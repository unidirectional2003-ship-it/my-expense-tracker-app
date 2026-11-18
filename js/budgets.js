import { parseMoney, formatMoney, roundMoney } from "./money.js";
import { today, inMonth } from "./dates.js";
import { state } from "./store.js";
import { ensureScreen, registerScreen } from "./router.js";
import { get, save, deleteRecord } from "./storage.js";

export const BUDGET_CATEGORIES = [
  "Groceries",
  "Beauty",
  "Clothing",
  "Household",
  "Business Supplies",
  "Total",
];

const limits = new Map();

export function spentFor(category, month) {
  const rows = [];
  ["home", "business"].forEach((space) => {
    (state.spaces[space] || []).forEach((expense) => {
      if (inMonth(expense.date, month)) rows.push(expense);
    });
  });
  return roundMoney(
    rows.reduce((sum, expense) => {
      if (category === "Total" || expense.category === category) return sum + expense.amount;
      return sum;
    }, 0)
  );
}

export function limitsFor(month) {
  const found = {};
  get("budgets").forEach((row) => {
    if (!row || row.month !== month || typeof row.category !== "string") return;
    const value = roundMoney(Number(row.limit));
    if (value > 0) found[row.category] = value;
  });
  return found;
}

export function budgetSnapshot(month) {
  const caps = limitsFor(month);
  return BUDGET_CATEGORIES.map((category) => {
    const spent = spentFor(category, month);
    const limit = caps[category] || 0;
    const percent = limit > 0 ? (spent / limit) * 100 : null;
    const shown = percent == null ? null : Math.round(percent);
    let tone = "none";
    if (shown != null) {
      if (shown > 100) tone = "over";
      else if (shown >= 80) tone = "warn";
      else tone = "ok";
    }
    return { category, spent, limit, shown, tone };
  });
}

function slug(category) {
  return category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function paintRow(category, month) {
  const snap = budgetSnapshot(month).find((row) => row.category === category);
  const spentEl = limits.get(`spent:${category}`);
  const track = limits.get(`track:${category}`);
  const fill = limits.get(`fill:${category}`);
  const input = limits.get(`input:${category}`);
  if (!snap || !spentEl || !track || !fill) return;
  if (input && document.activeElement !== input) {
    input.value = snap.limit > 0 ? snap.limit.toFixed(2) : "";
  }
  if (!snap.limit) {
    spentEl.textContent = `${formatMoney(snap.spent)} spent. No limit yet.`;
    track.hidden = true;
    return;
  }
  track.hidden = false;
  const width = Math.min(Math.max(snap.shown, 0), 100);
  fill.style.width = `${width}%`;
  fill.className = `progress-fill is-${snap.tone === "none" ? "ok" : snap.tone}`;
  const toneText = snap.tone === "over" ? "over the limit" : snap.tone === "warn" ? "close to the limit" : "under the limit";
  spentEl.textContent = `${formatMoney(snap.spent)} of ${formatMoney(snap.limit)} · ${snap.shown}% · ${toneText}`;
  track.setAttribute("aria-valuenow", String(width));
  track.setAttribute("aria-valuetext", spentEl.textContent);
}

export function renderBudgetScreen(params = {}) {
  const monthInput = limits.get("month");
  if (!monthInput) return;
  if (document.activeElement !== monthInput) {
    monthInput.value = monthInput.value || today().slice(0, 7);
  }
  const month = monthInput.value;
  BUDGET_CATEGORIES.forEach((category) => paintRow(category, month));
  document.querySelectorAll("[data-budget-category]").forEach((row) => {
    row.classList.toggle("is-target", row.getAttribute("data-budget-category") === params.category);
  });
}

function saveLimits(month, next, errorEl) {
  BUDGET_CATEGORIES.forEach((category) => {
    const id = `limit:${month}:${category}`;
    if (!(next[category] > 0)) {
      deleteRecord("budgets", id);
      return;
    }
    save("budgets", { id, month, category, limit: next[category] });
  });
  errorEl.hidden = true;
}

export function registerBudgets() {
  const screen = ensureScreen("budgets");
  const wrap = document.createElement("div");
  wrap.className = "screen-sheet";

  const intro = document.createElement("header");
  intro.className = "intro";
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Budgets";
  const heading = document.createElement("h1");
  heading.textContent = "Monthly limits";
  intro.append(eyebrow, heading);

  const sheet = document.createElement("div");
  sheet.className = "sheet";
  const title = document.createElement("h2");
  title.textContent = "Budgets";
  const help = document.createElement("p");
  help.className = "meta";
  help.textContent =
    "Set a limit for Groceries, Beauty, Clothing, Household, Business Supplies, and Total. Green is under 80%, orange is 80% to 100%, and red is over.";

  const form = document.createElement("form");
  form.noValidate = true;
  const monthField = document.createElement("div");
  monthField.className = "field";
  const monthLabel = document.createElement("label");
  monthLabel.htmlFor = "category-budget-month";
  monthLabel.textContent = "Month";
  const monthInput = document.createElement("input");
  monthInput.id = "category-budget-month";
  monthInput.type = "month";
  monthInput.value = today().slice(0, 7);
  monthField.append(monthLabel, monthInput);
  limits.set("month", monthInput);

  const rows = document.createElement("div");
  rows.className = "budget-rows";
  BUDGET_CATEGORIES.forEach((category) => {
    const row = document.createElement("article");
    row.className = "budget-row";
    row.dataset.budgetCategory = category;
    const name = document.createElement("h3");
    name.className = "subhead";
    name.textContent = category;
    const spent = document.createElement("p");
    spent.className = "meta";
    const track = document.createElement("div");
    track.className = "progress-track";
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");
    track.setAttribute("aria-valuenow", "0");
    track.setAttribute("aria-label", `${category} budget used`);
    const fill = document.createElement("div");
    fill.className = "progress-fill is-ok";
    track.append(fill);
    const field = document.createElement("div");
    field.className = "field";
    const label = document.createElement("label");
    const inputId = `limit-${slug(category)}`;
    label.htmlFor = inputId;
    label.textContent = "Monthly limit";
    const input = document.createElement("input");
    input.id = inputId;
    input.type = "number";
    input.inputMode = "decimal";
    input.min = "0.01";
    input.step = "0.01";
    input.placeholder = "No limit";
    field.append(label, input);
    if (category === "Total") {
      const note = document.createElement("p");
      note.className = "meta";
      note.textContent = "Total counts home and business spending for the month.";
      row.append(name, spent, track, note, field);
    } else {
      row.append(name, spent, track, field);
    }
    rows.append(row);
    limits.set(`spent:${category}`, spent);
    limits.set(`track:${category}`, track);
    limits.set(`fill:${category}`, fill);
    limits.set(`input:${category}`, input);
  });

  const errorEl = document.createElement("p");
  errorEl.className = "form-error";
  errorEl.hidden = true;
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "primary";
  submit.textContent = "Save limits";
  form.append(monthField, rows, errorEl, submit);
  sheet.append(title, help, form);
  wrap.append(intro, sheet);
  screen.replaceChildren(wrap);

  monthInput.addEventListener("input", () => {
    errorEl.hidden = true;
    renderBudgetScreen();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    errorEl.hidden = true;
    const month = monthInput.value;
    if (!/^\d{4}-\d{2}$/.test(month)) {
      errorEl.textContent = "Pick a month first.";
      errorEl.hidden = false;
      monthInput.focus();
      return;
    }
    const next = {};
    const invalid = [];
    BUDGET_CATEGORIES.forEach((category) => {
      const input = limits.get(`input:${category}`);
      input.classList.remove("invalid");
      if (!input.value.trim()) return;
      const parsed = parseMoney(input.value);
      if (!parsed.ok) invalid.push(input);
      else next[category] = parsed.value;
    });
    if (invalid.length) {
      invalid.forEach((input) => input.classList.add("invalid"));
      errorEl.textContent = "Enter a limit greater than 0, with at most 2 decimal places, or leave it blank.";
      errorEl.hidden = false;
      invalid[0].focus();
      return;
    }
    saveLimits(month, next, errorEl);
    renderBudgetScreen();
    document.dispatchEvent(new CustomEvent("budgets-saved"));
  });

  registerScreen("budgets", {
    show(params) {
      renderBudgetScreen(params || {});
      if (!params || !params.category) return;
      const row = [...screen.querySelectorAll("[data-budget-category]")].find(
        (node) => node.getAttribute("data-budget-category") === params.category
      );
      if (row) row.scrollIntoView({ block: "nearest" });
    },
  });
}
