#!/usr/bin/env node
// Builds the BTAB page templates (list / detail / settings) from the kit
// library and, with --upload, saves them into the Files `BTAB/` folder.
//
//   node scripts/btab-templates/build.mjs            # writes out/*.excalidraw
//   DIAGRAMS_TOKEN=… node scripts/btab-templates/build.mjs --upload
//
// Every part is a copy of a `clean` kit item, so templates follow the kit
// when it is regenerated: rebuild + re-upload.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createComposer } from "./compose.mjs";
import { PAGES } from "./pages.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.resolve(here, "../../public/btab-dashboard.excalidrawlib");
const OUT = path.join(here, "out");
const API = process.env.DIAGRAMS_API || "https://labs.voxen.dev/diagrams/api";

const lib = JSON.parse(fs.readFileSync(LIB, "utf8"));
fs.mkdirSync(OUT, { recursive: true });

const built = [];
for (const [file, build] of Object.entries(PAGES)) {
  const c = createComposer(lib, "clean");
  build(c);
  const out = path.join(OUT, file);
  fs.writeFileSync(out, JSON.stringify(c.scene(), null, 2));
  console.log(`built ${file} (${c.scene().elements.length} elements)`);
  built.push([file, out]);
}

if (process.argv.includes("--upload")) {
  const token = process.env.DIAGRAMS_TOKEN;
  if (!token) {
    throw new Error("DIAGRAMS_TOKEN is not set");
  }
  for (const [file, out] of built) {
    const res = await fetch(`${API}/file/BTAB/${encodeURIComponent(file)}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: fs.readFileSync(out),
    });
    console.log(`upload BTAB/${file}: ${res.status} ${await res.text()}`);
    if (!res.ok) {
      process.exitCode = 1;
    }
  }
}
