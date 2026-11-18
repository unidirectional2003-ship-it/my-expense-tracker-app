import { roundMoney } from "./money.js";
import { get, save, update } from "./storage.js";
import { recordPaymentIncome, refreshOrderIncome } from "./order-income.js";

export const ORDER_STATUSES = ["Pending", "In Progress", "Fulfilled", "Cancelled"];
export const PAYMENT_STATUSES = ["Unpaid", "Advance Received", "Paid in Full"];
export const PAYMENT_METHODS = ["Cash", "Bank Transfer", "Easypaisa", "JazzCash"];
export const WORK_STATUSES = [
  "Not Started",
  "Cutting/Preparing",
  "In Progress",
  "Quality Check",
  "Ready",
  "Delivered",
];

export function orderTotal(order) {
  return roundMoney(
    (order.items || []).reduce((sum, item) => sum + roundMoney(Number(item.qty) * Number(item.price)), 0)
  );
}

export function amountPaid(order) {
  return roundMoney((order.payments || []).reduce((sum, payment) => sum + roundMoney(payment.amount), 0));
}

export function balanceOf(order) {
  return roundMoney(orderTotal(order) - amountPaid(order));
}

export function linkedOrderBalances() {
  return get("orders")
    .filter((order) => order && order.status !== "Cancelled" && balanceOf(order) > 0)
    .map((order) => ({
      orderId: order.id,
      orderNumber: order.orderNumber,
      person: order.customerName,
      phone: order.phone || "",
      amount: orderTotal(order),
      paid: amountPaid(order),
      balance: balanceOf(order),
      givenDate: order.orderDate,
      dueDate: order.deliveryDate || "",
    }))
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)) || a.orderNumber - b.orderNumber);
}

export function paymentStatusFor(order) {
  const paid = amountPaid(order);
  if (!(paid > 0)) return "Unpaid";
  if (balanceOf(order) <= 0) return "Paid in Full";
  return "Advance Received";
}

export function workForOrder(orderId) {
  return get("workItems").find((item) => item.orderId === orderId) || null;
}

export function ordersPerCity() {
  const counts = new Map();
  get("orders").forEach((order) => {
    const name = order.cityName || "Unknown";
    counts.set(name, (counts.get(name) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
}

export function addCity(name) {
  const trimmed = String(name || "").trim().replace(/\s+/g, " ");
  if (!trimmed) return { ok: false, error: "Enter a city name." };
  if (trimmed.length > 40) return { ok: false, error: "Use a city name of 40 characters or less." };
  const existing = get("cities").find((city) => city.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) return { ok: true, city: existing };
  return { ok: true, city: save("cities", { name: trimmed }) };
}

function takeOrderNumber() {
  const orders = get("orders");
  const highest = orders.reduce((max, order) => Math.max(max, Number(order.orderNumber) || 0), 1000);
  const setting = get("settings", "nextOrderNumber");
  let next = Math.max(highest + 1, Number(setting?.value) || 1001);
  save("settings", { id: "nextOrderNumber", value: next + 1 });
  return next;
}

function cleanItems(items) {
  if (!Array.isArray(items) || !items.length) return { error: "Add at least one item." };
  const clean = [];
  for (const item of items) {
    const name = String(item.name || "").trim();
    const qty = roundMoney(Number(item.qty));
    const price = roundMoney(Number(item.price));
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

export function createOrder(input) {
  const customerName = String(input.customerName || "").trim();
  const phone = String(input.phone || "").trim();
  const digits = phone.replace(/\D/g, "");
  const address = String(input.address || "").trim();
  const notes = String(input.notes || "").trim();
  const city = get("cities", input.cityId);
  const itemsResult = cleanItems(input.items);
  if (!customerName) return { ok: false, error: "Enter the customer name." };
  if (digits.length < 7) return { ok: false, error: "Enter a phone number with at least 7 digits." };
  if (!city) return { ok: false, error: "Choose a city." };
  if (itemsResult.error) return { ok: false, error: itemsResult.error };
  if (!input.orderDate || !input.deliveryDate) return { ok: false, error: "Enter the order date and the delivery date." };
  if (input.deliveryDate < input.orderDate) {
    return { ok: false, error: "Delivery date cannot be before the order date." };
  }

  const items = itemsResult.items;
  const draft = { items, payments: [] };
  const total = orderTotal(draft);
  const advance = roundMoney(Number(input.advanceAmount) || 0);
  if (input.advanceAmount !== "" && input.advanceAmount != null && String(input.advanceAmount).trim() !== "") {
    if (!(advance > 0)) return { ok: false, error: "Advance must be greater than 0, or leave it blank." };
    if (advance - total > 0.001) return { ok: false, error: "Advance cannot be more than the order total." };
    if (!PAYMENT_METHODS.includes(input.advanceMethod)) return { ok: false, error: "Choose how the advance was paid." };
  }

  const payments = [];
  if (advance > 0) {
    payments.push({
      id: crypto.randomUUID(),
      date: input.advanceDate || input.orderDate,
      amount: advance,
      method: input.advanceMethod,
    });
  }

  const order = {
    id: crypto.randomUUID(),
    orderNumber: takeOrderNumber(),
    customerName: customerName.slice(0, 80),
    phone,
    cityId: city.id,
    cityName: city.name,
    address: address.slice(0, 160),
    items,
    orderDate: input.orderDate,
    deliveryDate: input.deliveryDate,
    notes: notes.slice(0, 240),
    status: "Pending",
    payments,
    paymentStatus: "Unpaid",
  };
  order.paymentStatus = paymentStatusFor(order);
  save("orders", order);
  save("workItems", {
    id: crypto.randomUUID(),
    orderId: order.id,
    status: "Not Started",
    dueDate: order.deliveryDate,
  });
  if (payments[0]) recordPaymentIncome(order, payments[0]);
  return { ok: true, order: get("orders", order.id) };
}

export function addPayment(orderId, input) {
  const order = get("orders", orderId);
  if (!order) return { ok: false, error: "That order is no longer here." };
  const amount = roundMoney(Number(input.amount));
  if (!(amount > 0)) return { ok: false, error: "Enter a payment greater than 0." };
  const remaining = balanceOf(order);
  if (remaining <= 0) return { ok: false, error: "This order is already paid in full." };
  if (amount - remaining > 0.001) return { ok: false, error: "That payment is more than the remaining balance." };
  if (!PAYMENT_METHODS.includes(input.method)) return { ok: false, error: "Choose how this payment was made." };
  if (!input.date) return { ok: false, error: "Enter the payment date." };
  const payment = { id: crypto.randomUUID(), date: input.date, amount, method: input.method };
  const next = { ...order, payments: [...order.payments, payment] };
  next.paymentStatus = paymentStatusFor(next);
  save("orders", next);
  recordPaymentIncome(next, payment);
  return { ok: true, order: get("orders", orderId) };
}

export function setOrderStatus(orderId, status) {
  if (!ORDER_STATUSES.includes(status)) return;
  const order = get("orders", orderId);
  if (!order || order.status === status) return;
  update("orders", orderId, { status });
  const work = workForOrder(orderId);
  if (work) {
    if (status === "Fulfilled" && work.status !== "Delivered") {
      update("workItems", work.id, { status: "Delivered", dueDate: order.deliveryDate });
    } else if (status !== "Fulfilled" && work.status === "Delivered") {
      update("workItems", work.id, { status: "Ready", dueDate: order.deliveryDate });
    }
  }
  refreshOrderIncome(get("orders", orderId));
}

export function setWorkStatus(workId, status) {
  const work = get("workItems", workId);
  if (!work || !WORK_STATUSES.includes(status)) return { needsConfirm: false };
  const order = get("orders", work.orderId);
  if (status === "Delivered" && order && order.status !== "Fulfilled") return { needsConfirm: true };
  update("workItems", workId, { status, dueDate: order ? order.deliveryDate : work.dueDate });
  if (status !== "Delivered" && order && order.status === "Fulfilled") {
    update("orders", order.id, { status: "In Progress" });
    refreshOrderIncome(get("orders", order.id));
  }
  return { needsConfirm: false };
}

export function confirmWorkDelivered(workId) {
  const work = get("workItems", workId);
  if (!work) return;
  const order = get("orders", work.orderId);
  update("workItems", workId, { status: "Delivered", dueDate: order ? order.deliveryDate : work.dueDate });
  if (order && order.status !== "Fulfilled") update("orders", order.id, { status: "Fulfilled" });
  if (order) refreshOrderIncome(get("orders", order.id));
}

export function filterOrders(orders, filters) {
  const query = String(filters.query || "").trim().toLowerCase();
  return orders.filter((order) => {
    if (filters.status && order.status !== filters.status) return false;
    if (filters.paymentStatus && order.paymentStatus !== filters.paymentStatus) return false;
    if (filters.cityId && order.cityId !== filters.cityId) return false;
    if (filters.from && order.orderDate < filters.from) return false;
    if (filters.to && order.orderDate > filters.to) return false;
    if (!query) return true;
    const haystack = `${order.customerName} ${order.phone} ${order.orderNumber}`.toLowerCase();
    return haystack.includes(query);
  });
}
