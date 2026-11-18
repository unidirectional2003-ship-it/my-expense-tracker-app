import { formatMoney } from "./money.js";
import { today } from "./dates.js";
import { state } from "./store.js";
import { get } from "./storage.js";
import { goTo } from "./router.js";
import {
  snapshotFromData,
  buildInsights,
  ruleSummary,
  explainMonth,
  readAiEndpoint,
} from "./insights.js";

let bound = false;
let explainToken = 0;

export function renderBriefing(month) {
  const goodEl = document.getElementById("good-news");
  const badEl = document.getElementById("bad-news");
  const quickEl = document.getElementById("quick-numbers");
  if (!goodEl || !badEl || !quickEl || !/^\d{4}-\d{2}$/.test(month || "")) return;
  if (!bound) {
    bindBriefing();
    bound = true;
  }

  const snapshot = currentSnapshot(month);
  const insights = buildInsights(snapshot);
  fillNews(goodEl, insights.good, "Nothing good to report for this month yet.");
  fillNews(badEl, insights.bad, "No bad news for this month.");
  fillQuick(quickEl, snapshot);

  const summary = document.getElementById("month-summary");
  if (summary && !summary.hidden && summary.dataset.source !== "endpoint") {
    summary.textContent = ruleSummary(snapshot);
    summary.dataset.month = month;
    summary.dataset.source = "rules";
  } else if (summary && summary.dataset.source === "endpoint" && summary.dataset.month !== month) {
    summary.hidden = true;
    summary.textContent = "";
    delete summary.dataset.source;
  }
}

function bindBriefing() {
  const root = document.getElementById("home-briefing");
  if (!root) return;
  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-screen]");
    if (!button || !root.contains(button)) return;
    const params = {};
    if (button.dataset.month) params.month = button.dataset.month;
    if (button.dataset.space) params.space = button.dataset.space;
    goTo(button.dataset.screen, params);
  });

  const explain = document.getElementById("explain-month");
  if (!explain) return;
  explain.addEventListener("click", () => {
    const monthInput = document.getElementById("dashboard-month");
    const month = monthInput && /^\d{4}-\d{2}$/.test(monthInput.value) ? monthInput.value : today().slice(0, 7);
    const snapshot = currentSnapshot(month);
    const summary = document.getElementById("month-summary");
    const token = ++explainToken;
    summary.hidden = false;
    summary.dataset.month = month;
    if (!snapshot.aiEndpoint) {
      summary.dataset.source = "rules";
      summary.textContent = ruleSummary(snapshot);
      return;
    }
    summary.dataset.source = "pending";
    summary.textContent = "Asking your explanation service.";
    explain.disabled = true;
    explainMonth(snapshot).then((result) => {
      if (token !== explainToken) return;
      explain.disabled = false;
      summary.dataset.source = result.source === "endpoint" ? "endpoint" : "rules";
      summary.textContent = result.note ? `${result.text} ${result.note}` : result.text;
    });
  });
}

function currentSnapshot(month) {
  const ordersRead = readList("orders");
  const ordersKnown = ordersRead.ok;
  const orders = ordersRead.rows;
  const storedAlerts = readList("alerts").rows;
  const pending = readList("pendingApprovals").rows;
  const settings = readList("settings").rows;
  return snapshotFromData({
    month,
    today: today(),
    sales: state.sales,
    homeExpenses: state.spaces.home,
    businessExpenses: state.spaces.business,
    budgets: state.budgets,
    categoryBudgets: state.categoryBudgets || {},
    savings: state.savings,
    bills: state.bills,
    orders,
    ordersKnown,
    storedAlerts: [...(Array.isArray(state.alerts) ? state.alerts : []), ...storedAlerts],
    pendingApprovals: [...(Array.isArray(state.pendingApprovals) ? state.pendingApprovals : []), ...pending],
    aiEndpoint: readAiEndpoint(settings),
  });
}

function readList(name) {
  try {
    const rows = get(name);
    return { ok: true, rows: Array.isArray(rows) ? rows : [] };
  } catch {
    return { ok: false, rows: [] };
  }
}

function fillNews(host, items, emptyText) {
  host.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = emptyText;
    host.append(empty);
    return;
  }
  const list = document.createElement("div");
  list.className = "news-list";
  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = item.type === "good" ? "news-card news-card-good" : "news-card news-card-bad";
    button.dataset.screen = item.screen;
    button.dataset.month = item.month;
    if (item.space) button.dataset.space = item.space;
    button.textContent = item.text;
    list.append(button);
  });
  host.append(list);
}

function fillQuick(host, snapshot) {
  const cards = [
    {
      label: "Income",
      meta: "Earned revenue",
      value: formatMoney(snapshot.income),
      tone: "dash-card-income",
      screen: "reports",
    },
    {
      label: "Expenses",
      meta: "Home and business",
      value: formatMoney(snapshot.totalSpending),
      tone: "dash-card-spending",
      screen: "expenses",
    },
    {
      label: "Profit",
      meta: "Earned income minus business expenses",
      value: formatMoney(snapshot.profit),
      tone: "dash-card-profit",
      figure: snapshot.profit > 0 ? "is-positive" : snapshot.profit < 0 ? "is-negative" : "",
      screen: "reports",
    },
    {
      label: "Pending approvals",
      meta:
        snapshot.pendingApprovals === 0
          ? "None waiting"
          : snapshot.pendingApprovals === 1
            ? "1 is waiting"
            : `${snapshot.pendingApprovals} are waiting`,
      value: String(snapshot.pendingApprovals),
      tone: "dash-card-left",
      screen: "approvals",
    },
    {
      label: "Open alerts",
      meta: `${snapshot.savedAlerts} saved, ${snapshot.warnings} warnings`,
      value: String(snapshot.openAlerts),
      tone: snapshot.openAlerts > 0 ? "dash-card-spending" : "dash-card-income",
      screen: "alerts",
    },
  ];
  host.replaceChildren(
    ...cards.map((card) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `dash-card quick-card ${card.tone}`;
      button.dataset.screen = card.screen;
      button.dataset.month = snapshot.month;
      const label = document.createElement("p");
      label.className = "summary-label";
      label.textContent = card.label;
      const meta = document.createElement("p");
      meta.className = "meta";
      meta.textContent = card.meta;
      const figure = document.createElement("p");
      figure.className = card.figure ? `dash-figure ${card.figure}` : "dash-figure";
      figure.textContent = card.value;
      button.append(label, meta, figure);
      return button;
    })
  );
}
