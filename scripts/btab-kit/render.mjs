#!/usr/bin/env node
// Browser helpers for the BTAB kit, driven through a running dev app
// (`yarn start`, or VITE_APP_PORT=... for another port):
//
//   node scripts/btab-kit/render.mjs metrics         # rewrite font-metrics.json
//   node scripts/btab-kit/render.mjs render <outDir> # one PNG per library item
//
// Env: KIT_APP_URL (default http://127.0.0.1:3000), CHROME_PATH.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import puppeteer from "puppeteer-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const appUrl = process.env.KIT_APP_URL || "http://127.0.0.1:3000";
const chromePath = process.env.CHROME_PATH || "/usr/bin/google-chrome";
const [mode, outDir] = process.argv.slice(2);

// Printable ASCII plus the few non-ASCII glyphs the kit uses.
const CHARS =
  Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("") +
  "←→‹›·…—–×✓⌄▾•";

const FAMILIES = { 11: "Inter", 5: "Excalifont" };

const openApp = async () => {
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1200, deviceScaleFactor: 1 });
  await page.goto(appUrl, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForFunction(() => window.h?.app, { timeout: 120000 });
  return { browser, page };
};

const metrics = async () => {
  const { browser, page } = await openApp();
  const widths = await page.evaluate(
    async (chars, families) => {
      const ctx = document.createElement("canvas").getContext("2d");
      const result = {};
      for (const [id, name] of Object.entries(families)) {
        await document.fonts.load(`100px "${name}"`, chars);
        ctx.font = `100px "${name}"`;
        const table = {};
        for (const ch of chars) {
          table[ch] = Math.round(ctx.measureText(ch).width * 100) / 10000;
        }
        result[id] = table;
      }
      return result;
    },
    CHARS,
    FAMILIES,
  );
  await browser.close();
  const file = path.join(here, "font-metrics.json");
  fs.writeFileSync(
    file,
    `${JSON.stringify({ unit: "em", families: widths }, null, 1)}\n`,
  );
  console.log(`wrote ${path.relative(repo, file)}`);
};

const render = async () => {
  if (!outDir) {
    throw new Error("usage: render.mjs render <outDir>");
  }
  const lib = JSON.parse(
    fs.readFileSync(path.join(repo, "public/btab-dashboard.excalidrawlib")),
  );
  fs.mkdirSync(outDir, { recursive: true });
  const { browser, page } = await openApp();
  // Same module instance the app already loaded (vite serves it by path).
  const pkg = `/@fs${path.join(repo, "packages/excalidraw/index.tsx")}`;
  for (const item of lib.libraryItems) {
    const dataUrl = await page.evaluate(
      async (pkgUrl, elements) => {
        const { exportToBlob } = await import(pkgUrl);
        const blob = await exportToBlob({
          elements,
          appState: { exportBackground: true, viewBackgroundColor: "#ffffff" },
          files: null,
          exportPadding: 16,
          getDimensions: (w, h) => ({ width: w * 2, height: h * 2, scale: 2 }),
        });
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      },
      pkg,
      item.elements,
    );
    const name = item.id.replace(/^btab-kit:/, "").replace(/:/g, "-");
    fs.writeFileSync(
      path.join(outDir, `${name}.png`),
      Buffer.from(dataUrl.split(",")[1], "base64"),
    );
    console.log(`rendered ${name}`);
  }
  await browser.close();
};

if (mode === "metrics") {
  await metrics();
} else if (mode === "render") {
  await render();
} else {
  console.error("usage: render.mjs metrics | render <outDir>");
  process.exit(1);
}
