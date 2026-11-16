const SPACES = {
  home: {
    label: "Home",
    totalLabel: "Total spent at home",
    empty: "No home expenses yet. Add one above.",
    categories: [
      "Groceries",
      "Bills",
      "Rent",
      "Kids",
      "Transport",
      "Health",
      "Shopping",
      "Other",
    ],
  },
  business: {
    label: "Business",
    totalLabel: "Total spent on the business",
    empty: "No business expenses yet. Add one above.",
    categories: [
      "Materials",
      "Rent",
      "Salaries",
      "Marketing",
      "Delivery",
      "Tools",
      "Other",
    ],
  },
};

const STORAGE_KEY = "expense-spaces";

const app = document.querySelector(".app");
const tabs = [...document.querySelectorAll(".tab")];
const panel = document.getElementById("space-panel");
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
const businessViews = document.getElementById("business-views");
const saleForm = document.getElementById("sale-form");
const saleAmountInput = document.getElementById("sale-amount");
const saleDateInput = document.getElementById("sale-date");
const saleNoteInput = document.getElementById("sale-note");
const saleCustomerInput = document.getElementById("sale-customer");
const saleErrorEl = document.getElementById("sale-error");
const saleListEl = document.getElementById("sale-list");
const profitMonthInput = document.getElementById("profit-month");
const profitIncomeEl = document.getElementById("profit-income");
const profitExpensesEl = document.getElementById("profit-expenses");
const profitAmountEl = document.getElementById("profit-amount");
const savingsSection = document.getElementById("savings-section");
const savingsForm = document.getElementById("savings-form");
const savingsNameInput = document.getElementById("savings-name");
const savingsTargetInput = document.getElementById("savings-target");
const savingsErrorEl = document.getElementById("savings-error");
const savingsSavedEl = document.getElementById("savings-saved");
const savingsLeftEl = document.getElementById("savings-left");
const addToSavingsButton = document.getElementById("add-to-savings");
const savingsTrack = document.getElementById("savings-track");
const savingsFill = document.getElementById("savings-fill");
const savingsProgressText = document.getElementById("savings-progress-text");
const homeViews = document.getElementById("home-views");
const homeSummaryPanel = document.getElementById("home-summary-panel");
const summaryMonthInput = document.getElementById("summary-month");
const budgetForm = document.getElementById("budget-form");
const budgetInput = document.getElementById("budget-amount");
const budgetErrorEl = document.getElementById("budget-error");
const summaryMessageEl = document.getElementById("summary-message");
const summarySpentEl = document.getElementById("summary-spent");
const summaryLeftEl = document.getElementById("summary-left");
const progressLabelEl = document.getElementById("progress-label");
const budgetProgressEl = document.getElementById("budget-progress");
const progressFillEl = document.getElementById("progress-fill");
const dailyLimitEl = document.getElementById("daily-limit");
const categoryBreakdownEl = document.getElementById("category-breakdown");

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const spaces = loadSpaces();
if (applyMonthlyRepeats()) saveSpaces();
const SALES_KEY = "business-sales";
const SAVINGS_KEY = "home-savings-goal";
const HOME_BUDGET_KEY = "homeMonthlyBudget";
const BUDGET_KEY = "home-budgets";
let currentSpace = "home";
let businessView = "expenses";
let homeView = "expenses";
let sales = loadSales();
let budgets = loadBudgets();
let savingsGoal = loadSavingsGoal();
let editingId = null;

dateInput.value = today();
saleDateInput.value = today();
profitMonthInput.value = today().slice(0, 7);
summaryMonthInput.value = today().slice(0, 7);
fillCategories();
fillFilterCategories();
render();

tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchSpace(tab.dataset.space));
});

document.querySelector(".tabs").addEventListener("keydown", (event) => {
  const names = Object.keys(SPACES);
  const index = names.indexOf(currentSpace);
  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    event.preventDefault();
    switchSpace(names[(index + 1) % names.length]);
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    event.preventDefault();
    switchSpace(names[(index - 1 + names.length) % names.length]);
  }
});

searchInput.addEventListener("input", render);
categoryFilterInput.addEventListener("change", render);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  clearInvalid();

  const amount = Number(amountInput.value);
  const category = categoryInput.value.trim();
  const date = dateInput.value;
  const note = noteInput.value.trim();
  const allowed = SPACES[currentSpace].categories;

  const invalid = [];
  if (!amountInput.value.trim() || !Number.isFinite(amount) || amount <= 0) {
    invalid.push(amountInput);
  }
  if (!category || !allowed.includes(category)) invalid.push(categoryInput);
  if (!date) invalid.push(dateInput);
  if (!note) invalid.push(noteInput);

  if (invalid.length) {
    invalid.forEach((field) => field.classList.add("invalid"));
    errorEl.textContent = "Fill in every field. Amount must be greater than 0.";
    errorEl.hidden = false;
    invalid[0].focus();
    return;
  }

  const repeatsMonthly = currentSpace === "home" && repeatsInput.checked;
  const expense = {
    id: crypto.randomUUID(),
    amount,
    category,
    date,
    note,
  };
  if (repeatsMonthly) {
    expense.repeatsMonthly = true;
    expense.seriesId = expense.id;
    expense.lastAppliedMonth = date.slice(0, 7);
  }
  spaces[currentSpace].unshift(expense);
  if (repeatsMonthly) applyMonthlyRepeats();

  saveSpaces();
  render();
  form.reset();
  dateInput.value = today();
  fillCategories();
  errorEl.hidden = true;
  amountInput.focus();
});

listEl.addEventListener("click", (event) => {
  if (event.target.closest("[data-cancel-edit]")) {
    editingId = null;
    render();
    return;
  }

  const editButton = event.target.closest("[data-edit]");
  if (editButton) {
    editingId = editButton.dataset.edit;
    clearInvalid();
    render();
    const field = listEl.querySelector(".edit-form [name=amount]");
    if (field) field.focus();
    return;
  }

  const button = event.target.closest("[data-id]");
  if (!button) return;
  if (editingId === button.dataset.id) editingId = null;
  spaces[currentSpace] = spaces[currentSpace].filter(
    (expense) => expense.id !== button.dataset.id
  );
  saveSpaces();
  render();
});

listEl.addEventListener("submit", (event) => {
  const form = event.target.closest(".edit-form");
  if (!form) return;
  event.preventDefault();
  saveExpenseEdit(form);
});


businessViews.addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button || currentSpace !== "business") return;
  businessView = button.dataset.view;
  syncBusinessView();
});

homeViews.addEventListener("click", (event) => {
  const button = event.target.closest("[data-home-view]");
  if (!button || currentSpace !== "home") return;
  homeView = button.dataset.homeView;
  syncBusinessView();
  renderSavingsGoal();
  if (homeView === "summary") renderHomeSummary();
});

budgetForm.addEventListener("submit", (event) => {
  event.preventDefault();
  budgetInput.classList.remove("invalid");
  budgetErrorEl.hidden = true;

  const month = summaryMonthInput.value;
  const raw = budgetInput.value.trim();
  const amount = Number(raw);

  if (!month) {
    budgetErrorEl.textContent = "Pick a month first.";
    budgetErrorEl.hidden = false;
    summaryMonthInput.focus();
    return;
  }

  if (!raw || !Number.isFinite(amount) || amount <= 0) {
    budgetInput.classList.add("invalid");
    budgetErrorEl.textContent = "Enter a budget greater than 0.";
    budgetErrorEl.hidden = false;
    budgetInput.focus();
    return;
  }

  budgets[month] = roundMoney(amount);
  saveBudgets();
  renderHomeSummary();
  renderSavingsGoal();
});

summaryMonthInput.addEventListener("input", () => {
  budgetInput.classList.remove("invalid");
  budgetErrorEl.hidden = true;
  renderHomeSummary();
});

saleForm.addEventListener("submit", (event) => {
  event.preventDefault();
  clearSaleInvalid();

  const amount = Number(saleAmountInput.value);
  const date = saleDateInput.value;
  const note = saleNoteInput.value.trim();
  const customer = saleCustomerInput.value.trim();

  const invalid = [];
  if (!saleAmountInput.value.trim() || !Number.isFinite(amount) || amount <= 0) {
    invalid.push(saleAmountInput);
  }
  if (!date) invalid.push(saleDateInput);
  if (!note) invalid.push(saleNoteInput);

  if (invalid.length) {
    invalid.forEach((field) => field.classList.add("invalid"));
    saleErrorEl.textContent =
      "Amount, date, and note are required. Amount must be greater than 0.";
    saleErrorEl.hidden = false;
    invalid[0].focus();
    return;
  }

  sales.unshift({
    id: crypto.randomUUID(),
    amount,
    date,
    note,
    customer,
  });

  saveSales();
  renderSales();
  renderProfit();
  saleForm.reset();
  saleDateInput.value = today();
  saleErrorEl.hidden = true;
  saleAmountInput.focus();
});

saleListEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-sale-id]");
  if (!button) return;
  sales = sales.filter((sale) => sale.id !== button.dataset.saleId);
  saveSales();
  renderSales();
  renderProfit();
});

profitMonthInput.addEventListener("input", renderProfit);

savingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  clearSavingsInvalid();

  const name = savingsNameInput.value.trim();
  const target = Number(savingsTargetInput.value);
  const invalid = [];
  if (!name) invalid.push(savingsNameInput);
  if (!savingsTargetInput.value.trim() || !Number.isFinite(target) || target <= 0) {
    invalid.push(savingsTargetInput);
  }

  if (invalid.length) {
    invalid.forEach((field) => field.classList.add("invalid"));
    savingsErrorEl.textContent =
      "Enter a goal name and a target amount greater than 0.";
    savingsErrorEl.hidden = false;
    invalid[0].focus();
    return;
  }

  savingsGoal.name = name;
  savingsGoal.target = roundMoney(target);
  saveSavingsGoal();
  renderSavingsGoal();
  savingsErrorEl.hidden = true;
});

addToSavingsButton.addEventListener("click", () => {
  const month = today().slice(0, 7);
  const left = moneyLeftThisMonth();
  if (savingsGoal.appliedMonth !== month) {
    savingsGoal.appliedMonth = month;
    savingsGoal.appliedAmount = 0;
  }
  const add = roundMoney(Math.max(0, left - savingsGoal.appliedAmount));
  if (add <= 0) return;
  savingsGoal.saved = roundMoney(savingsGoal.saved + add);
  savingsGoal.appliedAmount = roundMoney(savingsGoal.appliedAmount + add);
  saveSavingsGoal();
  renderSavingsGoal();
});

function switchSpace(name) {
  if (!SPACES[name] || name === currentSpace) return;
  currentSpace = name;
  editingId = null;
  app.dataset.space = name;

  tabs.forEach((tab) => {
    const active = tab.dataset.space === name;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active) panel.setAttribute("aria-labelledby", tab.id);
  });

  clearInvalid();
  const previousCategory = categoryInput.value;
  fillCategories();
  if (SPACES[name].categories.includes(previousCategory)) {
    categoryInput.value = previousCategory;
  }
  searchInput.value = "";
  fillFilterCategories();
  render();
}

function fillCategories() {
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a category";

  const options = SPACES[currentSpace].categories.map((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    return option;
  });

  categoryInput.replaceChildren(placeholder, ...options);
}

function fillFilterCategories() {
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "All categories";

  const options = SPACES[currentSpace].categories.map((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    return option;
  });

  categoryFilterInput.replaceChildren(placeholder, ...options);
}

function loadSpaces() {
  const empty = { home: [], business: [] };
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored || typeof stored !== "object") return empty;
    return {
      home: Array.isArray(stored.home) ? stored.home.filter(isValidExpense) : [],
      business: Array.isArray(stored.business)
        ? stored.business.filter(isValidExpense)
        : [],
    };
  } catch {
    return empty;
  }
}

function isValidExpense(expense) {
  return (
    expense &&
    typeof expense.id === "string" &&
    typeof expense.amount === "number" &&
    expense.amount > 0 &&
    typeof expense.category === "string" &&
    expense.category &&
    typeof expense.date === "string" &&
    expense.date &&
    typeof expense.note === "string" &&
    expense.note
  );
}

function saveSpaces() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(spaces));
}

function render() {
  const expenses = spaces[currentSpace];
  const space = SPACES[currentSpace];
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const visible = filterExpenses(expenses);

  totalLabel.textContent = space.totalLabel;
  totalEl.textContent = currency.format(total);
  emptyState.textContent =
    expenses.length > 0 && visible.length === 0
      ? "No expenses match your search."
      : space.empty;

  listEl.replaceChildren(
    ...visible.map((expense) => {
      const item = document.createElement("li");
      item.className = "expense";

      const main = document.createElement("div");
      main.className = "expense-main";

      const top = document.createElement("div");
      top.className = "expense-top";

      const category = document.createElement("span");
      category.className = "category";
      category.textContent = expense.category;

      const amount = document.createElement("span");
      amount.className = "amount";
      amount.textContent = currency.format(expense.amount);

      const meta = document.createElement("p");
      meta.className = "meta";
      meta.textContent = `${formatDate(expense.date)} · ${expense.note}`;

      const repeats =
        currentSpace === "home" && (expense.repeatsMonthly || expense.seriesId);
      const repeatNote = document.createElement("p");
      repeatNote.className = "meta";
      repeatNote.textContent = "Repeats every month";

      const actions = document.createElement("div");
      actions.className = "expense-actions";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "edit";
      editButton.dataset.edit = expense.id;
      editButton.textContent = "Edit";
      editButton.setAttribute(
        "aria-label",
        `Edit ${expense.category} expense of ${currency.format(expense.amount)}`
      );

      const button = document.createElement("button");
      button.type = "button";
      button.className = "delete";
      button.dataset.id = expense.id;
      button.textContent = "Delete";
      button.setAttribute(
        "aria-label",
        `Delete ${expense.category} expense of ${currency.format(expense.amount)}`
      );

      top.append(category, amount);
      main.append(top, meta);
      if (repeats) main.append(repeatNote);
      actions.append(editButton, button);

      if (expense.id === editingId) {
        item.classList.add("expense-editing");
        item.append(buildEditForm(expense));
        return item;
      }

      item.append(main, actions);
      return item;
    })
  );

  syncBusinessView();
  renderSales();
  renderProfit();
  renderHomeSummary();
  renderSavingsGoal();
}

function filterExpenses(expenses) {
  const query = searchInput.value.trim().toLowerCase();
  const category = categoryFilterInput.value;

  return expenses.filter((expense) => {
    const matchesNote = !query || expense.note.toLowerCase().includes(query);
    const matchesCategory = !category || expense.category === category;
    return matchesNote && matchesCategory;
  });
}

function buildEditForm(expense) {
  const form = document.createElement("form");
  form.className = "edit-form";
  form.noValidate = true;
  form.dataset.expenseId = expense.id;

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
  amount.value = String(expense.amount);

  const category = document.createElement("select");
  category.id = `edit-category-${expense.id}`;
  category.name = "category";
  category.required = true;
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a category";
  const options = SPACES[currentSpace].categories.map((name) => {
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
  error.role = "alert";
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
  form.append(
    title,
    editField("Amount", amount),
    editField("Category", category),
    editField("Date", date),
    editField("Note", note),
    error,
    actions
  );
  return form;
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

function saveExpenseEdit(form) {
  const expense = spaces[currentSpace].find(
    (item) => item.id === form.dataset.expenseId
  );
  if (!expense) {
    editingId = null;
    render();
    return;
  }

  const amountField = form.elements.amount;
  const categoryField = form.elements.category;
  const dateField = form.elements.date;
  const noteField = form.elements.note;
  const error = form.querySelector(".form-error");
  const amount = Number(amountField.value);
  const category = categoryField.value.trim();
  const date = dateField.value;
  const note = noteField.value.trim();
  const allowed = SPACES[currentSpace].categories;

  [amountField, categoryField, dateField, noteField].forEach((field) => {
    field.classList.remove("invalid");
  });

  const invalid = [];
  if (!amountField.value.trim() || !Number.isFinite(amount) || amount <= 0) {
    invalid.push(amountField);
  }
  if (!category || !allowed.includes(category)) invalid.push(categoryField);
  if (!date) invalid.push(dateField);
  if (!note) invalid.push(noteField);

  if (invalid.length) {
    invalid.forEach((field) => field.classList.add("invalid"));
    error.textContent = "Fill in every field. Amount must be greater than 0.";
    error.hidden = false;
    invalid[0].focus();
    return;
  }

  expense.amount = amount;
  expense.category = category;
  expense.date = date;
  expense.note = note;
  editingId = null;
  saveSpaces();
  render();
}

function clearInvalid() {
  [amountInput, categoryInput, dateInput, noteInput].forEach((field) => {
    field.classList.remove("invalid");
  });
  errorEl.hidden = true;
}

function applyMonthlyRepeats() {
  const templates = spaces.home.filter((expense) => expense.repeatsMonthly === true);
  const currentMonth = today().slice(0, 7);
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
      additions.push({
        id: crypto.randomUUID(),
        amount: template.amount,
        category: template.category,
        date: dateInMonth(month, day),
        note: template.note,
        seriesId: template.seriesId,
      });
      template.lastAppliedMonth = month;
      changed = true;
      month = nextMonth(month);
    }

    spaces.home.unshift(...additions.reverse());
  });

  return changed;
}

function nextMonth(yearMonth) {
  const [year, month] = yearMonth.split("-").map(Number);
  if (!year || !month) return "";
  const date = new Date(year, month, 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function dateInMonth(yearMonth, day) {
  const [year, month] = yearMonth.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const safeDay = Math.min(Math.max(day || 1, 1), lastDay);
  return `${yearMonth}-${String(safeDay).padStart(2, "0")}`;
}

function today() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}


function syncBusinessView() {
  const isBusiness = currentSpace === "business";
  const showHomeExpenses = !isBusiness && homeView === "expenses";

  businessViews.hidden = !isBusiness;
  homeViews.hidden = isBusiness;

  businessViews.querySelectorAll("[data-view]").forEach((button) => {
    const active = isBusiness && button.dataset.view === businessView;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });

  homeViews.querySelectorAll("[data-home-view]").forEach((button) => {
    const active = !isBusiness && button.dataset.homeView === homeView;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });

  document.querySelectorAll("[data-panel]").forEach((panel) => {
    if (panel.dataset.panel === "expenses") {
      panel.hidden = isBusiness ? businessView !== "expenses" : !showHomeExpenses;
      return;
    }
    panel.hidden = !isBusiness || panel.dataset.panel !== businessView;
  });

  homeSummaryPanel.hidden = isBusiness || homeView !== "summary";
  savingsSection.hidden = isBusiness || homeView !== "expenses";
}

function loadSales() {
  try {
    const stored = JSON.parse(localStorage.getItem(SALES_KEY));
    if (!Array.isArray(stored)) return [];
    return stored.filter(isValidSale);
  } catch {
    return [];
  }
}

function isValidSale(sale) {
  return (
    sale &&
    typeof sale.id === "string" &&
    typeof sale.amount === "number" &&
    sale.amount > 0 &&
    typeof sale.date === "string" &&
    sale.date &&
    typeof sale.note === "string" &&
    sale.note &&
    typeof sale.customer === "string"
  );
}

function saveSales() {
  localStorage.setItem(SALES_KEY, JSON.stringify(sales));
}

function renderSales() {
  saleListEl.replaceChildren(
    ...sales.map((sale) => {
      const item = document.createElement("li");
      item.className = "expense";

      const main = document.createElement("div");
      main.className = "expense-main";

      const top = document.createElement("div");
      top.className = "expense-top";

      const title = document.createElement("span");
      title.className = "category";
      title.textContent = sale.customer || "Sale";

      const amount = document.createElement("span");
      amount.className = "amount";
      amount.textContent = currency.format(sale.amount);

      const meta = document.createElement("p");
      meta.className = "meta";
      meta.textContent = `${formatDate(sale.date)} · ${sale.note}`;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "delete";
      button.dataset.saleId = sale.id;
      button.textContent = "Delete";
      button.setAttribute(
        "aria-label",
        `Delete ${sale.customer || "sale"} of ${currency.format(sale.amount)}`
      );

      top.append(title, amount);
      main.append(top, meta);
      item.append(main, button);
      return item;
    })
  );
}

function loadBudgets() {
  const clean = {};
  try {
    const stored = JSON.parse(localStorage.getItem(BUDGET_KEY));
    if (stored && typeof stored === "object") {
      Object.entries(stored).forEach(([month, amount]) => {
        if (/^\d{4}-\d{2}$/.test(month) && typeof amount === "number" && amount > 0) {
          clean[month] = roundMoney(amount);
        }
      });
    }
  } catch {
    // Leave any already read months in place.
  }

  const legacy = Number(localStorage.getItem(HOME_BUDGET_KEY));
  const current = today().slice(0, 7);
  if (clean[current] == null && Number.isFinite(legacy) && legacy > 0) {
    clean[current] = roundMoney(legacy);
  }
  return clean;
}

function saveBudgets() {
  localStorage.setItem(BUDGET_KEY, JSON.stringify(budgets));
  const current = today().slice(0, 7);
  if (typeof budgets[current] === "number") {
    localStorage.setItem(HOME_BUDGET_KEY, String(budgets[current]));
  }
}

function renderHomeSummary() {
  const month = summaryMonthInput.value;
  const monthExpenses = spaces.home.filter(
    (expense) => month && expense.date.slice(0, 7) === month
  );
  const spent = roundMoney(
    monthExpenses.reduce((sum, expense) => sum + expense.amount, 0)
  );
  const budget = budgets[month];
  const hasBudget = typeof budget === "number" && budget > 0;
  const left = hasBudget ? roundMoney(budget - spent) : null;
  const percent = hasBudget ? (spent / budget) * 100 : 0;

  if (document.activeElement !== budgetInput) {
    budgetInput.value = hasBudget ? budget.toFixed(2) : "";
  }

  summarySpentEl.textContent = currency.format(spent);
  summaryLeftEl.className = "home-figure";

  if (!hasBudget) {
    summaryLeftEl.textContent = "Set your budget to see what is left";
    summaryLeftEl.classList.add("is-prompt");
  } else if (left < 0) {
    summaryLeftEl.textContent = `Over budget by ${currency.format(Math.abs(left))}`;
    summaryLeftEl.classList.add("is-over");
  } else {
    summaryLeftEl.textContent = currency.format(left);
  }

  summaryMessageEl.className = "summary-message";
  if (!hasBudget) {
    summaryMessageEl.textContent =
      "Set a budget for this month, then I will show how you are doing.";
  } else if (left < 0) {
    summaryMessageEl.textContent = `Careful, you are over budget by ${currency.format(Math.abs(left))}.`;
    summaryMessageEl.classList.add("is-over");
  } else if (left === 0) {
    summaryMessageEl.textContent = "You have used your whole budget for this month.";
    summaryMessageEl.classList.add("is-over");
  } else if (percent >= 70) {
    summaryMessageEl.textContent = `Careful, only ${currency.format(left)} left for the rest of the month.`;
    summaryMessageEl.classList.add("is-careful");
  } else {
    summaryMessageEl.textContent = `You are doing great, you still have ${currency.format(left)} left.`;
  }

  const shownPercent = Math.round(percent);
  const barWidth = Math.min(Math.max(percent, 0), 100);
  progressFillEl.style.width = `${barWidth}%`;
  progressFillEl.className = "progress-fill";
  if (hasBudget && percent > 90) progressFillEl.classList.add("is-high");
  else if (hasBudget && percent >= 70) progressFillEl.classList.add("is-mid");

  progressLabelEl.textContent = hasBudget
    ? `${shownPercent}% of budget used`
    : "Budget used";
  budgetProgressEl.setAttribute("aria-valuenow", String(hasBudget ? Math.min(shownPercent, 100) : 0));
  budgetProgressEl.setAttribute(
    "aria-valuetext",
    hasBudget ? `${shownPercent}% of budget used` : "No budget yet"
  );

  const days = daysRemainingInMonth(month);
  if (!hasBudget) {
    dailyLimitEl.textContent = "Set your budget to see your daily limit.";
  } else if (days <= 0) {
    dailyLimitEl.textContent = "This month is already over.";
  } else if (left <= 0) {
    dailyLimitEl.textContent =
      "Daily limit: you can spend $0.00 per day for the remaining days of this month.";
  } else {
    dailyLimitEl.textContent = `Daily limit: you can spend ${currency.format(roundMoney(left / days))} per day for the remaining days of this month.`;
  }

  const totals = new Map();
  monthExpenses.forEach((expense) => {
    totals.set(expense.category, (totals.get(expense.category) || 0) + expense.amount);
  });

  const rows = [...totals.entries()]
    .map(([name, amount]) => ({ name, amount: roundMoney(amount) }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));

  categoryBreakdownEl.replaceChildren(
    ...rows.map((row) => {
      const item = document.createElement("li");
      item.className = "category-row";

      const top = document.createElement("div");
      top.className = "category-top";

      const name = document.createElement("span");
      name.className = "category-name";
      name.textContent = row.name;

      const amount = document.createElement("span");
      amount.textContent = currency.format(row.amount);

      const track = document.createElement("div");
      track.className = "mini-track";

      const fill = document.createElement("div");
      fill.className = "mini-fill";
      const share = spent > 0 ? (row.amount / spent) * 100 : 0;
      fill.style.width = `${share}%`;

      top.append(name, amount);
      track.append(fill);
      item.append(top, track);
      return item;
    })
  );
}

function daysRemainingInMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) return 0;
  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const currentMonth = today().slice(0, 7);
  if (month > currentMonth) return daysInMonth;
  if (month < currentMonth) return 0;
  const day = Number(today().slice(8, 10));
  return Math.max(daysInMonth - day + 1, 0);
}

function renderProfit() {
  const month = profitMonthInput.value;
  const inMonth = (date) => month && date.slice(0, 7) === month;
  const income = roundMoney(
    sales.filter((sale) => inMonth(sale.date)).reduce((sum, sale) => sum + sale.amount, 0)
  );
  const expenseTotal = roundMoney(
    spaces.business
      .filter((expense) => inMonth(expense.date))
      .reduce((sum, expense) => sum + expense.amount, 0)
  );
  const profit = roundMoney(income - expenseTotal);

  profitIncomeEl.textContent = currency.format(income);
  profitExpensesEl.textContent = currency.format(expenseTotal);
  profitAmountEl.textContent = currency.format(profit);
  profitAmountEl.classList.toggle("profit-positive", profit > 0);
  profitAmountEl.classList.toggle("profit-negative", profit < 0);
}

function clearSaleInvalid() {
  [saleAmountInput, saleDateInput, saleNoteInput].forEach((field) => {
    field.classList.remove("invalid");
  });
  saleErrorEl.hidden = true;
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function emptySavingsGoal() {
  return { name: "", target: 0, saved: 0, appliedMonth: "", appliedAmount: 0 };
}

function loadSavingsGoal() {
  try {
    const stored = JSON.parse(localStorage.getItem(SAVINGS_KEY));
    if (!stored || typeof stored !== "object") return emptySavingsGoal();
    const target = Number(stored.target);
    const saved = Number(stored.saved);
    const appliedAmount = Number(stored.appliedAmount);
    return {
      name: typeof stored.name === "string" ? stored.name : "",
      target: Number.isFinite(target) && target > 0 ? target : 0,
      saved: Number.isFinite(saved) && saved >= 0 ? saved : 0,
      appliedMonth: typeof stored.appliedMonth === "string" ? stored.appliedMonth : "",
      appliedAmount:
        Number.isFinite(appliedAmount) && appliedAmount >= 0 ? appliedAmount : 0,
    };
  } catch {
    return emptySavingsGoal();
  }
}

function saveSavingsGoal() {
  localStorage.setItem(SAVINGS_KEY, JSON.stringify(savingsGoal));
}

function moneyLeftThisMonth() {
  const month = today().slice(0, 7);
  const budget = budgets[month];
  if (typeof budget !== "number" || budget <= 0) return 0;
  const spent = spaces.home.reduce((sum, expense) => {
    return expense.date.slice(0, 7) === month ? sum + expense.amount : sum;
  }, 0);
  return roundMoney(Math.max(0, budget - spent));
}

function availableToSave() {
  const left = moneyLeftThisMonth();
  const already =
    savingsGoal.appliedMonth === today().slice(0, 7) ? savingsGoal.appliedAmount : 0;
  return roundMoney(Math.max(0, left - already));
}

function clearSavingsInvalid() {
  [savingsNameInput, savingsTargetInput].forEach((field) => {
    field.classList.remove("invalid");
  });
  savingsErrorEl.hidden = true;
}

function renderSavingsGoal() {
  if (document.activeElement !== savingsNameInput) {
    savingsNameInput.value = savingsGoal.name;
  }
  if (document.activeElement !== savingsTargetInput && savingsGoal.target > 0) {
    savingsTargetInput.value = String(savingsGoal.target);
  }

  const left = moneyLeftThisMonth();
  const available = availableToSave();
  const percent =
    savingsGoal.target > 0
      ? Math.min(100, Math.round((savingsGoal.saved / savingsGoal.target) * 100))
      : 0;
  const goalLabel = savingsGoal.name || "your goal";

  savingsSavedEl.textContent = currency.format(savingsGoal.saved);
  savingsLeftEl.textContent = `Money left this month: ${currency.format(left)}`;
  addToSavingsButton.disabled = available <= 0;
  savingsFill.style.width = `${percent}%`;
  savingsTrack.setAttribute("aria-valuenow", String(percent));
  savingsTrack.setAttribute(
    "aria-valuetext",
    `${currency.format(savingsGoal.saved)} of ${
      savingsGoal.target > 0 ? currency.format(savingsGoal.target) : "the target"
    }`
  );
  savingsProgressText.textContent =
    savingsGoal.target > 0 && savingsGoal.saved >= savingsGoal.target
      ? `${goalLabel} reached`
      : `${percent}% of ${goalLabel}`;
}

function formatDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
