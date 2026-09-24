import fs from "fs";
import path from "path";

import { restoreLibraryItems } from "@excalidraw/excalidraw/data/restore";

import type { LibraryItems } from "@excalidraw/excalidraw/types";

import { isBtabKitItem, mergeBtabKit } from "../data/btabKit";

const item = (id: string) =>
  ({ id, status: "unpublished", created: 1, elements: [] } as any);

describe("BTAB dashboard kit", () => {
  it("keeps the user's items and replaces old kit items", () => {
    const current: LibraryItems = [
      item("mine-1"),
      item("btab-kit:clean:Old"),
      item("mine-2"),
    ];
    const kit: LibraryItems = [
      item("btab-kit:clean:Card"),
      item("btab-kit:sketch:Card"),
      item("not-kit"),
    ];
    expect(mergeBtabKit(current, kit).map((i) => i.id)).toEqual([
      "mine-1",
      "mine-2",
      "btab-kit:clean:Card",
      "btab-kit:sketch:Card",
    ]);
  });

  it("is idempotent", () => {
    const kit = [item("btab-kit:clean:Card")];
    const once = mergeBtabKit([item("mine")], kit);
    expect(mergeBtabKit(once, kit)).toEqual(once);
  });

  it("ships a valid library whose items all own the kit prefix", () => {
    const file = path.resolve(
      __dirname,
      "../../public/btab-dashboard.excalidrawlib",
    );
    const lib = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(lib.type).toBe("excalidrawlib");
    const items = restoreLibraryItems(lib.libraryItems, "published");
    expect(items.length).toBeGreaterThan(0);
    expect(items.every(isBtabKitItem)).toBe(true);
    expect(items.every((i) => i.elements.length > 0 && i.name)).toBe(true);
  });
});
