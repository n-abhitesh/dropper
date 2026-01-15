import React from "react";

function computePeerPositions(peers) {
  const count = peers.length;
  if (count === 0) return [];

  const radius = 40;
  return peers.map((peer, index) => {
    const angle = (index / count) * Math.PI * 2;
    const r = radius + (index % 2) * 10;
    const x = 50 + r * Math.cos(angle);
    const y = 50 + r * Math.sin(angle);
    return {
      peer,
      x,
      y,
    };
  });
}

export function RadarCanvas({
  localDevice,
  peers,
  webrtcStateByPeer,
  signalingState,
  selectedPeerId,
  onSelectPeer,
  onDropFiles,
}) {
  const positions = computePeerPositions(peers);

  const handleDropOnPeer = (event, peerId) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      onDropFiles(peerId, files);
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
  };

  const statusLabel =
    signalingState === "connecting"
      ? "Connecting to radar..."
      : signalingState === "open"
        ? peers.length === 0
          ? "Waiting for nearby devices..."
          : "Devices discovered"
        : "Offline";

  return (
    <div className="radar-wrapper">
      <div className="radar-header">
        <span className="radar-title">Local radar</span>
        <span className={`radar-status radar-status-${signalingState}`}>
          {statusLabel}
        </span>
      </div>

      <div className="radar-shell">
        <div className="radar-surface">
          <div className="radar-circles" />
          <div className="radar-sweep" />

          <button
            type="button"
            className="radar-node radar-node-self"
            style={{ "--node-color": localDevice.color }}
          >
            <span className="radar-node-dot" />
            <span className="radar-node-label radar-node-label-self">
              {localDevice.deviceName}
            </span>
          </button>

          {positions.map(({ peer, x, y }) => {
            const webrtc = webrtcStateByPeer[peer.deviceId] || {};
            const active =
              webrtc.channelState === "open" || webrtc.channelState === "connecting";
            const isSelected = peer.deviceId === selectedPeerId;

            return (
              <button
                key={peer.deviceId}
                type="button"
                className={`radar-node radar-node-peer${
                  isSelected ? " radar-node-selected" : ""
                }${active ? " radar-node-active" : ""}`}
                style={{
                  "--node-color": peer.color || "#55ff99",
                  "--x": `${x}%`,
                  "--y": `${y}%`,
                }}
                data-device-name={peer.deviceName}
                onClick={() => onSelectPeer(peer.deviceId)}
                onDrop={(e) => handleDropOnPeer(e, peer.deviceId)}
                onDragOver={handleDragOver}
              >
                <span className="radar-node-dot" />
                <span className="radar-node-label radar-node-label-peer">
                  {peer.deviceName}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

