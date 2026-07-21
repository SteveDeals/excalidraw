# voxen `/diagrams` deploy (self-hosted Excalidraw)

Static Excalidraw SPA served at **https://labs.voxen.dev/diagrams/**.

- Built with Vite `base=/diagrams/`, served by nginx behind Traefik (which
  strips the `/diagrams` prefix). See `docker-compose.yml` / `nginx.conf`.
- Lives on `steve` at `~/lab/diagrams/` (`html/` = the served docroot).

## Deploy the app

```bash
yarn --cwd ./excalidraw-app vite build --base=/diagrams/
# back up the current html first, then sync the build (never touch scenes/):
rsync -av --delete --exclude=scenes/ --exclude='*.bak*' \
  excalidraw-app/build/ steve:~/lab/diagrams/html/
ssh steve 'cd ~/lab/diagrams && docker compose restart web'
```

The PWA service worker is `autoUpdate` and serves stale on the first load(s) —
clear the SW + caches when verifying a fresh deploy.

## Scenes (shared diagrams)

Scenes are `.excalidraw` files in `~/lab/diagrams/html/scenes/`. They are
**deployed separately** from the app build (the app rsync excludes `scenes/`),
so republishing the app never clobbers them.

- **List page:** https://labs.voxen.dev/diagrams/scenes/ — a small dark static
  page (`scenes/index.html`) that fetches a JSON directory listing from the
  `/scene-list/` nginx endpoint (`autoindex_format json`), filters
  `*.excalidraw`, and renders a link per scene. Zero maintenance: drop a file
  in and it appears — no rebuild.
- **Open a scene:** https://labs.voxen.dev/diagrams/?scene=&lt;name&gt; loads it
  into the canvas **editable**. Edits autosave to the visitor's own browser
  (localStorage) like any drawing. There is no server-side save — see below.

### Add / update a scene

There is no in-app "save to server" (a static site can't write server files).
Publishing a scene = putting the `.excalidraw` file in the scenes dir:

```bash
./deploy-steve/publish-scene.sh path/to/diagram.excalidraw [scene-name]
```

- `scene-name` defaults to the file's basename; it must match `[A-Za-z0-9-]`
  (the app only loads names in that set).
- No rebuild/restart needed — the scene shows up in the list immediately.

To seed the tracked example scene (`scenes/btab-pricing.excalidraw`) and the
list page onto a fresh box, sync the whole dir once:

```bash
rsync -av deploy-steve/scenes/ steve:~/lab/diagrams/html/scenes/
```

## Fonts

Fonts are self-hosted from the build (`html/fonts/…`) rather than Excalidraw's
DigitalOcean CDN — `window.EXCALIDRAW_ASSET_PATH` is set to the local
`/diagrams/` base at build time (`scripts/woff2/woff2-vite-plugins.js`), so
glyphs render fully and embed into SVG/PNG exports with no cross-origin 403s.
