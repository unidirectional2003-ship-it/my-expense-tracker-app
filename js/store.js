import { roundMoney } from "./money.js";
import { today } from "./dates.js";

export const STORAGE_KEY = "expense-spaces";
export const SALES_KEY = "business-sales";
export const SAVINGS_KEY = "home-savings-goal";
export const HOME_BUDGET_KEY = "homeMonthlyBudget";
export const BUDGET_KEY = "home-budgets";
export const BILLS_KEY = "bills";

export const state = {
  spaces: { home: [], business: [] },
  sales: [],
  budgets: {},
  savings: emptySavings(),
  bills: [],
};

export function emptySavings() {
  return { name: "", target: 0, saved: 0, appliedMonth: "", appliedAmount: 0 };
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
  return (
    stored.id === next.id &&
    stored.amount === next.amount &&
    stored.category === next.category &&
    stored.date === next.date &&
    stored.note === next.note &&
    stored.repeatsMonthly === next.repeatsMonthly &&
    stored.seriesId === next.seriesId &&
    stored.lastAppliedMonth === next.lastAppliedMonth &&
    stored.receiptId === next.receiptId &&
    stored.merchant === next.merchant &&
    stored.receipt === next.receipt
  );
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

function loadSavings() {
  const stored = readJson(SAVINGS_KEY);
  if (!stored.ok || stored.missing || !stored.value || typeof stored.value !== "object") {
    return emptySavings();
  }
  const target = Number(stored.value.target);
  const saved = Number(stored.value.saved);
  const appliedAmount = Number(stored.value.appliedAmount);
  return {
    name: typeof stored.value.name === "string" ? stored.value.name : "",
    target: Number.isFinite(target) && target > 0 ? roundMoney(target) : 0,
    saved: Number.isFinite(saved) && saved >= 0 ? roundMoney(saved) : 0,
    appliedMonth: typeof stored.value.appliedMonth === "string" ? stored.value.appliedMonth : "",
    appliedAmount: Number.isFinite(appliedAmount) && appliedAmount >= 0 ? roundMoney(appliedAmount) : 0,
  };
}

export function saveSpaces() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.spaces));
}

export function saveSales() {
  localStorage.setItem(SALES_KEY, JSON.stringify(state.sales));
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

const RECEIPTS_KEY = "expense-receipts";

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
