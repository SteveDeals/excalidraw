#!/usr/bin/env node
// voxen diagrams-api — the save layer behind the "Files" sidebar on
// https://labs.voxen.dev/diagrams. Zero dependencies (node:http + node:fs).
//
// Model: folders on disk ARE the folders in the UI (draw.io style). Every
// diagram is a plain `.excalidraw` JSON file under DATA_ROOT, so the store is
// greppable, rsync-able and openable by the Obsidian Excalidraw plugin.
//
// Safety:
//   - every route requires `Authorization: Bearer <DIAGRAMS_TOKEN>` (the SPA is
//     public; an unlocked write API is not an option)
//   - paths are whitelisted per segment, never contain `..`, never start with `.`
//   - deletes are MOVES into `.trash/` (nothing is ever unlinked)
//   - overwrites keep the previous version in `.history/` (last HISTORY_KEEP)
//
// Routes (all under /api, JSON in/out):
//   GET    /api/ping                    -> { ok: true }               (token check)
//   GET    /api/tree                    -> nested { folders, files }
//   GET    /api/file/<path>             -> raw .excalidraw JSON
//   PUT    /api/file/<path>   (body)    -> { ok, mtime }             (mkdir -p)
//   POST   /api/folder/<path>           -> { ok }
//   POST   /api/move  { from, to }      -> { ok }                    (file or folder)
//   DELETE /api/file/<path>             -> { ok, trashed }
//   DELETE /api/folder/<path>           -> { ok, trashed }

const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const PORT = Number(process.env.PORT || 8080);
const DATA_ROOT = path.resolve(process.env.DATA_ROOT || "/data");
const TOKEN = (process.env.DIAGRAMS_TOKEN || "").trim();
const HISTORY_KEEP = Number(process.env.HISTORY_KEEP || 20);
const MAX_BODY = Number(process.env.MAX_BODY || 50 * 1024 * 1024); // 50 MB
const EXT = ".excalidraw";
const TRASH_DIR = path.join(DATA_ROOT, ".trash");
const HISTORY_DIR = path.join(DATA_ROOT, ".history");

if (!TOKEN) {
  console.error(
    "DIAGRAMS_TOKEN is not set — refusing to start an open write API",
  );
  process.exit(1);
}
fs.mkdirSync(DATA_ROOT, { recursive: true });

// --- path handling ---------------------------------------------------------

const SEGMENT_RE = /^[A-Za-z0-9][A-Za-z0-9 _.()&+,'-]*$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Validate a relative path from the client → { rel, abs }. */
function resolveRel(rel, { kind }) {
  if (typeof rel !== "string") {
    throw new HttpError(400, "path required");
  }
  rel = rel.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (kind === "folder" && rel === "") {
    return { rel: "", abs: DATA_ROOT };
  }
  if (!rel) {
    throw new HttpError(400, "path required");
  }
  const segs = rel.split("/");
  for (const s of segs) {
    if (!SEGMENT_RE.test(s) || s === "." || s === "..") {
      throw new HttpError(400, `invalid path segment: ${JSON.stringify(s)}`);
    }
    if (s.length > 120) {
      throw new HttpError(400, "path segment too long");
    }
  }
  if (segs.length > 12) {
    throw new HttpError(400, "path too deep");
  }
  if (kind === "file" && !rel.endsWith(EXT)) {
    throw new HttpError(400, `files must end with ${EXT}`);
  }
  if (kind === "folder" && rel.endsWith(EXT)) {
    throw new HttpError(400, `folders cannot end with ${EXT}`);
  }
  const abs = path.resolve(DATA_ROOT, rel);
  if (abs !== DATA_ROOT && !abs.startsWith(DATA_ROOT + path.sep)) {
    throw new HttpError(400, "path escapes data root");
  }
  return { rel, abs };
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

// --- tree ------------------------------------------------------------------

async function readTree(abs, rel) {
  const entries = await fsp.readdir(abs, { withFileTypes: true });
  const folders = [];
  const files = [];
  for (const e of entries) {
    if (e.name.startsWith(".")) {
      continue;
    }
    const childRel = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      folders.push(await readTree(path.join(abs, e.name), childRel));
    } else if (e.isFile() && e.name.endsWith(EXT)) {
      const st = await fsp.stat(path.join(abs, e.name));
      files.push({
        name: e.name.slice(0, -EXT.length),
        path: childRel,
        size: st.size,
        mtime: st.mtimeMs,
      });
    }
  }
  const collator = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
  });
  folders.sort((a, b) => collator.compare(a.name, b.name));
  files.sort((a, b) => collator.compare(a.name, b.name));
  return { name: rel ? path.basename(rel) : "", path: rel, folders, files };
}

// --- file ops --------------------------------------------------------------

async function exists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

async function keepHistory(rel, abs) {
  if (!(await exists(abs))) {
    return;
  }
  const dir = path.join(HISTORY_DIR, rel);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.copyFile(abs, path.join(dir, `${stamp()}${EXT}`));
  const versions = (await fsp.readdir(dir))
    .filter((n) => n.endsWith(EXT))
    .sort();
  for (const old of versions.slice(
    0,
    Math.max(0, versions.length - HISTORY_KEEP),
  )) {
    await fsp.unlink(path.join(dir, old));
  }
}

async function writeFileAtomic(abs, body) {
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp-${process.pid}-${Date.now()}`;
  await fsp.writeFile(tmp, body);
  await fsp.rename(tmp, abs);
}

async function trash(rel, abs) {
  if (!(await exists(abs))) {
    throw new HttpError(404, "not found");
  }
  await fsp.mkdir(TRASH_DIR, { recursive: true });
  const dest = path.join(TRASH_DIR, `${stamp()}__${rel.replace(/\//g, "__")}`);
  await fsp.rename(abs, dest);
  return path.relative(DATA_ROOT, dest);
}

// --- http ------------------------------------------------------------------

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, "body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function send(res, status, payload, headers = {}) {
  const body =
    typeof payload === "string" || Buffer.isBuffer(payload)
      ? payload
      : JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}

function authorized(req) {
  const h = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) {
    return false;
  }
  const given = Buffer.from(m[1].trim());
  const want = Buffer.from(TOKEN);
  return (
    given.length === want.length &&
    require("node:crypto").timingSafeEqual(given, want)
  );
}

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  const p = decodeURIComponent(url.pathname).replace(/\/+$/, "");
  const method = req.method.toUpperCase();

  if (!p.startsWith("/api")) {
    throw new HttpError(404, "not found");
  }
  if (!authorized(req)) {
    throw new HttpError(401, "unauthorized");
  }

  if (method === "GET" && p === "/api/ping") {
    return send(res, 200, { ok: true });
  }

  if (method === "GET" && p === "/api/tree") {
    return send(res, 200, await readTree(DATA_ROOT, ""));
  }

  const fileMatch = /^\/api\/file\/(.+)$/.exec(p);
  if (fileMatch) {
    const { rel, abs } = resolveRel(fileMatch[1], { kind: "file" });
    if (method === "GET") {
      let data;
      try {
        data = await fsp.readFile(abs);
      } catch (e) {
        if (e.code === "ENOENT") {
          throw new HttpError(404, "not found");
        }
        throw e;
      }
      return send(res, 200, data);
    }
    if (method === "PUT") {
      const body = await readBody(req);
      let parsed;
      try {
        parsed = JSON.parse(body.toString("utf8"));
      } catch {
        throw new HttpError(400, "body is not JSON");
      }
      if (
        !parsed ||
        parsed.type !== "excalidraw" ||
        !Array.isArray(parsed.elements)
      ) {
        throw new HttpError(400, "body is not an excalidraw scene");
      }
      await keepHistory(rel, abs);
      await writeFileAtomic(abs, body);
      const st = await fsp.stat(abs);
      return send(res, 200, {
        ok: true,
        path: rel,
        mtime: st.mtimeMs,
        size: st.size,
      });
    }
    if (method === "DELETE") {
      const trashed = await trash(rel, abs);
      return send(res, 200, { ok: true, trashed });
    }
    throw new HttpError(405, "method not allowed");
  }

  const folderMatch = /^\/api\/folder(?:\/(.*))?$/.exec(p);
  if (folderMatch) {
    const { rel, abs } = resolveRel(folderMatch[1] || "", { kind: "folder" });
    if (method === "POST") {
      if (!rel) {
        throw new HttpError(400, "cannot create the root");
      }
      if (await exists(abs)) {
        throw new HttpError(409, "already exists");
      }
      await fsp.mkdir(abs, { recursive: true });
      return send(res, 200, { ok: true, path: rel });
    }
    if (method === "DELETE") {
      if (!rel) {
        throw new HttpError(400, "cannot delete the root");
      }
      const trashed = await trash(rel, abs);
      return send(res, 200, { ok: true, trashed });
    }
    throw new HttpError(405, "method not allowed");
  }

  if (method === "POST" && p === "/api/move") {
    const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
    const isFile = typeof body.from === "string" && body.from.endsWith(EXT);
    const kind = isFile ? "file" : "folder";
    const from = resolveRel(body.from, { kind });
    const to = resolveRel(body.to, { kind });
    if (!from.rel || !to.rel) {
      throw new HttpError(400, "cannot move the root");
    }
    if (!(await exists(from.abs))) {
      throw new HttpError(404, "source not found");
    }
    if (await exists(to.abs)) {
      throw new HttpError(409, "destination already exists");
    }
    if (
      !isFile &&
      (to.abs === from.abs || to.abs.startsWith(from.abs + path.sep))
    ) {
      throw new HttpError(400, "cannot move a folder into itself");
    }
    await fsp.mkdir(path.dirname(to.abs), { recursive: true });
    await fsp.rename(from.abs, to.abs);
    return send(res, 200, { ok: true, from: from.rel, to: to.rel });
  }

  throw new HttpError(404, "not found");
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) {
      console.error(new Date().toISOString(), req.method, req.url, err);
    }
    send(res, status, { error: err.message || "error" });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`diagrams-api listening on :${PORT}, data root ${DATA_ROOT}`);
});
