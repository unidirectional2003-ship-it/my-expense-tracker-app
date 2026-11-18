import { roundMoney } from "./money.js";
import { dateInMonth, nextMonth } from "./dates.js";

export const DEFAULT_CHECKLIST_ITEMS = [
  { name: "Electricity bill", dueDay: 5, category: "Bills" },
  { name: "Gas bill", dueDay: 8, category: "Bills" },
  { name: "Water bill", dueDay: 10, category: "Bills" },
  { name: "Rent", dueDay: 1, category: "Rent" },
  { name: "Grocery", dueDay: 15, category: "Groceries" },
  { name: "Internet", dueDay: 12, category: "Bills" },
  { name: "Mobile bill", dueDay: 18, category: "Bills" },
  { name: "Others", dueDay: 28, category: "Other" },
];

const HOME_CATEGORIES = ["Groceries", "Bills", "Rent", "Kids", "Transport", "Health", "Shopping", "Other"];

export function categoryForChecklistName(name) {
  const match = DEFAULT_CHECKLIST_ITEMS.find((item) => item.name.toLowerCase() === String(name).trim().toLowerCase());
  return match ? match.category : "Other";
}

export function opensGroceries(item) {
  if (!item) return false;
  return /^grocer(y|ies)$/i.test(String(item.name || "").trim());
}

export function emptyChecklist(idFactory = crypto.randomUUID.bind(crypto)) {
  return {
    items: DEFAULT_CHECKLIST_ITEMS.map((item, order) => ({
      id: idFactory(),
      name: item.name,
      dueDay: item.dueDay,
      expectedAmount: 0,
      category: item.category,
      order,
    })),
    months: {},
  };
}

export function normalizeChecklist(value, idFactory = crypto.randomUUID.bind(crypto)) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Array.isArray(value.items)) {
    return { checklist: emptyChecklist(idFactory), changed: true };
  }

  let changed = false;
  const items = [];
  value.items.forEach((item) => {
    const next = normalizeTemplate(item, items.length, idFactory);
    if (!next) {
      changed = true;
      return;
    }
    if (!sameTemplate(item, next)) changed = true;
    items.push(next);
  });

  const months = {};
  const source = value.months && typeof value.months === "object" && !Array.isArray(value.months) ? value.months : {};
  if (value.months !== source) changed = true;
  Object.entries(source).forEach(([month, rows]) => {
    if (!/^\d{4}-\d{2}$/.test(month) || !Array.isArray(rows)) {
      changed = true;
      return;
    }
    const nextRows = [];
    rows.forEach((row) => {
      const next = normalizeInstance(row, idFactory);
      if (!next) {
        changed = true;
        return;
      }
      if (!sameInstance(row, next)) changed = true;
      nextRows.push(next);
    });
    months[month] = nextRows;
  });

  return { checklist: { items, months }, changed };
}

export function ensureMonth(checklist, month, idFactory = crypto.randomUUID.bind(crypto)) {
  if (!/^\d{4}-\d{2}$/.test(month || "")) return false;
  if (Array.isArray(checklist.months[month])) return false;
  checklist.months[month] = sortTemplates(checklist.items).map((template) => instanceFromTemplate(template, idFactory));
  return true;
}

export function ensureMonthsThrough(checklist, month, idFactory = crypto.randomUUID.bind(crypto)) {
  if (!/^\d{4}-\d{2}$/.test(month || "")) return false;
  const keys = Object.keys(checklist.months)
    .filter((key) => /^\d{4}-\d{2}$/.test(key))
    .sort();
  const start = keys.length && keys[0] < month ? keys[0] : month;
  let changed = false;
  let cursor = start;
  while (cursor && cursor <= month) {
    if (ensureMonth(checklist, cursor, idFactory)) changed = true;
    cursor = nextMonth(cursor);
  }
  return changed;
}

export function addTemplate(checklist, input, currentMonth, idFactory = crypto.randomUUID.bind(crypto)) {
  const template = {
    id: idFactory(),
    name: input.name.trim(),
    dueDay: clampDay(input.dueDay),
    expectedAmount: moneyOrZero(input.expectedAmount),
    category: cleanCategory(input.category, input.name),
    order: checklist.items.length,
  };
  checklist.items.push(template);
  const rows = checklist.months[currentMonth];
  if (Array.isArray(rows)) rows.push(instanceFromTemplate(template, idFactory));
  return template;
}

export function updateTemplate(checklist, id, input, currentMonth) {
  const template = checklist.items.find((item) => item.id === id);
  if (!template) return false;
  template.name = input.name.trim();
  template.dueDay = clampDay(input.dueDay);
  template.expectedAmount = moneyOrZero(input.expectedAmount);
  template.category = cleanCategory(input.category, template.name);
  const rows = checklist.months[currentMonth];
  if (Array.isArray(rows)) {
    const row = rows.find((item) => item.templateId === id);
    if (row) {
      row.name = template.name;
      row.dueDay = template.dueDay;
      row.expectedAmount = template.expectedAmount;
      row.category = template.category;
    }
  }
  return true;
}

export function deleteTemplate(checklist, id, currentMonth) {
  const rows = checklist.months[currentMonth];
  const row = Array.isArray(rows) ? rows.find((item) => item.templateId === id) : null;
  if (row && row.paid) return { ok: false, reason: "paid" };
  const before = checklist.items.length;
  checklist.items = checklist.items.filter((item) => item.id !== id);
  if (checklist.items.length === before) return { ok: false, reason: "missing" };
  sortTemplates(checklist.items).forEach((item, order) => {
    item.order = order;
  });
  if (Array.isArray(rows)) {
    checklist.months[currentMonth] = rows.filter((item) => item.templateId !== id);
  }
  return { ok: true };
}

export function moveTemplate(checklist, id, direction, currentMonth) {
  const items = sortTemplates(checklist.items);
  const index = items.findIndex((item) => item.id === id);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return false;
  const [item] = items.splice(index, 1);
  items.splice(nextIndex, 0, item);
  items.forEach((entry, order) => {
    entry.order = order;
  });
  checklist.items = items;
  const rows = checklist.months[currentMonth];
  if (Array.isArray(rows)) {
    const byTemplate = new Map(rows.map((row) => [row.templateId, row]));
    const ordered = items.map((template) => byTemplate.get(template.id)).filter(Boolean);
    const extras = rows.filter((row) => !items.some((template) => template.id === row.templateId));
    checklist.months[currentMonth] = [...ordered, ...extras];
  }
  return true;
}

export function payChecklistItem(checklist, month, itemId, amount, expenseId) {
  const row = monthItem(checklist, month, itemId);
  const paidAmount = roundMoney(amount);
  if (!row || row.paid || !(paidAmount > 0)) return { ok: false };
  row.paid = true;
  row.paidAmount = paidAmount;
  row.expenseId = expenseId;
  return {
    ok: true,
    expense: {
      id: expenseId,
      amount: paidAmount,
      category: row.category || "Other",
      note: row.name,
    },
  };
}

export function unpayChecklistItem(checklist, month, itemId) {
  const row = monthItem(checklist, month, itemId);
  if (!row || !row.paid) return { ok: false, expenseId: "" };
  const expenseId = row.expenseId;
  row.paid = false;
  row.paidAmount = 0;
  row.expenseId = "";
  return { ok: true, expenseId };
}

export function dueDateFor(item, month) {
  return dateInMonth(month, item.dueDay);
}

export function itemUrgency(item, month, todayValue) {
  if (item.paid) return "paid";
  const due = dueDateFor(item, month);
  if (due < todayValue) return "overdue";
  if (due <= addDays(todayValue, 3)) return "soon";
  return "upcoming";
}

export function listOverdueChecklistItems(checklist, todayValue) {
  const rows = [];
  Object.entries(checklist.months || {}).forEach(([month, items]) => {
    if (!Array.isArray(items)) return;
    items.forEach((item) => {
      if (item.paid) return;
      const dueDate = dueDateFor(item, month);
      if (dueDate >= todayValue) return;
      rows.push({
        id: item.id,
        templateId: item.templateId,
        name: item.name,
        month,
        dueDate,
        dueDay: item.dueDay,
        expectedAmount: item.expectedAmount,
        paidAmount: item.paidAmount,
        paid: false,
        category: item.category,
      });
    });
  });
  rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name));
  return rows;
}

export function checklistProgress(items) {
  const total = items.length;
  const done = items.filter((item) => item.paid).length;
  return { done, total, label: `${done} of ${total} done` };
}

function monthItem(checklist, month, itemId) {
  const rows = checklist.months[month];
  if (!Array.isArray(rows)) return null;
  return rows.find((item) => item.id === itemId) || null;
}

function instanceFromTemplate(template, idFactory) {
  return {
    id: idFactory(),
    templateId: template.id,
    name: template.name,
    dueDay: template.dueDay,
    expectedAmount: template.expectedAmount,
    category: template.category,
    paid: false,
    paidAmount: 0,
    expenseId: "",
  };
}

function normalizeTemplate(item, order, idFactory) {
  if (!item || typeof item !== "object") return null;
  const name = typeof item.name === "string" ? item.name.trim() : "";
  if (!name) return null;
  return {
    id: typeof item.id === "string" && item.id ? item.id : idFactory(),
    name,
    dueDay: clampDay(item.dueDay),
    expectedAmount: moneyOrZero(item.expectedAmount),
    category: cleanCategory(item.category, name),
    order: Number.isInteger(item.order) ? item.order : order,
  };
}

function normalizeInstance(item, idFactory) {
  if (!item || typeof item !== "object") return null;
  const name = typeof item.name === "string" ? item.name.trim() : "";
  if (!name) return null;
  const paid = item.paid === true;
  const paidAmount = paid ? moneyOrZero(item.paidAmount) : 0;
  return {
    id: typeof item.id === "string" && item.id ? item.id : idFactory(),
    templateId: typeof item.templateId === "string" ? item.templateId : "",
    name,
    dueDay: clampDay(item.dueDay),
    expectedAmount: moneyOrZero(item.expectedAmount),
    category: cleanCategory(item.category, name),
    paid,
    paidAmount,
    expenseId: typeof item.expenseId === "string" ? item.expenseId : "",
  };
}

function sameTemplate(stored, next) {
  return (
    stored.id === next.id &&
    stored.name === next.name &&
    stored.dueDay === next.dueDay &&
    stored.expectedAmount === next.expectedAmount &&
    stored.category === next.category &&
    stored.order === next.order &&
    stored.screen == null
  );
}

function sameInstance(stored, next) {
  return (
    stored.id === next.id &&
    stored.templateId === next.templateId &&
    stored.name === next.name &&
    stored.dueDay === next.dueDay &&
    stored.expectedAmount === next.expectedAmount &&
    stored.category === next.category &&
    stored.paid === next.paid &&
    stored.paidAmount === next.paidAmount &&
    stored.expenseId === next.expenseId
  );
}

function sortTemplates(items) {
  return [...items].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

function cleanCategory(category, name) {
  if (typeof category === "string" && HOME_CATEGORIES.includes(category)) return category;
  return categoryForChecklistName(name);
}

function moneyOrZero(value) {
  const amount = roundMoney(Number(value));
  return amount > 0 ? amount : 0;
}

export function clampDay(value) {
  const day = Math.round(Number(value));
  if (!Number.isInteger(day) || day < 1) return 1;
  if (day > 31) return 31;
  return day;
}

function addDays(isoDate, days) {
  const [year, month, day] = String(isoDate).split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
