import assert from "node:assert/strict";

const memory = new Map();
globalThis.localStorage = {
  getItem(key) {
    return memory.has(key) ? memory.get(key) : null;
  },
  setItem(key, value) {
    memory.set(key, String(value));
  },
  removeItem(key) {
    memory.delete(key);
  },
};

memory.set(
  "expense-spaces",
  JSON.stringify({
    home: [{ id: "e1", amount: 250, category: "Groceries", date: "2026-11-01", note: "Milk" }],
    business: [],
  })
);

const { loadStorage, get } = await import("../js/storage.js");
const { loadAll, state } = await import("../js/store.js");
const {
  createOrder,
  addPayment,
  addCity,
  balanceOf,
  orderTotal,
  setOrderStatus,
  setWorkStatus,
  confirmWorkDelivered,
  workForOrder,
} = await import("../js/order-book.js");

loadStorage();
loadAll();

assert.equal(get("expenses").some((expense) => expense.note === "Milk" && expense.space === "home"), true);
assert.match(memory.get("expense-spaces"), /Milk/);
assert.equal(get("cities").some((city) => city.name === "Lahore"), true);

const lahore = addCity("Lahore");
assert.equal(lahore.ok, true);
const before = get("cities").length;
addCity("lahore");
assert.equal(get("cities").length, before);

const created = createOrder({
  customerName: "Ayesha Khan",
  phone: "0300-1234567",
  cityId: lahore.city.id,
  address: "Model Town",
  items: [
    { name: "Lawn suit", qty: "2", price: "2500" },
  ],
  orderDate: "2026-11-01",
  deliveryDate: "2026-11-10",
  notes: "Call before delivery",
  advanceAmount: "1500",
  advanceMethod: "Easypaisa",
});
assert.equal(created.ok, true, created.error);
assert.equal(orderTotal(created.order), 5000);
assert.equal(balanceOf(created.order), 3500);
assert.equal(created.order.paymentStatus, "Advance Received");
assert.equal(created.order.cityName, "Lahore");
assert.equal(state.sales.length, 1);
assert.equal(state.sales[0].kind, "advance");
assert.equal(state.sales[0].orderId, created.order.id);
assert.equal(state.sales[0].paymentId, created.order.payments[0].id);

const second = addPayment(created.order.id, {
  amount: "2000",
  date: "2026-11-05",
  method: "Cash",
});
assert.equal(second.ok, true, second.error);
assert.equal(balanceOf(second.order), 1500);
assert.equal(second.order.paymentStatus, "Advance Received");
assert.equal(state.sales.length, 2);
assert.equal(new Set(state.sales.map((sale) => sale.paymentId)).size, 2);

const work = workForOrder(created.order.id);
assert.ok(work);
assert.equal(work.status, "Not Started");

setOrderStatus(created.order.id, "Fulfilled");
assert.equal(get("orders", created.order.id).status, "Fulfilled");
assert.equal(workForOrder(created.order.id).status, "Delivered");
assert.equal(state.sales.every((sale) => sale.kind === "earned"), true);

setOrderStatus(created.order.id, "In Progress");
assert.equal(workForOrder(created.order.id).status, "Ready");

const ask = setWorkStatus(work.id, "Delivered");
assert.equal(ask.needsConfirm, true);
assert.equal(get("orders", created.order.id).status, "In Progress");
confirmWorkDelivered(work.id);
assert.equal(get("orders", created.order.id).status, "Fulfilled");
assert.equal(workForOrder(created.order.id).status, "Delivered");

const paid = addPayment(created.order.id, { amount: "1500", date: "2026-11-12", method: "JazzCash" });
assert.equal(paid.ok, true, paid.error);
assert.equal(balanceOf(paid.order), 0);
assert.equal(paid.order.paymentStatus, "Paid in Full");
assert.equal(state.sales.length, 3);

loadStorage();
loadAll();
const restored = get("orders", created.order.id);
assert.equal(restored.customerName, "Ayesha Khan");
assert.equal(restored.payments.length, 3);
assert.equal(balanceOf(restored), 0);
assert.equal(workForOrder(created.order.id).status, "Delivered");
assert.equal(state.sales.length, 3);
assert.match(memory.get("expense-spaces"), /Milk/);

console.log("orders test passed");
