import { formatMoney, roundMoney } from "./money.js";
import { today, formatDate, addDays } from "./dates.js";
import { get, save, update, deleteRecord } from "./storage.js";
import { goTo, currentScreen, ensureScreen, registerScreen } from "./router.js";
import { budgetSnapshot } from "./budgets.js";
import { getOverdueChecklistItems } from "./checklist.js";
import { balanceOf } from "./order-book.js";
import { deliveryProblems } from "./delivery.js";
import { listUdhaar, remainingOf } from "./udhaar-book.js";
import { refreshBadges } from "./nav.js";
import { billAlertPlans, loadBillBook } from "./bill-book.js";
import { reconcileProblems } from "./accounts.js";

let openList;
let historyList;
let openEmpty;
let historyEmpty;
let wired = false;

function budgetProblems(todayValue) {
  const month = todayValue.slice(0, 7);
  return budgetSnapshot(month)
    .filter((row) => row.limit > 0 && row.shown != null && row.shown >= 80)
    .map((row) => {
      const over = row.shown > 100;
      return {
        id: `budget:${month}:${row.category}`,
        title: over ? `${row.category} exceeded limit` : `${row.category} passed 80%`,
        message: over
          ? `${row.category} is over its limit by ${formatMoney(roundMoney(row.spent - row.limit))} (${formatMoney(row.spent)} of ${formatMoney(row.limit)}).`
          : `${row.category} spending is at ${row.shown}% of its limit (${formatMoney(row.spent)} of ${formatMoney(row.limit)}).`,
        severity: over ? "danger" : "warning",
        screen: "budgets",
        params: { category: row.category, month },
      };
    });
}

function checklistProblems(todayValue) {
  return getOverdueChecklistItems(todayValue).map((item) => ({
    id: `checklist:${item.id}`,
    title: "Overdue checklist",
    message: `${item.name} was due ${formatDate(item.dueDate)} and is still open.`,
    severity: "danger",
    screen: "checklist",
    params: { id: item.id, month: item.month },
  }));
}

function orderProblems(todayValue) {
  return get("orders")
    .filter((order) => {
      if (!order || order.status === "Cancelled") return false;
      const due = typeof order.deliveryDate === "string" ? order.deliveryDate.slice(0, 10) : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || due >= todayValue) return false;
      return balanceOf(order) > 0;
    })
    .map((order) => ({
      id: `order:${order.id}`,
      title: "Late order",
      message: `${order.customerName || "An order"} still has ${formatMoney(balanceOf(order))} unpaid after ${formatDate(order.deliveryDate)}.`,
      severity: "danger",
      screen: "orders",
      params: { id: order.id },
    }));
}

function udhaarProblems(todayValue) {
  return listUdhaar()
    .filter((entry) => {
      const due = typeof entry.dueDate === "string" ? entry.dueDate : "";
      return /^\d{4}-\d{2}-\d{2}$/.test(due) && due < todayValue && remainingOf(entry) > 0;
    })
    .map((entry) => {
      const remaining = remainingOf(entry);
      const theyOwe = entry.direction !== "payable";
      return {
        id: `udhaar:${entry.id}`,
        title: "Udhaar overdue",
        message: theyOwe
          ? `${entry.person} still owes ${formatMoney(remaining)}. Promised by ${formatDate(entry.dueDate)}.`
          : `You still owe ${entry.person} ${formatMoney(remaining)}. Promised by ${formatDate(entry.dueDate)}.`,
        severity: "danger",
        screen: "udhaar",
        params: { id: entry.id, tab: theyOwe ? "receivable" : "payable" },
      };
    });
}

function workProblems(todayValue) {
  const orders = get("orders");
  return get("workItems")
    .filter((item) => {
      if (!item || item.status === "Delivered") return false;
      const order = orders.find((row) => row.id === item.orderId);
      if (!order || order.status === "Cancelled" || order.status === "Fulfilled") return false;
      const due = typeof (order.deliveryDate || item.dueDate) === "string" ? (order.deliveryDate || item.dueDate).slice(0, 10) : "";
      return /^\d{4}-\d{2}-\d{2}$/.test(due) && due < todayValue;
    })
    .map((item) => {
      const order = orders.find((row) => row.id === item.orderId);
      const due = (order.deliveryDate || item.dueDate).slice(0, 10);
      const name = order ? `${order.customerName || "Work"} · #${order.orderNumber}` : "Work item";
      return {
        id: `work:${item.id}`,
        title: "Work item overdue",
        message: `${name} was due ${formatDate(due)} and is still ${item.status}.`,
        severity: "danger",
        screen: "work",
        params: { id: item.id },
      };
    });
}

function sameRecord(prev, next) {
  return (
    prev.title === next.title &&
    prev.message === next.message &&
    prev.severity === next.severity &&
    prev.screen === next.screen &&
    prev.status === next.status &&
    (prev.snoozeUntil || "") === (next.snoozeUntil || "") &&
    JSON.stringify(prev.params || {}) === JSON.stringify(next.params || {})
  );
}

export function syncAlerts(todayValue = today()) {
  const problems = [
    ...budgetProblems(todayValue),
    ...checklistProblems(todayValue),
    ...orderProblems(todayValue),
    ...udhaarProblems(todayValue),
    ...workProblems(todayValue),
    ...reconcileProblems(),
    ...billAlertPlans(loadBillBook().scans, todayValue),
  ];
  const existing = get("alerts");
  const seen = new Set();
  problems.forEach((problem) => {
    seen.add(problem.id);
    const prev = existing.find((row) => row.id === problem.id);
    if (!prev) {
      save("alerts", {
        ...problem,
        status: "open",
        snoozeUntil: "",
        resolvedAt: "",
      });
      return;
    }
    let status = prev.status || "open";
    let snoozeUntil = prev.snoozeUntil || "";
    if ((status === "snoozed" || status === "ignored") && (!snoozeUntil || snoozeUntil <= todayValue)) {
      status = "open";
      snoozeUntil = "";
    }
    const next = {
      ...prev,
      title: problem.title,
      message: problem.message,
      severity: problem.severity,
      screen: problem.screen,
      params: problem.params,
      status,
      snoozeUntil,
    };
    if (!sameRecord(prev, next)) save("alerts", next);
  });
  existing.forEach((row) => {
    if (seen.has(row.id) || row.status === "resolved") return;
    if (String(row.id).startsWith("bill-scan:")) {
      save("alerts", { ...row, status: "resolved", resolvedAt: todayValue });
      return;
    }
    deleteRecord("alerts", row.id);
  });
}

export function isAlertVisible(alert, todayValue = today()) {
  const status = String(alert.status || "open").toLowerCase();
  if (status === "resolved") return false;
  if ((status === "snoozed" || status === "ignored") && alert.snoozeUntil > todayValue) return false;
  return true;
}

function visibleAlerts() {
  return get("alerts")
    .filter((alert) => isAlertVisible(alert))
    .sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "danger" ? -1 : 1;
      return String(a.title).localeCompare(String(b.title));
    });
}

function historyAlerts() {
  return get("alerts")
    .filter((alert) => alert.status === "resolved")
    .sort((a, b) => String(b.resolvedAt || "").localeCompare(String(a.resolvedAt || "")));
}

function severityLabel(severity) {
  return severity === "danger" ? "Danger" : "Warning";
}

function alertCard(alert, { history = false } = {}) {
  const card = document.createElement("article");
  card.className = `notice notice-${alert.severity === "danger" ? "danger" : "warning"}`;
  card.dataset.alertId = alert.id;
  const open = document.createElement("button");
  open.type = "button";
  open.className = "notice-body";
  open.dataset.alertOpen = alert.id;
  const severity = document.createElement("span");
  severity.className = "notice-severity";
  severity.textContent = severityLabel(alert.severity);
  const title = document.createElement("span");
  title.className = "notice-title";
  title.textContent = alert.title;
  const message = document.createElement("span");
  message.className = "notice-message";
  message.textContent = alert.message;
  open.append(severity, title, message);
  card.append(open);
  if (!history) {
    const actions = document.createElement("div");
    actions.className = "notice-actions";
    const ignore = document.createElement("button");
    ignore.type = "button";
    ignore.className = "edit-cancel";
    ignore.dataset.alertIgnore = alert.id;
    ignore.textContent = "Ignore";
    const resolve = document.createElement("button");
    resolve.type = "button";
    resolve.className = "primary";
    resolve.dataset.alertResolve = alert.id;
    resolve.textContent = "Resolve";
    actions.append(ignore, resolve);
    card.append(actions);
  }
  return card;
}

function paintLists() {
  const open = visibleAlerts();
  const past = historyAlerts();
  if (openList) {
    openList.replaceChildren(...open.map((alert) => alertCard(alert)));
    if (openEmpty) openEmpty.hidden = open.length > 0;
  }
  if (historyList) {
    historyList.replaceChildren(...past.map((alert) => alertCard(alert, { history: true })));
    if (historyEmpty) historyEmpty.hidden = past.length > 0;
  }
}

function paintBanner() {
  let banner = document.getElementById("alert-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "alert-banner";
    banner.className = "alert-banner alert-popup";
    banner.setAttribute("aria-live", "polite");
    const main = document.querySelector("main.app");
    if (main) main.prepend(banner);
  }
  const onAlerts = currentScreen().name === "alerts";
  const open = onAlerts ? [] : visibleAlerts();
  banner.hidden = open.length === 0;
  banner.replaceChildren(...open.map((alert) => alertCard(alert)));
}

export function refreshAlerts() {
  syncAlerts();
  paintBanner();
  paintLists();
  refreshBadges();
}

function ignoreAlert(id) {
  update("alerts", id, { status: "snoozed", snoozeUntil: addDays(today(), 1) });
  refreshAlerts();
}

function resolveAlert(id) {
  update("alerts", id, {
    status: "resolved",
    snoozeUntil: "",
    resolvedAt: new Date().toISOString(),
  });
  refreshAlerts();
}

function reveal(alert) {
  const id = alert.params && alert.params.id;
  const category = alert.params && alert.params.category;
  requestAnimationFrame(() => {
    let node = null;
    if (category) {
      node = [...document.querySelectorAll("[data-budget-category]")].find(
        (row) => row.getAttribute("data-budget-category") === category
      );
    } else if (id && alert.screen === "orders") {
      node = document.querySelector(`[data-order-id="${CSS.escape(id)}"]`);
    } else if (id && alert.screen === "work") {
      node = document.querySelector(`[data-work-id="${CSS.escape(id)}"]`);
    } else if (id && alert.screen === "deliveries") {
      node = document.querySelector(`[data-screen="deliveries"] [data-delivery-id="${CSS.escape(id)}"]`);
    } else if (id && alert.screen === "udhaar") {
      node = document.querySelector(`[data-udhaar-id="${CSS.escape(id)}"]`);
    }
    if (node) node.scrollIntoView({ block: "nearest" });
  });
}

function onClick(event) {
  const ignore = event.target.closest("[data-alert-ignore]");
  if (ignore) {
    event.preventDefault();
    ignoreAlert(ignore.getAttribute("data-alert-ignore"));
    return;
  }
  const resolve = event.target.closest("[data-alert-resolve]");
  if (resolve) {
    event.preventDefault();
    resolveAlert(resolve.getAttribute("data-alert-resolve"));
    return;
  }
  const open = event.target.closest("[data-alert-open]");
  if (!open) return;
  const alert = get("alerts").find((item) => item.id === open.getAttribute("data-alert-open"));
  if (!alert) return;
  goTo(alert.screen, alert.params || {});
  reveal(alert);
}

export function registerAlerts() {
  const screen = ensureScreen("alerts");
  const wrap = document.createElement("div");
  wrap.className = "screen-sheet";
  const intro = document.createElement("header");
  intro.className = "intro";
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Alerts";
  const heading = document.createElement("h1");
  heading.textContent = "What needs attention";
  intro.append(eyebrow, heading);

  const sheet = document.createElement("div");
  sheet.className = "sheet";
  const help = document.createElement("p");
  help.className = "meta";
  help.textContent = "Ignore hides an alert until tomorrow. Resolve moves it to history. Tap the words to open the related screen.";
  const openHeading = document.createElement("h2");
  openHeading.className = "subhead";
  openHeading.textContent = "Open";
  openList = document.createElement("div");
  openList.className = "alert-stack";
  openEmpty = document.createElement("p");
  openEmpty.className = "empty";
  openEmpty.textContent = "No alerts right now.";
  const historyHeading = document.createElement("h2");
  historyHeading.className = "subhead";
  historyHeading.textContent = "History";
  historyList = document.createElement("div");
  historyList.className = "alert-stack";
  historyEmpty = document.createElement("p");
  historyEmpty.className = "empty";
  historyEmpty.textContent = "Resolved alerts will show up here.";
  sheet.append(help, openHeading, openList, openEmpty, historyHeading, historyList, historyEmpty);
  wrap.append(intro, sheet);
  screen.replaceChildren(wrap);

  if (!wired) {
    document.addEventListener("click", onClick);
    document.addEventListener("budgets-saved", () => refreshAlerts());
    wired = true;
  }

  registerScreen("alerts", {
    show() {
      refreshAlerts();
    },
  });
}
