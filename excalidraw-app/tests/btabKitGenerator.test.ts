import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

import { restoreLibraryItems } from "@excalidraw/excalidraw/data/restore";

const root = path.resolve(__dirname, "../..");
const lib = JSON.parse(
  fs.readFileSync(
    path.join(root, "public/btab-dashboard.excalidrawlib"),
    "utf8",
  ),
);

describe("BTAB kit generator", () => {
  it("the committed library matches scripts/btab-kit/build.mjs", () => {
    expect(() =>
      execFileSync("node", ["scripts/btab-kit/build.mjs", "--check"], {
        cwd: root,
        stdio: "pipe",
      }),
    ).not.toThrow();
  });

  it("ships every part in a clean and a sketch variant", () => {
    const ids: string[] = lib.libraryItems.map((i: { id: string }) => i.id);
    const names = ids
      .filter((id) => id.startsWith("btab-kit:clean:"))
      .map((id) => id.slice("btab-kit:clean:".length));
    expect(names).toContain("DashboardLayout");
    expect(names).toContain("PageHeader");
    expect(ids).toEqual([
      ...names.map((n) => `btab-kit:clean:${n}`),
      ...names.map((n) => `btab-kit:sketch:${n}`),
    ]);
  });

  it("restores without dropping elements", () => {
    const items = restoreLibraryItems(lib.libraryItems, "published");
    items.forEach((item, i) => {
      expect(item.elements.length).toBe(lib.libraryItems[i].elements.length);
    });
  });
});
