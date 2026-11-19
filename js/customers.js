import { formatMoney } from "./money.js";
import { formatDate } from "./dates.js";
import { get } from "./storage.js";
import { ensureScreen, registerScreen } from "./router.js";
import { createCustomer, customerMessageUrl, customerOrderSummary, filterCustomers } from "./customer-book.js";

let listEl;
let emptyEl;
let searchEl;
let cityEl;
let errorEl;
let formEl;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function field(labelText, control) {
  const wrap = el("div", "field");
  const label = el("label", "", labelText);
  label.htmlFor = control.id;
  wrap.append(label, control);
  return wrap;
}

function input(id, type, extra = {}) {
  const control = document.createElement("input");
  control.id = id;
  control.name = extra.name || id.replace(/^customer-/, "");
  control.type = type;
  if (extra.placeholder) control.placeholder = extra.placeholder;
  if (extra.maxLength) control.maxLength = extra.maxLength;
  if (extra.inputMode) control.inputMode = extra.inputMode;
  return control;
}

function link(text, href) {
  const anchor = el("a", "edit-cancel", text);
  anchor.href = href;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  return anchor;
}

function fillCities() {
  const keep = cityEl.value;
  cityEl.replaceChildren();
  const first = document.createElement("option");
  first.value = "";
  first.textContent = "Choose a city";
  cityEl.append(first);
  get("cities")
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .forEach((city) => {
      const option = document.createElement("option");
      option.value = city.id;
      option.textContent = city.name;
      cityEl.append(option);
    });
  cityEl.value = keep;
}

export function renderCustomers() {
  if (!listEl) return;
  fillCities();
  const all = get("customers");
  const rows = filterCustomers(all, { query: searchEl.value }).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  listEl.replaceChildren();
  emptyEl.hidden = rows.length > 0;
  emptyEl.textContent = all.length ? "No customers match your search." : "No customers yet. Add one above.";
  rows.forEach((customer) => {
    const summary = customerOrderSummary(customer.id);
    const card = el("article", "card");
    card.append(el("h3", "", customer.name));
    card.append(el("p", "meta", `${customer.phone} · ${customer.cityName || ""}`));
    const orders = `${summary.count} order${summary.count === 1 ? "" : "s"}`;
    const last = summary.lastOrderDate ? ` · Last order ${formatDate(summary.lastOrderDate)}` : "";
    card.append(el("p", "meta", `${orders} · Balance ${formatMoney(summary.balance)}${last}`));
    const actions = el("div", "");
    const ready = customerMessageUrl(customer, "orderReady");
    if (ready) actions.append(link("WhatsApp: order ready", ready));
    if (summary.balance > 0) {
      const reminder = customerMessageUrl(customer, "paymentReminder");
      if (reminder) actions.append(link("WhatsApp: payment reminder", reminder));
    }
    card.append(actions);
    listEl.append(card);
  });
}

export function registerCustomers() {
  const screen = ensureScreen("customers");
  const intro = el("header", "intro");
  intro.append(el("p", "eyebrow", "Customers"), el("h1", "", "Your customers"));

  const sheet = el("div", "sheet");
  formEl = document.createElement("form");
  formEl.id = "customer-form";
  formEl.noValidate = true;
  cityEl = document.createElement("select");
  cityEl.id = "customer-city";
  cityEl.name = "cityId";
  errorEl = el("p", "form-error");
  errorEl.id = "customer-error";
  errorEl.setAttribute("role", "alert");
  errorEl.hidden = true;
  const submit = el("button", "primary", "Add customer");
  submit.type = "submit";
  formEl.append(
    field("Name", input("customer-name", "text", { maxLength: 80 })),
    field("Phone", input("customer-phone", "tel", { inputMode: "tel", placeholder: "0300 1234567" })),
    field("WhatsApp (leave empty if the same)", input("customer-whatsapp", "tel", { inputMode: "tel" })),
    field("City", cityEl),
    field("Address", input("customer-address", "text", { maxLength: 160 })),
    field("Notes", input("customer-notes", "text", { maxLength: 240 })),
    errorEl,
    submit,
  );

  searchEl = input("customer-search", "search", { name: "search", placeholder: "Search by name or phone" });
  listEl = el("div", "");
  listEl.id = "customer-list";
  emptyEl = el("p", "empty", "No customers yet. Add one above.");
  emptyEl.id = "customer-empty";
  sheet.append(formEl, field("Search", searchEl), listEl, emptyEl);
  screen.append(intro, sheet);

  formEl.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(formEl);
    const result = createCustomer({
      name: data.get("name"),
      phone: data.get("phone"),
      whatsapp: data.get("whatsapp"),
      cityId: data.get("cityId"),
      address: data.get("address"),
      notes: data.get("notes"),
    });
    if (!result.ok) {
      errorEl.textContent = result.error;
      errorEl.hidden = false;
      return;
    }
    errorEl.hidden = true;
    formEl.reset();
    renderCustomers();
  });
  searchEl.addEventListener("input", renderCustomers);

  registerScreen("customers", {
    show() {
      renderCustomers();
    },
  });
}
