import { DEFAULT_SIDEBAR } from "@excalidraw/common";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { FILES_SIDEBAR_TAB } from "../files/filesEngine";

// voxen: top-right toolbar button that opens the Files tab of the sidebar.
export const FilesButton = ({
  excalidrawAPI,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
}) => {
  return (
    <div className="voxen-export-buttons">
      <button
        type="button"
        className="voxen-export-button"
        title="Files — folders & saved diagrams"
        onClick={() =>
          excalidrawAPI.toggleSidebar({
            name: DEFAULT_SIDEBAR.name,
            tab: FILES_SIDEBAR_TAB,
          })
        }
      >
        Files
      </button>
    </div>
  );
};
