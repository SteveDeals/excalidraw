import { DefaultSidebar, Sidebar } from "@excalidraw/excalidraw";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";

import { FilesSidebar, FILES_SIDEBAR_TAB } from "./FilesSidebar";

import "./AppSidebar.scss";

// voxen: the default sidebar carries the Library tab (built in) plus our
// "Files" tab — folders + saved diagrams on the server. The two Excalidraw+
// promo tabs (comments / presentation) that upstream ships here were removed
// with the de-brand.

const FilesIcon = (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M5 4h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
  </svg>
);

export const AppSidebar = () => {
  const { openSidebar } = useUIAppState();

  return (
    <DefaultSidebar>
      <DefaultSidebar.TabTriggers>
        <Sidebar.TabTrigger
          tab={FILES_SIDEBAR_TAB}
          title="Files — folders & saved diagrams"
          style={{ opacity: openSidebar?.tab === FILES_SIDEBAR_TAB ? 1 : 0.4 }}
        >
          {FilesIcon}
        </Sidebar.TabTrigger>
      </DefaultSidebar.TabTriggers>
      <Sidebar.Tab tab={FILES_SIDEBAR_TAB}>
        <FilesSidebar />
      </Sidebar.Tab>
    </DefaultSidebar>
  );
};
