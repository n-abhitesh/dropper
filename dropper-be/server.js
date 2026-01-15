import { WebSocketServer } from "ws";

/**
 * Simple in‑memory signaling server.
 *
 * Responsibilities:
 * - Maintain per‑URL rooms.
 * - Track devices (metadata) per room.
 * - Broadcast presence (peers joined/left).
 * - Forward targeted WebRTC signaling messages between peers in the same room.
 *
 * NOTE: This server never sees any file data – it only relays small signaling
 * and presence JSON messages. All file traffic flows directly over WebRTC
 * data channels between browsers.
 */
const PORT = process.env.PORT || 3001;
const wss = new WebSocketServer({ port: PORT });

/**
 * rooms: Map<roomId, {
 *   devices: Map<deviceId, { deviceId, deviceName, color }>,
 *   sockets: Set<WebSocket>,
 *   socketToDeviceId: Map<WebSocket, deviceId>
 * }>
 */
const rooms = new Map();

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      devices: new Map(),
      sockets: new Set(),
      socketToDeviceId: new Map(),
    });
  }
  return rooms.get(roomId);
}

function cleanupSocket(ws, roomId) {
  if (!roomId || !rooms.has(roomId)) return;

  const room = rooms.get(roomId);
  const deviceId = room.socketToDeviceId.get(ws);

  room.sockets.delete(ws);
  room.socketToDeviceId.delete(ws);

  if (deviceId && room.devices.has(deviceId)) {
    room.devices.delete(deviceId);

    // notify remaining peers in the room
    const payload = JSON.stringify({
      type: "peer-left",
      deviceId,
      roomId,
    });

    for (const client of room.sockets) {
      if (client.readyState === 1) {
        client.send(payload);
      }
    }
  }

  if (room.sockets.size === 0) {
    rooms.delete(roomId);
  }
}

wss.on("connection", (ws) => {
  let roomId = null;

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      // Ignore malformed messages.
      return;
    }

    if (msg.type === "join") {
      roomId = msg.roomId;
      if (!roomId) return;

      const { deviceId, deviceName, color } = msg;
      const room = getOrCreateRoom(roomId);

      room.sockets.add(ws);

      if (deviceId) {
        room.devices.set(deviceId, { deviceId, deviceName, color });
        room.socketToDeviceId.set(ws, deviceId);
      }

      // Send initial peer list to the joining client (excluding itself).
      const peers = Array.from(room.devices.values()).filter(
        (d) => d.deviceId && d.deviceId !== deviceId,
      );

      ws.send(
        JSON.stringify({
          type: "peers-sync",
          roomId,
          peers,
        }),
      );

      // Notify other peers about this new device.
      if (deviceId) {
        const joinedPayload = JSON.stringify({
          type: "peer-joined",
          roomId,
          peer: { deviceId, deviceName, color },
        });

        for (const client of room.sockets) {
          if (client !== ws && client.readyState === 1) {
            client.send(joinedPayload);
          }
        }
      }

      return;
    }

    // WebRTC signaling messages are wrapped as:
    // { type: "signal", roomId, from, to, signalType, payload }
    if (msg.type === "signal") {
      const { roomId: targetRoomId, from, to, signalType, payload } = msg;
      const activeRoomId = targetRoomId || roomId;
      if (!activeRoomId || !rooms.has(activeRoomId) || !to || !from) return;

      const room = rooms.get(activeRoomId);
      const targetMetadata = room.devices.get(to);
      if (!targetMetadata) {
        // Target device is not known in this room anymore; optionally inform sender.
        if (ws.readyState === 1) {
          ws.send(
            JSON.stringify({
              type: "signal-error",
              reason: "TARGET_NOT_FOUND",
              to,
              signalType,
            }),
          );
        }
        return;
      }

      // Find socket(s) for the target device.
      const payloadToSend = JSON.stringify({
        type: "signal",
        roomId: activeRoomId,
        from,
        to,
        signalType,
        payload,
      });

      for (const [socket, socketDeviceId] of room.socketToDeviceId.entries()) {
        if (socketDeviceId === to && socket.readyState === 1) {
          socket.send(payloadToSend);
        }
      }

      return;
    }
  });

  ws.on("close", () => {
    cleanupSocket(ws, roomId);
  });
});

console.log(`Signaling server running on :${PORT}`);
