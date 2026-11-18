import { parseMoney, formatMoney, roundMoney } from "./money.js";
import { today, formatDate, nextMonth, dateInMonth } from "./dates.js";
import { SPACES } from "./spaces.js";
import { state, saveChecklist, saveSales, saveSpaces } from "./store.js";
import { isDuplicateExpense, isDuplicateSale } from "./calc.js";
import { get, save, update } from "./storage.js";
import { ensureScreen, registerScreen } from "./router.js";
import { addExpense } from "./expenses.js";
import { render } from "./render.js";
import { ensureMonth, dueDateFor, payChecklistItem } from "./checklist-model.js";
import { applyMonthlyGroceryDraft, loadLists, saveLists, TEMPLATE_KEY } from "./grocery.js";

const SOURCE_GROCERY = "Auto: Monthly grocery list";
const SOURCE_CHECKLIST = "Auto: Checklist";
const SOURCE_BUSINESS = "Auto: Recurring business expense";
const SOURCE_RECEIPT = "Auto: Receipt scan";

let editingId = null;
let syncing = false;
let screenRoot = null;

export function registerApprovals() {
  mountApprovals();
  queueMicrotask(mountApprovals);
  globalThis.queuePendingApproval = queuePendingApproval;
}

function mountApprovals() {
  screenRoot = ensureScreen("approvals");
  screenRoot.replaceChildren(buildScreen());
  registerScreen("approvals", {
    show() {
      syncAutoApprovals();
      renderApprovals();
      updateApprovalsBadge();
    },
  });
  if (screenRoot.dataset.bound !== "yes") {
    screenRoot.dataset.bound = "yes";
    screenRoot.addEventListener("click", onClick);
    screenRoot.addEventListener("submit", onSubmit);
  }
}

export function syncAutoApprovals(asOf = today()) {
  if (syncing) return;
  syncing = true;
  try {
    const month = String(asOf).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    labelReceiptSuggestions();
    liftDirectAutoSaves();
    if (groceryFlagOn()) applyMonthlyGroceryDraft(asOf);
    queueGroceryLists(month);
    queueChecklist(month, asOf);
    queueBusinessRepeats(month);
  } finally {
    syncing = false;
  }
}

export function queuePendingApproval(input) {
  const record = normalizePending(input);
  if (!record) return null;
  const existing = get("pendingApprovals");
  if (existing.some((item) => item.sourceKey === record.sourceKey)) return null;
  return save("pendingApprovals", record);
}

export function renderApprovals() {
  if (!screenRoot) return;
  const list = screenRoot.querySelector("#approvals-list");
  const empty = screenRoot.querySelector("#approvals-empty");
  const approveAll = screenRoot.querySelector("#approve-all");
  const waiting = waitingItems();
  approveAll.hidden = waiting.length === 0;
  list.replaceChildren(...waiting.map((item) => (editingId === item.id ? buildEditForm(item) : buildRow(item))));
  empty.hidden = waiting.length > 0;
}

export function updateApprovalsBadge() {
  const count = waitingItems().length;
  document.querySelectorAll('[data-badge="approvals"]').forEach((badge) => {
    badge.hidden = count === 0;
    badge.textContent = count > 99 ? "99+" : String(count);
  });
}

function waitingItems() {
  return get("pendingApprovals")
    .filter((item) => isWaiting(item))
    .map(present)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.title.localeCompare(b.title));
}

function present(item) {
  const title = cleanText(item.title || item.note || item.merchant || item.category || "Suggested entry", 120);
  const note = cleanText(item.note || title, 120);
  const source = cleanText(item.source || (item.receiptId ? SOURCE_RECEIPT : "Auto"), 80);
  return {
    ...item,
    title,
    note,
    source,
    kind: item.kind === "income" ? "income" : "expense",
    space: item.space === "business" ? "business" : "home",
    amount: roundMoney(Number(item.amount)),
    category: item.category || "Other",
  };
}

function labelReceiptSuggestions() {
  get("pendingApprovals").forEach((item) => {
    if (!isWaiting(item) || item.source || item.sourceKey) return;
    if (!item.receiptId && !item.merchant) return;
    const month = String(item.date || "").slice(0, 7);
    update("pendingApprovals", item.id, {
      source: SOURCE_RECEIPT,
      sourceKey: `receipt:${item.merchant || item.receiptId}:${month}:${item.amount}`,
      title: item.note || item.merchant || "Receipt",
    });
  });
}

function isWaiting(item) {
  const status = String(item?.status || "waiting").toLowerCase();
  return status === "waiting" || status === "pending" || status === "open";
}

function knownKeys() {
  return new Set(get("pendingApprovals").map((item) => item.sourceKey).filter(Boolean));
}

function groceryFlagOn() {
  const records = [];
  const template = readJson(TEMPLATE_KEY);
  if (template && typeof template === "object") records.push(template);
  get("groceryTemplate").forEach((item) => {
    if (item && typeof item === "object") records.push(item);
  });
  let explicit = null;
  records.forEach((record) => {
    if (flagOff(record)) explicit = false;
    if (flagOn(record)) explicit = true;
  });
  if (explicit != null) return explicit;
  return records.some((record) => Array.isArray(record.lines) && record.lines.length > 0);
}

function flagOn(record) {
  return record.monthly === true || record.autoMonthly === true || record.prepareMonthly === true || record.monthlyFlag === true || record.flag === true;
}

function flagOff(record) {
  return record.monthly === false || record.autoMonthly === false || record.prepareMonthly === false || record.monthlyFlag === false || record.flag === false;
}

function queueGroceryLists(month) {
  loadLists().forEach((list) => {
    if (!list.fromTemplate || !list.needsApproval) return;
    if (list.month > month) return;
    const amount = roundMoney(
      list.lines.reduce((sum, line) => sum + (line.price > 0 ? line.qty * line.price : 0), 0)
    );
    const names = list.lines.map((line) => line.name).join(", ");
    queuePendingApproval({
      sourceKey: `grocery:${list.month}`,
      source: SOURCE_GROCERY,
      kind: "expense",
      space: "home",
      title: "Monthly grocery list",
      note: (names || "Monthly grocery list").slice(0, 120),
      category: "Groceries",
      amount,
      date: dateInMonth(list.month, 1),
      month: list.month,
      groceryListId: list.id,
    });
  });
}

function queueChecklist(month, asOf) {
  const checklist = state.checklist;
  if (!checklist || !Array.isArray(checklist.items)) return;
  const hasAmount = checklist.items.some((item) => roundMoney(Number(item.expectedAmount)) > 0);
  if (hasAmount && ensureMonth(checklist, month)) saveChecklist();
  const rows = Array.isArray(checklist.months?.[month]) ? checklist.months[month] : [];
  rows.forEach((row) => {
    if (!row) return;
    if (row.paid) {
      const key = `checklist:${row.templateId || row.id}:${month}`;
      const pending = get("pendingApprovals").find((item) => item.sourceKey === key && isWaiting(item));
      if (pending) update("pendingApprovals", pending.id, { status: "approved" });
      return;
    }
    const amount = roundMoney(Number(row.expectedAmount));
    if (!(amount > 0)) return;
    const due = dueDateFor(row, month);
    if (due > asOf && month > asOf.slice(0, 7)) return;
    queuePendingApproval({
      sourceKey: `checklist:${row.templateId || row.id}:${month}`,
      source: SOURCE_CHECKLIST,
      kind: "expense",
      space: "home",
      title: row.name,
      note: row.name,
      category: row.category || "Bills",
      amount,
      date: due,
      month,
      checklistItemId: row.id,
    });
  });
}

function queueBusinessRepeats(currentMonth) {
  const templates = state.spaces.business.filter((expense) => expense.repeatsMonthly === true);
  templates.forEach((template) => {
    const seriesId = template.seriesId || template.id;
    let month = nextMonth(template.date.slice(0, 7));
    while (month && month <= currentMonth) {
      const day = Number(template.date.slice(8, 10));
      const date = dateInMonth(month, day);
      const saved = state.spaces.business.some(
        (expense) => expense.seriesId === seriesId && expense.date.slice(0, 7) === month && expense.id !== template.id
      );
      if (!saved) {
        queuePendingApproval({
          sourceKey: `business:${seriesId}:${month}`,
          source: SOURCE_BUSINESS,
          kind: "expense",
          space: "business",
          title: template.note,
          note: template.note,
          category: template.category,
          amount: template.amount,
          date,
          month,
          seriesId,
        });
      }
      month = nextMonth(month);
    }
  });
}

function liftDirectAutoSaves() {
  let changed = false;
  ["home", "business"].forEach((space) => {
    const keep = [];
    state.spaces[space].forEach((expense) => {
      if (!isDirectAuto(expense)) {
        keep.push(expense);
        return;
      }
      changed = true;
      queuePendingApproval({
        sourceKey: expense.sourceKey || `expense:${expense.id}`,
        source: autoSource(expense),
        kind: "expense",
        space,
        title: expense.note,
        note: expense.note,
        category: expense.category,
        amount: expense.amount,
        date: expense.date,
        month: expense.date.slice(0, 7),
        merchant: expense.merchant || "",
        seriesId: expense.seriesId || "",
      });
    });
    state.spaces[space] = keep;
  });
  if (changed) saveSpaces();
}

function isDirectAuto(expense) {
  return expense.auto === true || expense.needsApproval === true || expense.suggested === true;
}

function autoSource(expense) {
  if (typeof expense.source === "string" && expense.source.startsWith("Auto:")) return expense.source;
  if (expense.receiptId || expense.receipt) return SOURCE_RECEIPT;
  if (expense.category === "Groceries") return SOURCE_GROCERY;
  if (expense.space === "business" || expense.repeatsMonthly) return SOURCE_BUSINESS;
  return SOURCE_CHECKLIST;
}

function normalizePending(input) {
  if (!input || typeof input !== "object") return null;
  const kind = input.kind === "income" ? "income" : "expense";
  const space = input.space === "business" ? "business" : "home";
  const amount = roundMoney(Number(input.amount));
  const date = typeof input.date === "string" ? input.date : "";
  const title = cleanText(input.title || input.note || input.name, 120);
  const note = cleanText(input.note || title, 120);
  const source = cleanText(input.source, 80);
  const sourceKey = cleanText(input.sourceKey, 160);
  if (!title || !note || !source || !sourceKey || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!Number.isFinite(amount) || amount < 0) return null;
  const category = cleanText(input.category || (kind === "income" ? "Income" : "Other"), 40);
  const record = {
    id: typeof input.id === "string" && input.id ? input.id : crypto.randomUUID(),
    status: "waiting",
    sourceKey,
    source,
    kind,
    space,
    title,
    note,
    category,
    amount,
    date,
    month: /^\d{4}-\d{2}$/.test(input.month) ? input.month : date.slice(0, 7),
  };
  copyOptional(input, record, "seriesId");
  copyOptional(input, record, "checklistItemId");
  copyOptional(input, record, "groceryListId");
  copyOptional(input, record, "merchant");
  copyOptional(input, record, "receiptId");
  copyOptional(input, record, "customer");
  if (knownKeys().has(sourceKey) && !input.id) return null;
  return record;
}

function copyOptional(source, target, key) {
  if (typeof source[key] === "string" && source[key]) target[key] = source[key].slice(0, 160);
}

function cleanText(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function buildScreen() {
  const wrap = document.createElement("div");
  const intro = document.createElement("header");
  intro.className = "intro";
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Pending Approvals";
  const heading = document.createElement("h1");
  heading.textContent = "Nothing is saved until you approve it";
  intro.append(eyebrow, heading);

  const sheet = document.createElement("div");
  sheet.className = "sheet";
  const title = document.createElement("h2");
  title.id = "approvals-heading";
  title.textContent = "Pending Approvals";
  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = "The app can prepare these. Totals stay the same until you approve.";
  const approveAll = document.createElement("button");
  approveAll.type = "button";
  approveAll.className = "primary";
  approveAll.id = "approve-all";
  approveAll.hidden = true;
  approveAll.textContent = "Approve all";
  const error = document.createElement("p");
  error.className = "form-error";
  error.id = "approvals-error";
  error.setAttribute("role", "alert");
  error.hidden = true;
  const list = document.createElement("ul");
  list.className = "expense-list";
  list.id = "approvals-list";
  const empty = document.createElement("p");
  empty.className = "empty";
  empty.id = "approvals-empty";
  empty.textContent = "Nothing is waiting for approval.";
  sheet.append(title, meta, approveAll, error, list, empty);
  wrap.append(intro, sheet);
  return wrap;
}

function buildRow(item) {
  const row = document.createElement("li");
  row.className = item.space === "business" ? "expense is-business" : "expense";
  const main = document.createElement("div");
  main.className = "expense-main";
  const top = document.createElement("div");
  top.className = "expense-top";
  const title = document.createElement("span");
  title.className = "category";
  const auto = document.createElement("span");
  auto.className = "auto-label";
  auto.textContent = "Auto";
  const name = document.createElement("span");
  name.textContent = itemLabel(item);
  title.append(auto, name);
  const amount = document.createElement("span");
  amount.className = "amount";
  amount.textContent = formatMoney(item.amount);
  const info = document.createElement("p");
  info.className = "meta";
  const kind = item.kind === "income" ? "Income" : "Expense";
  const where = item.space === "business" ? "Business" : "Home";
  info.textContent = `${formatDate(item.date)} · ${where} ${kind.toLowerCase()} · ${itemSource(item)}`;
  top.append(title, amount);
  main.append(top, info);

  const actions = document.createElement("div");
  actions.className = "expense-actions";
  actions.append(
    actionButton("Approve", "edit", "approve", item.id, `Approve ${item.title}`),
    actionButton("Edit", "edit", "edit-approval", item.id, `Edit ${item.title}`),
    actionButton("Reject", "delete", "reject", item.id, `Reject ${item.title}`)
  );
  row.append(main, actions);
  return row;
}

function itemLabel(item) {
  return item.title || item.note || item.merchant || "Suggested entry";
}

function itemSource(item) {
  if (item.source) return item.source;
  if (item.receiptId) return SOURCE_RECEIPT;
  return "Auto";
}

function actionButton(text, className, action, id, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.dataset[action === "edit-approval" ? "editApproval" : action] = id;
  button.textContent = text;
  button.setAttribute("aria-label", label);
  return button;
}

function buildEditForm(item) {
  const row = document.createElement("li");
  row.className = "expense expense-editing";
  const form = document.createElement("form");
  form.className = "edit-form";
  form.noValidate = true;
  form.dataset.approvalId = item.id;
  const title = document.createElement("p");
  title.className = "edit-title";
  title.textContent = "Edit, then approve";
  const amount = textInput(`approval-amount-${item.id}`, "amount", "number", item.amount ? item.amount.toFixed(2) : "");
  amount.inputMode = "decimal";
  amount.min = "0.01";
  amount.step = "0.01";
  amount.required = true;
  const date = textInput(`approval-date-${item.id}`, "date", "date", item.date);
  date.required = true;
  const note = textInput(`approval-note-${item.id}`, "note", "text", item.note);
  note.maxLength = 120;
  note.required = true;
  const error = document.createElement("p");
  error.className = "form-error";
  error.hidden = true;
  const actions = document.createElement("div");
  actions.className = "edit-actions";
  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.className = "primary";
  saveButton.textContent = "Approve";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "edit-cancel";
  cancel.dataset.cancelApproval = item.id;
  cancel.textContent = "Cancel";
  actions.append(saveButton, cancel);
  const fields = [
    title,
    labeledField("Amount", amount),
    labeledField("Date", date),
    labeledField(item.kind === "income" ? "What it is" : "Note", note),
  ];
  if (item.kind !== "income") {
    const category = document.createElement("select");
    category.id = `approval-category-${item.id}`;
    category.name = "category";
    category.required = true;
    const names = SPACES[item.space] ? SPACES[item.space].categories : [];
    names.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      option.selected = name === item.category;
      category.append(option);
    });
    fields.push(labeledField("Category", category));
  }
  form.append(...fields, error, actions);
  row.append(form);
  return row;
}

function textInput(id, name, type, value) {
  const input = document.createElement("input");
  input.id = id;
  input.name = name;
  input.type = type;
  input.value = value;
  return input;
}

function labeledField(labelText, control) {
  const field = document.createElement("div");
  field.className = "field";
  const label = document.createElement("label");
  label.htmlFor = control.id;
  label.textContent = labelText;
  field.append(label, control);
  return field;
}

function onClick(event) {
  const approveAll = event.target.closest("#approve-all");
  if (approveAll) {
    approveAllItems();
    return;
  }
  const cancel = event.target.closest("[data-cancel-approval]");
  if (cancel) {
    editingId = null;
    clearError();
    renderApprovals();
    return;
  }
  const edit = event.target.closest("[data-edit-approval]");
  if (edit) {
    editingId = edit.dataset.editApproval;
    clearError();
    renderApprovals();
    const field = screenRoot.querySelector(".edit-form [name=amount]");
    if (field) field.focus();
    return;
  }
  const approve = event.target.closest("[data-approve]");
  if (approve) {
    const item = findWaiting(approve.dataset.approve);
    if (!item) return;
    const result = commitApproval(item);
    showResult(result);
    return;
  }
  const reject = event.target.closest("[data-reject]");
  if (reject) {
    rejectItem(reject.dataset.reject);
  }
}

function onSubmit(event) {
  const form = event.target.closest(".edit-form");
  if (!form) return;
  event.preventDefault();
  const item = findWaiting(form.dataset.approvalId);
  if (!item) return;
  const parsed = parseMoney(form.elements.amount.value);
  const date = form.elements.date.value;
  const note = form.elements.note.value.trim();
  const categoryField = form.elements.category;
  const category = categoryField ? categoryField.value : item.category;
  const allowed = SPACES[item.space] ? SPACES[item.space].categories : [];
  const invalid = [];
  if (!parsed.ok) invalid.push(form.elements.amount);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) invalid.push(form.elements.date);
  if (!note) invalid.push(form.elements.note);
  if (item.kind !== "income" && (!category || !allowed.includes(category))) invalid.push(categoryField);
  const error = form.querySelector(".form-error");
  if (invalid.length) {
    invalid.forEach((field) => field && field.classList.add("invalid"));
    error.textContent = "Fill in every field. Use an amount greater than 0 with at most 2 decimal places.";
    error.hidden = false;
    invalid[0].focus();
    return;
  }
  const result = commitApproval({ ...item, amount: parsed.value, date, note, category, title: note });
  showResult(result);
}

function approveAllItems() {
  const waiting = waitingItems();
  if (!waiting.length) return;
  const noun = waiting.length === 1 ? "item" : "items";
  const confirmed = window.confirm(
    `Approve all ${waiting.length} ${noun}? They will be saved and counted in your totals.`
  );
  if (!confirmed) return;
  const failed = [];
  waiting.forEach((item) => {
    const result = commitApproval(item, { quiet: true });
    if (!result.ok) failed.push(item.title);
  });
  editingId = null;
  if (failed.length) {
    showError(`${failed.length} still need a valid amount before they can be saved.`);
  } else {
    clearError();
  }
  renderApprovals();
  render();
}

function showResult(result) {
  if (!result.ok) {
    showError(result.error);
    return;
  }
  editingId = null;
  clearError();
  renderApprovals();
  render();
}

function commitApproval(item, options = {}) {
  if (!(item.amount > 0)) {
    return { ok: false, error: "Enter an amount greater than 0 before approving." };
  }
  if (item.kind === "income") {
    const sale = {
      amount: item.amount,
      date: item.date,
      note: item.note,
      customer: item.customer || "",
      kind: "earned",
      earnedAmount: item.amount,
      cashReceived: item.amount,
    };
    if (isDuplicateSale(state.sales, sale)) {
      return { ok: false, error: "This matches income you already saved." };
    }
    state.sales.unshift({ id: crypto.randomUUID(), ...sale });
    saveSales();
  } else {
    const expense = {
      id: crypto.randomUUID(),
      amount: item.amount,
      category: item.category,
      date: item.date,
      note: item.note,
    };
    if (item.merchant) expense.merchant = item.merchant;
    if (item.receiptId) expense.receiptId = item.receiptId;
    if (item.seriesId) expense.seriesId = item.seriesId;
    if (isDuplicateExpense(state.spaces[item.space], expense)) {
      return { ok: false, error: "This matches an expense you already saved." };
    }
    addExpense(item.space, expense);
    if (item.checklistItemId) {
      const paid = payChecklistItem(state.checklist, item.month, item.checklistItemId, item.amount, expense.id);
      if (paid.ok) saveChecklist();
    }
    settleGroceryList(item);
  }
  update("pendingApprovals", item.id, { status: "approved", amount: item.amount, date: item.date, note: item.note, title: item.title, category: item.category });
  if (!options.quiet) {
    editingId = null;
  }
  return { ok: true };
}

function rejectItem(id) {
  const item = findWaiting(id);
  if (!item) return;
  update("pendingApprovals", item.id, { status: "rejected" });
  if (editingId === id) editingId = null;
  clearError();
  renderApprovals();
  render();
}

function settleGroceryList(item) {
  if (!item.groceryListId && item.source !== SOURCE_GROCERY) return;
  const lists = loadLists();
  let changed = false;
  lists.forEach((list) => {
    if (list.id === item.groceryListId || (item.source === SOURCE_GROCERY && list.month === item.month && list.fromTemplate)) {
      list.needsApproval = false;
      changed = true;
    }
  });
  if (changed) saveLists(lists);
}

function findWaiting(id) {
  return waitingItems().find((item) => item.id === id) || null;
}

function showError(message) {
  const error = screenRoot.querySelector("#approvals-error");
  error.textContent = message;
  error.hidden = false;
}

function clearError() {
  const error = screenRoot.querySelector("#approvals-error");
  if (!error) return;
  error.hidden = true;
  error.textContent = "";
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
