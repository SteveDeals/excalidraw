import fs from "fs";
import path from "path";

// @ts-ignore — plain node ESM script
import { createComposer } from "../../scripts/btab-templates/compose.mjs";
// @ts-ignore — plain node ESM script
import { PAGES } from "../../scripts/btab-templates/pages.mjs";

const lib = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, "../../public/btab-dashboard.excalidrawlib"),
    "utf8",
  ),
);

describe("BTAB page templates", () => {
  for (const [file, build] of Object.entries(PAGES) as [string, any][]) {
    it(`${file} builds from the shipped kit and fits the 1280x800 shell`, () => {
      const c = createComposer(lib, "clean");
      build(c);
      const { elements, type } = c.scene();
      expect(type).toBe("excalidraw");
      expect(elements.length).toBeGreaterThan(50);
      expect(new Set(elements.map((e: any) => e.id)).size).toBe(
        elements.length,
      );
      for (const e of elements) {
        expect(e.x).toBeGreaterThanOrEqual(-0.5);
        expect(e.x + e.width).toBeLessThanOrEqual(1280.5);
        expect(e.y + e.height).toBeLessThanOrEqual(800.5);
      }
    });
  }
});
