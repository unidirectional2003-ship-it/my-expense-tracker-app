import { roundMoney } from "./money.js";
import { today } from "./dates.js";
import { normalizeChecklist, emptyChecklist } from "./checklist-model.js";

export const STORAGE_KEY = "expense-spaces";
export const SALES_KEY = "business-sales";
export const SAVINGS_KEY = "home-savings-goal";
export const HOME_BUDGET_KEY = "homeMonthlyBudget";
export const BUDGET_KEY = "home-budgets";
export const CATEGORY_BUDGET_KEY = "category-budgets";
export const ALERTS_KEY = "alerts";
export const BILLS_KEY = "bills";
export const CHECKLIST_KEY = "checklist";

export const state = {
  spaces: { home: [], business: [] },
  sales: [],
  budgets: {},
  savings: emptySavings(),
  bills: [],
  checklist: emptyChecklist(),
};

export function emptySavings() {
  return { name: "", target: 0, saved: 0, appliedMonth: "", appliedAmount: 0, appliedByMonth: {} };
}

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return { ok: true, missing: true, value: null };
    return { ok: true, missing: false, value: JSON.parse(raw) };
  } catch {
    return { ok: false, missing: false, value: null };
  }
}

function sameExpense(stored, next) {
  if (!stored || !next) return false;
  return expenseSignature(stored) === expenseSignature(next);
}

function expenseSignature(expense) {
  return JSON.stringify({
    id: expense.id,
    amount: expense.amount,
    category: expense.category,
    date: expense.date,
    note: expense.note,
    repeatsMonthly: expense.repeatsMonthly === true ? true : undefined,
    seriesId: expense.seriesId || undefined,
    lastAppliedMonth: expense.lastAppliedMonth || undefined,
    receiptId: expense.receiptId || undefined,
    merchant: expense.merchant || undefined,
    receipt: expense.receipt || undefined,
    subcategory: expense.subcategory || undefined,
    itemName: expense.itemName || undefined,
    brand: expense.brand || undefined,
    size: expense.size || undefined,
    person: expense.person || undefined,
    receiptHook: expense.receiptHook || undefined,
    lines: expense.lines || undefined,
  });
}

export function normalizeExpense(expense) {
  if (
    !expense ||
    typeof expense.id !== "string" ||
    typeof expense.amount !== "number" ||
    !(expense.amount > 0) ||
    typeof expense.category !== "string" ||
    !expense.category ||
    typeof expense.date !== "string" ||
    !expense.date ||
    typeof expense.note !== "string" ||
    !expense.note
  ) {
    return null;
  }
  const amount = roundMoney(expense.amount);
  if (!(amount > 0)) return null;
  const next = {
    id: expense.id,
    amount,
    category: expense.category,
    date: expense.date,
    note: expense.note,
  };
  if (expense.repeatsMonthly === true) next.repeatsMonthly = true;
  if (typeof expense.seriesId === "string" && expense.seriesId) next.seriesId = expense.seriesId;
  if (typeof expense.lastAppliedMonth === "string" && /^\d{4}-\d{2}$/.test(expense.lastAppliedMonth)) {
    next.lastAppliedMonth = expense.lastAppliedMonth;
  }
  if (typeof expense.receiptId === "string" && expense.receiptId) next.receiptId = expense.receiptId;
  if (typeof expense.merchant === "string" && expense.merchant) next.merchant = expense.merchant;
  if (typeof expense.receipt === "string" && expense.receipt.startsWith("data:image/")) {
    next.receipt = expense.receipt;
  }
  copyText(expense, next, "subcategory", 80);
  copyText(expense, next, "itemName", 80);
  copyText(expense, next, "brand", 80);
  copyText(expense, next, "size", 40);
  copyText(expense, next, "person", 40);
  copyText(expense, next, "receiptHook", 120);
  if (Array.isArray(expense.lines)) {
    const lines = expense.lines.map(normalizeLine).filter(Boolean);
    if (lines.length) next.lines = lines;
  }
  return next;
}

function copyText(source, target, key, max) {
  if (typeof source[key] !== "string") return;
  const value = source[key].trim();
  if (value) target[key] = value.slice(0, max);
}

function normalizeLine(line) {
  if (!line || typeof line.name !== "string" || !line.name.trim()) return null;
  const qty = roundMoney(Number(line.qty));
  const price = roundMoney(Number(line.price));
  if (!(qty > 0) || !(price > 0)) return null;
  const next = {
    name: line.name.trim().slice(0, 80),
    qty,
    price,
    lineTotal: roundMoney(qty * price),
  };
  if (typeof line.itemId === "string" && line.itemId) next.itemId = line.itemId;
  return next;
}

function normalizeSale(sale) {
  if (
    !sale ||
    typeof sale.id !== "string" ||
    typeof sale.amount !== "number" ||
    !(sale.amount > 0) ||
    typeof sale.date !== "string" ||
    !sale.date ||
    typeof sale.note !== "string" ||
    !sale.note
  ) {
    return null;
  }
  const customer = typeof sale.customer === "string" ? sale.customer : "";
  const hasEarned = Object.prototype.hasOwnProperty.call(sale, "earnedAmount");
  const hasCash = Object.prototype.hasOwnProperty.call(sale, "cashReceived");
  let kind = sale.kind === "advance" ? "advance" : "earned";
  let earnedAmount = 0;
  let cashReceived = 0;

  if (kind === "advance") {
    cashReceived = roundMoney(hasCash ? Number(sale.cashReceived) : sale.amount);
    if (!(cashReceived > 0)) return null;
    earnedAmount = 0;
  } else if (hasEarned || hasCash || sale.kind === "earned") {
    earnedAmount = roundMoney(hasEarned ? Number(sale.earnedAmount) : sale.amount);
    cashReceived = roundMoney(hasCash ? Number(sale.cashReceived) : earnedAmount);
    if (!(earnedAmount > 0)) return null;
    if (cashReceived < 0) cashReceived = 0;
    if (cashReceived > earnedAmount) cashReceived = earnedAmount;
  } else {
    earnedAmount = roundMoney(sale.amount);
    cashReceived = earnedAmount;
    if (!(earnedAmount > 0)) return null;
    kind = "earned";
  }

  const next = {
    id: sale.id,
    amount: kind === "advance" ? cashReceived : earnedAmount,
    date: sale.date,
    note: sale.note,
    customer,
    kind,
    earnedAmount,
    cashReceived,
  };
  if (typeof sale.orderId === "string" && sale.orderId) next.orderId = sale.orderId;
  if (typeof sale.paymentId === "string" && sale.paymentId) next.paymentId = sale.paymentId;
  if (sale.verified === true || sale.verified === false) next.verified = sale.verified === true;
  if (typeof sale.paymentProofId === "string" && sale.paymentProofId) next.paymentProofId = sale.paymentProofId;
  if (typeof sale.proofAmount === "number" && Number.isFinite(sale.proofAmount)) next.proofAmount = roundMoney(sale.proofAmount);
  if (typeof sale.proofDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sale.proofDate)) next.proofDate = sale.proofDate;
  const changed =
    sale.kind !== next.kind ||
    sale.amount !== next.amount ||
    sale.customer !== next.customer ||
    sale.earnedAmount !== next.earnedAmount ||
    sale.cashReceived !== next.cashReceived ||
    typeof sale.customer !== "string";
  return { sale: next, changed };
}

function normalizeBill(bill) {
  if (!bill || typeof bill !== "object") return null;
  const amount = roundMoney(Number(bill.amount));
  const dueDate = typeof bill.dueDate === "string" ? bill.dueDate : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !(amount > 0)) return null;
  const nameSource = typeof bill.name === "string" && bill.name.trim()
    ? bill.name
    : typeof bill.note === "string" && bill.note.trim()
      ? bill.note
      : "Bill";
  const space = bill.space === "business" ? "business" : "home";
  const id = typeof bill.id === "string" && bill.id ? bill.id : crypto.randomUUID();
  const next = {
    id,
    name: nameSource.trim(),
    amount,
    dueDate,
    paid: bill.paid === true,
    space,
  };
  if (typeof bill.receiptId === "string" && bill.receiptId) next.receiptId = bill.receiptId;
  const changed =
    bill.id !== next.id ||
    bill.name !== next.name ||
    bill.amount !== next.amount ||
    bill.paid !== next.paid ||
    bill.space !== next.space ||
    typeof bill.note === "string";
  return { bill: next, changed };
}

export function loadAll() {
  const spaces = readJson(STORAGE_KEY);
  if (spaces.ok) {
    const stored = spaces.value;
    const home = Array.isArray(stored?.home) ? stored.home : [];
    const business = Array.isArray(stored?.business) ? stored.business : [];
    let changed = Array.isArray(stored?.home) === false || Array.isArray(stored?.business) === false;
    if (!spaces.missing && (!stored || typeof stored !== "object")) changed = false;
    const mapList = (list) =>
      list.reduce((rows, item) => {
        const next = normalizeExpense(item);
        if (!next) {
          changed = true;
          return rows;
        }
        if (!sameExpense(item, next)) changed = true;
        rows.push(next);
        return rows;
      }, []);
    if (spaces.missing) {
      state.spaces = { home: [], business: [] };
    } else if (stored && typeof stored === "object") {
      state.spaces = { home: mapList(home), business: mapList(business) };
      if (changed) saveSpaces();
    }
  }

  const sales = readJson(SALES_KEY);
  if (sales.ok) {
    if (sales.missing || !Array.isArray(sales.value)) {
      state.sales = [];
    } else {
      let changed = false;
      state.sales = sales.value.reduce((rows, item) => {
        const normalized = normalizeSale(item);
        if (!normalized) {
          changed = true;
          return rows;
        }
        if (normalized.changed) changed = true;
        rows.push(normalized.sale);
        return rows;
      }, []);
      if (changed) saveSales();
    }
  }

  state.budgets = loadBudgets();
  state.categoryBudgets = loadCategoryBudgets();
  state.alerts = loadAlerts();
  state.savings = loadSavings();

  const bills = readJson(BILLS_KEY);
  if (bills.ok) {
    if (bills.missing || !Array.isArray(bills.value)) {
      state.bills = [];
    } else {
      let changed = false;
      state.bills = bills.value.reduce((rows, item) => {
        const normalized = normalizeBill(item);
        if (!normalized) {
          changed = true;
          return rows;
        }
        if (normalized.changed) changed = true;
        rows.push(normalized.bill);
        return rows;
      }, []);
      if (changed) saveBills();
    }
  }

  const checklist = readJson(CHECKLIST_KEY);
  if (checklist.ok) {
    if (checklist.missing) {
      state.checklist = emptyChecklist();
      saveChecklist();
    } else {
      const normalized = normalizeChecklist(checklist.value);
      state.checklist = normalized.checklist;
      if (normalized.changed) saveChecklist();
    }
  }
}

function loadBudgets() {
  const clean = {};
  const stored = readJson(BUDGET_KEY);
  if (stored.ok && stored.value && typeof stored.value === "object") {
    Object.entries(stored.value).forEach(([month, amount]) => {
      if (/^\d{4}-\d{2}$/.test(month) && typeof amount === "number" && amount > 0) {
        clean[month] = roundMoney(amount);
      }
    });
  }
  let legacy = NaN;
  try {
    legacy = Number(localStorage.getItem(HOME_BUDGET_KEY));
  } catch {
    legacy = NaN;
  }
  const current = today().slice(0, 7);
  if (clean[current] == null && Number.isFinite(legacy) && legacy > 0) {
    clean[current] = roundMoney(legacy);
  }
  return clean;
}

function loadCategoryBudgets() {
  const clean = {};
  const stored = readJson(CATEGORY_BUDGET_KEY);
  if (!stored.ok || !stored.value || typeof stored.value !== "object" || Array.isArray(stored.value)) {
    return clean;
  }
  Object.entries(stored.value).forEach(([month, limits]) => {
    if (!/^\d{4}-\d{2}$/.test(month) || !limits || typeof limits !== "object" || Array.isArray(limits)) return;
    const row = {};
    Object.entries(limits).forEach(([category, amount]) => {
      const value = roundMoney(Number(amount));
      if (typeof category === "string" && category && value > 0) row[category] = value;
    });
    if (Object.keys(row).length) clean[month] = row;
  });
  return clean;
}

function loadAlerts() {
  const stored = readJson(ALERTS_KEY);
  if (!stored.ok || !Array.isArray(stored.value)) return [];
  const seen = new Set();
  return stored.value.reduce((rows, item) => {
    const next = normalizeAlert(item);
    if (!next || seen.has(next.key)) return rows;
    seen.add(next.key);
    rows.push(next);
    return rows;
  }, []);
}

function normalizeAlert(item) {
  if (!item || typeof item.key !== "string" || !item.key) return null;
  const status = item.status === "resolved" || item.status === "snoozed" ? item.status : "open";
  const params = {};
  if (item.params && typeof item.params === "object" && !Array.isArray(item.params)) {
    Object.entries(item.params).forEach(([key, value]) => {
      if (typeof value === "string" || typeof value === "number") params[key] = value;
    });
  }
  return {
    key: item.key,
    title: typeof item.title === "string" && item.title ? item.title : "Alert",
    message: typeof item.message === "string" ? item.message : "",
    severity: item.severity === "danger" ? "danger" : "warning",
    screen: typeof item.screen === "string" && item.screen ? item.screen : "alerts",
    params,
    status,
    snoozeUntil: typeof item.snoozeUntil === "string" ? item.snoozeUntil : "",
    resolvedAt: typeof item.resolvedAt === "string" ? item.resolvedAt : "",
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "",
  };
}

function loadSavings() {
  const stored = readJson(SAVINGS_KEY);
  if (!stored.ok || stored.missing || !stored.value || typeof stored.value !== "object") {
    return emptySavings();
  }
  const target = Number(stored.value.target);
  const saved = Number(stored.value.saved);
  const appliedAmount = Number(stored.value.appliedAmount);
  const appliedMonth = typeof stored.value.appliedMonth === "string" ? stored.value.appliedMonth : "";
  const appliedByMonth = {};
  const rawMap = stored.value.appliedByMonth;
  if (rawMap && typeof rawMap === "object" && !Array.isArray(rawMap)) {
    Object.entries(rawMap).forEach(([month, amount]) => {
      const value = roundMoney(Number(amount));
      if (/^\d{4}-\d{2}$/.test(month) && value > 0) appliedByMonth[month] = value;
    });
  }
  const legacyAmount = Number.isFinite(appliedAmount) && appliedAmount >= 0 ? roundMoney(appliedAmount) : 0;
  if (appliedMonth && appliedByMonth[appliedMonth] == null && legacyAmount > 0) {
    appliedByMonth[appliedMonth] = legacyAmount;
  }
  return {
    name: typeof stored.value.name === "string" ? stored.value.name : "",
    target: Number.isFinite(target) && target > 0 ? roundMoney(target) : 0,
    saved: Number.isFinite(saved) && saved >= 0 ? roundMoney(saved) : 0,
    appliedMonth,
    appliedAmount: legacyAmount,
    appliedByMonth,
  };
}

export function saveSpaces() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.spaces));
}

export function saveSales() {
  localStorage.setItem(SALES_KEY, JSON.stringify(state.sales));
}

export function saveCategoryBudgets() {
  localStorage.setItem(CATEGORY_BUDGET_KEY, JSON.stringify(state.categoryBudgets));
}

export function saveAlerts() {
  localStorage.setItem(ALERTS_KEY, JSON.stringify(state.alerts));
}

export function saveBudgets() {
  localStorage.setItem(BUDGET_KEY, JSON.stringify(state.budgets));
  const current = today().slice(0, 7);
  if (typeof state.budgets[current] === "number") {
    localStorage.setItem(HOME_BUDGET_KEY, String(state.budgets[current]));
  }
}

export function saveSavings() {
  localStorage.setItem(SAVINGS_KEY, JSON.stringify(state.savings));
}

export function saveBills() {
  localStorage.setItem(BILLS_KEY, JSON.stringify(state.bills));
}

export function saveChecklist() {
  localStorage.setItem(CHECKLIST_KEY, JSON.stringify(state.checklist));
}

export const RECEIPTS_KEY = "expense-receipts";

export function receiptPhotos() {
  const parsed = readJson(RECEIPTS_KEY);
  if (!parsed.ok || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    return {};
  }
  return parsed.value;
}

export function saveReceipt(id, dataUrl) {
  const all = receiptPhotos();
  all[id] = dataUrl;
  localStorage.setItem(RECEIPTS_KEY, JSON.stringify(all));
}

export function deleteReceipt(id) {
  if (!id) return;
  const all = receiptPhotos();
  if (!all[id]) return;
  delete all[id];
  localStorage.setItem(RECEIPTS_KEY, JSON.stringify(all));
}
