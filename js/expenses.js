import { parseMoney, formatMoney } from "./money.js";
import { today, formatDate, nextMonth, dateInMonth } from "./dates.js";
import { SPACES } from "./spaces.js";
import { session } from "./session.js";
import { state, saveSpaces, deleteReceipt, receiptPhotos } from "./store.js";
import { isDuplicateExpense } from "./calc.js";
import { render } from "./render.js";
import { buildReceiptThumb } from "./receipt-thumb.js";

const form = document.getElementById("expense-form");
const amountInput = document.getElementById("amount");
const categoryInput = document.getElementById("category");
const dateInput = document.getElementById("date");
const noteInput = document.getElementById("note");
const repeatsInput = document.getElementById("repeats-monthly");
const errorEl = document.getElementById("form-error");
const searchInput = document.getElementById("search");
const categoryFilterInput = document.getElementById("category-filter");
const listEl = document.getElementById("expense-list");
const totalEl = document.getElementById("total");
const totalLabel = document.getElementById("total-label");
const emptyState = document.getElementById("empty-state");

const amountHint = "Use an amount greater than 0 with at most 2 decimal places.";

export function bindExpenses() {
  searchInput.addEventListener("input", render);
  categoryFilterInput.addEventListener("change", render);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearInvalid();
    if (!SPACES[session.space]) return;

    const parsed = parseMoney(amountInput.value);
    const category = categoryInput.value.trim();
    const date = dateInput.value;
    const note = noteInput.value.trim();
    const allowed = SPACES[session.space].categories;
    const invalid = [];
    if (!parsed.ok) invalid.push(amountInput);
    if (!category || !allowed.includes(category)) invalid.push(categoryInput);
    if (!date) invalid.push(dateInput);
    if (!note) invalid.push(noteInput);

    if (invalid.length) {
      invalid.forEach((field) => field.classList.add("invalid"));
      errorEl.textContent = `Fill in every field. ${amountHint}`;
      errorEl.hidden = false;
      invalid[0].focus();
      return;
    }

    const repeatsMonthly = session.space === "home" && repeatsInput.checked;
    const expense = {
      id: crypto.randomUUID(),
      amount: parsed.value,
      category,
      date,
      note,
    };
    if (isDuplicateExpense(state.spaces[session.space], expense)) {
      errorEl.textContent = "This matches an expense you already saved.";
      errorEl.hidden = false;
      amountInput.focus();
      return;
    }
    if (repeatsMonthly) {
      expense.repeatsMonthly = true;
      expense.seriesId = expense.id;
      expense.lastAppliedMonth = date.slice(0, 7);
    }
    addExpense(session.space, expense);
    form.reset();
    dateInput.value = today();
    fillCategories();
    errorEl.hidden = true;
    amountInput.focus();
  });

  listEl.addEventListener("click", (event) => {
    if (event.target.closest("[data-cancel-edit]")) {
      session.editingId = null;
      render();
      return;
    }
    const editButton = event.target.closest("[data-edit]");
    if (editButton) {
      session.editingId = editButton.dataset.edit;
      clearInvalid();
      render();
      const field = listEl.querySelector(".edit-form [name=amount]");
      if (field) field.focus();
      return;
    }
    const button = event.target.closest("[data-id]");
    if (!button || !SPACES[session.space]) return;
    if (session.editingId === button.dataset.id) session.editingId = null;
    const removed = state.spaces[session.space].find((expense) => expense.id === button.dataset.id);
    if (removed) deleteReceipt(removed.receiptId);
    state.spaces[session.space] = state.spaces[session.space].filter(
      (expense) => expense.id !== button.dataset.id
    );
    saveSpaces();
    render();
  });

  listEl.addEventListener("submit", (event) => {
    const editForm = event.target.closest(".edit-form");
    if (!editForm) return;
    event.preventDefault();
    saveExpenseEdit(editForm);
  });
}

export function addExpense(spaceName, expense) {
  state.spaces[spaceName].unshift(expense);
  if (expense.repeatsMonthly) applyMonthlyRepeats();
  saveSpaces();
  render();
}

export function prepareExpenseForm() {
  dateInput.value = today();
  fillCategories();
  fillFilterCategories();
}

export function fillCategories() {
  if (!SPACES[session.space]) return;
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a category";
  const options = SPACES[session.space].categories.map((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    return option;
  });
  categoryInput.replaceChildren(placeholder, ...options);
}

export function fillFilterCategories() {
  if (!SPACES[session.space]) return;
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "All categories";
  const options = SPACES[session.space].categories.map((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    return option;
  });
  categoryFilterInput.replaceChildren(placeholder, ...options);
}

export function renderExpenses() {
  if (!SPACES[session.space]) return;
  const expenses = state.spaces[session.space];
  const photos = receiptPhotos();
  const space = SPACES[session.space];
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const visible = filterExpenses(expenses);

  totalLabel.textContent = space.totalLabel;
  totalEl.textContent = formatMoney(total);
  emptyState.textContent =
    expenses.length > 0 && visible.length === 0 ? "No expenses match your search." : space.empty;

  listEl.replaceChildren(
    ...visible.map((expense) => {
      const item = document.createElement("li");
      item.className = "expense";
      if (expense.id === session.editingId) {
        item.classList.add("expense-editing");
        item.append(buildEditForm(expense));
        return item;
      }

      const main = document.createElement("div");
      main.className = "expense-main";
      const top = document.createElement("div");
      top.className = "expense-top";
      const category = document.createElement("span");
      category.className = "category";
      category.textContent = expense.category;
      const amount = document.createElement("span");
      amount.className = "amount";
      amount.textContent = formatMoney(expense.amount);
      const meta = document.createElement("p");
      meta.className = "meta";
      meta.textContent = expenseMeta(expense);
      top.append(category, amount);
      main.append(top, meta);
      if (session.space === "home" && expense.repeatsMonthly) {
        const repeatNote = document.createElement("p");
        repeatNote.className = "meta";
        repeatNote.textContent = "Repeats every month";
        main.append(repeatNote);
      }

      const actions = document.createElement("div");
      actions.className = "expense-actions";
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "edit";
      editButton.dataset.edit = expense.id;
      editButton.textContent = "Edit";
      editButton.setAttribute(
        "aria-label",
        `Edit ${expense.category} expense of ${formatMoney(expense.amount)}`
      );
      const button = document.createElement("button");
      button.type = "button";
      button.className = "delete";
      button.dataset.id = expense.id;
      button.textContent = "Delete";
      button.setAttribute(
        "aria-label",
        `Delete ${expense.category} expense of ${formatMoney(expense.amount)}`
      );
      actions.append(editButton, button);
      const photo =
        (expense.receiptId && photos[expense.receiptId]) ||
        (typeof expense.receipt === "string" ? expense.receipt : "");
      const thumb = buildReceiptThumb({ ...expense, receipt: photo }, session.space);
      if (thumb) {
        item.classList.add("has-receipt");
        item.append(thumb);
      }
      item.append(main, actions);
      return item;
    })
  );
}

export function applyMonthlyRepeats(now = today()) {
  const templates = state.spaces.home.filter((expense) => expense.repeatsMonthly === true);
  const currentMonth = now.slice(0, 7);
  let changed = false;

  templates.forEach((template) => {
    if (!template.seriesId) {
      template.seriesId = template.id;
      changed = true;
    }
    if (!template.lastAppliedMonth) {
      template.lastAppliedMonth = template.date.slice(0, 7);
      changed = true;
    }

    const day = Number(template.date.slice(8, 10));
    let month = nextMonth(template.lastAppliedMonth);
    const additions = [];

    while (month && month <= currentMonth) {
      const date = dateInMonth(month, day);
      if (date > now) break;
      const candidate = {
        amount: template.amount,
        category: template.category,
        date,
        note: template.note,
        seriesId: template.seriesId,
      };
      const already = [...state.spaces.home, ...additions].some(
        (expense) => expense.seriesId === template.seriesId && expense.date.slice(0, 7) === month
      );
      const duplicate =
        isDuplicateExpense(state.spaces.home, candidate) || isDuplicateExpense(additions, candidate);
      if (!already && !duplicate) {
        additions.push({ id: crypto.randomUUID(), ...candidate });
      }
      template.lastAppliedMonth = month;
      changed = true;
      month = nextMonth(month);
    }

    state.spaces.home.unshift(...additions.reverse());
  });

  return changed;
}

function expenseMeta(expense) {
  const parts = [formatDate(expense.date)];
  if (expense.merchant && expense.merchant !== expense.note) parts.push(expense.merchant);
  parts.push(expense.note);
  return parts.join(" · ");
}

function filterExpenses(expenses) {
  const query = searchInput.value.trim().toLowerCase();
  const category = categoryFilterInput.value;
  return expenses.filter((expense) => {
    const haystack = `${expense.note} ${expense.merchant || ""}`.toLowerCase();
    const matchesNote = !query || haystack.includes(query);
    const matchesCategory = !category || expense.category === category;
    return matchesNote && matchesCategory;
  });
}

function buildEditForm(expense) {
  const editForm = document.createElement("form");
  editForm.className = "edit-form";
  editForm.noValidate = true;
  editForm.dataset.expenseId = expense.id;

  const title = document.createElement("p");
  title.className = "edit-title";
  title.textContent = "Edit expense";

  const amount = document.createElement("input");
  amount.id = `edit-amount-${expense.id}`;
  amount.name = "amount";
  amount.type = "number";
  amount.inputMode = "decimal";
  amount.min = "0.01";
  amount.step = "0.01";
  amount.required = true;
  amount.value = expense.amount.toFixed(2);

  const category = document.createElement("select");
  category.id = `edit-category-${expense.id}`;
  category.name = "category";
  category.required = true;
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a category";
  const options = SPACES[session.space].categories.map((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    option.selected = name === expense.category;
    return option;
  });
  category.append(placeholder, ...options);

  const date = document.createElement("input");
  date.id = `edit-date-${expense.id}`;
  date.name = "date";
  date.type = "date";
  date.required = true;
  date.value = expense.date;

  const note = document.createElement("input");
  note.id = `edit-note-${expense.id}`;
  note.name = "note";
  note.type = "text";
  note.maxLength = 120;
  note.required = true;
  note.value = expense.note;

  const error = document.createElement("p");
  error.className = "form-error";
  error.setAttribute("role", "alert");
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

  const fields = [
    title,
    editField("Amount", amount),
    editField("Category", category),
    editField("Date", date),
    editField("Note", note),
  ];

  let repeatBox = null;
  if (session.space === "home" && (expense.repeatsMonthly || !expense.seriesId)) {
    repeatBox = document.createElement("input");
    repeatBox.id = `edit-repeat-${expense.id}`;
    repeatBox.name = "repeats";
    repeatBox.className = "repeat-toggle";
    repeatBox.type = "checkbox";
    repeatBox.checked = expense.repeatsMonthly === true;
    const label = document.createElement("label");
    label.className = "repeat-label";
    label.htmlFor = repeatBox.id;
    label.append(repeatBox, document.createTextNode("Repeats every month"));
    const wrap = document.createElement("div");
    wrap.className = "field repeat-field";
    wrap.append(label);
    fields.push(wrap);
  }

  editForm.append(...fields, error, actions);
  editForm.dataset.canRepeat = repeatBox ? "yes" : "no";
  return editForm;
}

function editField(labelText, control) {
  const field = document.createElement("div");
  field.className = "field";
  const label = document.createElement("label");
  label.htmlFor = control.id;
  label.textContent = labelText;
  field.append(label, control);
  return field;
}

function saveExpenseEdit(editForm) {
  const expense = state.spaces[session.space].find((item) => item.id === editForm.dataset.expenseId);
  if (!expense) {
    session.editingId = null;
    render();
    return;
  }

  const amountField = editForm.elements.amount;
  const categoryField = editForm.elements.category;
  const dateField = editForm.elements.date;
  const noteField = editForm.elements.note;
  const error = editForm.querySelector(".form-error");
  const parsed = parseMoney(amountField.value);
  const category = categoryField.value.trim();
  const date = dateField.value;
  const note = noteField.value.trim();
  const allowed = SPACES[session.space].categories;

  [amountField, categoryField, dateField, noteField].forEach((field) => field.classList.remove("invalid"));
  const invalid = [];
  if (!parsed.ok) invalid.push(amountField);
  if (!category || !allowed.includes(category)) invalid.push(categoryField);
  if (!date) invalid.push(dateField);
  if (!note) invalid.push(noteField);
  if (invalid.length) {
    invalid.forEach((field) => field.classList.add("invalid"));
    error.textContent = `Fill in every field. ${amountHint}`;
    error.hidden = false;
    invalid[0].focus();
    return;
  }

  const next = { amount: parsed.value, category, date, note };
  if (isDuplicateExpense(state.spaces[session.space], next, expense.id)) {
    error.textContent = "This matches an expense you already saved.";
    error.hidden = false;
    amountField.focus();
    return;
  }

  expense.amount = next.amount;
  expense.category = next.category;
  expense.date = next.date;
  expense.note = next.note;

  if (editForm.dataset.canRepeat === "yes") {
    const box = editForm.elements.repeats;
    if (box && box.checked) {
      expense.repeatsMonthly = true;
      if (!expense.seriesId) expense.seriesId = expense.id;
      if (!expense.lastAppliedMonth) expense.lastAppliedMonth = date.slice(0, 7);
      applyMonthlyRepeats();
    } else {
      delete expense.repeatsMonthly;
    }
  }

  session.editingId = null;
  saveSpaces();
  render();
}

function clearInvalid() {
  [amountInput, categoryInput, dateInput, noteInput].forEach((field) => field.classList.remove("invalid"));
  errorEl.hidden = true;
}
