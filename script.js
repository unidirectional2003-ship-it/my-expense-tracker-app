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
const dashboardPanel = document.getElementById("dashboard-panel");
const spaceContent = document.getElementById("space-content");
const dashboardMonthInput = document.getElementById("dashboard-month");
const dashIncomeEl = document.getElementById("dash-income");
const dashSpendingEl = document.getElementById("dash-spending");
const dashProfitEl = document.getElementById("dash-profit");
const dashLeftEl = document.getElementById("dash-left");
const dashBarsCanvas = document.getElementById("dash-bars");
const dashBarsEmpty = document.getElementById("dash-bars-empty");
const dashSplitCanvas = document.getElementById("dash-split");
const dashSplitEmpty = document.getElementById("dash-split-empty");
const dashCategoriesCanvas = document.getElementById("dash-categories");
const dashCategoriesEmpty = document.getElementById("dash-categories-empty");
const dashTrendCanvas = document.getElementById("dash-trend");
const dashTrendEmpty = document.getElementById("dash-trend-empty");
const dashBudgetBlock = document.querySelector("#dashboard-panel .progress-block");
const dashBudgetLabel = document.getElementById("dash-budget-label");
const dashBudgetTrack = document.getElementById("dash-budget-track");
const dashBudgetFill = document.getElementById("dash-budget-fill");
const dashBudgetEmpty = document.getElementById("dash-budget-empty");
const dashAlertsEl = document.getElementById("dash-alerts");
const dashActivityEl = document.getElementById("dash-activity");
const dashActivityEmpty = document.getElementById("dash-activity-empty");
const BILLS_KEY = "bills";
const TAB_ORDER = ["dashboard", "home", "business"];
const dashCharts = {};
let chartDefaultsReady = false;

function formatMoney(value) {
  const amount = Number(value);
  const safe = Number.isFinite(amount) ? amount : 0;
  const negative = safe < 0;
  const rounded = Math.round((Math.abs(safe) + Number.EPSILON) * 100) / 100;
  const [whole, fraction = "00"] = rounded.toFixed(2).split(".");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const decimals = fraction === "00" ? "" : `.${fraction.replace(/0$/, "")}`;
  return `${negative ? "-" : ""}Rs ${withCommas}${decimals}`;
}

const spaces = loadSpaces();
if (applyMonthlyRepeats()) saveSpaces();
const SALES_KEY = "business-sales";
const SAVINGS_KEY = "home-savings-goal";
const HOME_BUDGET_KEY = "homeMonthlyBudget";
const BUDGET_KEY = "home-budgets";
let currentSpace = "dashboard";
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
dashboardMonthInput.value = today().slice(0, 7);
fillCategories();
fillFilterCategories();
render();

tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchSpace(tab.dataset.space));
});

document.querySelector(".tabs").addEventListener("keydown", (event) => {
  const names = TAB_ORDER;
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
dashboardMonthInput.addEventListener("input", renderDashboard);

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
  if (!TAB_ORDER.includes(name) || name === currentSpace) return;
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
  if (name === "dashboard") {
    render();
    return;
  }

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
  if (!SPACES[currentSpace]) return;
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
  if (!SPACES[currentSpace]) return;
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
  if (currentSpace === "dashboard") {
    syncBusinessView();
    renderDashboard();
    return;
  }

  const expenses = spaces[currentSpace];
  const space = SPACES[currentSpace];
  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const visible = filterExpenses(expenses);

  totalLabel.textContent = space.totalLabel;
  totalEl.textContent = formatMoney(total);
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
      amount.textContent = formatMoney(expense.amount);

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
  const isDashboard = currentSpace === "dashboard";
  dashboardPanel.hidden = !isDashboard;
  spaceContent.hidden = isDashboard;
  if (isDashboard) return;

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
      amount.textContent = formatMoney(sale.amount);

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
        `Delete ${sale.customer || "sale"} of ${formatMoney(sale.amount)}`
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

  summarySpentEl.textContent = formatMoney(spent);
  summaryLeftEl.className = "home-figure";

  if (!hasBudget) {
    summaryLeftEl.textContent = "Set your budget to see what is left";
    summaryLeftEl.classList.add("is-prompt");
  } else if (left < 0) {
    summaryLeftEl.textContent = `Over budget by ${formatMoney(Math.abs(left))}`;
    summaryLeftEl.classList.add("is-over");
  } else {
    summaryLeftEl.textContent = formatMoney(left);
  }

  summaryMessageEl.className = "summary-message";
  if (!hasBudget) {
    summaryMessageEl.textContent =
      "Set a budget for this month, then I will show how you are doing.";
  } else if (left < 0) {
    summaryMessageEl.textContent = `Careful, you are over budget by ${formatMoney(Math.abs(left))}.`;
    summaryMessageEl.classList.add("is-over");
  } else if (left === 0) {
    summaryMessageEl.textContent = "You have used your whole budget for this month.";
    summaryMessageEl.classList.add("is-over");
  } else if (percent >= 70) {
    summaryMessageEl.textContent = `Careful, only ${formatMoney(left)} left for the rest of the month.`;
    summaryMessageEl.classList.add("is-careful");
  } else {
    summaryMessageEl.textContent = `You are doing great, you still have ${formatMoney(left)} left.`;
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
      `Daily limit: you can spend ${formatMoney(0)} per day for the remaining days of this month.`;
  } else {
    dailyLimitEl.textContent = `Daily limit: you can spend ${formatMoney(roundMoney(left / days))} per day for the remaining days of this month.`;
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
      amount.textContent = formatMoney(row.amount);

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

  profitIncomeEl.textContent = formatMoney(income);
  profitExpensesEl.textContent = formatMoney(expenseTotal);
  profitAmountEl.textContent = formatMoney(profit);
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

  savingsSavedEl.textContent = formatMoney(savingsGoal.saved);
  savingsLeftEl.textContent = `Money left this month: ${formatMoney(left)}`;
  addToSavingsButton.disabled = available <= 0;
  savingsFill.style.width = `${percent}%`;
  savingsTrack.setAttribute("aria-valuenow", String(percent));
  savingsTrack.setAttribute(
    "aria-valuetext",
    `${formatMoney(savingsGoal.saved)} of ${
      savingsGoal.target > 0 ? formatMoney(savingsGoal.target) : "the target"
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

function renderDashboard() {
  prepareChartDefaults();
  const month = /^\d{4}-\d{2}$/.test(dashboardMonthInput.value)
    ? dashboardMonthInput.value
    : today().slice(0, 7);
  const months = recentMonths(month, 6);
  const homeSpent = totalFor(spaces.home, month);
  const businessSpent = totalFor(spaces.business, month);
  const income = totalFor(sales, month);
  const spending = roundMoney(homeSpent + businessSpent);
  const profit = roundMoney(income - businessSpent);
  const budget = budgets[month];
  const hasBudget = typeof budget === "number" && budget > 0;

  dashIncomeEl.textContent = formatMoney(income);
  dashSpendingEl.textContent = formatMoney(spending);
  dashProfitEl.textContent = formatMoney(profit);
  dashProfitEl.className =
    "dash-figure" + (profit > 0 ? " is-positive" : profit < 0 ? " is-negative" : "");

  if (!hasBudget) {
    dashLeftEl.textContent = "Set a home budget";
    dashLeftEl.className = "dash-figure is-prompt";
  } else {
    dashLeftEl.textContent = formatMoney(roundMoney(budget - homeSpent));
    dashLeftEl.className = "dash-figure";
  }

  const incomeSeries = months.map((item) => totalFor(sales, item.key));
  const businessSeries = months.map((item) => totalFor(spaces.business, item.key));
  const homeSeries = months.map((item) => totalFor(spaces.home, item.key));
  const labels = months.map((item) => item.label);

  showChart(
    "bars",
    dashBarsCanvas,
    dashBarsEmpty,
    seriesHasMoney(incomeSeries, businessSeries, homeSeries),
    "No income or expenses in the last 6 months.",
    {
      type: "bar",
      data: {
        labels,
        datasets: [
          barSet("Business Income", incomeSeries, "#8fbf78", "#5f9448"),
          barSet("Business Expenses", businessSeries, "#f4b6c8", "#e9899f"),
          barSet("Home Expenses", homeSeries, "#b7d3a0", "#7eae68"),
        ],
      },
      options: chartOptions({ scales: { x: labelScale(), y: moneyScale() } }),
    }
  );

  const splitTotal = spending;
  showChart(
    "split",
    dashSplitCanvas,
    dashSplitEmpty,
    splitTotal > 0,
    "No spending this month yet.",
    {
      type: "doughnut",
      data: {
        labels: ["Home", "Business"],
        datasets: [
          {
            data: [homeSpent, businessSpent],
            backgroundColor: ["#b7d3a0", "#f4b6c8"],
            borderColor: ["#7eae68", "#e9899f"],
            borderWidth: 2,
          },
        ],
      },
      options: chartOptions({ cutout: "58%" }),
    }
  );

  const categories = topCategories(month);
  const sliceColors = ["#b7d3a0", "#f4b6c8", "#8fbf78", "#f9d6e0", "#cfe3b8", "#e9899f"];
  const sliceBorders = ["#7eae68", "#e9899f", "#6fa85a", "#e7a0b6", "#8fbf78", "#d67b93"];
  showChart(
    "categories",
    dashCategoriesCanvas,
    dashCategoriesEmpty,
    categories.length > 0,
    "No categories to show for this month.",
    {
      type: "doughnut",
      data: {
        labels: categories.map((row) => row.label),
        datasets: [
          {
            data: categories.map((row) => row.amount),
            backgroundColor: categories.map((_, index) => sliceColors[index % sliceColors.length]),
            borderColor: categories.map((_, index) => sliceBorders[index % sliceBorders.length]),
            borderWidth: 2,
          },
        ],
      },
      options: chartOptions({ cutout: "58%" }),
    }
  );

  showChart(
    "trend",
    dashTrendCanvas,
    dashTrendEmpty,
    incomeSeries.some((value) => value > 0),
    "No business income in the last 6 months.",
    {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Business Income",
            data: incomeSeries,
            borderColor: "#6fa85a",
            backgroundColor: "#b7d3a0",
            pointBackgroundColor: "#f4b6c8",
            pointBorderColor: "#3b3b3b",
            pointRadius: 5,
            pointHoverRadius: 6,
            borderWidth: 3,
            tension: 0.35,
            fill: false,
          },
        ],
      },
      options: chartOptions({ scales: { x: labelScale(), y: moneyScale() } }),
    }
  );

  const budgetPercent = renderDashBudget(hasBudget, budget, homeSpent);
  renderDashAlerts(month, budgetPercent, profit);
  renderDashActivity();
}

function renderDashBudget(hasBudget, budget, homeSpent) {
  if (!hasBudget) {
    dashBudgetBlock.hidden = true;
    dashBudgetEmpty.hidden = false;
    dashBudgetTrack.setAttribute("aria-valuenow", "0");
    dashBudgetTrack.setAttribute("aria-valuetext", "No budget yet");
    return null;
  }

  const percent = (homeSpent / budget) * 100;
  const shown = Math.round(percent);
  dashBudgetBlock.hidden = false;
  dashBudgetEmpty.hidden = true;
  dashBudgetFill.style.width = `${Math.min(Math.max(percent, 0), 100)}%`;
  dashBudgetFill.className = "progress-fill";
  if (percent > 90) dashBudgetFill.classList.add("is-high");
  else if (percent >= 70) dashBudgetFill.classList.add("is-mid");
  dashBudgetLabel.textContent = `${shown}% of budget used`;
  dashBudgetTrack.setAttribute("aria-valuenow", String(Math.min(Math.max(shown, 0), 100)));
  dashBudgetTrack.setAttribute("aria-valuetext", `${shown}% of budget used`);
  return percent;
}

function renderDashAlerts(month, budgetPercent, profit) {
  const alerts = [];
  const overdue = overdueBillsFor(month);
  if (overdue.length) {
    const total = roundMoney(overdue.reduce((sum, bill) => sum + Number(bill.amount), 0));
    const noun = overdue.length === 1 ? "overdue bill" : "overdue bills";
    alerts.push(`${overdue.length} ${noun}, ${formatMoney(total)} still to pay.`);
  }
  if (budgetPercent != null && budgetPercent > 80) {
    alerts.push("Home spending is above 80% of the budget.");
  }
  if (profit < 0) alerts.push("Business is at a loss this month.");

  dashAlertsEl.replaceChildren();
  if (!alerts.length) {
    const ok = document.createElement("p");
    ok.className = "alerts-ok";
    ok.textContent = "All good this month";
    dashAlertsEl.append(ok);
    return;
  }

  const list = document.createElement("ul");
  list.className = "alerts-list";
  alerts.forEach((text) => {
    const item = document.createElement("li");
    item.textContent = text;
    list.append(item);
  });
  dashAlertsEl.append(list);
}

function renderDashActivity() {
  const rows = recentEntries().slice(0, 5);
  dashActivityEl.replaceChildren(
    ...rows.map((row) => {
      const item = document.createElement("li");
      item.className = row.space === "business" ? "expense is-business" : "expense";

      const main = document.createElement("div");
      main.className = "expense-main";

      const top = document.createElement("div");
      top.className = "expense-top";

      const title = document.createElement("span");
      title.className = "category";

      const tag = document.createElement("span");
      tag.className = `space-tag space-tag-${row.space}`;
      tag.textContent = row.space === "home" ? "Home" : "Business";

      const name = document.createElement("span");
      name.textContent = row.title;

      const amount = document.createElement("span");
      amount.className = "amount";
      amount.textContent = formatMoney(row.amount);

      const meta = document.createElement("p");
      meta.className = "meta";
      meta.textContent =
        row.kind === "sale"
          ? `${formatDate(row.date)} · Income · ${row.note}`
          : `${formatDate(row.date)} · ${row.note}`;

      title.append(tag, name);
      top.append(title, amount);
      main.append(top, meta);
      item.append(main);
      return item;
    })
  );
  dashActivityEmpty.hidden = rows.length > 0;
}

function overdueBillsFor(month) {
  const todayValue = today();
  let stored = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(BILLS_KEY));
    if (Array.isArray(parsed)) stored = parsed;
  } catch {
    stored = [];
  }

  return stored.filter((bill) => {
    if (!bill || bill.paid === true) return false;
    const due = typeof bill.dueDate === "string" ? bill.dueDate : "";
    const amount = Number(bill.amount);
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(due) &&
      Number.isFinite(amount) &&
      amount > 0 &&
      due.slice(0, 7) === month &&
      due < todayValue
    );
  });
}

function recentEntries() {
  const rows = [];
  spaces.home.forEach((expense, index) => {
    rows.push({
      space: "home",
      kind: "expense",
      date: expense.date,
      title: expense.category,
      note: expense.note,
      amount: expense.amount,
      index,
    });
  });
  spaces.business.forEach((expense, index) => {
    rows.push({
      space: "business",
      kind: "expense",
      date: expense.date,
      title: expense.category,
      note: expense.note,
      amount: expense.amount,
      index,
    });
  });
  sales.forEach((sale, index) => {
    rows.push({
      space: "business",
      kind: "sale",
      date: sale.date,
      title: sale.customer || "Sale",
      note: sale.note,
      amount: sale.amount,
      index,
    });
  });
  rows.sort((a, b) => b.date.localeCompare(a.date) || a.index - b.index);
  return rows;
}

function recentMonths(endMonth, count) {
  const match = /^(\d{4})-(\d{2})$/.exec(endMonth);
  const end = match ? new Date(Number(match[1]), Number(match[2]) - 1, 1) : new Date();
  const months = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(end.getFullYear(), end.getMonth() - i, 1);
    months.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: date.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
    });
  }
  return months;
}

function totalFor(items, month) {
  if (!month) return 0;
  return roundMoney(
    items.reduce((sum, item) => {
      return item.date && item.date.slice(0, 7) === month ? sum + item.amount : sum;
    }, 0)
  );
}

function topCategories(month) {
  const totals = new Map();
  const add = (space, expense) => {
    if (!expense.date || expense.date.slice(0, 7) !== month) return;
    const label = `${space === "home" ? "Home" : "Business"} · ${expense.category}`;
    totals.set(label, (totals.get(label) || 0) + expense.amount);
  };
  spaces.home.forEach((expense) => add("home", expense));
  spaces.business.forEach((expense) => add("business", expense));

  const rows = [...totals.entries()]
    .map(([label, amount]) => ({ label, amount: roundMoney(amount) }))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
  const top = rows.slice(0, 5);
  const rest = roundMoney(rows.slice(5).reduce((sum, row) => sum + row.amount, 0));
  if (rest > 0) top.push({ label: "Other", amount: rest });
  return top;
}

function seriesHasMoney(...series) {
  return series.some((values) => values.some((value) => value > 0));
}

function barSet(label, data, backgroundColor, borderColor) {
  return {
    label,
    data,
    backgroundColor,
    borderColor,
    borderWidth: 2,
    borderRadius: 8,
    maxBarThickness: 26,
  };
}

function prepareChartDefaults() {
  if (chartDefaultsReady || typeof Chart === "undefined") return;
  Chart.defaults.font.family = '"Nunito", "Avenir Next", "Trebuchet MS", "Segoe UI", sans-serif';
  Chart.defaults.color = "#3b3b3b";
  chartDefaultsReady = true;
}

function chartPlugins() {
  return {
    legend: {
      position: "bottom",
      labels: {
        color: "#3b3b3b",
        boxWidth: 14,
        padding: 12,
        font: { size: 13, weight: "700" },
      },
    },
    tooltip: {
      backgroundColor: "#3b3b3b",
      titleColor: "#fffbf5",
      bodyColor: "#fffbf5",
      padding: 10,
      cornerRadius: 12,
      callbacks: { label: chartMoneyLabel },
    },
  };
}

function chartOptions(extra) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: chartPlugins(),
    ...extra,
  };
}

function labelScale() {
  return {
    ticks: {
      color: "#3b3b3b",
      maxRotation: 0,
      autoSkip: true,
      font: { size: 12, weight: "700" },
    },
    grid: { display: false },
  };
}

function moneyScale() {
  return {
    beginAtZero: true,
    ticks: {
      color: "#3b3b3b",
      maxTicksLimit: 5,
      font: { size: 12, weight: "700" },
      callback: (value) => formatMoney(value),
    },
    grid: { color: "rgba(59, 59, 59, 0.08)" },
  };
}

function chartMoneyLabel(context) {
  const raw = context.parsed;
  const value = raw && typeof raw === "object" ? raw.y : raw;
  const name = context.dataset.label || context.label || "";
  return `${name}: ${formatMoney(value)}`;
}

function showChart(name, canvas, emptyEl, hasData, emptyText, config) {
  if (dashCharts[name]) {
    dashCharts[name].destroy();
    dashCharts[name] = null;
  }
  const box = canvas.parentElement;
  if (!hasData) {
    box.hidden = true;
    emptyEl.hidden = false;
    emptyEl.textContent = emptyText;
    return;
  }
  if (typeof Chart === "undefined") {
    box.hidden = true;
    emptyEl.hidden = false;
    emptyEl.textContent = "The chart could not load. Check your connection, then refresh the page.";
    return;
  }
  box.hidden = false;
  emptyEl.hidden = true;
  try {
    dashCharts[name] = new Chart(canvas, config);
  } catch {
    box.hidden = true;
    emptyEl.hidden = false;
    emptyEl.textContent = "This chart could not be drawn.";
  }
}
