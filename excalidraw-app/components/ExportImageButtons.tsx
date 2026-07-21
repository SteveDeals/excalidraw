import { exportToBlob, exportToSvg, MIME_TYPES } from "@excalidraw/excalidraw";

import { useState } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import "./ExportImageButtons.scss";

// voxen: one-click SVG/PNG export. Downloads the current canvas straight to the
// visitor's browser — SVG (editable vector) and PNG (2× scale). Pure
// client-side: no filesystem writes, no backend (explicit non-goal in the
// ticket). Sourced from the excalidrawAPI ref.

const EXPORT_PADDING = 10;
const PNG_SCALE = 2;

const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick so the browser has grabbed the blob first.
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

const sceneFilename = (ext: string) => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate(),
  )}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `diagram-${stamp}.${ext}`;
};

export const ExportImageButtons = ({
  excalidrawAPI,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
}) => {
  const [busy, setBusy] = useState<"svg" | "png" | null>(null);

  const getScene = () => ({
    elements: excalidrawAPI.getSceneElements(),
    appState: excalidrawAPI.getAppState(),
    files: excalidrawAPI.getFiles(),
  });

  const warnEmpty = () => {
    excalidrawAPI.setToast({
      message: "Nothing to export — the canvas is empty.",
      closable: true,
    });
  };

  const exportSvg = async () => {
    const { elements, appState, files } = getScene();
    if (!elements.length) {
      return warnEmpty();
    }
    setBusy("svg");
    try {
      const svg = await exportToSvg({
        elements,
        appState,
        files,
        exportPadding: EXPORT_PADDING,
      });
      const svgString = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([svgString], {
        type: "image/svg+xml;charset=utf-8",
      });
      triggerDownload(blob, sceneFilename("svg"));
    } finally {
      setBusy(null);
    }
  };

  const exportPng = async () => {
    const { elements, appState, files } = getScene();
    if (!elements.length) {
      return warnEmpty();
    }
    setBusy("png");
    try {
      const blob = await exportToBlob({
        elements,
        appState,
        files,
        mimeType: MIME_TYPES.png,
        exportPadding: EXPORT_PADDING,
        getDimensions: (width, height) => ({
          width: width * PNG_SCALE,
          height: height * PNG_SCALE,
          scale: PNG_SCALE,
        }),
      });
      triggerDownload(blob, sceneFilename("png"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="voxen-export-buttons" title="Download this diagram">
      <button
        type="button"
        className="voxen-export-button"
        onClick={exportSvg}
        disabled={busy !== null}
        aria-label="Download as SVG"
      >
        {busy === "svg" ? "…" : "SVG"}
      </button>
      <button
        type="button"
        className="voxen-export-button"
        onClick={exportPng}
        disabled={busy !== null}
        aria-label="Download as PNG (2× scale)"
      >
        {busy === "png" ? "…" : "PNG"}
      </button>
    </div>
  );
};
