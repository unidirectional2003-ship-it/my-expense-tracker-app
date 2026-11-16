import { parseMoney, formatMoney, roundMoney } from "./money.js";
import { today, daysRemainingInMonth, monthName } from "./dates.js";
import { state, saveBudgets, saveSavings } from "./store.js";
import { sumInMonth, personalBalance } from "./calc.js";
import { render } from "./render.js";

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

export function bindHome() {
  summaryMonthInput.addEventListener("input", () => {
    budgetInput.classList.remove("invalid");
    budgetErrorEl.hidden = true;
    render();
  });

  budgetForm.addEventListener("submit", (event) => {
    event.preventDefault();
    budgetInput.classList.remove("invalid");
    budgetErrorEl.hidden = true;
    const month = summaryMonthInput.value;
    const parsed = parseMoney(budgetInput.value);
    if (!month) {
      budgetErrorEl.textContent = "Pick a month first.";
      budgetErrorEl.hidden = false;
      summaryMonthInput.focus();
      return;
    }
    if (!parsed.ok) {
      budgetInput.classList.add("invalid");
      budgetErrorEl.textContent = "Enter a budget greater than 0, with at most 2 decimal places.";
      budgetErrorEl.hidden = false;
      budgetInput.focus();
      return;
    }
    state.budgets[month] = parsed.value;
    saveBudgets();
    render();
  });

  savingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    clearSavingsInvalid();
    const name = savingsNameInput.value.trim();
    const parsed = parseMoney(savingsTargetInput.value);
    const invalid = [];
    if (!name) invalid.push(savingsNameInput);
    if (!parsed.ok) invalid.push(savingsTargetInput);
    if (invalid.length) {
      invalid.forEach((field) => field.classList.add("invalid"));
      savingsErrorEl.textContent = "Enter a goal name and a target greater than 0, with at most 2 decimal places.";
      savingsErrorEl.hidden = false;
      invalid[0].focus();
      return;
    }
    state.savings.name = name;
    state.savings.target = parsed.value;
    saveSavings();
    render();
    savingsErrorEl.hidden = true;
  });

  addToSavingsButton.addEventListener("click", () => {
    const month = today().slice(0, 7);
    const gross = grossLeft(month);
    if (state.savings.appliedMonth !== month) {
      state.savings.appliedMonth = month;
      state.savings.appliedAmount = 0;
    }
    const add = roundMoney(Math.max(0, gross - state.savings.appliedAmount));
    if (add <= 0) return;
    state.savings.saved = roundMoney(state.savings.saved + add);
    state.savings.appliedAmount = roundMoney(state.savings.appliedAmount + add);
    saveSavings();
    render();
  });
}

export function prepareHome() {
  summaryMonthInput.value = today().slice(0, 7);
}

export function renderHomeSummary() {
  const month = summaryMonthInput.value;
  const monthExpenses = state.spaces.home.filter((expense) => month && expense.date.slice(0, 7) === month);
  const spent = sumInMonth(state.spaces.home, month);
  const budget = state.budgets[month];
  const hasBudget = typeof budget === "number" && budget > 0;
  const left = personalBalance(state.budgets, state.spaces.home, state.savings, month);
  const percent = hasBudget ? (spent / budget) * 100 : 0;

  if (document.activeElement !== budgetInput) {
    budgetInput.value = hasBudget ? budget.toFixed(2) : "";
  }

  summarySpentEl.textContent = formatMoney(spent);
  summaryLeftEl.className = "home-figure";
  summaryMessageEl.className = "summary-message";

  if (!hasBudget) {
    summaryLeftEl.textContent = "Set your budget to see what is left";
    summaryLeftEl.classList.add("is-prompt");
    summaryMessageEl.textContent = "Set a budget for this month, then I will show how you are doing.";
  } else if (spent > budget) {
    summaryLeftEl.textContent = formatMoney(left);
    summaryLeftEl.classList.add("is-over");
    summaryMessageEl.textContent = `Careful, you are over budget by ${formatMoney(roundMoney(spent - budget))}.`;
    summaryMessageEl.classList.add("is-over");
  } else if (left < 0) {
    summaryLeftEl.textContent = formatMoney(left);
    summaryLeftEl.classList.add("is-over");
    summaryMessageEl.textContent = "Savings set aside are more than the money left to spend.";
    summaryMessageEl.classList.add("is-careful");
  } else if (left === 0) {
    summaryLeftEl.textContent = formatMoney(0);
    summaryMessageEl.textContent = "You have nothing left to spend this month.";
    summaryMessageEl.classList.add("is-over");
  } else if (percent >= 70) {
    summaryLeftEl.textContent = formatMoney(left);
    summaryMessageEl.textContent = `Careful, only ${formatMoney(left)} left for the rest of the month.`;
    summaryMessageEl.classList.add("is-careful");
  } else {
    summaryLeftEl.textContent = formatMoney(left);
    summaryMessageEl.textContent = `You are doing great, you still have ${formatMoney(left)} left.`;
  }

  const shownPercent = Math.round(percent);
  progressFillEl.style.width = `${Math.min(Math.max(percent, 0), 100)}%`;
  progressFillEl.className = "progress-fill";
  if (hasBudget && percent > 90) progressFillEl.classList.add("is-high");
  else if (hasBudget && percent >= 70) progressFillEl.classList.add("is-mid");
  progressLabelEl.textContent = hasBudget ? `${shownPercent}% of budget used` : "Budget used";
  budgetProgressEl.setAttribute("aria-valuenow", String(hasBudget ? Math.min(shownPercent, 100) : 0));
  budgetProgressEl.setAttribute(
    "aria-valuetext",
    hasBudget ? `${shownPercent}% of budget used` : "No budget yet"
  );

  const days = daysRemainingInMonth(month);
  const spendable = left == null ? null : Math.max(0, left);
  if (!hasBudget) {
    dailyLimitEl.textContent = "Set your budget to see your daily limit.";
  } else if (days <= 0) {
    dailyLimitEl.textContent = "This month is already over.";
  } else {
    dailyLimitEl.textContent = `Daily limit: you can spend ${formatMoney(roundMoney(spendable / days))} per day for the remaining days of this month.`;
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
      fill.style.width = `${spent > 0 ? (row.amount / spent) * 100 : 0}%`;
      top.append(name, amount);
      track.append(fill);
      item.append(top, track);
      return item;
    })
  );
}

export function renderSavings() {
  const goal = state.savings;
  if (document.activeElement !== savingsNameInput) savingsNameInput.value = goal.name;
  if (document.activeElement !== savingsTargetInput && goal.target > 0) {
    savingsTargetInput.value = goal.target.toFixed(2);
  }

  const month = today().slice(0, 7);
  const gross = grossLeft(month);
  const available = availableToSave(month);
  const percent = goal.target > 0 ? Math.min(100, Math.round((goal.saved / goal.target) * 100)) : 0;
  const goalLabel = goal.name || "your goal";

  savingsSavedEl.textContent = formatMoney(goal.saved);
  savingsLeftEl.textContent = `Money left in ${monthName(month)}: ${formatMoney(gross)}. Still available to add: ${formatMoney(available)}.`;
  addToSavingsButton.disabled = available <= 0;
  savingsFill.style.width = `${percent}%`;
  savingsTrack.setAttribute("aria-valuenow", String(percent));
  savingsTrack.setAttribute(
    "aria-valuetext",
    `${formatMoney(goal.saved)} of ${goal.target > 0 ? formatMoney(goal.target) : "the target"}`
  );
  savingsProgressText.textContent =
    goal.target > 0 && goal.saved >= goal.target ? `${goalLabel} reached` : `${percent}% of ${goalLabel}`;
}

function grossLeft(month) {
  const budget = state.budgets[month];
  if (typeof budget !== "number" || budget <= 0) return 0;
  return roundMoney(Math.max(0, budget - sumInMonth(state.spaces.home, month)));
}

function availableToSave(month) {
  const already = state.savings.appliedMonth === month ? state.savings.appliedAmount : 0;
  return roundMoney(Math.max(0, grossLeft(month) - already));
}

function clearSavingsInvalid() {
  [savingsNameInput, savingsTargetInput].forEach((field) => field.classList.remove("invalid"));
  savingsErrorEl.hidden = true;
}
