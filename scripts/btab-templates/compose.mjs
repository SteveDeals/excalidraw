// Places copies of BTAB kit library items (by name) into an .excalidraw scene.
import crypto from "node:crypto";
import fs from "node:fs";

// per-character advance widths (em) from the kit generator, if present
let METRICS = null;
try {
  METRICS = JSON.parse(
    fs.readFileSync(
      new URL("../btab-kit/font-metrics.json", import.meta.url),
      "utf8",
    ),
  ).families;
} catch {}

const lineWidth = (line, el, fallbackPerChar) => {
  const table = METRICS?.[String(el.fontFamily)];
  if (!table) {
    return line.length * fallbackPerChar * 1.15;
  }
  return [...line].reduce((w, ch) => w + (table[ch] ?? 0.6), 0) * el.fontSize;
};

const newId = () => crypto.randomBytes(10).toString("base64url");

const bbox = (elements) => {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const el of elements) {
    x1 = Math.min(x1, el.x);
    y1 = Math.min(y1, el.y);
    x2 = Math.max(x2, el.x + Math.abs(el.width));
    y2 = Math.max(y2, el.y + Math.abs(el.height));
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
};

export const createComposer = (lib, variant = "clean") => {
  const byName = new Map();
  for (const item of lib.libraryItems) {
    const v = item.id.split(":")[1];
    if (v === variant) {
      byName.set(item.name, item);
    }
  }
  const elements = [];

  const itemSize = (name) => {
    const item = byName.get(name);
    if (!item) {
      throw new Error(
        `no "${variant}" kit item named "${name}" (have: ${[
          ...byName.keys(),
        ].join(", ")})`,
      );
    }
    return bbox(item.elements.filter((e) => !e.isDeleted));
  };

  /** place item `name` with its top-left at (x, y); returns its box */
  const place = (name, x, y) => {
    const box = itemSize(name);
    const src = byName.get(name).elements.filter((e) => !e.isDeleted);
    const ids = new Map(src.map((e) => [e.id, newId()]));
    const groups = new Map();
    const gid = (g) => {
      if (!groups.has(g)) {
        groups.set(g, newId());
      }
      return groups.get(g);
    };
    const dx = x - box.x;
    const dy = y - box.y;
    const placed = [];
    for (const el of src) {
      const copy = structuredClone(el);
      copy.id = ids.get(el.id);
      copy.x += dx;
      copy.y += dy;
      copy.seed = crypto.randomInt(2 ** 31);
      copy.versionNonce = crypto.randomInt(2 ** 31);
      copy.groupIds = (el.groupIds || []).map(gid);
      copy.frameId = null;
      if (el.containerId) {
        copy.containerId = ids.get(el.containerId) ?? null;
      }
      if (el.boundElements) {
        copy.boundElements = el.boundElements
          .filter((b) => ids.has(b.id))
          .map((b) => ({ ...b, id: ids.get(b.id) }));
      }
      for (const k of ["startBinding", "endBinding"]) {
        if (el[k]) {
          copy[k] = ids.has(el[k].elementId)
            ? { ...el[k], elementId: ids.get(el[k].elementId) }
            : null;
        }
      }
      elements.push(copy);
      placed.push(copy);
    }
    return { x, y, width: box.width, height: box.height, els: placed };
  };

  const findText = (els, text) => {
    const el = els.find((e) => e.type === "text" && e.text === text);
    if (!el) {
      throw new Error(`no text "${text}" in placed item`);
    }
    return el;
  };

  /** replace texts ({ old: new }) inside a placed item. A text centred on a
   * shape behind it (button label, badge) stays centred. */
  const edit = (placed, texts) => {
    for (const [from, to] of Object.entries(texts)) {
      const el = findText(placed.els, from);
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      const shape = placed.els.find(
        (s) =>
          s.type !== "text" &&
          s.width < 400 &&
          Math.abs(s.x + s.width / 2 - cx) < 4 &&
          Math.abs(s.y + s.height / 2 - cy) < 4,
      );
      const oldLines = el.text.split("\n");
      const newLines = to.split("\n");
      const perChar = el.width / Math.max(1, ...oldLines.map((l) => l.length));
      const width = Math.ceil(
        Math.max(...newLines.map((l) => lineWidth(l, el, perChar))),
      );
      el.height = (el.height / oldLines.length) * newLines.length;
      if (shape) {
        el.x = cx - width / 2;
        // grow a button only when the new text would crowd its edges
        const pad = Math.min((shape.width - el.width) / 2, 16);
        if (width + 2 * pad > shape.width) {
          shape.x = cx - width / 2 - pad;
          shape.width = width + 2 * pad;
        }
      }
      el.width = width;
      el.text = to;
      el.originalText = to;
    }
  };

  /** move the sidebar's active highlight from the `from` row to the `to`
   * row (both are nav labels inside `placed`) */
  const activate = (placed, from, to) => {
    const a = findText(placed.els, from);
    const b = findText(placed.els, to);
    // the smallest rectangle behind the active label is its highlight
    const hl = placed.els
      .filter(
        (e) =>
          e.type === "rectangle" &&
          a.x > e.x &&
          a.x < e.x + e.width &&
          a.y > e.y &&
          a.y + a.height < e.y + e.height,
      )
      .sort((p, q) => p.width * p.height - q.width * q.height)[0];
    if (!hl) {
      throw new Error(`no highlight behind "${from}"`);
    }
    const inset = a.x - hl.x;
    // a top-level row has an icon left of its label: cover it too
    const row = placed.els.filter(
      (e) =>
        e.type !== "text" &&
        e !== hl &&
        e.width < 30 &&
        e.x < b.x &&
        Math.abs(e.y + e.height / 2 - (b.y + b.height / 2)) < 8,
    );
    const icon = row.reduce((m, e) => Math.min(m, e.x), b.x);
    const left = Math.min(b.x, icon) - inset;
    hl.width += hl.x - left;
    hl.x = left;
    hl.y += b.y + b.height / 2 - (a.y + a.height / 2);
    [a.strokeColor, b.strokeColor] = [b.strokeColor, a.strokeColor];
    // the highlight must render under the new row's label + icon
    elements.splice(elements.indexOf(hl), 1);
    const under = Math.min(...[b, ...row].map((e) => elements.indexOf(e)));
    elements.splice(under, 0, hl);
  };

  /** delete the innermost group holding `text` (or the whole item if null) */
  const removeGroupOf = (placed, text) => {
    let doomed;
    if (text === null) {
      doomed = new Set(placed.els.map((e) => e.id));
    } else {
      const el = findText(placed.els, text);
      const g = el.groupIds[0];
      doomed = new Set(
        placed.els.filter((e) => e.groupIds.includes(g)).map((e) => e.id),
      );
    }
    for (let i = elements.length - 1; i >= 0; i--) {
      if (doomed.has(elements[i].id)) {
        elements.splice(i, 1);
      }
    }
    placed.els = placed.els.filter((e) => !doomed.has(e.id));
  };

  /** remove single elements matching `pred` from a placed item */
  const remove = (placed, pred) => {
    const doomed = new Set(placed.els.filter(pred).map((e) => e.id));
    for (let i = elements.length - 1; i >= 0; i--) {
      if (doomed.has(elements[i].id)) {
        elements.splice(i, 1);
      }
    }
    placed.els = placed.els.filter((e) => !doomed.has(e.id));
  };

  const scene = () => ({
    type: "excalidraw",
    version: 2,
    source: "https://labs.voxen.dev/diagrams/",
    elements,
    appState: { viewBackgroundColor: "#ffffff", gridSize: 20 },
    files: {},
  });

  return {
    place,
    edit,
    activate,
    remove,
    removeGroupOf,
    itemSize,
    scene,
    names: () => [...byName.keys()],
  };
};
