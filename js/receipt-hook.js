/**
 * Links a scanned photo to a record already stored on this device.
 * The photo is never uploaded. Call attachReceipt(entityType, entityId)
 * after the owner has checked the values and chosen to save.
 */
import { deleteRecord, get, save } from "./storage.js";
import { saveBills, saveSales, saveSpaces, state } from "./store.js";
import { parseMoney, sameMoney } from "./money.js";

const arms = [];

export function armReceipt(hostKey, entityType, payload) {
  const next = arms.filter((arm) => arm.hostKey !== hostKey);
  next.push({ hostKey, entityType, ...payload, entityId: "" });
  arms.length = 0;
  arms.push(...next);
}

export function clearArm(hostKey) {
  const kept = arms.filter((arm) => arm.hostKey !== hostKey);
  arms.length = 0;
  arms.push(...kept);
}

export function pinReceipt(hostKey, entityId) {
  const arm = arms.find((item) => item.hostKey === hostKey && !item.entityId);
  if (arm) arm.entityId = entityId;
}

function findArm(entityType, entityId) {
  return arms.findIndex((arm) => arm.entityId === entityId && arm.entityType === entityType);
}

function verdict(proofAmount, enteredRaw) {
  if (proofAmount == null) return false;
  const entered = parseMoney(enteredRaw, { allowZero: true });
  if (!entered.ok) return false;
  return sameMoney(proofAmount, entered.value);
}

export function attachReceipt(entityType, entityId) {
  if (!entityType || !entityId) return null;
  const index = findArm(entityType, entityId);
  if (index === -1) return null;
  const arm = arms[index];
  if (typeof arm.image !== "string" || !arm.image.startsWith("data:image/")) return null;

  const receiptId = crypto.randomUUID();
  save("receipts", {
    id: receiptId,
    dataUrl: arm.image,
    entityType,
    entityId,
    createdAt: new Date().toISOString(),
  });
  arms.splice(index, 1);

  const entered = typeof arm.enteredNow === "function" ? arm.enteredNow() : "";
  const verified = entityType === "payment" ? verdict(arm.proofAmount, entered) : undefined;
  linkRecord(entityType, entityId, receiptId, arm, verified);
  return receiptId;
}

function linkRecord(entityType, entityId, receiptId, arm, verified) {
  if (entityType === "expense" || entityType === "bill") {
    for (const spaceName of Object.keys(state.spaces)) {
      const expense = state.spaces[spaceName].find((item) => item.id === entityId);
      if (!expense) continue;
      expense.receiptId = receiptId;
      if (arm.merchant && !expense.merchant) expense.merchant = arm.merchant;
      saveSpaces();
      return;
    }
    const bill = state.bills.find((item) => item.id === entityId);
    if (bill) {
      bill.receiptId = receiptId;
      saveBills();
    }
  }

  if (entityType === "payment") {
    const orders = get("orders");
    for (const order of orders) {
      const payment = (order.payments || []).find((item) => item.id === entityId);
      if (!payment) continue;
      payment.receiptId = receiptId;
      payment.verified = verified === true;
      if (typeof arm.proofAmount === "number") payment.proofAmount = arm.proofAmount;
      if (arm.proofDate) payment.proofDate = arm.proofDate;
      save("orders", order);
      copyProofToSale(entityId, receiptId, payment);
      return;
    }
    const sale = state.sales.find((item) => item.id === entityId);
    if (sale) {
      sale.paymentProofId = receiptId;
      sale.verified = verified === true;
      if (typeof arm.proofAmount === "number") sale.proofAmount = arm.proofAmount;
      if (arm.proofDate) sale.proofDate = arm.proofDate;
      saveSales();
    }
  }
}

function copyProofToSale(paymentId, receiptId, payment) {
  const sale = state.sales.find((item) => item.paymentId === paymentId);
  if (!sale) return;
  sale.paymentProofId = receiptId;
  sale.verified = payment.verified === true;
  if (typeof payment.proofAmount === "number") sale.proofAmount = payment.proofAmount;
  if (payment.proofDate) sale.proofDate = payment.proofDate;
  saveSales();
}

export function removeReceipt(receiptId) {
  if (!receiptId) return;
  try {
    deleteRecord("receipts", receiptId);
  } catch {
    // The legacy photo map is removed with the receipt row when storage can write.
  }
}
