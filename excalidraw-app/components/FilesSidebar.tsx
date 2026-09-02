import { useMemo, useState } from "react";

import { useAtom, useAtomValue } from "../app-jotai";
import {
  api,
  ApiError,
  authFailedAtom,
  currentFileAtom,
  displayName,
  errorAtom,
  expandedAtom,
  EXT,
  filesEngine,
  parentOf,
  selectedFolderAtom,
  statusAtom,
  tokenAtom,
  treeAtom,
  treeLoadingAtom,
  validName,
} from "../files/filesEngine";

import "./FilesSidebar.scss";

import type { TreeFolder } from "../files/filesEngine";

// voxen: the "Files" sidebar — folders + saved diagrams on the server. Pure
// UI: all state + saving lives in files/filesEngine.ts (this component is
// unmounted whenever the sidebar is closed).

export { FILES_SIDEBAR_TAB } from "../files/filesEngine";

// --- icons (inline, match the editor's stroke icons) -----------------------

const svgProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};
const IconFolder = ({ open }: { open: boolean }) => (
  <svg {...svgProps} width="16" height="16">
    {open ? (
      <path d="M5 19l2.757-7.351A1 1 0 0 1 8.693 11H21l-2.5 8H5zM5 19V5a1 1 0 0 1 1-1h4l2 2h6a1 1 0 0 1 1 1v3" />
    ) : (
      <path d="M5 4h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
    )}
  </svg>
);
const IconFile = () => (
  <svg {...svgProps} width="16" height="16">
    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
    <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" />
  </svg>
);
const IconChevron = ({ open }: { open: boolean }) => (
  <svg
    {...svgProps}
    width="12"
    height="12"
    strokeWidth={2}
    style={{
      transform: open ? "rotate(90deg)" : undefined,
      transition: "transform 120ms",
    }}
  >
    <path d="M9 6l6 6-6 6" />
  </svg>
);

// ---------------------------------------------------------------------------

export const FilesSidebar = () => {
  const token = useAtomValue(tokenAtom);
  const authFailed = useAtomValue(authFailedAtom);
  const tree = useAtomValue(treeAtom);
  const loading = useAtomValue(treeLoadingAtom);
  const error = useAtomValue(errorAtom);
  const current = useAtomValue(currentFileAtom);
  const status = useAtomValue(statusAtom);
  const [selectedFolder, setSelectedFolder] = useAtom(selectedFolderAtom);
  const [expanded, setExpanded] = useAtom(expandedAtom);
  const [tokenInput, setTokenInput] = useState("");

  const toast = (message: string) =>
    filesEngine.handleError(new Error(message));

  const withRefresh = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      filesEngine.handleError(e);
    }
    await filesEngine.refreshTree();
  };

  const expand = (...paths: string[]) =>
    setExpanded((s) => new Set([...s, ...paths.filter(Boolean)]));

  // --- actions -------------------------------------------------------------

  const newFolder = (parent: string) => {
    const name = window.prompt(
      parent ? `New folder inside "${parent}"` : "New folder name",
    );
    if (name === null) {
      return;
    }
    const clean = name.trim();
    if (!validName(clean)) {
      return toast("Folder names: letters, digits, spaces, - _ . ( )");
    }
    const rel = parent ? `${parent}/${clean}` : clean;
    withRefresh(async () => {
      try {
        await api.mkdir(rel);
      } catch (e) {
        // already exists → just select it
        if (!(e instanceof ApiError && e.status === 409)) {
          throw e;
        }
      }
      expand(parent, rel);
      setSelectedFolder(rel);
    });
  };

  const saveAs = (folder: string, { blank = false } = {}) => {
    const name = window.prompt(
      blank
        ? `New blank diagram in "${folder || "/"}"`
        : `Save current canvas as… (in "${folder || "/"}")`,
      current && !blank ? displayName(current) : "",
    );
    if (name === null) {
      return;
    }
    const clean = name.trim();
    if (!validName(clean)) {
      return toast("Names: letters, digits, spaces, - _ . ( )");
    }
    const rel = `${folder ? `${folder}/` : ""}${clean}${EXT}`;
    withRefresh(async () => {
      if (await filesEngine.saveAsNew(rel, { blank })) {
        setSelectedFolder(folder);
        expand(folder);
      }
    });
  };

  const rename = (rel: string, isFile: boolean) => {
    const oldName = displayName(rel);
    const name = window.prompt("Rename to", oldName);
    if (name === null || name.trim() === oldName) {
      return;
    }
    const clean = name.trim();
    if (!validName(clean)) {
      return toast("Names: letters, digits, spaces, - _ . ( )");
    }
    const parent = parentOf(rel);
    const to = `${parent ? `${parent}/` : ""}${clean}${isFile ? EXT : ""}`;
    withRefresh(async () => {
      await filesEngine.flush();
      await api.move(rel, to);
      filesEngine.currentMoved(rel, to);
      if (!isFile) {
        setExpanded((s) => {
          const n = new Set<string>();
          s.forEach((p) =>
            n.add(
              p === rel || p.startsWith(`${rel}/`)
                ? to + p.slice(rel.length)
                : p,
            ),
          );
          return n;
        });
        if (selectedFolder === rel || selectedFolder.startsWith(`${rel}/`)) {
          setSelectedFolder(to + selectedFolder.slice(rel.length));
        }
      }
    });
  };

  const moveTo = (rel: string, isFile: boolean) => {
    const dest = window.prompt(
      `Move "${displayName(rel)}" to folder (blank = root)`,
      parentOf(rel),
    );
    if (dest === null) {
      return;
    }
    const folder = dest.trim().replace(/^\/+|\/+$/g, "");
    const base = rel.slice(rel.lastIndexOf("/") + 1);
    const to = folder ? `${folder}/${base}` : base;
    if (to === rel) {
      return;
    }
    withRefresh(async () => {
      await filesEngine.flush();
      await api.move(rel, to);
      filesEngine.currentMoved(rel, to);
      expand(folder);
    });
  };

  const remove = (rel: string, isFile: boolean) => {
    const what = isFile ? "diagram" : "folder (and everything in it)";
    if (
      !window.confirm(
        `Delete ${what} "${displayName(
          rel,
        )}"?\n\nIt is moved to the server's trash, not destroyed.`,
      )
    ) {
      return;
    }
    withRefresh(async () => {
      await api.remove(rel, isFile);
      filesEngine.currentMoved(rel, null);
      if (
        !isFile &&
        (selectedFolder === rel || selectedFolder.startsWith(`${rel}/`))
      ) {
        setSelectedFolder(parentOf(rel));
      }
    });
  };

  const toggleExpanded = (rel: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(rel)) {
        n.delete(rel);
      } else {
        n.add(rel);
      }
      return n;
    });

  // --- render --------------------------------------------------------------

  const counts = useMemo(() => {
    let folders = 0;
    let files = 0;
    const walk = (f: TreeFolder) => {
      files += f.files.length;
      f.folders.forEach((c) => {
        folders += 1;
        walk(c);
      });
    };
    if (tree) {
      walk(tree);
    }
    return { folders, files };
  }, [tree]);

  if (!token || authFailed) {
    return (
      <div className="voxen-files voxen-files--locked">
        <p className="voxen-files__hint">
          Enter the diagrams access token to save into folders on the server.
          It's remembered in this browser.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = tokenInput.trim();
            if (t) {
              filesEngine.setToken(t);
              setTokenInput("");
            }
          }}
        >
          <input
            type="password"
            className="voxen-files__input"
            placeholder="access token"
            value={tokenInput}
            autoComplete="off"
            onChange={(e) => setTokenInput(e.target.value)}
          />
          <button
            type="submit"
            className="voxen-files__btn voxen-files__btn--primary"
          >
            Unlock
          </button>
        </form>
        {error && <div className="voxen-files__error">{error}</div>}
      </div>
    );
  }

  const renderFolder = (folder: TreeFolder, depth: number) => {
    const isRoot = folder.path === "";
    const open = isRoot || expanded.has(folder.path);
    const childDepth = isRoot ? depth : depth + 1;
    return (
      <div key={folder.path || "/"} className="voxen-files__node">
        {!isRoot && (
          <div
            className={`voxen-files__row voxen-files__row--folder${
              selectedFolder === folder.path ? " is-selected" : ""
            }`}
            style={{ paddingLeft: 6 + depth * 14 }}
            onClick={() => {
              setSelectedFolder(folder.path);
              toggleExpanded(folder.path);
            }}
            title={folder.path}
          >
            <span className="voxen-files__chev">
              <IconChevron open={open} />
            </span>
            <span className="voxen-files__icon">
              <IconFolder open={open} />
            </span>
            <span className="voxen-files__name">{folder.name}</span>
            <span
              className="voxen-files__actions"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                title="New folder inside"
                onClick={() => newFolder(folder.path)}
              >
                ＋▭
              </button>
              <button
                title="Save current canvas here as…"
                onClick={() => saveAs(folder.path)}
              >
                ＋◇
              </button>
              <button title="Rename" onClick={() => rename(folder.path, false)}>
                ✎
              </button>
              <button title="Move…" onClick={() => moveTo(folder.path, false)}>
                ⇄
              </button>
              <button
                title="Delete (to trash)"
                onClick={() => remove(folder.path, false)}
              >
                🗑
              </button>
            </span>
          </div>
        )}
        {open && (
          <div className="voxen-files__children">
            {folder.folders.map((f) => renderFolder(f, childDepth))}
            {folder.files.map((file) => (
              <div
                key={file.path}
                className={`voxen-files__row voxen-files__row--file${
                  current === file.path ? " is-current" : ""
                }`}
                style={{ paddingLeft: 6 + childDepth * 14 + 14 }}
                onClick={() => filesEngine.openFile(file.path)}
                title={`${file.path} · ${new Date(
                  file.mtime,
                ).toLocaleString()}`}
              >
                <span className="voxen-files__icon">
                  <IconFile />
                </span>
                <span className="voxen-files__name">{file.name}</span>
                <span
                  className="voxen-files__actions"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    title="Rename"
                    onClick={() => rename(file.path, true)}
                  >
                    ✎
                  </button>
                  <button title="Move…" onClick={() => moveTo(file.path, true)}>
                    ⇄
                  </button>
                  <button
                    title="Delete (to trash)"
                    onClick={() => remove(file.path, true)}
                  >
                    🗑
                  </button>
                </span>
              </div>
            ))}
            {isRoot && !folder.folders.length && !folder.files.length && (
              <div className="voxen-files__empty">
                Nothing saved yet. Create a folder, then save the canvas into
                it.
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="voxen-files">
      <div className="voxen-files__current">
        {current ? (
          <>
            <span className={`voxen-files__dot voxen-files__dot--${status}`} />
            <span className="voxen-files__current-name" title={current}>
              {displayName(current)}
            </span>
            <span className="voxen-files__current-status">
              {status === "saving"
                ? "saving…"
                : status === "dirty"
                ? "unsaved"
                : "saved"}
            </span>
            <button
              className="voxen-files__link"
              onClick={() => filesEngine.detachFile()}
              title="Stop saving to this file"
            >
              detach
            </button>
          </>
        ) : (
          <span className="voxen-files__current-name is-muted">
            Canvas is not saved to a file
          </span>
        )}
      </div>

      <div className="voxen-files__toolbar">
        <button
          className="voxen-files__btn"
          onClick={() => newFolder(selectedFolder)}
          title={`New folder in "${selectedFolder || "/"}"`}
        >
          + Folder
        </button>
        <button
          className="voxen-files__btn"
          onClick={() => saveAs(selectedFolder, { blank: true })}
          title={`New blank diagram in "${selectedFolder || "/"}"`}
        >
          + Diagram
        </button>
        <button
          className="voxen-files__btn voxen-files__btn--primary"
          onClick={() => saveAs(selectedFolder)}
          title={`Save the current canvas as a new file in "${
            selectedFolder || "/"
          }"`}
        >
          Save as…
        </button>
        <button
          className="voxen-files__btn voxen-files__btn--icon"
          onClick={() => filesEngine.refreshTree()}
          title="Refresh"
          disabled={loading}
        >
          ↻
        </button>
      </div>

      <div
        className={`voxen-files__root${
          selectedFolder === "" ? " is-selected" : ""
        }`}
        onClick={() => setSelectedFolder("")}
        title="Root folder"
      >
        / &nbsp;
        <span className="is-muted">
          {counts.folders} folders · {counts.files} diagrams
        </span>
      </div>

      <div className="voxen-files__tree">
        {tree ? (
          renderFolder(tree, 0)
        ) : loading ? (
          <div className="voxen-files__empty">Loading…</div>
        ) : null}
      </div>

      {error && <div className="voxen-files__error">{error}</div>}

      <div className="voxen-files__footer">
        <span className="is-muted">
          Autosaves while a file is open · Ctrl/⌘+S saves now
        </span>
        <button
          className="voxen-files__link"
          onClick={() => filesEngine.lock()}
          title="Forget the token in this browser"
        >
          lock
        </button>
      </div>
    </div>
  );
};
