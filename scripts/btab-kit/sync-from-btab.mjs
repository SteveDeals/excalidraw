#!/usr/bin/env node
// Refresh scripts/btab-kit/source/ from btab-api's origin/main.
//
//   node scripts/btab-kit/sync-from-btab.mjs [path-to-btab-git-dir]
//
// The generator (build.mjs) only reads source/, so the kit builds without a
// btab checkout. Run this when btab's brand or dashboard theme changes, then
// rebuild the library and commit both.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "source");
const gitDir =
  process.argv[2] ||
  process.env.BTAB_GIT_DIR ||
  "/home/adminuser/dev/btab/.bare";

const git = (...args) =>
  execFileSync("git", ["-C", gitDir, ...args], { encoding: "utf8" });

git("fetch", "-q", "origin", "main");
const sha = git("rev-parse", "origin/main").trim();
const show = (p) => git("show", `origin/main:${p}`);

// CSS custom properties of one selector block in globals.css
const cssBlock = (css, selectorRe) => {
  const m = css.match(selectorRe);
  if (!m) {
    throw new Error(`selector ${selectorRe} not found in globals.css`);
  }
  const body = css.slice(m.index + m[0].length, css.indexOf("}", m.index));
  const vars = {};
  for (const [, k, v] of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    vars[k] = v.trim();
  }
  return vars;
};

const css = show("vendor-dashboard/app/globals.css");
const tailwind = show("vendor-dashboard/tailwind.config.ts");
const sidebarW = css.match(/--vd-sidebar-w:\s*([\d.]+)rem/);
const green = tailwind.match(/'btab-green':\s*'(#[0-9a-fA-F]{6})'/);

const theme = {
  dark: cssBlock(css, /:root,\s*\.dark\s*\{/),
  light: cssBlock(css, /\n\.light\s*\{/),
  btabGreen: green ? green[1] : null,
  sidebarWidth: sidebarW ? Number(sidebarW[1]) * 16 : 256,
};

const sections = [
  ...show("vendor-dashboard/components/settings/sections.ts").matchAll(
    /label:\s*'([^']+)'(?:,\s*\n\s*short:\s*'([^']+)')?/g,
  ),
].map(([, label, short]) => short || label);

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "tokens.json"), show("brand/tokens.json"));
fs.writeFileSync(path.join(out, "icon.svg"), show("brand/icon.svg"));
fs.writeFileSync(
  path.join(out, "theme.json"),
  `${JSON.stringify({ ...theme, settingsSections: sections }, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(out, "SOURCE.txt"),
  `SteveDeals/btab-api origin/main @ ${sha}\n`,
);
console.log(
  `synced btab @ ${sha.slice(0, 8)} -> ${path.relative(process.cwd(), out)}`,
);
