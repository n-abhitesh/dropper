import React from "react";

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

function formatSpeed(bps) {
  if (!bps) return "";
  return `${formatBytes(bps)}/s`;
}

export function TransferPanel({ transfers, peers, localDeviceId }) {
  const peerNameLookup = React.useMemo(() => {
    const map = new Map();
    peers.forEach((p) => map.set(p.deviceId, p.deviceName));
    return map;
  }, [peers]);

  if (!transfers.length) {
    return (
      <div className="transfer-panel">
        <div className="transfer-header">
          <span className="transfer-title">Transfers</span>
        </div>
        <p className="transfer-empty">
          No transfers yet. Choose a device and send a file.
        </p>
      </div>
    );
  }

  return (
    <div className="transfer-panel">
      <div className="transfer-header">
        <span className="transfer-title">Transfers</span>
      </div>
      <ul className="transfer-list">
        {transfers.map((t) => {
          const peerName = peerNameLookup.get(t.peerId) || "Unknown device";
          const statusLabel =
            t.status === "in-progress"
              ? "In progress"
              : t.status === "completed"
                ? "Completed"
                : t.status === "queued"
                  ? "Queued"
                  : "Failed";

          return (
            <li key={t.id} className="transfer-item">
              <div className="transfer-row-main">
                <div className="transfer-filename">
                  <span className="transfer-direction">
                    {t.direction === "send" ? "⇢" : "⇠"}
                  </span>
                  <span className="transfer-name">{t.name}</span>
                </div>
                <div className="transfer-meta">
                  <span className="transfer-peer">{peerName}</span>
                  <span className={`transfer-status transfer-status-${t.status}`}>
                    {statusLabel}
                  </span>
                </div>
              </div>
              <div className="transfer-row-progress">
                <div className="transfer-progress-bar">
                  <div
                    className="transfer-progress-fill"
                    style={{ width: `${Math.round((t.progress || 0) * 100)}%` }}
                  />
                </div>
                <div className="transfer-progress-meta">
                  <span className="transfer-bytes">
                    {formatBytes(t.size || 0)}
                  </span>
                  {t.status === "in-progress" && t.speedBps ? (
                    <span className="transfer-speed">
                      {formatSpeed(t.speedBps)}
                    </span>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

