import { formatMoney, roundMoney } from "./money.js";
import { today } from "./dates.js";
import { get, save, update } from "./storage.js";
import { balanceOf, orderTotal } from "./order-book.js";

export const DEFAULT_WHATSAPP_TEMPLATES = {
  orderReady: "Assalam o Alaikum {name}, your order is ready.",
  paymentReminder: "Assalam o Alaikum {name}, this is a reminder that {balance} is still due.",
};

const TEMPLATE_LIMIT = 500;

export function whatsAppDigits(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  let digits = text.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  const explicitPlus = text.startsWith("+");
  const alreadyCountry = explicitPlus || digits.startsWith("92");
  if (!alreadyCountry && digits.length === 11 && digits.startsWith("0")) {
    digits = `92${digits.slice(1)}`;
  } else if (!alreadyCountry && digits.length === 10 && digits.startsWith("3")) {
    digits = `92${digits}`;
  }
  return digits;
}

export function whatsAppUrl(number, message) {
  const digits = whatsAppDigits(number);
  if (digits.length < 8) return "";
  const text = String(message || "").trim();
  const base = `https://wa.me/${digits}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

function significantDigits(value) {
  const digits = whatsAppDigits(value);
  if (digits.startsWith("92")) return digits.slice(2);
  return digits.replace(/^0+/, "");
}

function samePhone(left, right) {
  const a = whatsAppDigits(left);
  const b = whatsAppDigits(right);
  return a.length >= 10 && a === b;
}

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function sameName(left, right) {
  const a = cleanName(left).toLowerCase();
  const b = cleanName(right).toLowerCase();
  return a.length > 0 && a === b;
}

function cleanTemplate(value, fallback) {
  const text = String(value || "").trim();
  return text ? text.slice(0, TEMPLATE_LIMIT) : fallback;
}

function phoneTaken(phone, exceptId) {
  const customers = get("customers");
  return customers.find((customer) => customer.id !== exceptId && samePhone(customer.phone, phone)) || null;
}

function readCustomerInput(input, exceptId) {
  const name = cleanName(input.name);
  const phone = String(input.phone || "").trim();
  let whatsapp = String(input.whatsapp || "").trim();
  if (!whatsapp) whatsapp = phone;
  const address = String(input.address || "").trim();
  const notes = String(input.notes || "").trim();
  const city = get("cities", input.cityId);
  if (!name) return { ok: false, error: "Enter the customer name." };
  if (name.length > 80) return { ok: false, error: "Use a name of 80 characters or less." };
  if (phone.replace(/\D/g, "").length < 7) return { ok: false, error: "Enter a phone number with at least 7 digits." };
  if (whatsapp.replace(/\D/g, "").length < 7) {
    return { ok: false, error: "Enter a WhatsApp number with at least 7 digits, or leave it the same as the phone." };
  }
  if (!city) return { ok: false, error: "Choose a city." };
  const taken = phoneTaken(phone, exceptId);
  if (taken) {
    return {
      ok: false,
      error: `A customer named ${taken.name} already has this phone. Search for them and pick that customer.`,
    };
  }
  return {
    ok: true,
    value: {
      name: name.slice(0, 80),
      phone: phone.slice(0, 24),
      whatsapp: whatsapp.slice(0, 24),
      cityId: city.id,
      cityName: city.name,
      address: address.slice(0, 160),
      notes: notes.slice(0, 240),
    },
  };
}

export function createCustomer(input) {
  const read = readCustomerInput(input || {});
  if (!read.ok) return read;
  const added = String(input.addedDate || "");
  const customer = {
    id: crypto.randomUUID(),
    ...read.value,
    addedDate: /^\d{4}-\d{2}-\d{2}$/.test(added) ? added : today(),
  };
  save("customers", customer);
  return { ok: true, customer: get("customers", customer.id) };
}

export function updateCustomer(id, input) {
  const current = get("customers", id);
  if (!current) return { ok: false, error: "That customer is no longer here." };
  const read = readCustomerInput(input || {}, id);
  if (!read.ok) return read;
  save("customers", { ...current, ...read.value, id, addedDate: current.addedDate });
  return { ok: true, customer: get("customers", id) };
}

export function filterCustomers(list, filters = {}) {
  const query = String(filters.query || "").trim().toLowerCase();
  const queryDigits = significantDigits(query);
  const cityId = filters.cityId || "";
  return list.filter((customer) => {
    if (cityId && customer.cityId !== cityId) return false;
    if (!query) return true;
    if (String(customer.name || "").toLowerCase().includes(query)) return true;
    if (queryDigits.length < 3) return false;
    return [customer.phone, customer.whatsapp].some((value) => significantDigits(value).includes(queryDigits));
  });
}

export function searchCustomers(query) {
  return filterCustomers(get("customers"), { query }).sort((a, b) => a.name.localeCompare(b.name));
}

export function customerOrderSummary(customerId) {
  const orders = get("orders")
    .filter((order) => order.customerId === customerId)
    .sort((a, b) => String(b.orderDate || "").localeCompare(String(a.orderDate || "")) || (Number(b.orderNumber) || 0) - (Number(a.orderNumber) || 0));
  const active = orders.filter((order) => order.status !== "Cancelled");
  return {
    orders,
    count: orders.length,
    total: roundMoney(active.reduce((sum, order) => sum + orderTotal(order), 0)),
    balance: roundMoney(active.reduce((sum, order) => sum + Math.max(0, balanceOf(order)), 0)),
    lastOrderDate: orders[0]?.orderDate || "",
    repeat: orders.length >= 2,
  };
}

export function unmatchedOrderCount() {
  return get("orders").filter((order) => !order.customerId).length;
}

export function matchOldOrdersToCustomers() {
  const customers = get("customers");
  let matched = 0;
  get("orders").forEach((order) => {
    if (order.customerId) return;
    const phoneMatches = customers.filter(
      (customer) => samePhone(order.phone, customer.phone) || samePhone(order.phone, customer.whatsapp)
    );
    let customer = null;
    if (phoneMatches.length === 1) customer = phoneMatches[0];
    else if (phoneMatches.length === 0) {
      const nameMatches = customers.filter((item) => sameName(item.name, order.customerName));
      if (nameMatches.length === 1) customer = nameMatches[0];
    }
    if (!customer) return;
    update("orders", order.id, { customerId: customer.id });
    matched += 1;
  });
  return { matched, unmatched: unmatchedOrderCount() };
}

export function readWhatsAppTemplates() {
  const saved = get("settings", "whatsappTemplates");
  return {
    orderReady: cleanTemplate(saved?.orderReady, DEFAULT_WHATSAPP_TEMPLATES.orderReady),
    paymentReminder: cleanTemplate(saved?.paymentReminder, DEFAULT_WHATSAPP_TEMPLATES.paymentReminder),
  };
}

export function saveWhatsAppTemplates(input) {
  const next = {
    id: "whatsappTemplates",
    orderReady: cleanTemplate(input?.orderReady, DEFAULT_WHATSAPP_TEMPLATES.orderReady),
    paymentReminder: cleanTemplate(input?.paymentReminder, DEFAULT_WHATSAPP_TEMPLATES.paymentReminder),
  };
  save("settings", next);
  return { orderReady: next.orderReady, paymentReminder: next.paymentReminder };
}

export function fillWhatsAppTemplate(template, values) {
  return String(template || "").replace(/\{(name|balance|orders|phone)\}/g, (_full, key) => {
    if (values[key] == null) return "";
    return String(values[key]);
  });
}

export function customerMessageUrl(customer, templateKey) {
  if (!customer) return "";
  const summary = customerOrderSummary(customer.id);
  const templates = readWhatsAppTemplates();
  const template = templates[templateKey] || templates.orderReady;
  const message = fillWhatsAppTemplate(template, {
    name: customer.name,
    balance: formatMoney(summary.balance),
    orders: summary.count,
    phone: customer.phone,
  });
  return whatsAppUrl(customer.whatsapp || customer.phone, message);
}
