/**
 * One store for every collection later screens share.
 * Versioned so a future shape can be migrated without dropping saved rows.
 * Legacy keys (expense-spaces, budgets, receipt photos) are copied in once
 * and left in place, so the original dashboard keeps its own data.
 */

export const STORAGE_VERSION = 1;

export const COLLECTIONS = [
  "orders",
  "workItems",
  "expenses",
  "groceryItems",
  "groceryTemplate",
  "checklist",
  "pendingApprovals",
  "alerts",
  "budgets",
  "settings",
  "receipts",
  "cities",
  "receiptAliases",
  "accounts",
];

const DB_KEY = "tracker-db";
const BACKUP_KEY = "tracker-db-previous";
const UNREADABLE_KEY = "tracker-db-unreadable";

const LEGACY = {
  spaces: "expense-spaces",
  budgets: "home-budgets",
  receipts: "expense-receipts",
};

export const STARTER_CITIES = [
  "Lahore",
  "Karachi",
  "Islamabad",
  "Rawalpindi",
  "Faisalabad",
  "Multan",
  "Gujranwala",
  "Sialkot",
  "Peshawar",
  "Quetta",
  "Hyderabad",
  "Bahawalpur",
  "Sargodha",
  "Sukkur",
  "Larkana",
  "Sheikhupura",
  "Rahim Yar Khan",
  "Jhang",
  "Mardan",
  "Gujrat",
  "Abbottabad",
  "Kasur",
  "Sahiwal",
  "Okara",
  "Wah Cantonment",
  "Dera Ghazi Khan",
  "Mirpur",
  "Gilgit",
  "Muzaffarabad",
  "Gwadar",
];

const listeners = new Set();
let db = null;

export function onStorageChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  listeners.forEach((listener) => listener());
}

function emptyDb() {
  const collections = {};
  COLLECTIONS.forEach((name) => {
    collections[name] = [];
  });
  return { version: STORAGE_VERSION, collections };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readRaw(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readJson(key) {
  const raw = readRaw(key);
  if (raw == null) return { missing: true, value: null, raw: null };
  try {
    return { missing: false, value: JSON.parse(raw), raw };
  } catch {
    return { missing: false, corrupt: true, value: null, raw };
  }
}

function assertCollection(name) {
  if (!COLLECTIONS.includes(name)) {
    throw new Error(`Unknown collection: ${name}`);
  }
}

function ensureShape(data) {
  if (!data || typeof data !== "object") return emptyDb();
  const collections = data.collections && typeof data.collections === "object" ? { ...data.collections } : {};
  COLLECTIONS.forEach((name) => {
    if (!Array.isArray(collections[name])) collections[name] = [];
  });
  const version = Number.isInteger(data.version) ? data.version : 0;
  return { ...data, version, collections };
}

function cityId(name) {
  return `city-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function seedCities(target) {
  target.collections.cities = STARTER_CITIES.map((name) => ({ id: cityId(name), name }));
}

function importLegacy(target) {
  if (target.collections.expenses.length === 0) {
    const spaces = readJson(LEGACY.spaces);
    const stored = spaces.value;
    if (stored && typeof stored === "object") {
      ["home", "business"].forEach((space) => {
        const list = Array.isArray(stored[space]) ? stored[space] : [];
        list.forEach((expense) => {
          if (!expense || typeof expense !== "object" || typeof expense.id !== "string") return;
          const copy = { ...expense, space };
          if (typeof copy.receipt === "string" && copy.receipt.startsWith("data:image/")) {
            delete copy.receipt;
          }
          target.collections.expenses.push(copy);
        });
      });
    }
  }

  if (target.collections.budgets.length === 0) {
    const budgets = readJson(LEGACY.budgets);
    if (budgets.value && typeof budgets.value === "object" && !Array.isArray(budgets.value)) {
      Object.entries(budgets.value).forEach(([month, amount]) => {
        if (/^\d{4}-\d{2}$/.test(month) && typeof amount === "number" && amount > 0) {
          target.collections.budgets.push({ id: month, month, amount });
        }
      });
    }
  }

  if (target.collections.receipts.length === 0) {
    const photos = readJson(LEGACY.receipts);
    if (photos.value && typeof photos.value === "object" && !Array.isArray(photos.value)) {
      Object.keys(photos.value).forEach((id) => {
        if (typeof id === "string" && id) target.collections.receipts.push({ id, source: LEGACY.receipts });
      });
    }
  }

  if (target.collections.cities.length === 0) seedCities(target);
}

function legacyReceiptMap() {
  const photos = readJson(LEGACY.receipts);
  if (!photos.value || typeof photos.value !== "object" || Array.isArray(photos.value)) return {};
  return photos.value;
}

function hydrate(name, list) {
  if (name !== "receipts") return list;
  const photos = legacyReceiptMap();
  return list.map((receipt) => {
    if (typeof receipt.dataUrl === "string" && receipt.dataUrl) return receipt;
    const dataUrl = photos[receipt.id];
    return dataUrl ? { ...receipt, dataUrl } : receipt;
  });
}

function mirrorReceipt(record) {
  if (typeof record.dataUrl !== "string" || !record.dataUrl.startsWith("data:image/")) return;
  const photos = legacyReceiptMap();
  photos[record.id] = record.dataUrl;
  try {
    localStorage.setItem(LEGACY.receipts, JSON.stringify(photos));
  } catch {
    // The collection copy is the one this module just saved. The legacy mirror is best-effort.
  }
}

function unmirrorReceipt(id) {
  const photos = legacyReceiptMap();
  if (!photos[id]) return;
  delete photos[id];
  try {
    localStorage.setItem(LEGACY.receipts, JSON.stringify(photos));
  } catch {
    // Leave the legacy photo in place if storage is full. The collection row is already gone.
  }
}

function withoutHeavyImages(data) {
  const copy = clone(data);
  COLLECTIONS.forEach((name) => {
    copy.collections[name] = copy.collections[name].map((record) => {
      const next = { ...record };
      Object.keys(next).forEach((key) => {
        if (typeof next[key] === "string" && next[key].startsWith("data:image/")) delete next[key];
      });
      return next;
    });
  });
  return copy;
}

function persist() {
  const next = JSON.stringify(db);
  const current = readRaw(DB_KEY);
  if (current && current !== next) {
    try {
      localStorage.setItem(BACKUP_KEY, current);
    } catch {
      // A backup is a safety net. Saving the current database still comes first.
    }
  }
  try {
    localStorage.setItem(DB_KEY, next);
  } catch {
    const lighter = withoutHeavyImages(db);
    localStorage.setItem(DB_KEY, JSON.stringify(lighter));
    db = lighter;
  }
  emit();
}

function migrate(data) {
  let next = ensureShape(data);
  if (next.version < 1) {
    importLegacy(next);
    next.version = 1;
  }
  while (next.version < STORAGE_VERSION) {
    next.version += 1;
  }
  return next;
}

export function initStorage() {
  return loadStorage();
}

export function loadStorage() {
  const stored = readJson(DB_KEY);
  if (stored.corrupt) {
    try {
      localStorage.setItem(UNREADABLE_KEY, stored.raw);
    } catch {
      // Keep the original key if we cannot copy it. migrate() below does not delete it until persist.
    }
    db = migrate({ version: 0, collections: {} });
    persist();
    return db.version;
  }
  if (stored.missing) {
    db = migrate({ version: 0, collections: {} });
    persist();
    return db.version;
  }
  const before = stored.raw;
  db = migrate(stored.value);
  if (JSON.stringify(db) !== before) persist();
  return db.version;
}

export function get(collection, id) {
  if (!db) loadStorage();
  assertCollection(collection);
  const list = hydrate(collection, db.collections[collection]).map(clone);
  if (id === undefined) return list;
  return list.find((record) => record.id === id) || null;
}

export function save(collection, item) {
  if (!db) loadStorage();
  assertCollection(collection);
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error("A record must be an object");
  }
  const record = clone(item);
  if (typeof record.id !== "string" || !record.id) record.id = crypto.randomUUID();
  const list = db.collections[collection];
  const index = list.findIndex((row) => row.id === record.id);
  if (index === -1) list.push(record);
  else list[index] = record;
  persist();
  if (collection === "receipts") mirrorReceipt(record);
  return clone(hydrate(collection, [record])[0]);
}

export function update(collection, id, patch) {
  if (!db) loadStorage();
  assertCollection(collection);
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new Error("Updates must be an object");
  }
  const list = db.collections[collection];
  const index = list.findIndex((row) => row.id === id);
  if (index === -1) return null;
  const next = { ...clone(list[index]), ...clone(patch), id };
  list[index] = next;
  persist();
  if (collection === "receipts") mirrorReceipt(next);
  return clone(hydrate(collection, [next])[0]);
}

export function deleteRecord(collection, id) {
  if (!db) loadStorage();
  assertCollection(collection);
  const list = db.collections[collection];
  const index = list.findIndex((row) => row.id === id);
  if (index === -1) return false;
  list.splice(index, 1);
  persist();
  if (collection === "receipts") unmirrorReceipt(id);
  return true;
}

export { deleteRecord as delete };
