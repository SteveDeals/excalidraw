# BTAB dashboard kit

Generates `public/btab-dashboard.excalidrawlib`: Excalidraw library items drawn from btab's **vendor-dashboard**, so a new service's screens can be sketched from real btab parts. The app loads it into everyone's Library panel (`excalidraw-app/data/btabKit.ts`).

```bash
node scripts/btab-kit/sync-from-btab.mjs   # refresh source/ from btab-api origin/main
node scripts/btab-kit/build.mjs            # regenerate the library
node scripts/btab-kit/build.mjs --check    # fail if the committed library is stale
```

Commit `source/` and the regenerated library together. The build is deterministic: ids, seeds and timestamps come from item names, so an unchanged kit regenerates byte-for-byte.

## Files

| file | what |
| --- | --- |
| `source/tokens.json`, `source/icon.svg` | btab `brand/` (green, navy, the "B" mark) |
| `source/theme.json` | the dashboard's CSS variables (`vendor-dashboard/app/globals.css`, dark + light), `btab-green`, sidebar width, the Settings sections |
| `source/SOURCE.txt` | the btab commit the snapshot came from |
| `font-metrics.json` | per-glyph advance widths of Inter and Excalifont, used to size text and buttons |
| `render.mjs` | against a running dev app: `metrics` rewrites `font-metrics.json`; `render <dir>` exports every item to PNG with the real exporter |

## Items

Every item exists twice: id `btab-kit:clean:<Name>` (sharp lines, `roughness 0`, Inter) and `btab-kit:sketch:<Name>` (hand-drawn, Excalifont). The name is the btab component it maps to. Each item is one outer group; composite parts are nested groups (select into them with double-click). Parts use the dashboard's default **dark** theme at 1 canvas px = 1 CSS px.

| name | btab source | size (px) |
| --- | --- | --- |
| `DashboardLayout` | `components/DashboardLayout.tsx` (desktop) | 1280 × 800 |
| `Sidebar` | the `<aside>` of DashboardLayout | 256 × 800 |
| `MobileHeader` | DashboardLayout's `md:hidden` top bar | 390 × 57 |
| `PageHeader` | `components/ui/PageHeader.tsx` (back link, h1, subtitle, actions) | 832 wide |
| `Button`, `ButtonSecondary`, `ButtonDanger` | `min-h-[44px] px-4 rounded-lg text-sm` | 44 high |
| `Card` | `rounded-xl border bg-secondary p-5` | 400 × 180 |
| `SettingsCard` | `components/ui/SettingsCard.tsx` + `SettingsCardFooter.tsx` | 640 × 250 |
| `StatTile` | `components/home/HomeStats.tsx` tile | 200 × 84 |
| `Table` | orders table: header + 3 rows | 760 × 196 |
| `StatusBadge` | `components/ui/StatusBadge.tsx`, all six tones | — |
| `TextInput`, `Select` | label + 44px field | 360 wide |
| `Tabs` | the room wizard's step tabs | 832 wide |
| `EmptyState` | `components/ui/EmptyState.tsx` | 640 × 262 |
| `Modal` | confirm dialog | 480 × 206 |
| `SettingsNav` | `components/settings/SettingsNav.tsx` chip strip | — |
| `DropdownMenu` | a row's "…" menu | 224 wide |
| `Toggle` | the app switch | 44 × 24 |
| `BtabLogo`, `BtabIcon` | `components/BtabLogo.tsx`, `brand/icon.svg` | — |

`PageHeader`, `StatusBadge`, `TextInput`, `Select`, `Tabs`, `SettingsNav` and `Toggle` sit on a plate of the page background (`--background`) so their text reads on a white canvas; inside the shell the plate is invisible.

### DashboardLayout geometry (for templates)

Relative to the item's top-left: sidebar `x 0–256`; the `<Page>` column is `x 288, w 960` (`px-8 py-8`). It already contains a PageHeader group at `y 32` (edit its texts or delete it) and a dashed "Page content" placeholder at `x 288, y 128, w 960, h 640` — delete it and place parts there.

## Known differences from the real dashboard

- Excalidraw text has no weights: headings and the wordmark are regular, not bold.
- Icons are simplified line drawings of the lucide icons.
- Only the dark theme is generated (`source/theme.json` also holds light).
- Excalidraw's own dark theme inverts the canvas, so in dark mode the parts (and their Library thumbnails) show inverted; the light theme shows the dashboard's true colours.
