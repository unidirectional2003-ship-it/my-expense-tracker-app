import { state, saveSales } from "./store.js";
import { roundMoney } from "./money.js";

function saleFromPayment(order, payment) {
  const fulfilled = order.status === "Fulfilled";
  const amount = roundMoney(payment.amount);
  return {
    id: `pay-${payment.id}`,
    amount,
    date: payment.date,
    note: `Order ${order.orderNumber} · ${order.customerName}`,
    customer: order.customerName || "",
    kind: fulfilled ? "earned" : "advance",
    earnedAmount: fulfilled ? amount : 0,
    cashReceived: amount,
    orderId: order.id,
    paymentId: payment.id,
  };
}

export function recordPaymentIncome(order, payment) {
  const next = saleFromPayment(order, payment);
  const index = state.sales.findIndex((sale) => sale.paymentId === payment.id);
  if (index === -1) state.sales.unshift(next);
  else state.sales[index] = { ...state.sales[index], ...next, id: state.sales[index].id };
  saveSales();
}

export function refreshOrderIncome(order) {
  let changed = false;
  (order.payments || []).forEach((payment) => {
    const index = state.sales.findIndex((sale) => sale.paymentId === payment.id);
    if (index === -1) return;
    const next = saleFromPayment(order, payment);
    state.sales[index] = { ...state.sales[index], ...next, id: state.sales[index].id };
    changed = true;
  });
  if (!changed) return;
  saveSales();
}
