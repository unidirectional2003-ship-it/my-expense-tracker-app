import { parseMoney, formatMoney } from "./money.js";
import { today, formatDate } from "./dates.js";
import { SPACES } from "./spaces.js";
import { session } from "./session.js";
import { state, saveChecklist, saveSpaces } from "./store.js";
import { render } from "./render.js";
import { registerScreen } from "./router.js";
import { openSpend } from "./spend.js";
import {
  ensureMonth,
  ensureMonthsThrough,
  addTemplate,
  updateTemplate,
  deleteTemplate,
  moveTemplate,
  payChecklistItem,
  unpayChecklistItem,
  dueDateFor,
  itemUrgency,
  listOverdueChecklistItems,
  checklistProgress,
  opensGroceries,
  clampDay,
} from "./checklist-model.js";

const panel = document.getElementById("checklist-panel");
const listView = document.getElementById("checklist-list-view");
const detailView = document.getElementById("checklist-detail-view");
const groceriesView = document.getElementById("checklist-groceries-view");
const monthInput = document.getElementById("checklist-month");
const progressLabel = document.getElementById("checklist-progress-label");
const progressTrack = document.getElementById("checklist-progress-track");
const progressFill = document.getElementById("checklist-progress-fill");
const listEl = document.getElementById("checklist-list");
const emptyEl = document.getElementById("checklist-empty");
const historyNote = document.getElementById("checklist-history-note");
const manageForm = document.getElementById("checklist-manage");
const manageName = document.getElementById("checklist-name");
const manageDay = document.getElementById("checklist-day");
const manageAmount = document.getElementById("checklist-expected");
const manageCategory = document.getElementById("checklist-category");
const manageError = document.getElementById("checklist-manage-error");
const payForm = document.getElementById("checklist-pay-form");
const payTitle = document.getElementById("checklist-pay-title");
const payAmount = document.getElementById("checklist-pay-amount");
const payError = document.getElementById("checklist-pay-error");
const payCancel = document.getElementById("checklist-pay-cancel");

let editingTemplateId = null;
let pendingPayId = null;

export function getOverdueChecklistItems(todayValue = today()) {
  const month = todayValue.slice(0, 7);
  if (ensureMonthsThrough(state.checklist, month)) saveChecklist();
  return listOverdueChecklistItems(state.checklist, todayValue);
}

globalThis.getOverdueChecklistItems = getOverdueChecklistItems;

export function bindChecklist() {
  monthInput.addEventListener("input", () => {
    editingTemplateId = null;
    pendingPayId = null;
    session.checklistView = "list";
    session.checklistItemId = null;
    const month = selectedMonth();
    if (ensureMonth(state.checklist, month)) saveChecklist();
    render();
  });

  manageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    clearManageInvalid();
    const name = manageName.value.trim();
    const day = Number(manageDay.value);
    const parsed = parseMoney(manageAmount.value, { allowZero: true });
    const invalid = [];
    if (!name) invalid.push(manageName);
    if (!Number.isInteger(day) || day < 1 || day > 31) invalid.push(manageDay);
    if (!parsed.ok) invalid.push(manageAmount);
    if (invalid.length) {
      invalid.forEach((field) => field.classList.add("invalid"));
      manageError.textContent = "Enter a name, a due day from 1 to 31, and an expected amount of 0 or more.";
      manageError.hidden = false;
      invalid[0].focus();
      return;
    }
    if (!isCurrentMonth()) return;
    addTemplate(
      state.checklist,
      { name, dueDay: day, expectedAmount: parsed.value, category: manageCategory.value },
      selectedMonth()
    );
    saveChecklist();
    manageForm.reset();
    manageDay.value = "1";
    manageAmount.value = "0";
    fillManageCategories();
    render();
    manageName.focus();
  });

  payForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const parsed = parseMoney(payAmount.value);
    if (!parsed.ok) {
      payAmount.classList.add("invalid");
      payError.textContent = "Enter an amount greater than 0, with at most 2 decimal places.";
      payError.hidden = false;
      payAmount.focus();
      return;
    }
    const item = currentRows().find((row) => row.id === pendingPayId);
    if (!item) {
      pendingPayId = null;
      render();
      return;
    }
    commitPayment(item, parsed.value);
  });

  payCancel.addEventListener("click", () => {
    pendingPayId = null;
    payError.hidden = true;
    render();
  });

  listEl.addEventListener("click", (event) => {
    const payBox = event.target.closest("[data-pay]");
    if (payBox) return;

    const moveButton = event.target.closest("[data-move]");
    if (moveButton) {
      const direction = moveButton.dataset.move === "up" ? -1 : 1;
      if (moveTemplate(state.checklist, moveButton.dataset.template, direction, currentMonthKey())) {
        saveChecklist();
        render();
      }
      return;
    }

    if (event.target.closest("[data-cancel-edit]")) {
      editingTemplateId = null;
      render();
      return;
    }

    const editButton = event.target.closest("[data-edit-template]");
    if (editButton) {
      editingTemplateId = editButton.dataset.editTemplate;
      pendingPayId = null;
      render();
      const field = listEl.querySelector(".edit-form [name=name]");
      if (field) field.focus();
      return;
    }

    const deleteButton = event.target.closest("[data-delete-template]");
    if (deleteButton) {
      const result = deleteTemplate(state.checklist, deleteButton.dataset.deleteTemplate, currentMonthKey());
      if (!result.ok && result.reason === "paid") {
        manageError.textContent = "Uncheck Paid before deleting this item.";
        manageError.hidden = false;
        return;
      }
      if (result.ok) {
        if (editingTemplateId === deleteButton.dataset.deleteTemplate) editingTemplateId = null;
        saveChecklist();
        render();
      }
      return;
    }

    const openButton = event.target.closest("[data-open-item]");
    if (!openButton) return;
    const item = currentRows().find((row) => row.id === openButton.dataset.openItem);
    if (!item) return;
    if (opensGroceries(item)) {
      openGroceryScreen();
      return;
    } else {
      session.checklistView = "detail";
      session.checklistItemId = item.id;
    }
    editingTemplateId = null;
    pendingPayId = null;
    render();
  });

  listEl.addEventListener("change", (event) => {
    const box = event.target.closest("[data-pay]");
    if (!box) return;
    const item = currentRows().find((row) => row.id === box.dataset.pay);
    if (!item) return;
    if (box.checked && !item.paid) {
      pendingPayId = item.id;
      session.checklistView = "list";
      render();
      payAmount.focus();
      return;
    }
    if (!box.checked && item.paid) {
      undoPayment(item);
    }
  });

  listEl.addEventListener("submit", (event) => {
    const form = event.target.closest(".edit-form");
    if (!form) return;
    event.preventDefault();
    saveTemplateEdit(form);
  });

  detailView.addEventListener("click", (event) => {
    if (event.target.closest("[data-checklist-back]")) {
      session.checklistView = "list";
      session.checklistItemId = null;
      pendingPayId = null;
      render();
    }
  });

  detailView.addEventListener("submit", (event) => {
    const form = event.target.closest("#checklist-detail-form");
    if (!form) return;
    event.preventDefault();
    saveDetail(form);
  });

  detailView.addEventListener("change", (event) => {
    const box = event.target.closest("[data-detail-pay]");
    if (!box) return;
    const item = currentRows().find((row) => row.id === box.dataset.detailPay);
    if (!item) return;
    if (box.checked && !item.paid) {
      pendingPayId = item.id;
      render();
      const field = detailView.querySelector("[name=paidAmount]");
      if (field) field.focus();
      return;
    }
    if (!box.checked && item.paid) undoPayment(item);
  });

  groceriesView.addEventListener("click", (event) => {
    if (!event.target.closest("[data-checklist-back]")) return;
    session.checklistView = "list";
    render();
  });
}

export function prepareChecklist() {
  const month = today().slice(0, 7);
  monthInput.value = month;
  fillManageCategories();
  manageDay.value = "1";
  manageAmount.value = "0";
  if (ensureMonthsThrough(state.checklist, month)) saveChecklist();
}

export function renderChecklist() {
  const showList = session.checklistView !== "detail" && session.checklistView !== "groceries";
  listView.hidden = !showList;
  detailView.hidden = session.checklistView !== "detail";
  groceriesView.hidden = session.checklistView !== "groceries";
  if (session.checklistView === "detail") {
    renderDetail();
    return;
  }
  if (session.checklistView === "groceries") {
    renderGroceries();
    return;
  }
  renderList();
}

function renderList() {
  const month = selectedMonth();
  if (ensureMonth(state.checklist, month)) saveChecklist();
  const current = isCurrentMonth();
  const rows = currentRows();
  const progress = checklistProgress(rows);
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  progressLabel.textContent = progress.label;
  progressTrack.setAttribute("aria-valuemax", String(progress.total));
  progressTrack.setAttribute("aria-valuenow", String(progress.done));
  progressTrack.setAttribute("aria-valuetext", progress.label);
  progressFill.style.width = `${percent}%`;
  historyNote.hidden = current;
  manageForm.hidden = !current;
  emptyEl.hidden = rows.length > 0;
  payForm.hidden = !pendingPayId;

  const pending = rows.find((row) => row.id === pendingPayId);
  if (pending) {
    payTitle.textContent = `How much did you pay for ${pending.name}?`;
    if (document.activeElement !== payAmount) {
      payAmount.value = pending.expectedAmount > 0 ? pending.expectedAmount.toFixed(2) : "";
    }
  }

  listEl.replaceChildren(
    ...rows.map((item, index) => {
      if (current && item.templateId === editingTemplateId) return buildEditRow(item);
      return buildRow(item, month, current, index, rows.length);
    })
  );
}

function buildRow(item, month, current, index, total) {
  const urgency = itemUrgency(item, month, today());
  const row = document.createElement("li");
  row.className = `checklist-item is-${urgency}`;

  const checkLabel = document.createElement("label");
  checkLabel.className = "checklist-paid";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.dataset.pay = item.id;
  box.checked = item.paid;
  const checkText = document.createElement("span");
  checkText.textContent = "Paid";
  checkLabel.append(box, checkText);

  const open = document.createElement("button");
  open.type = "button";
  open.className = "checklist-open";
  open.dataset.openItem = item.id;
  const title = document.createElement("span");
  title.className = "category";
  title.textContent = item.name;
  const meta = document.createElement("span");
  meta.className = "meta";
  const due = formatDate(dueDateFor(item, month));
  const paidText = item.paid ? formatMoney(item.paidAmount) : "Not paid";
  meta.textContent = `${due} · Expected ${formatMoney(item.expectedAmount)} · Paid ${paidText}`;
  open.append(title, meta);
  open.setAttribute("aria-label", `${item.name}, due ${due}`);

  const main = document.createElement("div");
  main.className = "checklist-main";
  main.append(checkLabel, open);

  row.append(main);
  if (current) row.append(buildRowActions(item, index, total));
  return row;
}

function buildRowActions(item, index, total) {
  const actions = document.createElement("div");
  actions.className = "expense-actions checklist-actions";
  actions.append(
    actionButton("Up", "edit", { move: "up", template: item.templateId }, index === 0),
    actionButton("Down", "edit", { move: "down", template: item.templateId }, index === total - 1),
    actionButton("Edit", "edit", { editTemplate: item.templateId }),
    actionButton("Delete", "delete", { deleteTemplate: item.templateId }, false, `Delete ${item.name}`)
  );
  return actions;
}

function actionButton(text, className, data, disabled = false, label = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  Object.entries(data).forEach(([key, value]) => {
    button.dataset[key] = value;
  });
  button.disabled = disabled;
  if (label) button.setAttribute("aria-label", label);
  return button;
}

function buildEditRow(item) {
  const template = state.checklist.items.find((entry) => entry.id === item.templateId) || item;
  const row = document.createElement("li");
  row.className = "checklist-item expense-editing";
  const form = document.createElement("form");
  form.className = "edit-form";
  form.noValidate = true;
  form.dataset.templateId = item.templateId;

  const title = document.createElement("p");
  title.className = "edit-title";
  title.textContent = "Edit checklist item";
  const name = textControl("name", "Name", template.name, "text");
  const day = textControl("dueDay", "Due day", String(template.dueDay), "number");
  day.control.min = "1";
  day.control.max = "31";
  day.control.step = "1";
  const amount = textControl("expected", "Expected amount", template.expectedAmount.toFixed(2), "number");
  amount.control.min = "0";
  amount.control.step = "0.01";
  amount.control.inputMode = "decimal";
  const category = document.createElement("select");
  category.name = "category";
  SPACES.home.categories.forEach((entry) => {
    const option = document.createElement("option");
    option.value = entry;
    option.textContent = entry;
    option.selected = entry === template.category;
    category.append(option);
  });

  const error = document.createElement("p");
  error.className = "form-error";
  error.hidden = true;
  const actions = document.createElement("div");
  actions.className = "edit-actions";
  const save = document.createElement("button");
  save.type = "submit";
  save.className = "primary";
  save.textContent = "Save";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "edit-cancel";
  cancel.dataset.cancelEdit = "";
  cancel.textContent = "Cancel";
  actions.append(save, cancel);
  form.append(title, name.field, day.field, amount.field, fieldWrap("Category", category), error, actions);
  row.append(form);
  return row;
}

function saveTemplateEdit(form) {
  const name = form.elements.name.value.trim();
  const day = Number(form.elements.dueDay.value);
  const parsed = parseMoney(form.elements.expected.value, { allowZero: true });
  const error = form.querySelector(".form-error");
  [form.elements.name, form.elements.dueDay, form.elements.expected].forEach((field) => field.classList.remove("invalid"));
  const invalid = [];
  if (!name) invalid.push(form.elements.name);
  if (!Number.isInteger(day) || day < 1 || day > 31) invalid.push(form.elements.dueDay);
  if (!parsed.ok) invalid.push(form.elements.expected);
  if (invalid.length) {
    invalid.forEach((field) => field.classList.add("invalid"));
    error.textContent = "Enter a name, a due day from 1 to 31, and an expected amount of 0 or more.";
    error.hidden = false;
    invalid[0].focus();
    return;
  }
  updateTemplate(
    state.checklist,
    form.dataset.templateId,
    { name, dueDay: day, expectedAmount: parsed.value, category: form.elements.category.value },
    currentMonthKey()
  );
  editingTemplateId = null;
  saveChecklist();
  render();
}

function renderDetail() {
  const month = selectedMonth();
  const item = currentRows().find((row) => row.id === session.checklistItemId);
  detailView.replaceChildren();
  if (!item) {
    session.checklistView = "list";
    session.checklistItemId = null;
    renderList();
    listView.hidden = false;
    detailView.hidden = true;
    return;
  }

  const urgency = itemUrgency(item, month, today());
  const wrap = document.createElement("article");
  wrap.className = `card checklist-detail is-${urgency}`;
  const back = document.createElement("button");
  back.type = "button";
  back.className = "edit-cancel";
  back.dataset.checklistBack = "";
  back.textContent = "Back to checklist";
  const heading = document.createElement("h2");
  heading.textContent = item.name;
  const status = document.createElement("p");
  status.className = "meta";
  status.textContent = urgencyLabel(urgency);

  const form = document.createElement("form");
  form.id = "checklist-detail-form";
  form.noValidate = true;
  const day = textControl("dueDay", "Due day", String(item.dueDay), "number");
  day.control.min = "1";
  day.control.max = "31";
  day.control.step = "1";
  day.control.disabled = !isCurrentMonth();
  const expected = textControl("expected", "Expected amount", item.expectedAmount.toFixed(2), "number");
  expected.control.min = "0";
  expected.control.step = "0.01";
  expected.control.inputMode = "decimal";
  expected.control.disabled = !isCurrentMonth();
  const due = document.createElement("p");
  due.className = "meta";
  due.textContent = `Due ${formatDate(dueDateFor(item, month))} · ${item.category}`;

  const paidLabel = document.createElement("label");
  paidLabel.className = "checklist-paid";
  const box = document.createElement("input");
  box.type = "checkbox";
  box.dataset.detailPay = item.id;
  box.checked = item.paid || pendingPayId === item.id;
  paidLabel.append(box, document.createTextNode("Paid"));

  const paid = textControl(
    "paidAmount",
    "Paid amount",
    item.paid ? item.paidAmount.toFixed(2) : item.expectedAmount > 0 ? item.expectedAmount.toFixed(2) : "",
    "number"
  );
  paid.control.min = "0.01";
  paid.control.step = "0.01";
  paid.control.inputMode = "decimal";
  paid.field.hidden = pendingPayId !== item.id;

  const error = document.createElement("p");
  error.className = "form-error";
  error.hidden = true;
  const save = document.createElement("button");
  save.type = "submit";
  save.className = "primary";
  save.textContent = pendingPayId === item.id ? "Save payment" : "Save";
  save.hidden = !isCurrentMonth() && pendingPayId !== item.id;

  form.append(day.field, expected.field, due, paidLabel, paid.field, error, save);
  wrap.append(back, heading, status, form);
  detailView.append(wrap);
}

function saveDetail(form) {
  const item = currentRows().find((row) => row.id === session.checklistItemId);
  if (!item) return;
  const error = form.querySelector(".form-error");
  error.hidden = true;
  if (pendingPayId === item.id) {
    const parsed = parseMoney(form.elements.paidAmount.value);
    if (!parsed.ok) {
      form.elements.paidAmount.classList.add("invalid");
      error.textContent = "Enter an amount greater than 0, with at most 2 decimal places.";
      error.hidden = false;
      form.elements.paidAmount.focus();
      return;
    }
    commitPayment(item, parsed.value);
    return;
  }
  if (!isCurrentMonth()) return;
  const day = Number(form.elements.dueDay.value);
  const parsed = parseMoney(form.elements.expected.value, { allowZero: true });
  if (!Number.isInteger(day) || day < 1 || day > 31 || !parsed.ok) {
    error.textContent = "Enter a due day from 1 to 31 and an expected amount of 0 or more.";
    error.hidden = false;
    return;
  }
  updateTemplate(
    state.checklist,
    item.templateId,
    {
      name: item.name,
      dueDay: clampDay(day),
      expectedAmount: parsed.value,
      category: item.category,
    },
    currentMonthKey()
  );
  saveChecklist();
  render();
}

function renderGroceries() {
  const month = selectedMonth();
  const expenses = state.spaces.home.filter(
    (expense) => expense.category === "Groceries" && expense.date.slice(0, 7) === month
  );
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  groceriesView.replaceChildren();

  const wrap = document.createElement("article");
  wrap.className = "card";
  const back = document.createElement("button");
  back.type = "button";
  back.className = "edit-cancel";
  back.dataset.checklistBack = "";
  back.textContent = "Back to checklist";
  const heading = document.createElement("h2");
  heading.textContent = "Groceries";
  const spent = document.createElement("p");
  spent.className = "summary-amount";
  spent.textContent = formatMoney(total);
  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = "Home grocery expenses for this month.";
  const list = document.createElement("ul");
  list.className = "expense-list";
  expenses.forEach((expense) => {
    const item = document.createElement("li");
    item.className = "expense";
    const top = document.createElement("div");
    top.className = "expense-top";
    const note = document.createElement("span");
    note.className = "category";
    note.textContent = expense.note;
    const amount = document.createElement("span");
    amount.className = "amount";
    amount.textContent = formatMoney(expense.amount);
    top.append(note, amount);
    const when = document.createElement("p");
    when.className = "meta";
    when.textContent = formatDate(expense.date);
    item.append(top, when);
    list.append(item);
  });
  const empty = document.createElement("p");
  empty.className = "empty";
  empty.textContent = "No grocery expenses this month.";
  empty.hidden = expenses.length > 0;
  wrap.append(back, heading, spent, meta, list, empty);
  groceriesView.append(wrap);
}

function commitPayment(item, amount) {
  const month = selectedMonth();
  const due = dueDateFor(item, month);
  const now = today();
  const expenseId = crypto.randomUUID();
  const result = payChecklistItem(state.checklist, month, item.id, amount, expenseId);
  if (!result.ok) return;
  state.spaces.home.unshift({
    id: expenseId,
    amount: result.expense.amount,
    category: result.expense.category,
    date: due > now ? now : due,
    note: result.expense.note,
  });
  pendingPayId = null;
  saveSpaces();
  saveChecklist();
  render();
}

function undoPayment(item) {
  const result = unpayChecklistItem(state.checklist, selectedMonth(), item.id);
  if (!result.ok) return;
  if (result.expenseId) {
    state.spaces.home = state.spaces.home.filter((expense) => expense.id !== result.expenseId);
    saveSpaces();
  }
  pendingPayId = null;
  saveChecklist();
  render();
}

function fillManageCategories() {
  manageCategory.replaceChildren(
    ...SPACES.home.categories.map((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      option.selected = name === "Other";
      return option;
    })
  );
}

function openGroceryScreen() {
  session.space = "home";
  session.homeView = "expenses";
  session.checklistView = "list";
  session.checklistItemId = null;
  const appEl = document.querySelector(".app");
  if (appEl) appEl.dataset.space = "home";
  openSpend("groceries");
}

function selectedMonth() {
  return /^\d{4}-\d{2}$/.test(monthInput.value) ? monthInput.value : today().slice(0, 7);
}

function currentMonthKey() {
  return today().slice(0, 7);
}

function isCurrentMonth() {
  return selectedMonth() === currentMonthKey();
}

function currentRows() {
  return state.checklist.months[selectedMonth()] || [];
}

function urgencyLabel(urgency) {
  if (urgency === "paid") return "Paid";
  if (urgency === "overdue") return "Overdue";
  if (urgency === "soon") return "Due within 3 days";
  return "Upcoming";
}

function textControl(name, labelText, value, type) {
  const control = document.createElement("input");
  control.name = name;
  control.id = `checklist-${name}-${Math.random().toString(16).slice(2)}`;
  control.type = type;
  control.value = value;
  control.required = true;
  return { control, field: fieldWrap(labelText, control) };
}

function fieldWrap(labelText, control) {
  const field = document.createElement("div");
  field.className = "field";
  const label = document.createElement("label");
  label.htmlFor = control.id;
  label.textContent = labelText;
  field.append(label, control);
  return field;
}

function clearManageInvalid() {
  [manageName, manageDay, manageAmount].forEach((field) => field.classList.remove("invalid"));
  manageError.hidden = true;
}

export function registerChecklistScreen() {
  registerScreen("checklist", {
    show(params = {}) {
      if (params.month && monthInput) monthInput.value = params.month;
      session.space = "checklist";
      session.editingId = null;
      session.editingSaleId = null;
      session.checklistView = params.id ? "detail" : "list";
      session.checklistItemId = params.id || null;
      const root = document.querySelector(".app");
      if (root) root.dataset.space = "checklist";
      render();
    },
  });
}
