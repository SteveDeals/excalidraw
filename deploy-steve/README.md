# voxen `/diagrams` deploy (self-hosted Excalidraw)

Static Excalidraw SPA served at **https://labs.voxen.dev/diagrams/**.

- Built with Vite `base=/diagrams/`, served by nginx behind Traefik (which strips the `/diagrams` prefix). See `docker-compose.yml` / `nginx.conf`.
- Lives on `steve` at `~/lab/diagrams/` (`html/` = the served docroot).

## Deploy the app

```bash
yarn --cwd ./excalidraw-app vite build --base=/diagrams/
# back up the current html first, then sync the build (never touch scenes/):
rsync -av --delete --filter='protect scenes/' --exclude=scenes/ --exclude='*.bak*' \
  excalidraw-app/build/ steve:~/lab/diagrams/html/
ssh steve 'cd ~/lab/diagrams && docker compose restart web'
```

(`--filter='protect scenes/'` matters: with `--delete`, a bare `--exclude` did NOT stop rsync emptying `html/scenes/` on 2026-09-03 — restored from the `html.bak-*` snapshot. Always take that snapshot first.)

## Files sidebar (folders + saved diagrams on the server)

The **Files** button (top-right) / Files tab of the sidebar saves diagrams as `.excalidraw` files in folders **on the server** — the draw.io model: the folder tree on disk _is_ the tree in the UI.

- **Backend:** `api/server.js` — a zero-dependency Node script, run by the `api` service in `docker-compose.yml` as container `diagrams-api`; nginx proxies `/api/` to it (`nginx.conf`). Data lives in `~/lab/diagrams/data/`.
- **Auth:** every API call needs `Authorization: Bearer $DIAGRAMS_TOKEN` (`~/lab/diagrams/.env`, chmod 600; vault item `diagrams-api-token`). The SPA is public, so the write API cannot be open. Users paste the token once into the sidebar's Unlock box; it is kept in that browser's localStorage.
- **Undo:** deletes move into `data/.trash/`, every overwrite keeps the previous version in `data/.history/<path>/` (last 20). Nothing is unlinked.
- **Autosave:** while a file is open, content changes save ~1.5s after the last edit (also on tab-hide / close); Ctrl/⌘+S saves immediately. The save engine (`excalidraw-app/files/filesEngine.ts`) is mounted for the whole app lifetime — the sidebar itself unmounts when closed.
- **Deep link:** `/diagrams/?file=<Folder>/<name>.excalidraw` opens a saved file (needs the token in that browser).
- **Deploy the API:** copy `api/server.js`, `nginx.conf`, `docker-compose.yml` to `~/lab/diagrams/`, then `docker compose up -d && docker compose restart web`. (`restart web` is needed — nginx reads its config at start.)

```bash

```

The PWA service worker is `autoUpdate` and serves stale on the first load(s) — clear the SW + caches when verifying a fresh deploy.

## Scenes (shared diagrams)

Scenes are `.excalidraw` files in `~/lab/diagrams/html/scenes/`. They are **deployed separately** from the app build (the app rsync excludes `scenes/`), so republishing the app never clobbers them.

- **List page:** https://labs.voxen.dev/diagrams/scenes/ — a small dark static page (`scenes/index.html`) that fetches a JSON directory listing from the `/scene-list/` nginx endpoint (`autoindex_format json`), filters `*.excalidraw`, and renders a link per scene. Zero maintenance: drop a file in and it appears — no rebuild.
- **Open a scene:** https://labs.voxen.dev/diagrams/?scene=&lt;name&gt; loads it into the canvas **editable**. Edits autosave to the visitor's own browser (localStorage) like any drawing. There is no server-side save — see below.

### Add / update a scene

There is no in-app "save to server" (a static site can't write server files). Publishing a scene = putting the `.excalidraw` file in the scenes dir:

```bash
./deploy-steve/publish-scene.sh path/to/diagram.excalidraw [scene-name]
```

- `scene-name` defaults to the file's basename; it must match `[A-Za-z0-9-]` (the app only loads names in that set).
- No rebuild/restart needed — the scene shows up in the list immediately.

To seed the tracked example scene (`scenes/btab-pricing.excalidraw`) and the list page onto a fresh box, sync the whole dir once:

```bash
rsync -av deploy-steve/scenes/ steve:~/lab/diagrams/html/scenes/
```

## Fonts

Fonts are self-hosted from the build (`html/fonts/…`) rather than Excalidraw's DigitalOcean CDN — `window.EXCALIDRAW_ASSET_PATH` is set to the local `/diagrams/` base at build time (`scripts/woff2/woff2-vite-plugins.js`), so glyphs render fully and embed into SVG/PNG exports with no cross-origin 403s.
