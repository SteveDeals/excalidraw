// voxen self-hosted fork: serve ALL fonts from our own origin instead of
// Excalidraw's DigitalOcean CDN (which 403s cross-origin on the /diagrams
// deploy and forces a subset fallback). Two things drive font loading:
//   1. UI font (Assistant) — loaded via `packages/excalidraw/fonts/fonts.css`
//      `@font-face` before the editor boots. The source css already points at
//      local `../fonts/Assistant/*.woff2`; upstream's app build used to rewrite
//      those to the CDN, so we simply DON'T rewrite them — they bundle locally.
//   2. Canvas/picker fonts (Excalifont, Nunito, Comic Shanns, …) — resolved at
//      runtime against `window.EXCALIDRAW_ASSET_PATH`. Their asset paths already
//      carry the Vite base (e.g. `/diagrams/fonts/…`), so the asset ROOT is just
//      the origin, "/". Setting a single local path removes the CDN attempt (and
//      its 403) entirely; ExcalidrawFontFace still keeps its esm.sh safety net.

// Serve fonts from our own origin. The per-font asset paths already include the
// Vite base, so this is the origin root, not the base.
const LOCAL_ASSET_PATH = "/";

/**
 * Custom vite plugin to self-host `EXCALIDRAW_ASSET_PATH` woff2 fonts in `excalidraw-app`.
 *
 * @returns {import("vite").PluginOption}
 */
module.exports.woff2BrowserPlugin = () => {
  let isDev;

  return {
    name: "woff2BrowserPlugin",
    enforce: "pre",
    config(_, { command }) {
      isDev = command === "serve";
    },
    transform(code, id) {
      // Point the runtime font asset path at our own origin (no CDN), and drop
      // the CDN <link rel="preload"> tags: their hashes don't match our locally
      // emitted files (would 404) and they'd hit the CDN cross-origin anyway.
      // A brief first-paint font swap is an acceptable trade for zero 403s.
      if (!isDev && id.endsWith("excalidraw-app/index.html")) {
        return code.replace(
          "<!-- PLACEHOLDER:EXCALIDRAW_APP_FONTS -->",
          `<script>
        // voxen: self-host fonts from our own origin (see woff2-vite-plugins.js)
        window.EXCALIDRAW_ASSET_PATH = "${LOCAL_ASSET_PATH}";
      </script>`,
        );
      }
    },
  };
};
