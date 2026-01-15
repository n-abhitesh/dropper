import { useMemo, useState } from "react";

import { RadarCanvas } from "./components/RadarCanvas.jsx";
import { TransferPanel } from "./components/TransferPanel.jsx";
import { FileDropZone } from "./components/FileDropZone.jsx";
import { usePeers } from "./hooks/usePeers.js";
import { useFileTransfer } from "./hooks/useFileTransfer.js";

const ADJECTIVES = [
  "Swift",
  "Silent",
  "Bright",
  "Lucky",
  "Curious",
  "Brave",
  "Calm",
  "Solar",
  "Quantum",
  "Neon",
];

const ANIMALS = [
  "Falcon",
  "Otter",
  "Fox",
  "Tiger",
  "Panda",
  "Lynx",
  "Raven",
  "Orca",
  "Koala",
  "Wolf",
];

function createStableId() {
  const existing = window.localStorage.getItem("dropper:deviceId");
  if (existing) return existing;

  const id = crypto.randomUUID();
  window.localStorage.setItem("dropper:deviceId", id);
  return id;
}

function createDeviceName() {
  const existing = window.localStorage.getItem("dropper:deviceName");
  if (existing) return existing;

  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const name = `${adjective} ${animal}`;

  window.localStorage.setItem("dropper:deviceName", name);
  return name;
}

function createDeviceColor() {
  const existing = window.localStorage.getItem("dropper:deviceColor");
  if (existing) return existing;

  const hue = Math.floor(Math.random() * 360);
  const color = `hsl(${hue} 70% 55%)`;
  window.localStorage.setItem("dropper:deviceColor", color);
  return color;
}

function deriveRoomId() {
  const key = `${window.location.origin}${window.location.pathname}`;
  // Simple, deterministic hash so that the same URL maps to the same room ID.
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0; // force 32-bit
  }
  return `room-${Math.abs(hash)}`;
}

export default function App() {
  const [selectedPeerId, setSelectedPeerId] = useState(null);

  const identity = useMemo(
    () => ({
      deviceId: createStableId(),
      deviceName: createDeviceName(),
      color: createDeviceColor(),
      roomId: deriveRoomId(),
    }),
    [],
  );

  const {
    peers,
    channelsByPeer,
    signalingState,
    webrtcStateByPeer,
    channelsVersion,
  } = usePeers(identity);

  const transferApi = useFileTransfer({
    localDevice: identity,
    peers,
    channelsByPeer,
    channelsVersion,
    webrtcStateByPeer,
  });

  const selectedPeer =
    peers.find((peer) => peer.deviceId === selectedPeerId) ?? null;

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="app-title">
          <span className="brand-mark" />
          <div>
            <h1>Dropper</h1>
            <p className="app-subtitle">Local network file beaming</p>
          </div>
        </div>

        <div className="device-badge">
          <span
            className="device-color-dot"
            style={{ backgroundColor: identity.color }}
          />
          <div className="device-meta">
            <span className="device-label">This device</span>
            <span className="device-name">{identity.deviceName}</span>
          </div>
        </div>
      </header>

      <main className="app-main">
        <section className="radar-section">
          <RadarCanvas
            localDevice={identity}
            peers={peers}
            webrtcStateByPeer={webrtcStateByPeer}
            signalingState={signalingState}
            selectedPeerId={selectedPeerId}
            onSelectPeer={setSelectedPeerId}
            onDropFiles={(peerId, files) =>
              transferApi.sendFilesToPeer(peerId, files)
            }
          />
        </section>

        <section className="side-panel">
          <FileDropZone
            selectedPeer={selectedPeer}
            onSendFiles={(files) =>
              selectedPeer
                ? transferApi.sendFilesToPeer(selectedPeer.deviceId, files)
                : undefined
            }
          />

          <TransferPanel
            transfers={transferApi.transfers}
            peers={peers}
            localDeviceId={identity.deviceId}
          />
        </section>
      </main>
    </div>
  );
}
