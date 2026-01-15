import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSignaling } from "./useSignaling.js";

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

function createPeerConnection(peerId, localId, sendSignalRef, onDataChannelReady) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  pc.onicecandidate = (event) => {
    if (event.candidate && sendSignalRef.current) {
      sendSignalRef.current(peerId, "ice-candidate", event.candidate);
    }
  };

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
      // Let caller clean up on its side.
    }
  };

  pc.ondatachannel = (event) => {
    const channel = event.channel;
    if (channel.label === "files") {
      onDataChannelReady(peerId, channel);
    }
  };

  return pc;
}

export function usePeers(identity) {
  const { deviceId } = identity;

  const [peers, setPeers] = useState([]);
  const [webrtcStateByPeer, setWebrtcStateByPeer] = useState({});
  const [channelsVersion, setChannelsVersion] = useState(0);

  const peerConnectionsRef = useRef(new Map());
  const dataChannelsRef = useRef(new Map());
  const connectingPeersRef = useRef(new Set());
  const sendSignalRef = useRef(null);

  const cleanupPeer = useCallback((peerId) => {
    const pc = peerConnectionsRef.current.get(peerId);
    if (pc) {
      pc.close();
      peerConnectionsRef.current.delete(peerId);
    }

    const channel = dataChannelsRef.current.get(peerId);
    if (channel) {
      channel.close();
      dataChannelsRef.current.delete(peerId);
      setChannelsVersion((v) => v + 1);
    }

    connectingPeersRef.current.delete(peerId);

    setWebrtcStateByPeer((prev) => {
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  const handleDataChannelReady = useCallback((peerId, channel) => {
    // Don't overwrite an existing channel
    if (dataChannelsRef.current.has(peerId)) {
      return;
    }

    dataChannelsRef.current.set(peerId, channel);
    setChannelsVersion((v) => v + 1);

    setWebrtcStateByPeer((prev) => ({
      ...prev,
      [peerId]: {
        ...(prev[peerId] || {}),
        channelState: channel.readyState,
      },
    }));

    channel.onopen = () => {
      setWebrtcStateByPeer((prev) => ({
        ...prev,
        [peerId]: {
          ...(prev[peerId] || {}),
          channelState: "open",
        },
      }));
      connectingPeersRef.current.delete(peerId);
    };

    channel.onclose = () => {
      setWebrtcStateByPeer((prev) => {
        const next = { ...prev };
        delete next[peerId];
        return next;
      });
      dataChannelsRef.current.delete(peerId);
      setChannelsVersion((v) => v + 1);
    };

    channel.onerror = () => {
      setWebrtcStateByPeer((prev) => ({
        ...prev,
        [peerId]: {
          ...(prev[peerId] || {}),
          channelState: "error",
        },
      }));
    };
  }, []);

  const handleSignal = useCallback(
    async (msg) => {
      const { from: peerId, signalType, payload } = msg;
      if (!peerId || peerId === deviceId) return;

      let pc = peerConnectionsRef.current.get(peerId);
      if (!pc) {
        pc = createPeerConnection(
          peerId,
          deviceId,
          sendSignalRef,
          handleDataChannelReady,
        );
        peerConnectionsRef.current.set(peerId, pc);
      }

      try {
        if (signalType === "offer") {
          await pc.setRemoteDescription(payload);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (sendSignalRef.current) {
            sendSignalRef.current(peerId, "answer", answer);
          }
        } else if (signalType === "answer") {
          if (!pc.currentRemoteDescription) {
            await pc.setRemoteDescription(payload);
          }
        } else if (signalType === "ice-candidate") {
          await pc.addIceCandidate(payload);
        }
      } catch {
        // Any errors will surface via connection state or data channel events.
      }
    },
    [deviceId, handleDataChannelReady],
  );

  const { signalingState, peers: signalingPeers, sendSignal } = useSignaling({
    identity,
    onSignal: handleSignal,
    onPeersUpdate: setPeers,
  });

  // Update sendSignal ref when it changes
  useEffect(() => {
    sendSignalRef.current = sendSignal;
  }, [sendSignal]);

  // Clean up WebRTC connections when peers leave
  useEffect(() => {
    const currentPeerIds = new Set(
      signalingPeers.map((p) => p.deviceId).filter(Boolean),
    );

    // Remove connections for peers that are no longer in the signaling list
    peerConnectionsRef.current.forEach((pc, peerId) => {
      if (peerId !== deviceId && !currentPeerIds.has(peerId)) {
        cleanupPeer(peerId);
      }
    });
  }, [signalingPeers, deviceId, cleanupPeer]);

  // deterministically decide which side initiates a WebRTC connection
  useEffect(() => {
    signalingPeers.forEach((peer) => {
      const peerId = peer.deviceId;
      if (!peerId || peerId === deviceId) return;

      // Skip if already connecting or connected
      if (
        peerConnectionsRef.current.has(peerId) ||
        connectingPeersRef.current.has(peerId)
      ) {
        return;
      }

      const iAmInitiator = deviceId < peerId;
      if (!iAmInitiator) return;

      connectingPeersRef.current.add(peerId);

      const pc = createPeerConnection(
        peerId,
        deviceId,
        sendSignalRef,
        handleDataChannelReady,
      );
      peerConnectionsRef.current.set(peerId, pc);

      const channel = pc.createDataChannel("files");
      handleDataChannelReady(peerId, channel);

      pc
        .createOffer()
        .then((offer) => pc.setLocalDescription(offer).then(() => offer))
        .then((offer) => {
          if (sendSignalRef.current) {
            sendSignalRef.current(peerId, "offer", offer);
          }
        })
        .catch(() => {
          connectingPeersRef.current.delete(peerId);
        });
    });
  }, [deviceId, signalingPeers, handleDataChannelReady]);

  useEffect(
    () => () => {
      peerConnectionsRef.current.forEach((pc) => pc.close());
      peerConnectionsRef.current.clear();
      dataChannelsRef.current.forEach((channel) => channel.close());
      dataChannelsRef.current.clear();
      connectingPeersRef.current.clear();
    },
    [],
  );

  // Return the Map directly - it's a ref so it's always current
  // The webrtcStateByPeer state changes will trigger re-renders when channels open
  return {
    peers,
    signalingState,
    webrtcStateByPeer,
    channelsByPeer: dataChannelsRef.current,
    channelsVersion, // Expose version to trigger re-registration of handlers
  };
}

