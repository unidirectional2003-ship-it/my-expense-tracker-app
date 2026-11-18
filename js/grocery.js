import { roundMoney } from "./money.js";
import { monthName, today } from "./dates.js";

export const CATALOG_KEY = "grocery-catalog";
export const TEMPLATE_KEY = "grocery-template";
export const LISTS_KEY = "grocery-lists";

const SEED = [
  {
    name: "Kitchen staples",
    items: [
      "Atta",
      "Chawal",
      "Daal chana",
      "Daal masoor",
      "Daal mash",
      "Cheeni",
      "Namak",
      "Cooking oil",
      "Ghee",
      "Chai patti",
      "Doodh",
      "Dahi",
      "Anday",
      "Pyaaz",
      "Aloo",
      "Tamatar",
      "Lehsan",
      "Adrak",
    ],
  },
  {
    name: "Masalay",
    items: [
      "Haldi",
      "Lal mirch",
      "Dhaniya powder",
      "Zeera",
      "Garam masala",
      "Chaat masala",
      "Biryani masala",
      "Karahi masala",
      "Qeema masala",
      "Nihari masala",
    ],
  },
  {
    name: "Cleaning and household",
    items: [
      "Surf (detergent)",
      "Dish-wash soap/liquid",
      "Bleach",
      "Floor cleaner",
      "Toilet cleaner",
      "Hand wash",
      "Tissue rolls",
      "Garbage bags",
      "Matches",
    ],
  },
  {
    name: "Personal care and sanitary",
    items: ["Sanitary pads", "Soap", "Shampoo", "Toothpaste", "Toothbrush"],
  },
];

export function seedCatalog() {
  return {
    groups: SEED.map((group) => ({
      id: slug(group.name),
      name: group.name,
    })),
    items: SEED.flatMap((group) =>
      group.items.map((name) => ({
        id: `${slug(group.name)}-${slug(name)}`,
        groupId: slug(group.name),
        name,
        hidden: false,
        lastPrice: null,
      }))
    ),
  };
}

export function loadCatalog() {
  const stored = readJson(CATALOG_KEY);
  if (!stored) {
    const seeded = seedCatalog();
    saveCatalog(seeded);
    return seeded;
  }
  return normalizeCatalog(stored);
}

export function saveCatalog(catalog) {
  localStorage.setItem(CATALOG_KEY, JSON.stringify(normalizeCatalog(catalog)));
}

export function loadTemplate() {
  const stored = readJson(TEMPLATE_KEY);
  if (!stored || !Array.isArray(stored.lines)) return { lines: [] };
  return {
    lines: stored.lines
      .map((line) => {
        const qty = roundMoney(Number(line?.qty));
        if (!line || typeof line.itemId !== "string" || !(qty > 0)) return null;
        return { itemId: line.itemId, qty };
      })
      .filter(Boolean),
  };
}

export function saveTemplate(template) {
  localStorage.setItem(
    TEMPLATE_KEY,
    JSON.stringify({
      name: "My monthly grocery list",
      lines: (template.lines || [])
        .map((line) => ({ itemId: line.itemId, qty: roundMoney(Number(line.qty)) }))
        .filter((line) => line.itemId && line.qty > 0),
    })
  );
}

export function loadLists() {
  const stored = readJson(LISTS_KEY);
  if (!Array.isArray(stored)) return [];
  return stored.map(normalizeList).filter(Boolean);
}

export function saveLists(lists) {
  localStorage.setItem(LISTS_KEY, JSON.stringify(lists.map(normalizeList).filter(Boolean)));
}

export function rememberPrice(catalog, itemId, price) {
  const amount = roundMoney(Number(price));
  if (!(amount > 0)) return catalog;
  const items = catalog.items.map((item) => (item.id === itemId ? { ...item, lastPrice: amount } : item));
  return { ...catalog, items };
}

export function buildMonthlyDraft(template, catalog, existingLists, asOf) {
  const month = String(asOf || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return { lists: existingLists, created: null };
  const lines = (template?.lines || [])
    .map((line) => {
      const item = catalog.items.find((entry) => entry.id === line.itemId);
      const qty = roundMoney(Number(line.qty));
      if (!item || item.hidden || !(qty > 0)) return null;
      const price = item.lastPrice == null ? null : roundMoney(Number(item.lastPrice));
      return {
        itemId: item.id,
        name: item.name,
        qty,
        price: price > 0 ? price : null,
      };
    })
    .filter(Boolean);
  if (!lines.length) return { lists: existingLists, created: null };
  if (existingLists.some((list) => list.month === month && list.fromTemplate)) {
    return { lists: existingLists, created: null };
  }
  const created = {
    id: crypto.randomUUID(),
    month,
    fromTemplate: true,
    draft: true,
    needsApproval: true,
    createdOn: asOf,
    lines,
  };
  return { lists: [created, ...existingLists], created };
}

export function applyMonthlyGroceryDraft(asOf = today()) {
  const template = loadTemplate();
  const catalog = loadCatalog();
  const existing = loadLists();
  const result = buildMonthlyDraft(template, catalog, existing, asOf);
  if (!result.created) return null;
  saveLists(result.lists);
  return result.created;
}

export function visibleItems(catalog) {
  return catalog.items.filter((item) => !item.hidden);
}

export function itemsInGroup(catalog, groupId, { hidden = false } = {}) {
  return catalog.items.filter((item) => item.groupId === groupId && item.hidden === hidden);
}

export function draftTitle(list) {
  const year = list.month.slice(0, 4);
  return `${monthName(list.month)} ${year}`;
}

function normalizeCatalog(raw) {
  const groups = Array.isArray(raw.groups) ? raw.groups : [];
  const items = Array.isArray(raw.items) ? raw.items : [];
  const cleanGroups = groups
    .map((group) => {
      if (!group || typeof group.id !== "string" || typeof group.name !== "string") return null;
      const name = group.name.trim();
      if (!name) return null;
      return { id: group.id, name: name.slice(0, 40) };
    })
    .filter(Boolean);
  const groupIds = new Set(cleanGroups.map((group) => group.id));
  const cleanItems = items
    .map((item) => {
      if (!item || typeof item.id !== "string" || typeof item.name !== "string") return null;
      if (!groupIds.has(item.groupId)) return null;
      const name = item.name.trim();
      if (!name) return null;
      const price = roundMoney(Number(item.lastPrice));
      return {
        id: item.id,
        groupId: item.groupId,
        name: name.slice(0, 60),
        hidden: item.hidden === true,
        lastPrice: price > 0 ? price : null,
      };
    })
    .filter(Boolean);
  return { groups: cleanGroups, items: cleanItems };
}

function normalizeList(list) {
  if (!list || typeof list.id !== "string" || !/^\d{4}-\d{2}$/.test(list.month || "")) return null;
  const lines = Array.isArray(list.lines)
    ? list.lines
        .map((line) => {
          if (!line || typeof line.name !== "string" || !line.name.trim()) return null;
          const qty = roundMoney(Number(line.qty));
          if (!(qty > 0)) return null;
          const price = line.price == null ? null : roundMoney(Number(line.price));
          return {
            itemId: typeof line.itemId === "string" ? line.itemId : "",
            name: line.name.trim().slice(0, 80),
            qty,
            price: price > 0 ? price : null,
            bought: line.bought === true,
          };
        })
        .filter(Boolean)
    : [];
  if (!lines.length) return null;
  return {
    id: list.id,
    month: list.month,
    fromTemplate: list.fromTemplate === true,
    draft: list.draft !== false,
    needsApproval: list.needsApproval === true,
    createdOn: typeof list.createdOn === "string" ? list.createdOn : "",
    lines,
  };
}

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
