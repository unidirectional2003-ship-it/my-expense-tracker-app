import { today } from "./dates.js";
import { get, onStorageChange } from "./storage.js";
import { goTo, onRoute } from "./router.js";

export const MENU = [
  { screen: "home", label: "Home", tab: true },
  { screen: "accounts", label: "Accounts" },
  { screen: "approvals", label: "Pending Approvals", tabLabel: "Pending Approvals", tab: true, badge: "approvals" },
  { screen: "orders", label: "Orders", tab: true },
  { screen: "udhaar", label: "Udhaar" },
  { screen: "work", label: "Work", tab: true },
  { screen: "expenses", label: "Expenses", tab: true },
  { screen: "groceries", label: "Groceries" },
  { screen: "beauty", label: "Beauty" },
  { screen: "clothing", label: "Clothing" },
  { screen: "household", label: "Household" },
  { screen: "bills", label: "Bills" },
  { screen: "supplies", label: "Business Supplies" },
  { screen: "other", label: "Other" },
  { screen: "checklist", label: "Checklist", tab: true },
  { screen: "alerts", label: "Alerts", tab: true, badge: "alerts" },
  { screen: "budgets", label: "Budgets" },
  { screen: "reports", label: "Reports" },
  { screen: "settings", label: "Settings" },
];

const CLOSED = new Set(["done", "resolved", "dismissed", "read", "approved", "rejected"]);
const phoneQuery = window.matchMedia("(max-width: 700px)");

function waitingCount(collection) {
  return get(collection).filter((item) => {
    const status = String(item.status || "waiting").toLowerCase();
    return !CLOSED.has(status);
  }).length;
}

function alertCount() {
  const todayValue = today();
  return get("alerts").filter((item) => {
    const status = String(item.status || "open").toLowerCase();
    if (CLOSED.has(status) || status === "resolved") return false;
    if (item.snoozeUntil && item.snoozeUntil > todayValue && (status === "snoozed" || status === "ignored")) {
      return false;
    }
    return true;
  }).length;
}

function badgeCounts() {
  return {
    approvals: waitingCount("pendingApprovals"),
    alerts: alertCount(),
  };
}

function applyBadge(node, count) {
  if (!count) {
    node.hidden = true;
    node.textContent = "";
    return;
  }
  node.hidden = false;
  node.textContent = count > 99 ? "99+" : String(count);
}

export function refreshBadges() {
  const counts = badgeCounts();
  document.querySelectorAll("[data-badge]").forEach((node) => {
    applyBadge(node, counts[node.dataset.badge] || 0);
  });
}

function makeButton(item, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.go = item.screen;
  button.textContent = label;
  if (item.badge) {
    const badge = document.createElement("span");
    badge.className = "nav-badge";
    badge.dataset.badge = item.badge;
    badge.hidden = true;
    button.append(badge);
  }
  button.addEventListener("click", () => goTo(item.screen));
  return button;
}

function syncMenu(open) {
  const nav = document.getElementById("main-nav");
  const button = document.getElementById("menu-button");
  const mobile = phoneQuery.matches;
  const shown = !mobile || open;
  nav.classList.toggle("is-open", shown && mobile);
  button.setAttribute("aria-expanded", mobile && shown ? "true" : "false");
  if (mobile && !shown) nav.setAttribute("aria-hidden", "true");
  else nav.removeAttribute("aria-hidden");
}

export function initNav() {
  const top = document.getElementById("main-nav");
  const bottom = document.getElementById("tabbar");
  const menuButton = document.getElementById("menu-button");
  const menuBadge = document.createElement("span");
  menuBadge.className = "nav-badge";
  menuBadge.dataset.badge = "alerts";
  menuBadge.hidden = true;
  menuButton.append(menuBadge);

  MENU.forEach((item) => top.append(makeButton(item, item.label)));
  MENU.filter((item) => item.tab).forEach((item) => {
    bottom.append(makeButton(item, item.tabLabel || item.label));
  });

  menuButton.addEventListener("click", () => {
    const open = menuButton.getAttribute("aria-expanded") === "true";
    syncMenu(!open);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") syncMenu(false);
  });

  phoneQuery.addEventListener("change", () => syncMenu(false));
  onRoute((name) => {
    document.querySelectorAll("[data-go]").forEach((button) => {
      const active = button.dataset.go === name;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    syncMenu(false);
    refreshBadges();
  });
  onStorageChange(refreshBadges);
  syncMenu(false);
  refreshBadges();
}
