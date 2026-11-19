import { formatMoney } from "./money.js";
import { addDays, formatDate, today } from "./dates.js";
import { get, save, update, deleteRecord } from "./storage.js";
import { ensureScreen, registerScreen, goTo } from "./router.js";
import { createOrder, orderTotal } from "./order-book.js";
import { takeSerial } from "./invoices.js";

export const QUOTE_STATUSES = ["Draft", "Sent", "Accepted", "Declined"];

const rowErrors = new Map();
let formEl;
let formErrorEl;
let itemsEl;
let cityEl;
let expiryEl;
let listEl;
let emptyEl;

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
  control.name = extra.name || id.replace(/^quote-/, "");
  control.type = type;
  if (extra.placeholder) control.placeholder = extra.placeholder;
  if (extra.maxLength) control.maxLength = extra.maxLength;
  if (extra.inputMode) control.inputMode = extra.inputMode;
  if (extra.min != null) control.min = extra.min;
  if (extra.step) control.step = extra.step;
  return control;
}

function itemRow() {
  const row = el("div", "item-row");
  const name = input("", "text", { placeholder: "Item name", maxLength: 80, name: "item-name" });
  name.removeAttribute("id");
  name.setAttribute("aria-label", "Item name");
  const qty = input("", "number", { placeholder: "Qty", min: "0.01", step: "0.01", inputMode: "decimal", name: "item-qty" });
  qty.removeAttribute("id");
  qty.setAttribute("aria-label", "Quantity");
  const price = input("", "number", { placeholder: "Price", min: "0.01", step: "0.01", inputMode: "decimal", name: "item-price" });
  price.removeAttribute("id");
  price.setAttribute("aria-label", "Price");
  const remove = el("button", "edit-cancel", "Remove");
  remove.type = "button";
  remove.dataset.removeItem = "true";
  row.append(name, qty, price, remove);
  return row;
}

function readItems(form) {
  return [...form.querySelectorAll(".item-row")].map((row) => ({
    name: row.querySelector("[name=item-name]").value,
    qty: row.querySelector("[name=item-qty]").value,
    price: row.querySelector("[name=item-price]").value,
  }));
}

function cleanItems(items) {
  if (!Array.isArray(items) || !items.length) return { error: "Add at least one item." };
  const clean = [];
  for (const item of items) {
    const name = String(item.name || "").trim();
    const qty = Number(item.qty);
    const price = Number(item.price);
    if (!name || !(qty > 0) || !(price > 0)) {
      return { error: "Each item needs a name, a quantity, and a price greater than 0." };
    }
    clean.push({ id: item.id || crypto.randomUUID(), name: name.slice(0, 80), qty, price });
  }
  return { items: clean };
}

function readCustomer(data) {
  const customerName = String(data.customerName || "").trim();
  const phone = String(data.phone || "").trim();
  const city = get("cities", data.cityId);
  if (!customerName) return { error: "Enter the customer name." };
  if (phone.replace(/\D/g, "").length < 7) return { error: "Enter a phone number with at least 7 digits." };
  if (!city) return { error: "Choose a city." };
  return {
    customerName: customerName.slice(0, 80),
    phone,
    city,
    address: String(data.address || "").trim().slice(0, 160),
  };
}

export function createQuote(data) {
  const customer = readCustomer(data);
  if (customer.error) return { ok: false, error: customer.error };
  const itemsResult = cleanItems(data.items);
  if (itemsResult.error) return { ok: false, error: itemsResult.error };
  const expiryDate = String(data.expiryDate || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) return { ok: false, error: "Enter an expiry date." };
  const status = QUOTE_STATUSES.includes(data.status) ? data.status : "Draft";
  const quote = {
    id: data.id || crypto.randomUUID(),
    number: data.number || takeSerial("quotes", "number", "nextQuoteNumber"),
    customerName: customer.customerName,
    phone: customer.phone,
    cityId: customer.city.id,
    cityName: customer.city.name,
    address: customer.address,
    items: itemsResult.items,
    expiryDate,
    notes: String(data.notes || "").trim().slice(0, 240),
    status,
    createdOn: data.createdOn || today(),
  };
  if (data.customerId && get("customers", data.customerId)) quote.customerId = data.customerId;
  if (data.orderId) quote.orderId = data.orderId;
  return { ok: true, quote: save("quotes", quote) };
}

export const createQuoteSync = createQuote;

function fillCities() {
  const keep = cityEl.value;
  cityEl.replaceChildren(new Option("Select a city", ""));
  get("cities")
    .slice()
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .forEach((city) => cityEl.append(new Option(city.name, city.id)));
  if ([...cityEl.options].some((option) => option.value === keep)) cityEl.value = keep;
}

function quoteCard(quote) {
  const card = el("article", "card");
  card.dataset.quoteId = quote.id;
  card.append(el("h3", "", `Quote #${quote.number} · ${quote.customerName}`));
  const expired = quote.expiryDate < today() && (quote.status === "Draft" || quote.status === "Sent");
  card.append(
    el(
      "p",
      "meta",
      `${quote.cityName || ""} · ${formatMoney(orderTotal(quote))} · ${expired ? "Expired" : "Valid until"} ${formatDate(quote.expiryDate)}`,
    ),
  );
  card.append(
    el("p", "meta", (quote.items || []).map((item) => `${item.name} × ${item.qty}`).join(", ")),
  );

  const status = document.createElement("select");
  status.id = `quote-status-${quote.id}`;
  status.dataset.statusQuote = quote.id;
  QUOTE_STATUSES.forEach((name) => status.append(new Option(name, name)));
  status.value = quote.status;
  card.append(field("Status", status));

  if (quote.orderId) {
    const order = get("orders", quote.orderId);
    card.append(el("p", "meta", order ? `Order #${order.orderNumber} was made from this quote.` : "An order was made from this quote."));
  } else if (quote.status === "Accepted") {
    const delivery = input(`quote-delivery-${quote.id}`, "date", { name: "delivery" });
    delivery.value = addDays(today(), 7);
    delivery.dataset.deliveryFor = quote.id;
    card.append(field("Delivery date for the order", delivery));
    const make = el("button", "primary", "Make order");
    make.type = "button";
    make.dataset.makeOrder = quote.id;
    card.append(make);
  }
  const error = el("p", "form-error", rowErrors.get(quote.id) || "");
  error.setAttribute("role", "alert");
  error.hidden = !rowErrors.has(quote.id);
  card.append(error);
  const remove = el("button", "edit-cancel", "Delete quote");
  remove.type = "button";
  remove.dataset.deleteQuote = quote.id;
  card.append(remove);
  return card;
}

export function renderQuotes() {
  if (!listEl) return;
  fillCities();
  const rows = get("quotes")
    .slice()
    .sort((a, b) => (Number(b.number) || 0) - (Number(a.number) || 0));
  listEl.replaceChildren(...rows.map(quoteCard));
  emptyEl.hidden = rows.length > 0;
}

function makeOrder(quoteId) {
  const quote = get("quotes", quoteId);
  if (!quote) return;
  const dateInput = listEl.querySelector(`[data-delivery-for="${quoteId}"]`);
  const result = createOrder({
    customerName: quote.customerName,
    phone: quote.phone,
    cityId: quote.cityId,
    address: quote.address,
    items: quote.items,
    orderDate: today(),
    deliveryDate: dateInput && dateInput.value ? dateInput.value : addDays(today(), 7),
    notes: quote.notes,
    customerId: quote.customerId || "",
  });
  if (!result.ok) {
    rowErrors.set(quoteId, result.error);
    renderQuotes();
    return;
  }
  rowErrors.delete(quoteId);
  update("quotes", quoteId, { orderId: result.order.id, status: "Accepted" });
  goTo("orders", { id: result.order.id });
}

export function registerQuotes() {
  const screen = ensureScreen("quotes");
  const intro = el("header", "intro");
  intro.append(el("p", "eyebrow", "Quotes"), el("h1", "", "Price quotes"));
  const sheet = el("div", "sheet");

  formEl = document.createElement("form");
  formEl.id = "quote-form";
  formEl.noValidate = true;
  cityEl = document.createElement("select");
  cityEl.id = "quote-city";
  cityEl.name = "cityId";
  expiryEl = input("quote-expiry", "date", { name: "expiryDate" });
  expiryEl.value = addDays(today(), 14);
  const statusEl = document.createElement("select");
  statusEl.id = "quote-status";
  statusEl.name = "status";
  QUOTE_STATUSES.forEach((name) => statusEl.append(new Option(name, name)));
  itemsEl = el("div", "");
  itemsEl.append(itemRow());
  const addItem = el("button", "edit-cancel", "Add another item");
  addItem.type = "button";
  addItem.dataset.addItem = "true";
  formErrorEl = el("p", "form-error");
  formErrorEl.id = "quote-error";
  formErrorEl.setAttribute("role", "alert");
  formErrorEl.hidden = true;
  const submit = el("button", "primary", "Save quote");
  submit.type = "submit";
  formEl.append(
    field("Customer name", input("quote-customer", "text", { name: "customerName", maxLength: 80 })),
    field("Phone", input("quote-phone", "tel", { name: "phone", inputMode: "tel" })),
    field("City", cityEl),
    field("Address", input("quote-address", "text", { name: "address", maxLength: 160 })),
    field("Valid until", expiryEl),
    el("p", "meta", "Items"),
    itemsEl,
    addItem,
    field("Notes", input("quote-notes", "text", { name: "notes", maxLength: 240 })),
    field("Status", statusEl),
    formErrorEl,
    submit,
  );

  listEl = el("div", "");
  listEl.id = "quote-list";
  emptyEl = el("p", "empty", "No quotes yet. Add one above.");
  emptyEl.id = "quote-empty";
  sheet.append(formEl, listEl, emptyEl);
  screen.append(intro, sheet);

  formEl.addEventListener("click", (event) => {
    if (event.target.closest("[data-add-item]")) {
      itemsEl.append(itemRow());
      return;
    }
    const remove = event.target.closest("[data-remove-item]");
    if (remove && itemsEl.children.length > 1) remove.closest(".item-row").remove();
  });

  formEl.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(formEl);
    const result = createQuote({
      customerName: data.get("customerName"),
      phone: data.get("phone"),
      cityId: data.get("cityId"),
      address: data.get("address"),
      expiryDate: data.get("expiryDate"),
      notes: data.get("notes"),
      status: data.get("status"),
      items: readItems(formEl),
    });
    if (!result.ok) {
      formErrorEl.textContent = result.error;
      formErrorEl.hidden = false;
      return;
    }
    formErrorEl.hidden = true;
    formEl.reset();
    itemsEl.replaceChildren(itemRow());
    expiryEl.value = addDays(today(), 14);
    renderQuotes();
  });

  listEl.addEventListener("change", (event) => {
    const select = event.target.closest("[data-status-quote]");
    if (!select || !QUOTE_STATUSES.includes(select.value)) return;
    update("quotes", select.dataset.statusQuote, { status: select.value });
    renderQuotes();
  });

  listEl.addEventListener("click", (event) => {
    const make = event.target.closest("[data-make-order]");
    if (make) {
      makeOrder(make.dataset.makeOrder);
      return;
    }
    const remove = event.target.closest("[data-delete-quote]");
    if (remove && window.confirm("Delete this quote? This cannot be undone.")) {
      deleteRecord("quotes", remove.dataset.deleteQuote);
      renderQuotes();
    }
  });

  registerScreen("quotes", {
    show() {
      renderQuotes();
    },
  });
}
