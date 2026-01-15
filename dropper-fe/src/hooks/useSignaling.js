import * as React from "react";

const DEFAULT_PORT = 3001;
const RECONNECT_DELAY_INITIAL = 1000;
const RECONNECT_DELAY_MAX = 10000;

function buildSignalingUrl() {
  // Use environment variable for backend URL in production
  const backendUrl = import.meta.env.VITE_SIGNALING_URL;
  if (backendUrl) {
    return backendUrl;
  }
  // Fallback for local development
  const { protocol, hostname } = window.location;
  const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
  return `${wsProtocol}//${hostname}:${DEFAULT_PORT}`;
}

/**
 * Lightweight signaling hook.
 *
 * Responsibilities:
 * - Connect to the signaling WebSocket.
 * - Send the initial `join` message with room + device metadata.
 * - Maintain a list of peers (presence) in the current room.
 * - Forward generic `signal` messages to the provided callback.
 * - Automatically reconnect on unexpected disconnects.
 */
export function useSignaling({ identity, onSignal, onPeersUpdate }) {
  const { deviceId, deviceName, color, roomId } = identity;

  const [state, setState] = React.useState("connecting"); // connecting | open | closed | error
  const [peers, setPeers] = React.useState([]);
  const socketRef = React.useRef(null);
  const reconnectTimeoutRef = React.useRef(null);
  const reconnectDelayRef = React.useRef(RECONNECT_DELAY_INITIAL);
  const isIntentionallyClosingRef = React.useRef(false);
  const onSignalRef = React.useRef(onSignal);
  const onPeersUpdateRef = React.useRef(onPeersUpdate);
  // Store handlers for proper cleanup
  const handlersRef = React.useRef({
    handleOpen: null,
    handleClose: null,
    handleError: null,
    handleMessage: null,
  });

  // Keep callbacks in refs to avoid dependency issues
  React.useEffect(() => {
    onSignalRef.current = onSignal;
    onPeersUpdateRef.current = onPeersUpdate;
  }, [onSignal, onPeersUpdate]);

  /**
   * Establishes WebSocket connection to signaling server.
   * 
   * Prevents duplicate connections by checking socket state before creating new ones.
   * Handlers are stored in refs to ensure proper cleanup and prevent memory leaks.
   */
  const connect = React.useCallback(() => {
    // Prevent duplicate connections - if socket exists and is connecting/open, don't create another
    if (socketRef.current) {
      const state = socketRef.current.readyState;
      if (
        state === WebSocket.CONNECTING ||
        state === WebSocket.OPEN
      ) {
        return;
      }
      // Socket exists but is closed/closing - clean it up first
      socketRef.current = null;
    }

    const url = buildSignalingUrl();
    const socket = new WebSocket(url);
    socketRef.current = socket;

    // Store handlers in ref for cleanup
    const handleOpen = () => {
      // Only process if this is still the current socket
      if (socketRef.current !== socket) return;
      
      setState("open");
      reconnectDelayRef.current = RECONNECT_DELAY_INITIAL;
      socket.send(
        JSON.stringify({
          type: "join",
          roomId,
          deviceId,
          deviceName,
          color,
        }),
      );
    };

    const handleClose = (event) => {
      // Only process if this is still the current socket
      if (socketRef.current !== socket) return;
      
      socketRef.current = null;

      // Only reconnect if it wasn't an intentional close
      if (!isIntentionallyClosingRef.current && !event.wasClean) {
        setState("connecting");
        const delay = Math.min(
          reconnectDelayRef.current,
          RECONNECT_DELAY_MAX,
        );
        reconnectDelayRef.current *= 1.5;

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      } else {
        setState("closed");
        setPeers([]);
        if (onPeersUpdateRef.current) onPeersUpdateRef.current([]);
      }
    };

    const handleError = (error) => {
      // Only process if this is still the current socket
      if (socketRef.current !== socket) return;
      
      // Only set error state if not intentionally closing
      if (!isIntentionallyClosingRef.current) {
        setState("error");
      }
    };

    const handleMessage = (event) => {
      // Only process if this is still the current socket
      if (socketRef.current !== socket) return;
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      if (msg.type === "peers-sync") {
        const nextPeers = (msg.peers || []).filter(
          (p) => p.deviceId && p.deviceId !== deviceId,
        );
        setPeers(nextPeers);
        if (onPeersUpdateRef.current) onPeersUpdateRef.current(nextPeers);
        return;
      }

      if (msg.type === "peer-joined") {
        const peer = msg.peer;
        if (!peer || peer.deviceId === deviceId) return;

        setPeers((prev) => {
          const existingIdx = prev.findIndex(
            (p) => p.deviceId === peer.deviceId,
          );
          if (existingIdx !== -1) {
            const next = prev.slice();
            next[existingIdx] = peer;
            if (onPeersUpdateRef.current) onPeersUpdateRef.current(next);
            return next;
          }

          const next = [...prev, peer];
          if (onPeersUpdateRef.current) onPeersUpdateRef.current(next);
          return next;
        });
        return;
      }

      if (msg.type === "peer-left") {
        const leftId = msg.deviceId;
        setPeers((prev) => {
          const next = prev.filter((p) => p.deviceId !== leftId);
          if (onPeersUpdateRef.current) onPeersUpdateRef.current(next);
          return next;
        });
        return;
      }

      if (msg.type === "signal") {
        if (onSignalRef.current) {
          onSignalRef.current(msg);
        }
        return;
      }
    };

    // Store handlers for cleanup
    handlersRef.current = {
      handleOpen,
      handleClose,
      handleError,
      handleMessage,
    };

    socket.addEventListener("open", handleOpen);
    socket.addEventListener("close", handleClose);
    socket.addEventListener("error", handleError);
    socket.addEventListener("message", handleMessage);
  }, [roomId, deviceId, deviceName, color]);

  /**
   * Connection lifecycle effect.
   * 
   * Only reconnects when identity actually changes (roomId or deviceId), not on every render.
   * This prevents premature socket closure during connection establishment.
   * Properly cleans up event listeners to avoid "closed before connection" errors.
   */
  const identityKeyRef = React.useRef(null);
  const currentIdentityKey = `${roomId}-${deviceId}`;

  React.useEffect(() => {
    // Only reconnect if identity actually changed (prevents unnecessary reconnections)
    const identityChanged = identityKeyRef.current !== currentIdentityKey;
    identityKeyRef.current = currentIdentityKey;

    // If identity changed, close existing connection first
    if (identityChanged && socketRef.current) {
      isIntentionallyClosingRef.current = true;
      const oldSocket = socketRef.current;
      const oldHandlers = handlersRef.current;
      socketRef.current = null;
      
      // Remove old handlers
      if (oldHandlers) {
        try {
          if (oldHandlers.handleOpen) {
            oldSocket.removeEventListener("open", oldHandlers.handleOpen);
          }
          if (oldHandlers.handleClose) {
            oldSocket.removeEventListener("close", oldHandlers.handleClose);
          }
          if (oldHandlers.handleError) {
            oldSocket.removeEventListener("error", oldHandlers.handleError);
          }
          if (oldHandlers.handleMessage) {
            oldSocket.removeEventListener("message", oldHandlers.handleMessage);
          }
        } catch (e) {
          // Ignore errors when removing listeners
        }
      }
      
      // Only close OPEN sockets - let CONNECTING sockets fail naturally
      if (oldSocket.readyState === WebSocket.OPEN) {
        try {
          oldSocket.close(1000, "Identity changed");
        } catch (e) {
          // Ignore errors
        }
      }
      // Don't close CONNECTING sockets - they'll fail on their own
    }

    isIntentionallyClosingRef.current = false;
    connect();

    return () => {
      isIntentionallyClosingRef.current = true;
      
      // Clear any pending reconnection
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      // Clean up socket if it exists
      if (socketRef.current) {
        const socket = socketRef.current;
        const handlers = handlersRef.current;
        socketRef.current = null;
        
        // Remove event listeners first to prevent handler execution during cleanup
        if (handlers.handleOpen) {
          try {
            socket.removeEventListener("open", handlers.handleOpen);
          } catch (e) {
            // Ignore if already removed
          }
        }
        if (handlers.handleClose) {
          try {
            socket.removeEventListener("close", handlers.handleClose);
          } catch (e) {
            // Ignore if already removed
          }
        }
        if (handlers.handleError) {
          try {
            socket.removeEventListener("error", handlers.handleError);
          } catch (e) {
            // Ignore if already removed
          }
        }
        if (handlers.handleMessage) {
          try {
            socket.removeEventListener("message", handlers.handleMessage);
          } catch (e) {
            // Ignore if already removed
          }
        }
        
        // Only close OPEN sockets - don't close CONNECTING sockets to avoid errors
        // CONNECTING sockets will fail naturally or can be ignored
        if (socket.readyState === WebSocket.OPEN) {
          try {
            socket.close(1000, "Component unmounting");
          } catch (e) {
            // Ignore errors during cleanup
          }
        } else if (socket.readyState === WebSocket.CONNECTING) {
          // For CONNECTING sockets, just remove listeners and let it fail naturally
          // Closing a CONNECTING socket can cause "closed before connection" errors
          // The socket will either connect (and be cleaned up later) or fail on its own
        }
      }
    };
  }, [connect, currentIdentityKey]);

  const sendSignal = React.useCallback(
    (to, signalType, payload) => {
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN)
        return;

      socketRef.current.send(
        JSON.stringify({
          type: "signal",
          roomId,
          from: deviceId,
          to,
          signalType,
          payload,
        }),
      );
    },
    [deviceId, roomId],
  );

  return {
    signalingState: state,
    peers,
    sendSignal,
  };
}

