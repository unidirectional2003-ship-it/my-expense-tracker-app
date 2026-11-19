import { roundMoney } from "./money.js";
import { get, save, deleteRecord } from "./storage.js";
import { linkedOrderBalances } from "./order-book.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function cleanRepayment(row, index) {
  if (!row || typeof row !== "object") return null;
  const amount = roundMoney(Number(row.amount));
  const date = typeof row.date === "string" ? row.date : "";
  if (!(amount > 0) || !DATE.test(date)) return null;
  const next = {
    id: typeof row.id === "string" && row.id ? row.id : `repay-${index}`,
    date,
    amount,
  };
  const note = typeof row.note === "string" ? row.note.trim() : "";
  if (note) next.note = note.slice(0, 120);
  return next;
}

export function normalizeUdhaar(entry) {
  if (!entry || typeof entry.id !== "string" || !entry.id) return null;
  const person = String(entry.person || "").trim();
  const amount = roundMoney(Number(entry.amount));
  const givenDate = typeof entry.givenDate === "string" ? entry.givenDate : "";
  if (!person || !(amount > 0) || !DATE.test(givenDate)) return null;
  const dueDate = typeof entry.dueDate === "string" && DATE.test(entry.dueDate) ? entry.dueDate : "";
  const repayments = (Array.isArray(entry.repayments) ? entry.repayments : [])
    .map(cleanRepayment)
    .filter(Boolean);
  return {
    id: entry.id,
    direction: entry.direction === "payable" ? "payable" : "receivable",
    person: person.slice(0, 80),
    phone: String(entry.phone || "").trim().slice(0, 24),
    customerId: typeof entry.customerId === "string" ? entry.customerId : "",
    amount,
    reason: String(entry.reason || "").trim().slice(0, 120),
    givenDate,
    dueDate,
    notes: String(entry.notes || "").trim().slice(0, 240),
    repayments,
  };
}

export function listUdhaar() {
  return get("udhaar").map(normalizeUdhaar).filter(Boolean);
}

export function repaidOf(entry) {
  return roundMoney((entry.repayments || []).reduce((sum, row) => sum + roundMoney(row.amount), 0));
}

export function remainingOf(entry) {
  return roundMoney(Math.max(0, entry.amount - repaidOf(entry)));
}

export function statusOf(entry) {
  if (remainingOf(entry) <= 0) return "Settled";
  if (repaidOf(entry) > 0) return "Partly Paid";
  return "Open";
}

export function customerOptions() {
  const map = new Map();
  get("customers").forEach((customer) => {
    const name = String(customer.name || "").trim();
    if (!name) return;
    map.set(name.toLowerCase(), {
      id: customer.id,
      name,
      phone: customer.whatsapp || customer.phone || "",
    });
  });
  get("orders").forEach((order) => {
    const name = String(order.customerName || "").trim();
    if (!name || map.has(name.toLowerCase())) return;
    map.set(name.toLowerCase(), {
      id: order.customerId || "",
      name,
      phone: order.phone || "",
    });
  });
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function phoneForName(name) {
  const match = customerOptions().find((customer) => customer.name.toLowerCase() === String(name || "").trim().toLowerCase());
  return match ? match.phone : "";
}

export function udhaarTotals() {
  const entries = listUdhaar();
  const owed = entries
    .filter((entry) => entry.direction === "receivable")
    .reduce((sum, entry) => sum + remainingOf(entry), 0);
  const owe = entries
    .filter((entry) => entry.direction === "payable")
    .reduce((sum, entry) => sum + remainingOf(entry), 0);
  const orders = linkedOrderBalances().reduce((sum, row) => sum + row.balance, 0);
  return {
    owedToMe: roundMoney(owed + orders),
    iOwe: roundMoney(owe),
  };
}

export { linkedOrderBalances };

export function createUdhaar(input) {
  const person = String(input.person || "").trim().replace(/\s+/g, " ");
  const reason = String(input.reason || "").trim().replace(/\s+/g, " ");
  const notes = String(input.notes || "").trim();
  const givenDate = String(input.givenDate || "");
  const dueDate = String(input.dueDate || "").trim();
  let phone = String(input.phone || "").trim();
  let customerId = typeof input.customerId === "string" ? input.customerId : "";
  const amount = roundMoney(Number(input.amount));
  if (!person) return { ok: false, error: "Enter a person, or pick a customer." };
  if (person.length > 80) return { ok: false, error: "Use a name of 80 characters or less." };
  if (!(amount > 0)) return { ok: false, error: "Enter an amount greater than 0." };
  if (!reason) return { ok: false, error: "Enter a reason." };
  if (reason.length > 120) return { ok: false, error: "Use a reason of 120 characters or less." };
  if (!DATE.test(givenDate)) return { ok: false, error: "Enter the date given." };
  if (dueDate && !DATE.test(dueDate)) return { ok: false, error: "Enter a real promised return date." };
  if (dueDate && dueDate < givenDate) {
    return { ok: false, error: "Promised return date cannot be before the date given." };
  }
  const match = customerOptions().find((customer) => customer.name.toLowerCase() === person.toLowerCase());
  if (match) {
    if (!phone) phone = match.phone || "";
    if (!customerId) customerId = match.id || "";
  }
  const digits = phone.replace(/\D/g, "");
  if (phone && digits.length < 7) {
    return { ok: false, error: "Enter a phone number with at least 7 digits, or leave it blank." };
  }
  const record = {
    id: crypto.randomUUID(),
    direction: input.direction === "payable" ? "payable" : "receivable",
    person: person.slice(0, 80),
    phone: phone.slice(0, 24),
    customerId,
    amount,
    reason: reason.slice(0, 120),
    givenDate,
    dueDate,
    notes: notes.slice(0, 240),
    repayments: [],
  };
  save("udhaar", record);
  return { ok: true, entry: normalizeUdhaar(record) };
}

export function addRepayment(id, input) {
  const stored = get("udhaar", id);
  const entry = normalizeUdhaar(stored);
  if (!entry) return { ok: false, error: "That udhaar is no longer here." };
  const amount = roundMoney(Number(input.amount));
  if (!(amount > 0)) return { ok: false, error: "Enter a repayment greater than 0." };
  const remaining = remainingOf(entry);
  if (remaining <= 0) return { ok: false, error: "This udhaar is already settled." };
  if (amount - remaining > 0.001) return { ok: false, error: "That repayment is more than the remaining balance." };
  if (!DATE.test(String(input.date || ""))) return { ok: false, error: "Enter the repayment date." };
  const note = String(input.note || "").trim().slice(0, 120);
  const repayment = { id: crypto.randomUUID(), date: input.date, amount };
  if (note) repayment.note = note;
  save("udhaar", { ...stored, repayments: [...entry.repayments, repayment] });
  return { ok: true };
}

export function removeRepayment(id, repaymentId) {
  const stored = get("udhaar", id);
  const entry = normalizeUdhaar(stored);
  if (!entry) return { ok: false, error: "That udhaar is no longer here." };
  const repayments = entry.repayments.filter((row) => row.id !== repaymentId);
  if (repayments.length === entry.repayments.length) return { ok: false, error: "That repayment is no longer here." };
  save("udhaar", { ...stored, repayments });
  return { ok: true };
}

export function deleteUdhaar(id) {
  return deleteRecord("udhaar", id);
}
