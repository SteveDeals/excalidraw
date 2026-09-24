#!/usr/bin/env node
// Generates public/btab-dashboard.excalidrawlib — the "BTAB dashboard kit":
// Excalidraw library items drawn from btab's vendor-dashboard, at the real
// proportions (1 canvas px = 1 CSS px) and in its default dark theme.
//
//   node scripts/btab-kit/build.mjs [--check]
//
// Inputs live in scripts/btab-kit/source/ (refresh with sync-from-btab.mjs).
// Output is deterministic: ids, seeds and timestamps are derived from item
// names, so regenerating an unchanged kit produces an identical file and the
// app can replace `btab-kit:*` items by id without touching user items.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const read = (f) => fs.readFileSync(path.join(here, f), "utf8");

const tokens = JSON.parse(read("source/tokens.json"));
const theme = JSON.parse(read("source/theme.json"));
const iconSvg = read("source/icon.svg");
const metrics = JSON.parse(read("font-metrics.json")).families;

const OUT = path.join(repo, "public/btab-dashboard.excalidrawlib");
// Fixed timestamp keeps the output byte-stable across runs.
const TIMESTAMP = Date.UTC(2026, 8, 24);

// ---------------------------------------------------------------------------
// colours
// ---------------------------------------------------------------------------

const hex = (c) =>
  c
    .replace("#", "")
    .match(/../g)
    .map((v) => parseInt(v, 16));
const toHex = (rgb) =>
  `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
// Tailwind `bg-x/15` over a surface, flattened so parts stay opaque on any
// canvas background.
const tint = (color, over, alpha = 0.15) => {
  const a = hex(color);
  const b = hex(over);
  return toHex(a.map((v, i) => v * alpha + b[i] * (1 - alpha)));
};

const t = theme.dark;
const C = {
  bg: t.background,
  bg2: t["background-secondary"],
  bg3: t["background-tertiary"],
  fg: t.foreground,
  muted: t["foreground-muted"],
  border: t.border,
  accent: t.accent,
  accentText: t["accent-text"],
  positive: t.positive,
  negative: t.negative,
  warning: t.warning,
  green: theme.btabGreen || tokens.green,
  navy: tokens.navy,
  white: "#ffffff",
  // emerald-400, the avatar gradient's start
  avatar: "#34d399",
  // blue-500 / blue-400 (StatusBadge `info`)
  info: "#3b82f6",
  infoText: "#60a5fa",
};

// Tailwind sizes used by the dashboard
const TEXT = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, "2xl": 24, "3xl": 30 };
const LINE_HEIGHT = 1.25;

// ---------------------------------------------------------------------------
// deterministic ids / seeds
// ---------------------------------------------------------------------------

const hash = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

// ---------------------------------------------------------------------------
// element builder
// ---------------------------------------------------------------------------

const VARIANTS = {
  clean: { roughness: 0, fontFamily: 11 /* Inter */ },
  sketch: { roughness: 1, fontFamily: 5 /* Excalifont */ },
};

class Kit {
  constructor(variant, itemName) {
    this.variant = variant;
    this.v = VARIANTS[variant];
    this.prefix = `btab-kit:${variant}:${itemName}`;
    this.elements = [];
    this.groups = [];
    this.count = 0;
    this.groupCount = 0;
  }

  nextId(kind) {
    this.count++;
    return `bk${hash(`${this.prefix}:${kind}:${this.count}`).toString(36)}`;
  }

  // Nested groups: every element drawn inside `fn` is grouped together, so a
  // composite part (the sidebar inside the shell) can be selected as a unit.
  group(fn) {
    this.groupCount++;
    this.groups.push(
      `bg${hash(`${this.prefix}:group:${this.groupCount}`).toString(36)}`,
    );
    const result = fn();
    this.groups.pop();
    return result;
  }

  base(type, x, y, width, height, props = {}) {
    const id = this.nextId(type);
    const el = {
      id,
      type,
      x: round(x),
      y: round(y),
      width: round(width),
      height: round(height),
      angle: 0,
      strokeColor: C.border,
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: this.v.roughness,
      opacity: 100,
      groupIds: [...this.groups].reverse(),
      frameId: null,
      index: null,
      roundness: null,
      seed: hash(`${id}:seed`) % 2 ** 31,
      version: 1,
      versionNonce: hash(`${id}:nonce`) % 2 ** 31,
      isDeleted: false,
      boundElements: null,
      updated: TIMESTAMP,
      link: null,
      locked: false,
      ...props,
    };
    this.elements.push(el);
    return el;
  }

  rect(x, y, w, h, { fill, stroke, radius = 0, dashed, strokeWidth } = {}) {
    return this.base("rectangle", x, y, w, h, {
      backgroundColor: fill || "transparent",
      strokeColor: stroke || (fill ? fill : C.border),
      strokeStyle: dashed ? "dashed" : "solid",
      strokeWidth: strokeWidth || 1,
      roundness: radius ? { type: 3, value: radius } : null,
    });
  }

  ellipse(x, y, w, h, { fill, stroke, strokeWidth } = {}) {
    return this.base("ellipse", x, y, w, h, {
      backgroundColor: fill || "transparent",
      strokeColor: stroke || fill || C.border,
      strokeWidth: strokeWidth || 1,
    });
  }

  // Open polyline (points relative to the canvas), or a closed filled polygon.
  line(points, { stroke, fill, strokeWidth, closed } = {}) {
    const [x0, y0] = points[0];
    const rel = points.map(([px, py]) => [round(px - x0), round(py - y0)]);
    if (closed) {
      rel.push([0, 0]);
    }
    const xs = rel.map((p) => p[0]);
    const ys = rel.map((p) => p[1]);
    return this.base(
      "line",
      x0,
      y0,
      Math.max(...xs) - Math.min(...xs),
      Math.max(...ys) - Math.min(...ys),
      {
        points: rel,
        strokeColor: stroke || fill || C.muted,
        backgroundColor: fill || "transparent",
        strokeWidth: strokeWidth || 1,
        lastCommittedPoint: null,
        startBinding: null,
        endBinding: null,
        startArrowhead: null,
        endArrowhead: null,
        polygon: !!closed,
      },
    );
  }

  // Tailwind `rounded-full`: Excalidraw's rectangle radius tops out at 25% of
  // the short side, so pills are drawn as closed polygons.
  pill(x, y, w, h, { fill, stroke, radius = h / 2 } = {}) {
    const r = Math.min(radius, h / 2, w / 2);
    const pts = [];
    const corner = (cx, cy, from) => {
      for (let i = 0; i <= 6; i++) {
        const a = from + (i / 6) * (Math.PI / 2);
        pts.push([x + cx + r * Math.cos(a), y + cy + r * Math.sin(a)]);
      }
    };
    corner(w - r, h - r, 0);
    corner(r, h - r, Math.PI / 2);
    corner(r, r, Math.PI);
    corner(w - r, r, (3 * Math.PI) / 2);
    return this.line(pts, { fill, stroke: stroke || fill, closed: true });
  }

  // A page-background (`--background`) plate behind everything drawn so far,
  // so a part whose text is meant for the dark page stays readable when it is
  // dropped onto a white canvas. Inside the shell it is invisible.
  backdrop(pad = 16) {
    let [x1, y1, x2, y2] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const el of this.elements) {
      const xs = el.points
        ? el.points.map((pt) => el.x + pt[0])
        : [el.x, el.x + el.width];
      const ys = el.points
        ? el.points.map((pt) => el.y + pt[1])
        : [el.y, el.y + el.height];
      x1 = Math.min(x1, ...xs);
      y1 = Math.min(y1, ...ys);
      x2 = Math.max(x2, ...xs);
      y2 = Math.max(y2, ...ys);
    }
    const plate = this.rect(
      x1 - pad,
      y1 - pad,
      x2 - x1 + 2 * pad,
      y2 - y1 + 2 * pad,
      {
        fill: C.bg,
        radius: 8,
      },
    );
    this.elements.unshift(this.elements.pop());
    return plate;
  }

  textWidth(str, size) {
    const table = metrics[this.v.fontFamily];
    return Math.max(
      ...str
        .split("\n")
        .map((line) =>
          [...line].reduce((sum, ch) => sum + (table[ch] ?? 0.6) * size, 0),
        ),
    );
  }

  // `align` positions the text inside a box of width `w` starting at x;
  // `h` vertically centres it inside a box of that height starting at y.
  text(x, y, str, { size = TEXT.sm, color = C.fg, align = "left", w, h } = {}) {
    const width = this.textWidth(str, size);
    const lines = str.split("\n").length;
    const height = lines * size * LINE_HEIGHT;
    let tx = x;
    if (align === "center") {
      tx = x + (w - width) / 2;
    } else if (align === "right") {
      tx = x + w - width;
    }
    const ty = h ? y + (h - height) / 2 : y;
    return this.base("text", tx, ty, width, height, {
      strokeColor: color,
      text: str,
      originalText: str,
      fontSize: size,
      fontFamily: this.v.fontFamily,
      textAlign: align === "center" && lines > 1 ? "center" : "left",
      verticalAlign: "top",
      containerId: null,
      lineHeight: LINE_HEIGHT,
      autoResize: true,
    });
  }
}

const round = (n) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// icons (lucide-ish, 20px box, drawn with plain strokes)
// ---------------------------------------------------------------------------

const icon = (k, kind, x, y, s = 20, color = C.muted) => {
  const p = (px, py) => [x + (px / 20) * s, y + (py / 20) * s];
  const o = { stroke: color, strokeWidth: 1.5 };
  k.group(() => {
    switch (kind) {
      case "store":
        k.line([p(3, 8), p(4.5, 3), p(15.5, 3), p(17, 8), p(3, 8)], o);
        k.line([p(4, 8), p(4, 17), p(16, 17), p(16, 8)], o);
        k.line([p(8, 17), p(8, 12), p(12, 12), p(12, 17)], o);
        break;
      case "box":
        k.line(
          [
            p(10, 2),
            p(17, 6),
            p(17, 14),
            p(10, 18),
            p(3, 14),
            p(3, 6),
            p(10, 2),
          ],
          o,
        );
        k.line([p(3, 6), p(10, 10), p(17, 6)], o);
        k.line([p(10, 10), p(10, 18)], o);
        break;
      case "bag":
        k.rect(...p(3, 6), (14 / 20) * s, (12 / 20) * s, {
          stroke: color,
          radius: 2,
          strokeWidth: 1.5,
        });
        k.line([p(7, 9), p(7, 4), p(13, 4), p(13, 9)], o);
        break;
      case "gear":
        k.ellipse(...p(2.5, 2.5), (15 / 20) * s, (15 / 20) * s, o);
        k.ellipse(...p(7, 7), (6 / 20) * s, (6 / 20) * s, o);
        break;
      case "help":
        k.ellipse(...p(2, 2), (16 / 20) * s, (16 / 20) * s, o);
        k.text(...p(2, 2), "?", {
          size: (11 / 20) * s,
          color,
          align: "center",
          w: (16 / 20) * s,
          h: (16 / 20) * s,
        });
        break;
      case "collapse":
        k.rect(...p(2, 2), (16 / 20) * s, (16 / 20) * s, {
          stroke: color,
          radius: 3,
          strokeWidth: 1.5,
        });
        k.line([p(7, 2), p(7, 18)], o);
        k.line([p(13, 7.5), p(10.5, 10), p(13, 12.5)], o);
        break;
      case "menu":
        for (const yy of [5, 10, 15]) {
          k.line([p(3, yy), p(17, yy)], o);
        }
        break;
      case "sparkles":
        k.line(
          [
            p(10, 2),
            p(11.8, 8.2),
            p(18, 10),
            p(11.8, 11.8),
            p(10, 18),
            p(8.2, 11.8),
            p(2, 10),
            p(8.2, 8.2),
            p(10, 2),
          ],
          o,
        );
        break;
      case "logout":
        k.line([p(8, 3), p(3, 3), p(3, 17), p(8, 17)], o);
        k.line([p(8, 10), p(17, 10)], o);
        k.line([p(13, 6), p(17, 10), p(13, 14)], o);
        break;
      case "chevron":
        k.line([p(5, 7.5), p(10, 12.5), p(15, 7.5)], o);
        break;
      case "close":
        k.line([p(5, 5), p(15, 15)], o);
        k.line([p(15, 5), p(5, 15)], o);
        break;
      case "more":
        for (const xx of [4.5, 10, 15.5]) {
          k.ellipse(...p(xx - 1.2, 8.8), (2.4 / 20) * s, (2.4 / 20) * s, {
            fill: color,
          });
        }
        break;
      case "inbox":
        k.line(
          [p(2, 11), p(6, 11), p(8, 14), p(12, 14), p(14, 11), p(18, 11)],
          o,
        );
        k.line([p(2, 11), p(4.5, 4), p(15.5, 4), p(18, 11), p(18, 16)], o);
        k.line([p(2, 11), p(2, 16), p(18, 16)], o);
        break;
      default:
        throw new Error(`unknown icon ${kind}`);
    }
  });
};

// ---------------------------------------------------------------------------
// brand
// ---------------------------------------------------------------------------

// brand/icon.svg: a navy tile with the "B" as one M/C/Z path — the outer
// shape plus two counters. Flattened into polygons (counters painted navy).
const iconPaths = (() => {
  const tf = iconSvg.match(
    /translate\(([\d.-]+)[ ,]+([\d.-]+)\)\s*scale\(([\d.]+)\)/,
  );
  const [tx, ty, sc] = tf ? tf.slice(1).map(Number) : [0, 0, 1];
  const d = iconSvg.match(/ d="([^"]+)"/)[1];
  const subpaths = [];
  for (const sub of d.split("M").slice(1)) {
    const nums = sub.replace(/[CZ]/g, " ").trim().split(/\s+/).map(Number);
    const pts = [];
    // start point, then each cubic segment's end point (segments are tiny)
    for (let i = 0; i + 1 < nums.length; i += i === 0 ? 2 : 6) {
      const j = i === 0 ? 0 : i + 4;
      if (j + 1 < nums.length) {
        pts.push([tx + nums[j] * sc, ty + nums[j + 1] * sc]);
      }
    }
    subpaths.push(pts);
  }
  const radius = Number(iconSvg.match(/rx="([\d.]+)"/)?.[1] ?? 22);
  return { subpaths, radius };
})();

const btabIcon = (k, x, y, size) => {
  const f = size / 100;
  k.group(() => {
    k.rect(x, y, size, size, { fill: C.navy, radius: iconPaths.radius * f });
    iconPaths.subpaths.forEach((pts, i) =>
      k.line(
        pts.map(([px, py]) => [x + px * f, y + py * f]),
        { fill: i === 0 ? C.green : C.navy, closed: true },
      ),
    );
  });
};

// <BtabLogo>: "B" in btab-green, "tab" in currentColor (muted in the shell).
const btabLogo = (k, x, y, size, tabColor = C.muted) =>
  k.group(() => {
    const b = k.text(x, y, "B", { size, color: C.green });
    const tab = k.text(x + b.width, y, "tab", { size, color: tabColor });
    return b.width + tab.width;
  });

// ---------------------------------------------------------------------------
// parts
// ---------------------------------------------------------------------------

const BUTTON_H = 44; // min-h-[44px]

// Returns the drawn width so callers can lay buttons out in a row.
const button = (k, x, y, label, tone = "primary", size = TEXT.sm) => {
  const w = Math.round(k.textWidth(label, size) + 32); // px-4
  const style = {
    primary: { fill: C.accent, stroke: C.accent, color: C.white },
    secondary: { fill: C.bg, stroke: C.border, color: C.fg },
    danger: { fill: C.negative, stroke: C.negative, color: C.white },
  }[tone];
  k.group(() => {
    k.rect(x, y, w, BUTTON_H, {
      fill: style.fill,
      stroke: style.stroke,
      radius: 8,
    });
    k.text(x, y, label, {
      size,
      color: style.color,
      align: "center",
      w,
      h: BUTTON_H,
    });
  });
  return w;
};

const buttonRowRight = (k, right, y, buttons) => {
  const widths = buttons.map(([label]) =>
    Math.round(k.textWidth(label, TEXT.sm) + 32),
  );
  let x = right - widths.reduce((a, b) => a + b, 0) - 8 * (buttons.length - 1);
  buttons.forEach(([label, tone], i) => {
    button(k, x, y, label, tone);
    x += widths[i] + 8;
  });
};

const pageHeader = (k, x, y, w, { back = "Rooms", title, subtitle, actions }) =>
  k.group(() => {
    let cy = y;
    if (back) {
      k.text(x, cy, `← ${back}`, { size: TEXT.sm, color: C.muted });
      cy += 28;
    }
    k.text(x, cy, title, { size: TEXT["3xl"], color: C.fg });
    const titleH = TEXT["3xl"] * LINE_HEIGHT;
    if (subtitle) {
      k.text(x, cy + titleH + 4, subtitle, { size: TEXT.sm, color: C.muted });
    }
    const blockH = titleH + (subtitle ? 4 + TEXT.sm * LINE_HEIGHT : 0);
    if (actions) {
      buttonRowRight(k, x + w, cy + (blockH - BUTTON_H) / 2, actions);
    }
    return cy + blockH - y;
  });

const BADGE_TONES = {
  neutral: { fill: C.bg3, color: C.muted },
  info: { fill: tint(C.info, C.bg2), color: C.infoText },
  success: { fill: tint(C.positive, C.bg2), color: C.positive },
  warning: { fill: tint(C.warning, C.bg2), color: C.warning },
  danger: { fill: tint(C.negative, C.bg2), color: C.negative },
  accent: { fill: tint(C.accent, C.bg2), color: C.accentText },
};

const statusBadge = (k, x, y, label, tone) => {
  const s = BADGE_TONES[tone];
  const w = Math.round(k.textWidth(label, TEXT.xs) + 20); // px-2.5
  const h = 22;
  k.group(() => {
    k.pill(x, y, w, h, { fill: s.fill });
    k.text(x, y, label, {
      size: TEXT.xs,
      color: s.color,
      align: "center",
      w,
      h,
    });
  });
  return w;
};

const textInput = (k, x, y, w, { label, value, placeholder, select }) =>
  k.group(() => {
    k.text(x, y, label, { size: TEXT.sm, color: C.muted });
    const iy = y + 26;
    k.rect(x, iy, w, BUTTON_H, { fill: C.bg, stroke: C.border, radius: 8 });
    k.text(x + 16, iy, value || placeholder, {
      size: TEXT.base,
      color: value ? C.fg : C.muted,
      h: BUTTON_H,
    });
    if (select) {
      icon(k, "chevron", x + w - 16 - 20, iy + 12, 20, C.muted);
    }
  });

// settings sections come from btab's components/settings/sections.ts
const settingsNav = (k, x, y, active = 1) =>
  k.group(() => {
    let cx = x;
    theme.settingsSections.forEach((label, i) => {
      const w = Math.round(k.textWidth(label, TEXT.sm) + 28); // px-3.5
      const on = i === active;
      k.group(() => {
        k.pill(cx, y, w, BUTTON_H, {
          fill: on ? C.accent : C.bg2,
          stroke: on ? C.accent : C.border,
        });
        k.text(cx, y, label, {
          size: TEXT.sm,
          color: on ? C.white : C.muted,
          align: "center",
          w,
          h: BUTTON_H,
        });
      });
      cx += w + 8;
    });
    return cx - 8 - x;
  });

// ---------------------------------------------------------------------------
// the shell: DashboardLayout (desktop, 1280 × 800)
// ---------------------------------------------------------------------------

const SHELL_W = 1280;
const SHELL_H = 800;
const SIDEBAR_W = theme.sidebarWidth;

const NAV = [
  {
    label: "My Store",
    icon: "store",
    children: [
      "Overview",
      "Manage store",
      "Customize",
      "Blog",
      "Rooms",
      "AI Content",
      "Apps",
      "SEO",
      "Domain",
    ],
    activeChild: 4,
  },
  { label: "Products", icon: "box" },
  { label: "Sales", icon: "bag" },
  { label: "Settings", icon: "gear" },
];

const sidebar = (k, x, y, h) =>
  k.group(() => {
    k.rect(x, y, SIDEBAR_W, h, { fill: C.bg2, stroke: C.border });

    // vd-head: logo + "Vendor Portal" + collapse
    const headH = 68;
    k.group(() => {
      const lw = btabLogo(k, x + 16, y + (headH - 30) / 2, 24);
      k.text(x + 16 + lw + 12, y, "Vendor Portal", {
        size: TEXT.sm,
        color: C.muted,
        h: headH,
      });
      icon(k, "collapse", x + SIDEBAR_W - 16 - 28, y + (headH - 20) / 2);
    });
    k.line(
      [
        [x, y + headH],
        [x + SIDEBAR_W, y + headH],
      ],
      { stroke: C.border },
    );

    // vd-nav: p-4, rows py-2.5 (40px), space-y-1
    let cy = y + headH + 16;
    const row = (label, iconKind, selected, strong) => {
      k.group(() => {
        if (selected) {
          k.rect(x + 16, cy, SIDEBAR_W - 32, 40, { fill: C.accent, radius: 8 });
        }
        const color = selected ? C.white : strong ? C.fg : C.muted;
        icon(k, iconKind, x + 28, cy + 10, 20, color);
        k.text(x + 60, cy, label, { size: TEXT.sm, color, h: 40 });
      });
      cy += 44;
    };
    for (const item of NAV) {
      row(item.label, item.icon, false, !!item.children);
      if (item.children) {
        // vd-children: mt-1 ml-4 pl-4 border-l, rows py-2 (36px), space-y-0.5
        const top = cy;
        k.group(() => {
          item.children.forEach((child, i) => {
            const on = i === item.activeChild;
            k.group(() => {
              if (on) {
                k.rect(x + 48, cy, SIDEBAR_W - 16 - 48, 36, {
                  fill: C.accent,
                  radius: 8,
                });
              }
              k.text(x + 60, cy, child, {
                size: TEXT.sm,
                color: on ? C.white : C.muted,
                h: 36,
              });
            });
            cy += 38;
          });
          k.line(
            [
              [x + 32, top],
              [x + 32, cy - 2],
            ],
            { stroke: C.border },
          );
        });
        cy += 4;
      }
    }

    // footer: Help row, then the user block (border-t, p-4)
    const footerY = y + h - 64;
    cy = footerY - 16 - 40;
    row("Help", "help", false, false);
    k.line(
      [
        [x, footerY],
        [x + SIDEBAR_W, footerY],
      ],
      { stroke: C.border },
    );
    k.group(() => {
      k.ellipse(x + 16, footerY + 16, 32, 32, { fill: C.avatar });
      k.text(x + 16, footerY + 16, "A", {
        size: TEXT.sm,
        color: C.white,
        align: "center",
        w: 32,
        h: 32,
      });
      k.text(x + 60, footerY + 13, "Acme Furniture", { size: TEXT.sm });
      k.text(x + 60, footerY + 33, "me@acme.co", {
        size: TEXT.xs,
        color: C.muted,
      });
      icon(k, "sparkles", x + SIDEBAR_W - 16 - 56, footerY + 24, 16);
      icon(k, "logout", x + SIDEBAR_W - 16 - 24, footerY + 24, 16);
    });
  });

// <Page> (px-8 py-8, max-w-5xl) inside <main>
const PAGE_X = SIDEBAR_W + 32;
const PAGE_W = SHELL_W - SIDEBAR_W - 64;

// ---------------------------------------------------------------------------
// library items
// ---------------------------------------------------------------------------

const ITEMS = [
  [
    "DashboardLayout",
    (k) => {
      k.rect(0, 0, SHELL_W, SHELL_H, { fill: C.bg, stroke: C.border });
      sidebar(k, 0, 0, SHELL_H);
      pageHeader(k, PAGE_X, 32, PAGE_W, {
        back: null,
        title: "Page title",
        subtitle: "One line on what this page is for.",
        actions: [
          ["Secondary", "secondary"],
          ["+ New item", "primary"],
        ],
      });
      // <main> content area, left for the page's own parts
      k.rect(PAGE_X, 128, PAGE_W, SHELL_H - 128 - 32, {
        stroke: C.border,
        dashed: true,
        radius: 12,
      });
      k.text(PAGE_X, 128, "Page content", {
        size: TEXT.sm,
        color: C.muted,
        align: "center",
        w: PAGE_W,
        h: SHELL_H - 160,
      });
    },
  ],
  ["Sidebar", (k) => sidebar(k, 0, 0, SHELL_H)],
  [
    "MobileHeader",
    (k) => {
      // <md: sticky top bar, px-4 py-3, 57px tall, 390px phone
      k.rect(0, 0, 390, 57, { fill: C.bg2, stroke: C.border });
      const lw = btabLogo(k, 16, 16, 20);
      k.text(16 + lw + 8, 0, "Vendor", {
        size: TEXT.sm,
        color: C.muted,
        h: 57,
      });
      icon(k, "sparkles", 390 - 16 - 24 - 8 - 36, 18, 20);
      icon(k, "menu", 390 - 16 - 28, 16, 24, C.fg);
    },
  ],
  [
    "PageHeader",
    (k) =>
      pageHeader(k, 0, 0, 832, {
        back: "Rooms",
        title: "Rooms",
        subtitle:
          "A room is a photo with your pieces in it. Shoppers scroll it at /rooms.",
        actions: [
          ["From my catalogue", "secondary"],
          ["+ New room", "primary"],
        ],
      }),
  ],
  ["Button", (k) => button(k, 0, 0, "+ New room", "primary")],
  ["ButtonSecondary", (k) => button(k, 0, 0, "From my catalogue", "secondary")],
  ["ButtonDanger", (k) => button(k, 0, 0, "Delete", "danger")],
  [
    "Card",
    (k) => {
      // rounded-xl border bg-secondary p-5
      k.rect(0, 0, 400, 180, { fill: C.bg2, stroke: C.border, radius: 12 });
      k.rect(20, 20, 40, 40, { fill: tint(C.accent, C.bg2), radius: 8 });
      k.text(20, 76, "Card title", { size: TEXT.lg });
      k.text(
        20,
        104,
        "Supporting text for this card, one or two\nlines at most.",
        {
          size: TEXT.sm,
          color: C.muted,
        },
      );
      k.text(20, 150, "View details →", { size: TEXT.sm, color: C.muted });
    },
  ],
  [
    "SettingsCard",
    (k) => {
      const w = 640;
      k.rect(0, 0, w, 250, { fill: C.bg2, stroke: C.border, radius: 12 });
      // header px-5 py-4 + border-b
      k.text(20, 16, "Section title", { size: TEXT.base });
      k.text(20, 40, "What this group of settings controls.", {
        size: TEXT.sm,
        color: C.muted,
      });
      k.line(
        [
          [0, 74],
          [w, 74],
        ],
        { stroke: C.border },
      );
      // body px-5 py-5
      textInput(k, 20, 94, w - 40, {
        label: "Store name",
        value: "Acme Furniture",
      });
      // SettingsCardFooter: px-5 py-3, bg-background, border-t
      k.rect(0, 182, w, 68, { fill: C.bg, stroke: C.border, radius: 12 });
      k.text(20, 182, "Saved", { size: TEXT.sm, color: C.positive, h: 68 });
      buttonRowRight(k, w - 20, 194, [["Save", "primary"]]);
    },
  ],
  [
    "StatTile",
    (k) => {
      // HomeStats tile: rounded-xl border bg-secondary px-4 py-3
      k.rect(0, 0, 200, 84, { fill: C.bg2, stroke: C.border, radius: 12 });
      k.text(16, 12, "Orders this week", { size: TEXT.xs, color: C.muted });
      k.text(16, 32, "128", { size: TEXT.xl });
      k.text(16, 60, "+12% vs last week", { size: TEXT.xs, color: C.positive });
    },
  ],
  [
    "Table",
    (k) => {
      const w = 760;
      const cols = [
        ["Order", 16],
        ["Customer", 140],
        ["Status", 400],
        ["Total", w - 16, "right"],
      ];
      const rows = [
        ["#1042", "Jane Cooper", ["Paid", "success"], "$1,280.00"],
        ["#1041", "Liam Nguyen", ["Awaiting stock", "warning"], "$640.00"],
        ["#1040", "Olivia Brown", ["Draft", "neutral"], "$95.00"],
      ];
      const headH = 40;
      const rowH = 52;
      const h = headH + rows.length * rowH;
      k.rect(0, 0, w, h, { fill: C.bg2, stroke: C.border, radius: 12 });
      // thead: bg-tertiary, text-xs uppercase muted
      k.rect(1, 1, w - 2, headH - 1, { fill: C.bg3, radius: 11 });
      k.rect(1, headH / 2, w - 2, headH / 2, { fill: C.bg3 });
      for (const [label, cx, align] of cols) {
        k.text(align === "right" ? cx - 200 : cx, 0, label.toUpperCase(), {
          size: TEXT.xs,
          color: C.muted,
          align: align || "left",
          w: 200,
          h: headH,
        });
      }
      rows.forEach((r, i) => {
        const y = headH + i * rowH;
        k.line(
          [
            [0, y],
            [w, y],
          ],
          { stroke: C.border },
        );
        k.group(() => {
          k.text(cols[0][1], y, r[0], {
            size: TEXT.sm,
            color: C.accentText,
            h: rowH,
          });
          k.text(cols[1][1], y, r[1], { size: TEXT.sm, h: rowH });
          statusBadge(k, cols[2][1], y + (rowH - 22) / 2, ...r[2]);
          k.text(w - 16 - 200, y, r[3], {
            size: TEXT.sm,
            align: "right",
            w: 200,
            h: rowH,
          });
        });
      });
    },
  ],
  [
    "StatusBadge",
    (k) => {
      let x = 0;
      for (const [label, tone] of [
        ["Draft", "neutral"],
        ["Active", "info"],
        ["Live", "success"],
        ["Awaiting stock", "warning"],
        ["Overdue", "danger"],
        ["New", "accent"],
      ]) {
        x += statusBadge(k, x, 0, label, tone) + 8;
      }
    },
  ],
  [
    "TextInput",
    (k) =>
      textInput(k, 0, 0, 360, {
        label: "Title",
        placeholder: "e.g. The coastal living room",
      }),
  ],
  [
    "Select",
    (k) =>
      textInput(k, 0, 0, 360, {
        label: "Room type",
        value: "Living",
        select: true,
      }),
  ],
  [
    "Tabs",
    (k) => {
      // step tabs of the room wizard: equal boxes, active = accent border
      const w = 272;
      ["Photo", "Pieces", "Publish"].forEach((label, i) => {
        const on = i === 0;
        k.group(() => {
          k.rect(i * (w + 8), 0, w, BUTTON_H, {
            fill: C.bg,
            stroke: on ? C.accent : C.border,
            radius: 8,
          });
          k.text(i * (w + 8), 0, label, {
            size: TEXT.sm,
            color: on ? C.fg : C.muted,
            align: "center",
            w,
            h: BUTTON_H,
          });
        });
      });
    },
  ],
  [
    "EmptyState",
    (k) => {
      // rounded-xl border bg-secondary px-6 py-12 text-center
      const w = 640;
      k.rect(0, 0, w, 262, { fill: C.bg2, stroke: C.border, radius: 12 });
      icon(k, "inbox", w / 2 - 20, 48, 40);
      k.text(0, 104, "No rooms yet", { size: TEXT.lg, align: "center", w });
      k.text(0, 132, "Add a photo of a room and pin your pieces in it.", {
        size: TEXT.sm,
        color: C.muted,
        align: "center",
        w,
      });
      const bw = Math.round(k.textWidth("+ New room", TEXT.sm) + 32);
      button(k, (w - bw) / 2, 170, "+ New room", "primary");
    },
  ],
  [
    "Modal",
    (k) => {
      const w = 480;
      k.rect(0, 0, w, 206, { fill: C.bg2, stroke: C.border, radius: 12 });
      k.text(24, 24, "Delete this room?", { size: TEXT.lg });
      icon(k, "close", w - 24 - 20, 24, 20);
      k.text(
        24,
        60,
        "Shoppers will no longer see it at /rooms. You can\nrestore it from Restore version for 30 days.",
        {
          size: TEXT.sm,
          color: C.muted,
        },
      );
      k.line(
        [
          [0, 122],
          [w, 122],
        ],
        { stroke: C.border },
      );
      buttonRowRight(k, w - 24, 142, [
        ["Cancel", "secondary"],
        ["Delete", "danger"],
      ]);
    },
  ],
  ["SettingsNav", (k) => settingsNav(k, 0, 0)],
  [
    "DropdownMenu",
    (k) => {
      const w = 224;
      const items = [
        ["View on store", C.fg],
        ["Unpublish", C.fg],
        ["Schedule", C.fg],
        ["Restore version", C.fg],
        ["Delete", C.negative],
      ];
      k.rect(0, 0, w, 8 + items.length * 44 + 8, {
        fill: C.bg2,
        stroke: C.border,
        radius: 8,
      });
      items.forEach(([label, color], i) =>
        k.text(16, 8 + i * 44, label, { size: TEXT.base, color, h: 44 }),
      );
    },
  ],
  [
    "Toggle",
    (k) => {
      k.pill(0, 0, 44, 24, { fill: C.accent });
      k.ellipse(22, 2, 20, 20, { fill: C.white });
    },
  ],
  ["BtabLogo", (k) => btabLogo(k, 0, 0, 32)],
  ["BtabIcon", (k) => btabIcon(k, 0, 0, 64)],
];

// Parts without their own surface: their text is coloured for the dark page.
const ON_PAGE_BACKGROUND = new Set([
  "PageHeader",
  "StatusBadge",
  "TextInput",
  "Select",
  "Tabs",
  "SettingsNav",
  "Toggle",
]);

// ---------------------------------------------------------------------------

const libraryItems = [];
for (const variant of Object.keys(VARIANTS)) {
  for (const [name, draw] of ITEMS) {
    const k = new Kit(variant, name);
    // one outer group per item: it drops onto the canvas as a single unit
    k.group(() => {
      draw(k);
      if (ON_PAGE_BACKGROUND.has(name)) {
        k.backdrop();
      }
    });
    libraryItems.push({
      id: `btab-kit:${variant}:${name}`,
      status: "published",
      name,
      created: TIMESTAMP,
      elements: k.elements,
    });
  }
}

const lib = {
  type: "excalidrawlib",
  version: 2,
  source: "scripts/btab-kit/build.mjs",
  libraryItems,
};
const output = `${JSON.stringify(lib)}\n`;
if (process.argv.includes("--check")) {
  // CI: fail when the committed library is stale against the generator
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (current !== output) {
    console.error(
      `${path.relative(
        repo,
        OUT,
      )} is out of date: run node scripts/btab-kit/build.mjs`,
    );
    process.exit(1);
  }
  console.log(`${path.relative(repo, OUT)} is up to date`);
  process.exit(0);
}
fs.writeFileSync(OUT, output);
console.log(
  `wrote ${path.relative(repo, OUT)}: ${libraryItems.length} items, ${(
    fs.statSync(OUT).size / 1024
  ).toFixed(0)} KB`,
);
