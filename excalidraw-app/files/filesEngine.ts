import {
  CaptureUpdateAction,
  restoreAppState,
  restoreElements,
  serializeAsJSON,
} from "@excalidraw/excalidraw";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { atom, appJotaiStore } from "../app-jotai";

// voxen: the save engine behind the "Files" sidebar. Lives OUTSIDE the sidebar
// (Excalidraw unmounts sidebar content when it's closed) so autosave keeps
// running while the user draws with the panel shut. State is in jotai atoms
// so the sidebar UI and the headless <FilesEngine> share it.
//
// Server: deploy-steve/api/server.js (folders on disk = folders in the UI).

export const FILES_SIDEBAR_TAB = "files";
export const EXT = ".excalidraw";
const API_BASE = `${import.meta.env.BASE_URL}api`;
const AUTOSAVE_MS = 1500;

const LS = {
  token: "voxen-diagrams-token",
  current: "voxen-diagrams-current-file",
  expanded: "voxen-diagrams-expanded",
  selected: "voxen-diagrams-selected-folder",
};

export type TreeFile = {
  name: string;
  path: string;
  size: number;
  mtime: number;
};
export type TreeFolder = {
  name: string;
  path: string;
  folders: TreeFolder[];
  files: TreeFile[];
};
export type SaveStatus = "idle" | "dirty" | "saving" | "saved";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const readLS = (key: string) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeLS = (key: string, value: string | null) => {
  try {
    if (value === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // ignore
  }
};

// --- atoms -----------------------------------------------------------------

export const tokenAtom = atom<string>(readLS(LS.token) || "");
export const authFailedAtom = atom<boolean>(false);
export const currentFileAtom = atom<string | null>(readLS(LS.current));
export const statusAtom = atom<SaveStatus>("idle");
export const treeAtom = atom<TreeFolder | null>(null);
export const treeLoadingAtom = atom<boolean>(false);
export const errorAtom = atom<string | null>(null);
export const selectedFolderAtom = atom<string>(readLS(LS.selected) || "");
export const expandedAtom = atom<Set<string>>(
  (() => {
    try {
      return new Set<string>(JSON.parse(readLS(LS.expanded) || "[]"));
    } catch {
      return new Set<string>();
    }
  })(),
);

// persist the bits that should survive a reload
appJotaiStore.sub(tokenAtom, () =>
  writeLS(LS.token, appJotaiStore.get(tokenAtom) || null),
);
appJotaiStore.sub(currentFileAtom, () => {
  const current = appJotaiStore.get(currentFileAtom);
  writeLS(LS.current, current);
  document.title = current ? `${displayName(current)} · Diagrams` : "Diagrams";
});
appJotaiStore.sub(selectedFolderAtom, () =>
  writeLS(LS.selected, appJotaiStore.get(selectedFolderAtom)),
);
appJotaiStore.sub(expandedAtom, () =>
  writeLS(LS.expanded, JSON.stringify([...appJotaiStore.get(expandedAtom)])),
);

// --- helpers ---------------------------------------------------------------

export const parentOf = (rel: string) => {
  const i = rel.lastIndexOf("/");
  return i === -1 ? "" : rel.slice(0, i);
};
export const displayName = (rel: string) => {
  const base = rel.slice(rel.lastIndexOf("/") + 1);
  return base.endsWith(EXT) ? base.slice(0, -EXT.length) : base;
};
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _.()&+,'-]*$/;
export const validName = (name: string | null | undefined) =>
  !!name && NAME_RE.test(name) && !name.endsWith(EXT);

const encodePath = (rel: string) =>
  rel.split("/").map(encodeURIComponent).join("/");

const request = async (
  method: string,
  route: string,
  body?: string,
): Promise<Response> => {
  const token = appJotaiStore.get(tokenAtom);
  if (!token) {
    throw new ApiError(401, "no token");
  }
  const res = await fetch(`${API_BASE}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body,
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      message = (await res.json()).error || message;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, message);
  }
  return res;
};

export const api = {
  tree: async () =>
    (await request("GET", "/tree")).json() as Promise<TreeFolder>,
  read: async (rel: string) =>
    (await request("GET", `/file/${encodePath(rel)}`)).json(),
  write: (rel: string, json: string) =>
    request("PUT", `/file/${encodePath(rel)}`, json),
  mkdir: (rel: string) => request("POST", `/folder/${encodePath(rel)}`),
  move: (from: string, to: string) =>
    request("POST", "/move", JSON.stringify({ from, to })),
  remove: (rel: string, isFile: boolean) =>
    request("DELETE", `/${isFile ? "file" : "folder"}/${encodePath(rel)}`),
};

// --- engine ----------------------------------------------------------------

class FilesEngine {
  private excalidrawAPI: ExcalidrawImperativeAPI | null = null;
  private lastSaved: string | null = null;
  private loadingScene = false;
  private timer: number | null = null;
  private lastSeen: {
    elements: unknown;
    files: unknown;
    bg: string;
    grid: unknown;
  } | null = null;
  private teardown: (() => void) | null = null;

  attach(excalidrawAPI: ExcalidrawImperativeAPI) {
    this.detachAPI();
    this.excalidrawAPI = excalidrawAPI;

    const unsubscribe = excalidrawAPI.onChange((elements, appState, files) => {
      const seen = this.lastSeen;
      const changed =
        !seen ||
        seen.elements !== elements ||
        seen.files !== files ||
        seen.bg !== appState.viewBackgroundColor ||
        seen.grid !== appState.gridSize;
      this.lastSeen = {
        elements,
        files,
        bg: appState.viewBackgroundColor,
        grid: appState.gridSize,
      };
      if (!changed || !seen || this.loadingScene) {
        return;
      }
      if (!appJotaiStore.get(currentFileAtom)) {
        return;
      }
      appJotaiStore.set(statusAtom, "dirty");
      this.scheduleAutosave();
    });

    // Ctrl/Cmd+S saves the open file now; falls through to the editor's own
    // "save to disk" when no file is open.
    const onKey = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "s" &&
        appJotaiStore.get(currentFileAtom)
      ) {
        event.preventDefault();
        event.stopPropagation();
        this.saveNow({ announce: true });
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });

    const flush = () => this.flush();
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);

    this.teardown = () => {
      unsubscribe();
      window.removeEventListener("keydown", onKey, { capture: true });
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
      if (this.timer) {
        window.clearTimeout(this.timer);
        this.timer = null;
      }
    };

    // a file remembered from last time: adopt the current canvas as its live
    // copy (Excalidraw restored the same scene from localStorage)
    if (appJotaiStore.get(currentFileAtom) && appJotaiStore.get(tokenAtom)) {
      this.lastSaved = this.serialize();
      appJotaiStore.set(statusAtom, "saved");
    }
  }

  detachAPI() {
    this.teardown?.();
    this.teardown = null;
    this.excalidrawAPI = null;
  }

  private serialize() {
    const api = this.excalidrawAPI!;
    return serializeAsJSON(
      api.getSceneElements(),
      api.getAppState(),
      api.getFiles(),
      "local",
    );
  }

  private toast(message: string) {
    this.excalidrawAPI?.setToast({ message, closable: true });
  }

  handleError(e: unknown) {
    if (e instanceof ApiError && e.status === 401) {
      appJotaiStore.set(authFailedAtom, true);
      appJotaiStore.set(
        errorAtom,
        "Token rejected — enter the access token again.",
      );
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    appJotaiStore.set(errorAtom, msg);
    this.toast(`Files: ${msg}`);
  }

  async refreshTree() {
    if (!appJotaiStore.get(tokenAtom)) {
      return;
    }
    appJotaiStore.set(treeLoadingAtom, true);
    appJotaiStore.set(errorAtom, null);
    try {
      appJotaiStore.set(treeAtom, await api.tree());
      appJotaiStore.set(authFailedAtom, false);
    } catch (e) {
      this.handleError(e);
    } finally {
      appJotaiStore.set(treeLoadingAtom, false);
    }
  }

  private scheduleAutosave() {
    if (this.timer) {
      window.clearTimeout(this.timer);
    }
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.saveNow();
    }, AUTOSAVE_MS);
  }

  /** Flush a pending autosave immediately (tab hidden, switching files…). */
  async flush() {
    if (this.timer) {
      window.clearTimeout(this.timer);
      this.timer = null;
      await this.saveNow();
    }
  }

  async saveNow({ announce = false } = {}) {
    const rel = appJotaiStore.get(currentFileAtom);
    if (!rel) {
      return false;
    }
    return this.saveTo(rel, { announce });
  }

  /** Write the canvas to `rel`. Does NOT change the current file. */
  async saveTo(rel: string, { announce = false } = {}) {
    if (!this.excalidrawAPI || !appJotaiStore.get(tokenAtom)) {
      return false;
    }
    const json = this.serialize();
    if (rel === appJotaiStore.get(currentFileAtom) && json === this.lastSaved) {
      appJotaiStore.set(statusAtom, "saved");
      return true;
    }
    appJotaiStore.set(statusAtom, "saving");
    try {
      await api.write(rel, json);
      if (rel === appJotaiStore.get(currentFileAtom)) {
        this.lastSaved = json;
      }
      appJotaiStore.set(statusAtom, "saved");
      if (announce) {
        this.toast(`Saved ${displayName(rel)}`);
      }
      return true;
    } catch (e) {
      appJotaiStore.set(statusAtom, "dirty");
      this.handleError(e);
      return false;
    }
  }

  /** Save the canvas as a new file and make it current. */
  async saveAsNew(rel: string, { blank = false } = {}) {
    if (!this.excalidrawAPI) {
      return false;
    }
    await this.flush();
    if (blank) {
      this.loadingScene = true;
      this.excalidrawAPI.resetScene();
      window.setTimeout(() => {
        this.loadingScene = false;
      }, 50);
    }
    const json = this.serialize();
    appJotaiStore.set(statusAtom, "saving");
    try {
      await api.write(rel, json);
      this.lastSaved = json;
      appJotaiStore.set(currentFileAtom, rel);
      appJotaiStore.set(statusAtom, "saved");
      this.toast(`Saved ${displayName(rel)}`);
      return true;
    } catch (e) {
      appJotaiStore.set(statusAtom, "dirty");
      this.handleError(e);
      return false;
    }
  }

  async openFile(rel: string) {
    const excalidrawAPI = this.excalidrawAPI;
    if (!excalidrawAPI || !appJotaiStore.get(tokenAtom)) {
      return;
    }
    await this.flush();
    this.loadingScene = true;
    try {
      const data = await api.read(rel);
      const elements = restoreElements(data.elements || [], null, {
        repairBindings: true,
      });
      const appState = restoreAppState(data.appState || {}, null);
      const files = data.files ? Object.values(data.files) : [];
      if (files.length) {
        excalidrawAPI.addFiles(files as any);
      }
      excalidrawAPI.updateScene({
        elements,
        appState: {
          ...appState,
          // the visitor's theme is a preference, not content
          theme: excalidrawAPI.getAppState().theme,
        },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      excalidrawAPI.history.clear();
      if (elements.length) {
        excalidrawAPI.setViewport({
          target: excalidrawAPI.getSceneElements(),
          fit: "scale-down",
          animation: false,
        });
      }
      appJotaiStore.set(currentFileAtom, rel);
      appJotaiStore.set(selectedFolderAtom, parentOf(rel));
      this.lastSaved = this.serialize();
      appJotaiStore.set(statusAtom, "saved");
    } catch (e) {
      this.handleError(e);
    } finally {
      // let updateScene's change events settle before re-arming autosave
      window.setTimeout(() => {
        this.loadingScene = false;
      }, 50);
    }
  }

  /** Stop saving to the current file (canvas stays as-is). */
  async detachFile(silent = false) {
    await this.flush();
    appJotaiStore.set(currentFileAtom, null);
    appJotaiStore.set(statusAtom, "idle");
    this.lastSaved = null;
    if (!silent) {
      this.toast("Detached — edits now stay in this browser only.");
    }
  }

  /** The current file was renamed/moved/deleted from the tree. */
  currentMoved(from: string, to: string | null) {
    const current = appJotaiStore.get(currentFileAtom);
    if (!current || (current !== from && !current.startsWith(`${from}/`))) {
      return;
    }
    if (to === null) {
      if (this.timer) {
        window.clearTimeout(this.timer);
        this.timer = null;
      }
      appJotaiStore.set(currentFileAtom, null);
      appJotaiStore.set(statusAtom, "idle");
      this.lastSaved = null;
    } else {
      appJotaiStore.set(currentFileAtom, to + current.slice(from.length));
    }
  }

  setToken(token: string) {
    appJotaiStore.set(tokenAtom, token);
    appJotaiStore.set(authFailedAtom, false);
    appJotaiStore.set(errorAtom, null);
    this.refreshTree();
  }

  lock() {
    if (this.timer) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    appJotaiStore.set(tokenAtom, "");
    appJotaiStore.set(treeAtom, null);
    appJotaiStore.set(currentFileAtom, null);
    appJotaiStore.set(statusAtom, "idle");
    this.lastSaved = null;
  }
}

export const filesEngine = new FilesEngine();
