import { formatMoney } from "./money.js";
import { addDays, formatDate, today } from "./dates.js";
import { get } from "./storage.js";
import { ensureScreen, registerScreen } from "./router.js";
import { PAYMENT_METHODS, addCity, createOrder, orderTotal } from "./order-book.js";
import { takeSerial } from "./invoices.js";

export const QUOTE_STATUSES = ["Draft", "Sent", "Accepted", "Declined"];

const quoteErrors = new Map();

function field(labelText, control) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const label = document.createElement("label");
  label.htmlFor = control.id;
  label.textContent = labelText;
  wrap.append(label, control);
  return wrap;
}

function input(id, type, extra = {}) {
  const control = document.createElement("input");
  control.id = id;
  control.name = extra.name || id;
  control.type = type;
  if (extra.placeholder) control.placeholder = extra.placeholder;
  if (extra.maxLength) control.maxLength = extra.maxLength;
  if (extra.inputMode) control.inputMode = extra.inputMode;
  if (extra.min != null) control.min = extra.min;
  if (extra.step) control.step = extra.step;
  if (extra.required) control.required = true;
  return control;
}

function select(id, options, blank) {
  const control = document.createElement("select");
  control.id = id;
  control.name = id;
  if (blank) control.append(new Option(blank, ""));
  options.forEach((option) => control.append(new Option(option, option)));
  return control;
}

function cities() {
  return get("cities").slice().sort((a, b) => a.name.localeCompare(b.name));
}

function fillCitySelect(control, includeNew, selected) {
  const current = selected == null ? control.value : selected;
  const options = [new Option(includeNew ? "Select a city" : "All cities", "")];
  cities().forEach((city) => options.push(new Option(city.name, city.id)));
  if (includeNew) options.push(new Option("Add new city", "__new__"));
  control.replaceChildren(...options);
  if ([...control.options].some((option) => option.value === current)) control.value = current;
}

function itemRow() {
  const row = document.createElement("div");
  row.className = "item-row";
  const name = input("", "text", { placeholder: "Item name", maxLength: 80 });
  name.name = "item-name";
  name.setAttribute("aria-label", "Item name");
  const qty = input("", "number", { placeholder: "Qty", min: "0.01", step: "0.01", inputMode: "decimal" });
  qty.name = "item-qty";
  qty.setAttribute("aria-label", "Quantity");
  const price = input("", "number", { placeholder: "Price", min: "0.01", step: "0.01", inputMode: "decimal" });
  price.name = "item-price";
  price.setAttribute("aria-label", "Price");
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "edit-cancel";
  remove.dataset.removeItem = "true";
  remove.textContent = "Remove";
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
    clean.push({
      id: item.id || crypto.randomUUID(),
      name: name.slice(0, 80),
      qty,
      price,
    });
  }
  return { items: clean };
}

function readCustomer(input) {
  const customerName = String(input.customerName || "").trim();
  const phone = String(input.phone || "").trim();
  const digits = phone.replace(/\D/g, "");
  const city = get("cities", input.cityId);
  if (!customerName) return { error: "Enter the customer name." };
  if (digits.length < 7) return { error: "Enter a phone number with at least 7 digits." };
  if (!city) return { error: "Choose a city." };
  return {
    customerName: customerName.slice(0, 80),
    phone,
    city,
    address: String(input.address || "").trim().slice(0, 160),
  };
}

export function createQuote(input) {
  const customer = readCustomer(input);
  if (customer.error) return { ok: false, error: customer.error };
  const itemsResult = cleanItems(input.items);
  if (itemsResult.error) return { ok: false, error: itemsResult.error };
  const expiryDate = String(input.expiryDate || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) return { ok: false, error: "Enter an expiry date." };
  const status = QUOTE_STATUSES.includes(input.status) ? input.status : "Draft";
  const quote = {
    id: crypto.randomUUID(),
    number: takeSerial("quotes", "number", "nextQuoteNumber"),
    customerName: customer.customerName,
    phone: customer.phone,
    cityId: customer.city.id,
    cityName: customer.city.name,
    address: customer.address,
    items: itemsResult.items,
    expiryDate,
    notes: String(input.notes || "").trim().slice(0, 240),
    status,
    createdOn: today(),
  };
  if (input.customerId && get("customers", input.customerId)) quote.customerId = input.customerId;
  const { save } = { save: null };
  return persistQuote(quote);
}

function persistQuote(quote) {
  const saved = saveQuote(quote);
  return { ok: true, quote: saved };
}

function saveQuote(quote) {
  return getSaver()( "quotes", quote);
}

function getSaver() {
  return saver;
}

let saver = null;

async function loadSaver() {
  if (!saver) {
    const storage = await import("./storage.js");
    saver = storage.save;
    updater = storage.update;
  }
}

let updater = null;

export function createQuoteSync(input) {
  const customer = readCustomer(input);
  if (customer.error) return { ok: false, error: customer.error };
  const itemsResult = cleanItems(input.items);
  if (itemsResult.error) return { ok: false, error: itemsResult.error };
  const expiryDate = String(input.expiryDate || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) return { ok: false, error: "Enter an expiry date." };
  const status = QUOTE_STATUSES.includes(input.status) ? input.status : "";
  if (!status) return { ok: false, error: "Choose a status." };
  const quote = {
    id: input.id || crypto.randomUUID(),
    number: input.number || takeSerial("quotes", "number", "nextQuoteNumber"),
    customerName: customer.customerName,
    phone: customer.phone,
    cityId: customer.city.id,
    cityName: customer.city.name,
    address: customer.address,
    items: itemsResult.items,
    expiryDate,
    notes: String(input.notes || "").trim().slice(0, 240),
    status,
    createdOn: input.createdOn || today(),
  };
  if (input.customerId && get("customers", input.customerId)) quote.customerId = input.customerId;
  if (input.orderId) quote.orderId = input.orderId;
  const { save } = requireStorage();
  return { ok: true, quote: save("quotes", quote) };
}

function requireStorage() {
  throw new Error("replaced");
}
