import { formatMoney } from "./money.js";
import { today, formatDate, recentMonths } from "./dates.js";
import { state, receiptPhotos } from "./store.js";
import {
  monthBusiness,
  sumInMonth,
  businessBalance,
  personalBalance,
  totalReceivable,
  openReceivables,
  upcomingBills,
  overdueBills,
  cashOf,
} from "./calc.js";
import { renderBills } from "./bills.js";
import { buildReceiptThumb } from "./receipt-thumb.js";
import { renderBriefing } from "./briefing.js";

const dashboardMonthInput = document.getElementById("dashboard-month");
const dashPersonalEl = document.getElementById("dash-personal-balance");
const dashBusinessEl = document.getElementById("dash-business-balance");
const dashEarnedEl = document.getElementById("dash-earned");
const dashExpensesEl = document.getElementById("dash-expenses");
const dashProfitEl = document.getElementById("dash-profit");
const dashSavingsEl = document.getElementById("dash-savings");
const dashSavingsMeta = document.getElementById("dash-savings-meta");
const dashOutstandingEl = document.getElementById("dash-outstanding");
const dashUpcomingEl = document.getElementById("dash-upcoming");
const dashUpcomingMeta = document.getElementById("dash-upcoming-meta");
const dashCashEl = document.getElementById("dash-cash");
const dashAdvancesEl = document.getElementById("dash-advances");
const dashSpendingEl = document.getElementById("dash-spending");
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
const outstandingList = document.getElementById("outstanding-list");
const outstandingEmpty = document.getElementById("outstanding-empty");

const dashCharts = {};
let chartDefaultsReady = false;

export function bindDashboard() {
  dashboardMonthInput.addEventListener("input", () => {
    if (document.querySelector(".app").dataset.space === "dashboard") renderDashboard();
  });
}

export function prepareDashboard() {
  dashboardMonthInput.value = today().slice(0, 7);
}

export function renderDashboard() {
  prepareChartDefaults();
  const month = /^\d{4}-\d{2}$/.test(dashboardMonthInput.value)
    ? dashboardMonthInput.value
    : today().slice(0, 7);
  renderBriefing(month);
  const todayValue = today();
  const figures = monthBusiness(state.sales, state.spaces.business, month);
  const homeSpent = sumInMonth(state.spaces.home, month);
  const spending = roundSum(homeSpent, figures.expenses);
  const balance = personalBalance(state.budgets, state.spaces.home, state.savings, month);
  const cashPosition = businessBalance(state.sales, state.spaces.business);
  const owed = totalReceivable(state.sales);
  const upcoming = upcomingBills(state.bills, month, todayValue);
  const upcomingTotal = roundSum(...upcoming.map((bill) => bill.amount));

  setPlain(dashEarnedEl, figures.earned);
  setPlain(dashCashEl, figures.cash);
  setPlain(dashAdvancesEl, figures.advances);
  setPlain(dashExpensesEl, figures.expenses);
  setPlain(dashSpendingEl, spending);
  setProfit(dashProfitEl, figures.profit);
  setProfit(dashBusinessEl, cashPosition);
  setPlain(dashOutstandingEl, owed);

  if (balance == null) {
    dashPersonalEl.textContent = "Set a home budget";
    dashPersonalEl.className = "dash-figure is-prompt";
  } else {
    setPlain(dashPersonalEl, balance);
  }

  if (!(state.savings.target > 0) && !(state.savings.saved > 0)) {
    dashSavingsEl.textContent = "Set a savings goal";
    dashSavingsEl.className = "dash-figure is-prompt";
    dashSavingsMeta.textContent = "Home summary, all time";
  } else {
    setPlain(dashSavingsEl, state.savings.saved);
    dashSavingsMeta.textContent = state.savings.name
      ? `${state.savings.name}, all time`
      : "All time, toward your goal";
  }

  setPlain(dashUpcomingEl, upcomingTotal);
  dashUpcomingMeta.textContent = upcoming.length
    ? `${upcoming.length} unpaid ${upcoming.length === 1 ? "bill" : "bills"} still due this month`
    : "Nothing due later this month";

  const months = recentMonths(month, 6);
  const incomeSeries = months.map((item) => monthBusiness(state.sales, state.spaces.business, item.key).earned);
  const profitSeries = months.map((item) => monthBusiness(state.sales, state.spaces.business, item.key).profit);
  const businessSeries = months.map((item) => sumInMonth(state.spaces.business, item.key));
  const homeSeries = months.map((item) => sumInMonth(state.spaces.home, item.key));
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
          barSet("Earned revenue", incomeSeries, "#8fbf78", "#5f9448"),
          barSet("Business expenses", businessSeries, "#f4b6c8", "#e9899f"),
          barSet("Home expenses", homeSeries, "#b7d3a0", "#7eae68"),
        ],
      },
      options: chartOptions({ scales: { x: labelScale(), y: moneyScale(false) } }),
    }
  );

  showChart(
    "split",
    dashSplitCanvas,
    dashSplitEmpty,
    spending > 0,
    "No spending this month yet.",
    {
      type: "doughnut",
      data: {
        labels: ["Home", "Business"],
        datasets: [
          {
            data: [homeSpent, figures.expenses],
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

  const trendHasSignal = [...incomeSeries, ...profitSeries].some((value) => value !== 0);
  showChart(
    "trend",
    dashTrendCanvas,
    dashTrendEmpty,
    trendHasSignal,
    "No earned revenue or profit in the last 6 months.",
    {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Earned revenue",
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
          {
            label: "Actual profit",
            data: profitSeries,
            borderColor: "#e9899f",
            backgroundColor: "#f4b6c8",
            pointBackgroundColor: "#fffbf5",
            pointBorderColor: "#3b3b3b",
            pointRadius: 5,
            pointHoverRadius: 6,
            borderWidth: 3,
            tension: 0.35,
            fill: false,
          },
        ],
      },
      options: chartOptions({
        scales: { x: labelScale(), y: moneyScale(profitSeries.some((value) => value < 0)) },
      }),
    }
  );

  const budget = state.budgets[month];
  const hasBudget = typeof budget === "number" && budget > 0;
  const budgetPercent = renderDashBudget(hasBudget, budget, homeSpent);
  renderOutstanding();
  renderBills(month);
  renderDashAlerts(month, budgetPercent, figures.profit, todayValue);
  renderDashActivity();
}

function roundSum(...values) {
  return Math.round((values.reduce((sum, value) => sum + Number(value), 0) + Number.EPSILON) * 100) / 100;
}

function setPlain(el, value) {
  el.textContent = formatMoney(value);
  el.className = "dash-figure";
}

function setProfit(el, value) {
  el.textContent = formatMoney(value);
  el.className = "dash-figure" + (value > 0 ? " is-positive" : value < 0 ? " is-negative" : "");
}

function renderOutstanding() {
  const rows = openReceivables(state.sales);
  outstandingList.replaceChildren(
    ...rows.map(({ sale, due }) => {
      const item = document.createElement("li");
      item.className = "expense is-business";
      const main = document.createElement("div");
      main.className = "expense-main";
      const top = document.createElement("div");
      top.className = "expense-top";
      const title = document.createElement("span");
      title.className = "category";
      title.textContent = sale.customer || "Sale";
      const amount = document.createElement("span");
      amount.className = "amount";
      amount.textContent = formatMoney(due);
      const meta = document.createElement("p");
      meta.className = "meta";
      meta.textContent = `${formatDate(sale.date)} · Paid ${formatMoney(cashOf(sale))} of ${formatMoney(sale.earnedAmount)} · ${sale.note}`;
      top.append(title, amount);
      main.append(top, meta);
      item.append(main);
      return item;
    })
  );
  outstandingEmpty.hidden = rows.length > 0;
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

function renderDashAlerts(month, budgetPercent, profit, todayValue) {
  const alerts = [];
  const overdue = overdueBills(state.bills, month, todayValue);
  const upcoming = upcomingBills(state.bills, month, todayValue);
  if (overdue.length) {
    const total = roundSum(...overdue.map((bill) => bill.amount));
    const noun = overdue.length === 1 ? "overdue bill" : "overdue bills";
    alerts.push(`${overdue.length} ${noun}, ${formatMoney(total)} still to pay.`);
  }
  if (upcoming.length) {
    const total = roundSum(...upcoming.map((bill) => bill.amount));
    const noun = upcoming.length === 1 ? "upcoming bill" : "upcoming bills";
    alerts.push(`${upcoming.length} ${noun}, ${formatMoney(total)} due this month.`);
  }
  if (budgetPercent != null && budgetPercent > 80) alerts.push("Home spending is above 80% of the budget.");
  if (profit < 0) alerts.push("Business profit is below zero this month. Advances are not included.");

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
      meta.textContent = `${formatDate(row.date)} · ${row.detail}`;
      title.append(tag, name);
      top.append(title, amount);
      main.append(top, meta);
      const thumb = buildReceiptThumb(row, row.space);
      if (thumb) {
        item.classList.add("has-receipt");
        item.append(thumb);
      }
      item.append(main);
      return item;
    })
  );
  dashActivityEmpty.hidden = rows.length > 0;
}

function expenseDetail(expense) {
  if (expense.merchant && expense.merchant !== expense.note) {
    return `${expense.merchant} · ${expense.note}`;
  }
  return expense.note;
}

function recentEntries() {
  const photos = receiptPhotos();
  const rows = [];
  state.spaces.home.forEach((expense, index) => {
    rows.push({
      space: "home",
      date: expense.date,
      title: expense.subcategory ? `${expense.category} · ${expense.subcategory}` : expense.category,
      detail: expenseDetail(expense),
      amount: expense.amount,
      id: expense.id,
      receiptId: expense.receiptId || "",
      receipt: (expense.receiptId && photos[expense.receiptId]) || expense.receipt || "",
      note: expense.note,
      index,
    });
  });
  state.spaces.business.forEach((expense, index) => {
    rows.push({
      space: "business",
      date: expense.date,
      title: expense.subcategory ? `${expense.category} · ${expense.subcategory}` : expense.category,
      detail: expenseDetail(expense),
      amount: expense.amount,
      id: expense.id,
      receiptId: expense.receiptId || "",
      receipt: (expense.receiptId && photos[expense.receiptId]) || expense.receipt || "",
      note: expense.note,
      index,
    });
  });
  state.sales.forEach((sale, index) => {
    const advance = sale.kind === "advance";
    rows.push({
      space: "business",
      date: sale.date,
      title: sale.customer || (advance ? "Advance" : "Sale"),
      detail: advance ? `Advance · not profit · ${sale.note}` : `Earned revenue · ${sale.note}`,
      amount: sale.amount,
      index,
    });
  });
  rows.sort((a, b) => b.date.localeCompare(a.date) || a.index - b.index);
  return rows;
}

function topCategories(month) {
  const totals = new Map();
  const add = (space, expense) => {
    if (!expense.date || expense.date.slice(0, 7) !== month) return;
    const label = expense.subcategory
      ? `${space === "home" ? "Home" : "Business"} · ${expense.category} · ${expense.subcategory}`
      : `${space === "home" ? "Home" : "Business"} · ${expense.category}`;
    totals.set(label, (totals.get(label) || 0) + expense.amount);
  };
  state.spaces.home.forEach((expense) => add("home", expense));
  state.spaces.business.forEach((expense) => add("business", expense));
  const rows = [...totals.entries()]
    .map(([label, amount]) => ({ label, amount: roundSum(amount) }))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));
  const top = rows.slice(0, 5);
  const rest = roundSum(...rows.slice(5).map((row) => row.amount));
  if (rest > 0) top.push({ label: "Other", amount: rest });
  return top;
}

function seriesHasMoney(...series) {
  return series.some((values) => values.some((value) => value > 0));
}

function barSet(label, data, backgroundColor, borderColor) {
  return { label, data, backgroundColor, borderColor, borderWidth: 2, borderRadius: 8, maxBarThickness: 26 };
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
      labels: { color: "#3b3b3b", boxWidth: 14, padding: 12, font: { size: 13, weight: "700" } },
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
  return { responsive: true, maintainAspectRatio: false, plugins: chartPlugins(), ...extra };
}

function labelScale() {
  return {
    ticks: { color: "#3b3b3b", maxRotation: 0, autoSkip: true, font: { size: 12, weight: "700" } },
    grid: { display: false },
  };
}

function moneyScale(allowNegative) {
  return {
    beginAtZero: !allowNegative,
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
