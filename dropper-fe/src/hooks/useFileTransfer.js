import { useEffect, useRef, useState } from "react";

const CHUNK_SIZE = 128 * 1024; // 128KB

let transferCounter = 0;

function createTransferId() {
  transferCounter += 1;
  return `tx-${Date.now()}-${transferCounter}`;
}

export function useFileTransfer({
  localDevice,
  peers,
  channelsByPeer,
  channelsVersion,
  webrtcStateByPeer,
}) {
  const [transfers, setTransfers] = useState([]);

  const incomingStateRef = useRef(new Map());
  const pendingFilesRef = useRef(new Map()); // Map<peerId, Array<{file, transferId, retries}>>

  const peerLookup = useRef(new Map());
  useEffect(() => {
    const map = new Map();
    peers.forEach((p) => map.set(p.deviceId, p));
    peerLookup.current = map;
  }, [peers]);

  const sendFileToPeerInternal = (peerId, file, isRetry = false) => {
    if (!file) {
      console.warn("sendFileToPeer: No file provided");
      return;
    }

    if (!channelsByPeer || typeof channelsByPeer.get !== "function") {
      console.warn("sendFileToPeer: channelsByPeer is not a valid Map");
      return;
    }

    const channel = channelsByPeer.get(peerId);

    if (!channel) {
      // Queue the file if channel doesn't exist yet
      if (!isRetry) {
        const transferId = createTransferId();
        if (!pendingFilesRef.current.has(peerId)) {
          pendingFilesRef.current.set(peerId, []);
        }
        pendingFilesRef.current.get(peerId).push({
          file,
          transferId,
          retries: 0,
        });

        setTransfers((prev) => [
          {
            id: transferId,
            direction: "send",
            peerId,
            name: file.name,
            size: file.size,
            status: "queued",
            progress: 0,
            speedBps: 0,
          },
          ...prev,
        ]);
      }
      return;
    }

    if (channel.readyState !== "open") {
      // Queue the file if channel isn't open yet
      if (!isRetry) {
        const transferId = createTransferId();
        if (!pendingFilesRef.current.has(peerId)) {
          pendingFilesRef.current.set(peerId, []);
        }
        const pending = pendingFilesRef.current.get(peerId);
        pending.push({ file, transferId, retries: 0 });

        setTransfers((prev) => [
          {
            id: transferId,
            direction: "send",
            peerId,
            name: file.name,
            size: file.size,
            status: "queued",
            progress: 0,
            speedBps: 0,
          },
          ...prev,
        ]);
      }
      return;
    }

    // Channel is ready, send the file
    // If this is a retry, use the existing transfer ID, otherwise create a new one
    let id;
    let existingTransferId = null;

    if (isRetry) {
      // Find the pending file entry to get its transfer ID
      const pendingFiles = pendingFilesRef.current.get(peerId);
      if (pendingFiles) {
        const pendingIndex = pendingFiles.findIndex(
          (p) => p.file === file || p.file.name === file.name,
        );
        if (pendingIndex !== -1) {
          existingTransferId = pendingFiles[pendingIndex].transferId;
          pendingFiles[pendingIndex].retries += 1;
        }
      }
      id = existingTransferId || createTransferId();
    } else {
      id = createTransferId();
    }

    const meta = {
      type: "file-meta",
      id,
      name: file.name,
      size: file.size,
      mimeType: file.type,
      from: localDevice.deviceId,
    };

    channel.send(JSON.stringify(meta));

    // Update existing queued transfer to in-progress, or create new one
    if (isRetry && existingTransferId) {
      setTransfers((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                status: "in-progress",
                progress: 0,
                speedBps: 0,
              }
            : t,
        ),
      );
    } else {
      const transfer = {
        id,
        direction: "send",
        peerId,
        name: file.name,
        size: file.size,
        status: "in-progress",
        progress: 0,
        speedBps: 0,
      };
      setTransfers((prev) => [transfer, ...prev]);
    }

    let offset = 0;
    const startedAt = performance.now();

    const reader = new FileReader();

    reader.onerror = () => {
      setTransfers((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                status: "failed",
              }
            : t,
        ),
      );
    };

    const readSlice = () => {
      const slice = file.slice(offset, offset + CHUNK_SIZE);
      reader.readAsArrayBuffer(slice);
    };

    reader.onload = () => {
      if (channel.readyState !== "open") {
        setTransfers((prev) =>
          prev.map((t) =>
            t.id === id
              ? {
                  ...t,
                  status: "failed",
                }
              : t,
          ),
        );
        return;
      }

      const buffer = reader.result;

      const sendChunk = () => {
        if (channel.bufferedAmount > 4 * 1024 * 1024) {
          setTimeout(sendChunk, 50);
          return;
        }

        channel.send(buffer);
        offset += CHUNK_SIZE;

        const now = performance.now();
        const elapsedSeconds = (now - startedAt) / 1000 || 1;
        const sentBytes = Math.min(offset, file.size);
        const speedBps = sentBytes / elapsedSeconds;

        setTransfers((prev) =>
          prev.map((t) =>
            t.id === id
              ? {
                  ...t,
                  progress: file.size ? sentBytes / file.size : 0,
                  speedBps,
                }
              : t,
          ),
        );

        if (offset < file.size) {
          readSlice();
        } else {
          channel.send(
            JSON.stringify({
              type: "file-complete",
              id,
            }),
          );

          setTransfers((prev) =>
            prev.map((t) =>
              t.id === id
                ? {
                    ...t,
                    status: "completed",
                    progress: 1,
                  }
                : t,
            ),
          );
        }
      };

      sendChunk();
    };

    readSlice();
  };

  // Retry pending files when channels become ready
  useEffect(() => {
    pendingFilesRef.current.forEach((pendingFiles, peerId) => {
      const channel = channelsByPeer?.get(peerId);

      if (channel && channel.readyState === "open") {
        // Channel is ready, process pending files
        const filesToSend = [];
        const remainingFiles = [];

        pendingFiles.forEach((pending) => {
          if (pending.retries < 5) {
            // Max 5 retries
            filesToSend.push(pending);
          } else {
            // Max retries exceeded, mark as failed
            setTransfers((prev) =>
              prev.map((t) =>
                t.id === pending.transferId
                  ? {
                      ...t,
                      status: "failed",
                    }
                  : t,
              ),
            );
          }
        });

        filesToSend.forEach(({ file }) => {
          sendFileToPeerInternal(peerId, file, true);
        });

        // Remove processed files from pending list
        if (filesToSend.length > 0) {
          filesToSend.forEach((sent) => {
            const index = pendingFiles.indexOf(sent);
            if (index !== -1) {
              pendingFiles.splice(index, 1);
            }
          });
        }

        if (pendingFiles.length === 0) {
          pendingFilesRef.current.delete(peerId);
        }
      }
    });
  }, [channelsVersion, webrtcStateByPeer, channelsByPeer]);

  const registerIncomingHandlers = () => {
    if (!channelsByPeer || typeof channelsByPeer.forEach !== "function") {
      return;
    }

    channelsByPeer.forEach((channel, peerId) => {
      if (!channel || channel._dropperHandlersInstalled) return;
      channel._dropperHandlersInstalled = true;

      channel.onmessage = (event) => {
        if (typeof event.data === "string") {
          try {
            const msg = JSON.parse(event.data);
            if (msg && msg.type === "file-meta") {
              const { id, name, size, mimeType } = msg;
              incomingStateRef.current.set(id, {
                peerId,
                name,
                size,
                mimeType,
                receivedBytes: 0,
                chunks: [],
                startedAt: performance.now(),
              });

              setTransfers((prev) => [
                {
                  id,
                  direction: "receive",
                  peerId,
                  name,
                  size,
                  status: "in-progress",
                  progress: 0,
                  speedBps: 0,
                },
                ...prev,
              ]);
            } else if (msg && msg.type === "file-complete") {
              const { id } = msg;
              const state = incomingStateRef.current.get(id);
              if (!state) return;

              const blob = new Blob(state.chunks, {
                type: state.mimeType || "application/octet-stream",
              });
              const url = URL.createObjectURL(blob);

              const link = document.createElement("a");
              link.href = url;
              link.download = state.name || "file";
              link.click();
              URL.revokeObjectURL(url);

              incomingStateRef.current.delete(id);

              setTransfers((prev) =>
                prev.map((t) =>
                  t.id === id
                    ? {
                        ...t,
                        status: "completed",
                        progress: 1,
                      }
                    : t,
                ),
              );
            }
          } catch {
            // ignore malformed JSON on data channel
          }
          return;
        }

        for (const [id, state] of incomingStateRef.current.entries()) {
          if (state.peerId === peerId && state.receivedBytes < state.size) {
            state.chunks.push(event.data);
            state.receivedBytes += event.data.byteLength || 0;

            const now = performance.now();
            const elapsedSeconds = (now - state.startedAt) / 1000 || 1;
            const speedBps = state.receivedBytes / elapsedSeconds;

            setTransfers((prev) =>
              prev.map((t) =>
                t.id === id
                  ? {
                      ...t,
                      progress: state.size
                        ? state.receivedBytes / state.size
                        : 0,
                      speedBps,
                    }
                  : t,
              ),
            );
            break;
          }
        }
      };
    });
  };

  // Re-register handlers when channels change
  useEffect(() => {
    registerIncomingHandlers();
  }, [channelsVersion]); // Re-run when channels are added/removed

  const sendFileToPeer = (peerId, file) => {
    sendFileToPeerInternal(peerId, file, false);
  };

  const sendFilesToPeer = (peerId, fileListOrArray) => {
    const files =
      fileListOrArray instanceof FileList
        ? Array.from(fileListOrArray)
        : Array.isArray(fileListOrArray)
          ? fileListOrArray
          : [];

    files.forEach((file) => sendFileToPeer(peerId, file));
  };

  return {
    transfers,
    sendFilesToPeer,
  };
}

