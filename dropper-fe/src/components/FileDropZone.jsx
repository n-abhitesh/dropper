import React, { useCallback, useState } from "react";

export function FileDropZone({ selectedPeer, onSendFiles }) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((event) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (event) => {
      event.preventDefault();
      setIsDragging(false);
      const files = event.dataTransfer.files;
      if (!files || files.length === 0 || !selectedPeer) return;
      onSendFiles(files);
    },
    [onSendFiles, selectedPeer],
  );

  const handleFileChange = (event) => {
    const { files } = event.target;
    if (!files || files.length === 0 || !selectedPeer) return;
    onSendFiles(files);
  };

  return (
    <div
      className={`dropzone${isDragging ? " dropzone-active" : ""}${
        !selectedPeer ? " dropzone-disabled" : ""
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="dropzone-inner">
        <p className="dropzone-title">
          {selectedPeer ? `Send files to ${selectedPeer.deviceName}` : "Select a device"}
        </p>
        <p className="dropzone-subtitle">
          Drag files here or choose from your device.
        </p>
        <label className="dropzone-button">
          <span>Choose files</span>
          <input
            type="file"
            multiple
            onChange={handleFileChange}
            disabled={!selectedPeer}
          />
        </label>
      </div>
    </div>
  );
}

