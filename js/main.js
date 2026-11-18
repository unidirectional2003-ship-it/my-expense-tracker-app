import { TAB_ORDER, SPACES } from "./spaces.js";
import { session } from "./session.js";
import { setRenderer, render } from "./render.js";
import { loadAll, saveSpaces } from "./store.js";
import {
  bindExpenses,
  prepareExpenseForm,
  fillCategories,
  fillFilterCategories,
  renderExpenses,
  applyMonthlyRepeats,
} from "./expenses.js";
import { bindSales, prepareSalesForm, renderSales, renderProfit } from "./sales.js";
import { bindHome, prepareHome, renderHomeSummary, renderSavings } from "./home.js";
import { bindBills, prepareBills } from "./bills.js";
import { bindDashboard, prepareDashboard, renderDashboard } from "./dashboard.js";
import { bindReceipt } from "./receipt.js";
import { bindSpend, syncSpend, registerSpendScreens } from "./spend.js";
import { applyMonthlyGroceryDraft } from "./grocery.js";
import { initStorage } from "./storage.js";
import { goTo, registerScreen, startRouter } from "./router.js";
import { initNav } from "./nav.js";
import { registerPlaceholders } from "./placeholders.js";
import { registerOrders } from "./orders.js";
import { registerWork } from "./work.js";
import { bindChecklist, prepareChecklist, renderChecklist, registerChecklistScreen } from "./checklist.js";
import { registerApprovals, syncAutoApprovals, updateApprovalsBadge } from "./approvals.js";
import { registerBudgets } from "./budgets.js";
import { registerAlerts, refreshAlerts } from "./alerts.js";
import { bootLock } from "./lock.js";
const app = document.querySelector(".app");
const tabs = [...document.querySelectorAll(".tab")];
const panel = document.getElementById("space-panel");
const businessViews = document.getElementById("business-views");
const homeViews = document.getElementById("home-views");
const dashboardPanel = document.getElementById("dashboard-panel");
const spaceContent = document.getElementById("space-content");
const homeSummaryPanel = document.getElementById("home-summary-panel");
const savingsSection = document.getElementById("savings-section");
const searchInput = document.getElementById("search");
const categoryInput = document.getElementById("category");
const checklistTab = document.getElementById("tab-checklist");

setRenderer(() => {
  syncAutoApprovals();
  updateApprovalsBadge();
  syncPanels();
  refreshAlerts();
  if (session.space === "checklist" && document.getElementById("checklist-panel")) {
    renderChecklist();
    syncSpend();
    return;
  }
  if (session.space === "dashboard") {
    renderDashboard();
    syncSpend();
    return;
  }
  renderExpenses();
  renderSales();
  renderProfit();
  renderHomeSummary();
  renderSavings();
  syncSpend();
});

bindExpenses();
bindReceipt();
bindSales();
bindHome();
bindBills();
bindDashboard();
bindSpend({
  showSpace(name) {
    if (name === "home") session.homeView = "expenses";
    if (name === "business") session.businessView = "expenses";
    if (session.space !== name) switchSpace(name);
    else render();
  },
});
if (document.getElementById("checklist-panel")) {
bindChecklist();
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchSpace(tab.dataset.space));
});

if (checklistTab) checklistTab.addEventListener("click", openChecklist);

registerScreen("home", {
  show() {
    if (session.space === "checklist") {
      session.space = "dashboard";
      app.dataset.space = "dashboard";
    }
    render();
  },
});
registerScreen("checklist", {
  show() {
    session.space = "checklist";
    app.dataset.space = "checklist";
    render();
  },
});
registerPlaceholders();
registerChecklistScreen();
registerSpendScreens();
registerOrders();
registerWork();
registerApprovals();
registerLinkedScreens();
registerBudgets();
registerAlerts();
initNav();

app.hidden = true;
app.inert = true;

function registerLinkedScreens() {
  registerScreen("settings", {
    show() {
      goTo("home", {}, { replace: true });
      document.getElementById("open-settings")?.click();
    },
  });
  registerScreen("reports", {
    show() {
      openHomePlace("dashboard", "dash-bars-heading");
    },
  });
}

function openHomePlace(spaceName, headingId) {
  goTo("home", {}, { replace: true });
  if (session.space !== spaceName) switchSpace(spaceName);
  else if (spaceName === "home") render();
  const heading = document.getElementById(headingId);
  if (heading) heading.scrollIntoView({ block: "start" });
}

let prepared = false;

bootLock({
  onUnlock() {
    app.hidden = false;
    app.inert = false;
    initStorage();
    loadAll();
    if (applyMonthlyRepeats()) saveSpaces();
    applyMonthlyGroceryDraft();
    syncAutoApprovals();
    updateApprovalsBadge();
    if (!prepared) {
      prepareDashboard();
      prepareExpenseForm();
      prepareSalesForm();
      prepareHome();
      prepareBills();
      if (document.getElementById("checklist-panel")) prepareChecklist();
      prepared = true;
    }
    render();
    startRouter();
  },
  onLock() {
    app.hidden = true;
    app.inert = true;
  },
});

document.querySelector(".tabs").addEventListener("keydown", (event) => {
  const index = TAB_ORDER.indexOf(session.space);
  if (index < 0) return;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") {
    event.preventDefault();
    switchSpace(TAB_ORDER[(index + 1) % TAB_ORDER.length]);
  } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
    event.preventDefault();
    switchSpace(TAB_ORDER[(index - 1 + TAB_ORDER.length) % TAB_ORDER.length]);
  }
});

businessViews.addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button || session.space !== "business") return;
  session.businessView = button.dataset.view;
  session.editingSaleId = null;
  render();
});

homeViews.addEventListener("click", (event) => {
  const button = event.target.closest("[data-home-view]");
  if (!button || session.space !== "home") return;
  session.homeView = button.dataset.homeView;
  session.editingId = null;
  render();
});

function openChecklist() {
  goTo("checklist");
}

function switchSpace(name) {
  if (!TAB_ORDER.includes(name) || name === session.space) return;
  const homeScreen = document.getElementById("screen-home");
  if (homeScreen) homeScreen.hidden = false;
  session.space = name;
  session.editingId = null;
  session.editingSaleId = null;
  session.checklistView = "list";
  session.checklistItemId = null;
  app.dataset.space = name;

  tabs.forEach((tab) => {
    const active = tab.dataset.space === name;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active) panel.setAttribute("aria-labelledby", tab.id);
  });

  if (name === "dashboard") {
    render();
    return;
  }

  const previousCategory = categoryInput.value;
  fillCategories();
  if (SPACES[name].categories.includes(previousCategory)) categoryInput.value = previousCategory;
  searchInput.value = "";
  fillFilterCategories();
  render();
}

function syncPanels() {
  const isDashboard = session.space === "dashboard";
  const isChecklist = session.space === "checklist";
  dashboardPanel.hidden = !isDashboard;
  spaceContent.hidden = isDashboard || isChecklist;
  const checklistPanel = document.getElementById("checklist-panel");
  if (checklistPanel) checklistPanel.hidden = !isChecklist;
  const homeScreen = document.getElementById("screen-home");
  if (homeScreen && isChecklist) homeScreen.hidden = true;
  const checklistActive = isChecklist;
  if (checklistTab) {
    checklistTab.classList.toggle("is-active", checklistActive);
    checklistTab.setAttribute("aria-selected", String(checklistActive));
  }
  if (isChecklist) {
    tabs.forEach((tab) => {
      tab.classList.remove("is-active");
      tab.setAttribute("aria-selected", "false");
      tab.tabIndex = -1;
    });
    panel.setAttribute("aria-labelledby", "checklist-heading");
    return;
  }

  const isBusiness = session.space === "business";
  const showHomeExpenses = !isBusiness && session.homeView === "expenses";
  businessViews.hidden = !isBusiness;
  homeViews.hidden = isBusiness;

  businessViews.querySelectorAll("[data-view]").forEach((button) => {
    const active = isBusiness && button.dataset.view === session.businessView;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });

  homeViews.querySelectorAll("[data-home-view]").forEach((button) => {
    const active = !isBusiness && button.dataset.homeView === session.homeView;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });

  document.querySelectorAll("[data-panel]").forEach((section) => {
    if (section.dataset.panel === "expenses") {
      section.hidden = isBusiness ? session.businessView !== "expenses" : !showHomeExpenses;
      return;
    }
    section.hidden = !isBusiness || section.dataset.panel !== session.businessView;
  });

  const showSummary = !isBusiness && session.homeView === "summary";
  homeSummaryPanel.hidden = !showSummary;
  savingsSection.hidden = !showSummary;
}
