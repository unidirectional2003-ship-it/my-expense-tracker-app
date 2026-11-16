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

setRenderer(() => {
  syncPanels();
  if (session.space === "dashboard") {
    renderDashboard();
    return;
  }
  renderExpenses();
  renderSales();
  renderProfit();
  renderHomeSummary();
  renderSavings();
});

loadAll();
if (applyMonthlyRepeats()) saveSpaces();
prepareDashboard();
prepareExpenseForm();
prepareSalesForm();
prepareHome();
prepareBills();
bindExpenses();
bindReceipt();
bindSales();
bindHome();
bindBills();
bindDashboard();

tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchSpace(tab.dataset.space));
});

document.querySelector(".tabs").addEventListener("keydown", (event) => {
  const index = TAB_ORDER.indexOf(session.space);
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

render();

function switchSpace(name) {
  if (!TAB_ORDER.includes(name) || name === session.space) return;
  session.space = name;
  session.editingId = null;
  session.editingSaleId = null;
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
  dashboardPanel.hidden = !isDashboard;
  spaceContent.hidden = isDashboard;
  if (isDashboard) return;

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
