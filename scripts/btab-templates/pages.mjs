// The three BTAB page templates. Coordinates follow the DashboardLayout item:
// 1280x800, page column x=288 w=960, header at y=32, content from y=128.
const COL = 288;
// Tabs and PageHeader carry 16px of inner padding on the left
const INSET = 16;
const TOP = 128;

/** the shell, minus its "Page content" placeholder */
const shell = (c) => {
  const s = c.place("DashboardLayout", 0, 0);
  c.remove(
    s,
    (e) =>
      (e.type === "text" && e.text === "Page content") ||
      (e.type === "rectangle" && e.strokeStyle === "dashed"),
  );
  return s;
};

export const PAGES = {
  // list page: header + stat tiles + tabs + filters + table (e.g. /orders)
  "List page.excalidraw": (c) => {
    const s = shell(c);
    c.activate(s, "Rooms", "Sales");
    c.edit(s, {
      "Page title": "Orders",
      "One line on what this page is for.":
        "Every order from your store, newest first.",
      Secondary: "Export",
      "+ New item": "New order",
    });
    const stats = [
      ["Orders this week", "128", "+12% vs last week"],
      ["Revenue", "$18,240", "+8% vs last week"],
      ["Awaiting stock", "6", "2 overdue"],
      ["Avg. order", "$142", "-3% vs last week"],
    ];
    stats.forEach(([label, value, delta], i) => {
      const t = c.place("StatTile", COL + i * 220, TOP);
      c.edit(t, {
        "Orders this week": label,
        128: value,
        "+12% vs last week": delta,
      });
    });
    const tabs = c.place("Tabs", COL - INSET, TOP + 112);
    c.edit(tabs, { Photo: "All", Pieces: "Open", Publish: "Shipped" });
    const search = c.place("TextInput", COL, TOP + 180);
    c.edit(search, {
      Title: "Search",
      "e.g. The coastal living room": "Order #, customer…",
    });
    const status = c.place("Select", COL + 384, TOP + 180);
    c.edit(status, { "Room type": "Status", Living: "Any" });
    c.place("Table", COL, TOP + 274);
  },

  // detail page: back link header + tabs + line items + side cards (e.g. /orders/[id])
  "Detail page.excalidraw": (c) => {
    const s = shell(c);
    c.activate(s, "Rooms", "Sales");
    c.removeGroupOf(s, "Page title");
    const h = c.place("PageHeader", COL - INSET, 32);
    c.edit(h, {
      "← Rooms": "← Orders",
      Rooms: "Order #1042",
      "A room is a photo with your pieces in it. Shoppers scroll it at /rooms.":
        "Placed 24 Sep by Jane Cooper · Paid by card.",
      "From my catalogue": "Print invoice",
      "+ New room": "Ship order",
    });
    const tabs = c.place("Tabs", COL - INSET, TOP + 16);
    c.edit(tabs, { Photo: "Items", Pieces: "Shipping", Publish: "History" });
    const items = c.place("Table", COL, TOP + 84);
    c.edit(items, {
      ORDER: "SKU",
      CUSTOMER: "ITEM",
      "#1042": "OAK-120",
      "Jane Cooper": "Oak dining table",
      "#1041": "LIN-SOFA",
      "Liam Nguyen": "Linen 3-seat sofa",
      "#1040": "CER-LMP",
      "Olivia Brown": "Ceramic lamp",
    });
    const cards = [
      [
        "Customer",
        "Jane Cooper · jane@example.com\n12 Harbour St, Fremantle WA",
        "View customer →",
      ],
      ["Payment", "$1,280.00 paid by card on 24 Sep.\nNo refunds.", "Refund →"],
    ];
    cards.forEach(([title, body, link], i) => {
      const card = c.place("Card", COL + i * 424, TOP + 304);
      c.edit(card, {
        "Card title": title,
        "Supporting text for this card, one or two\nlines at most.": body,
        "View details →": link,
      });
    });
  },

  // settings page: settings nav + settings cards (e.g. /settings/business)
  "Settings page.excalidraw": (c) => {
    const s = shell(c);
    c.activate(s, "Rooms", "Settings");
    c.removeGroupOf(s, "Secondary");
    c.removeGroupOf(s, "+ New item");
    c.edit(s, {
      "Page title": "Settings",
      "One line on what this page is for.":
        "Your business details, payouts and team.",
    });
    c.place("SettingsNav", COL, TOP);
    const business = c.place("SettingsCard", COL, TOP + 77);
    c.edit(business, {
      "Section title": "Business",
      "What this group of settings controls.":
        "How your store appears to shoppers.",
    });
    const contact = c.place("SettingsCard", COL, TOP + 351);
    c.edit(contact, {
      "Section title": "Contact",
      "What this group of settings controls.":
        "Where order and payout emails go.",
      "Store name": "Order emails to",
      "Acme Furniture": "owner@acme.example",
    });
  },
};
