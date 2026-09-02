import { useEffect } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { useAtomValue } from "../app-jotai";
import { EXT, filesEngine, tokenAtom, treeAtom } from "../files/filesEngine";

// voxen: headless — mounts the Files save engine on the editor API for the
// lifetime of the app, so autosave / Ctrl+S keep working with the sidebar
// closed. Also honours the `?file=<path>` deep-link once the tree is known.
export const FilesEngine = ({
  excalidrawAPI,
}: {
  excalidrawAPI: ExcalidrawImperativeAPI;
}) => {
  const token = useAtomValue(tokenAtom);
  const tree = useAtomValue(treeAtom);

  useEffect(() => {
    filesEngine.attach(excalidrawAPI);
    return () => filesEngine.detachAPI();
  }, [excalidrawAPI]);

  useEffect(() => {
    if (token) {
      filesEngine.refreshTree();
    }
  }, [token]);

  useEffect(() => {
    if (!token || !tree) {
      return;
    }
    const wanted = new URLSearchParams(window.location.search).get("file");
    if (wanted && wanted.endsWith(EXT)) {
      const url = new URL(window.location.href);
      url.searchParams.delete("file");
      window.history.replaceState(null, "", url.toString());
      filesEngine.openFile(wanted);
    }
    // only on first tree load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, !!tree]);

  return null;
};
