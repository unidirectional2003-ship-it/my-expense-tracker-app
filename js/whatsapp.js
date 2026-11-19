import { get } from "./storage.js";

export const DEFAULT_REMINDER_TEMPLATE =
  "Assalam o Alaikum {name}, this is a reminder that {amount} is still due for {reason}. The promised date was {date}. Please let me know when you can return it. Thank you.";

const SETTING_IDS = ["whatsappTemplate", "whatsapp-template", "reminderTemplate", "udhaarTemplate", "messageTemplate"];
const TEXT_KEYS = ["template", "body", "text", "message", "content", "value"];
const EXTRA_COLLECTIONS = ["templates", "messageTemplates", "whatsappTemplates", "messages", "customers"];

function placeholderText(value) {
  if (typeof value !== "string") return "";
  return /\{\{?\s*(name|person|customer|amount)\s*\}?\}/.test(value) ? value : "";
}

function templateText(row) {
  if (typeof row === "string") return placeholderText(row);
  if (!row || typeof row !== "object") return "";
  for (const key of TEXT_KEYS) {
    const text = placeholderText(row[key]);
    if (text) return text;
  }
  return "";
}

function preferredRow(rows) {
  if (!Array.isArray(rows)) return "";
  const ranked = rows.find((row) => {
    if (!row || typeof row !== "object") return false;
    const label = `${row.id || ""} ${row.kind || ""} ${row.name || ""} ${row.purpose || ""}`.toLowerCase();
    return label.includes("udhaar") || label.includes("remind") || label.includes("whatsapp");
  });
  return templateText(ranked) || rows.map(templateText).find(Boolean) || "";
}

function storedTemplates() {
  try {
    const parsed = JSON.parse(localStorage.getItem("tracker-db") || "null");
    const collections = parsed && parsed.collections;
    if (!collections || typeof collections !== "object") return "";
    for (const name of EXTRA_COLLECTIONS) {
      const text = preferredRow(collections[name]);
      if (text) return text;
    }
  } catch {
    return "";
  }
  return "";
}

function looseTemplate() {
  const keys = ["whatsapp-template", "message-template", "udhaar-template"];
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      if (raw.trim().startsWith("{")) {
        const text = templateText(JSON.parse(raw));
        if (text) return text;
      }
      const text = placeholderText(raw);
      if (text) return text;
    } catch {
      // A template that cannot be read falls through to the default reminder.
    }
  }
  return "";
}

export function reminderTemplate() {
  for (const id of SETTING_IDS) {
    const text = templateText(get("settings", id));
    if (text) return text;
  }
  const fromSettings = preferredRow(get("settings"));
  if (fromSettings) return fromSettings;
  return storedTemplates() || looseTemplate() || DEFAULT_REMINDER_TEMPLATE;
}

export function fillReminder(template, fields) {
  const map = {
    name: fields.name || "",
    person: fields.name || "",
    customer: fields.name || "",
    amount: fields.amount || "",
    balance: fields.amount || "",
    reason: fields.reason || "",
    date: fields.date || "",
    due: fields.date || "",
    order: fields.order || "",
    phone: fields.phone || "",
  };
  return String(template || DEFAULT_REMINDER_TEMPLATE).replace(
    /\{\{\s*(\w+)\s*\}\}|\{(\w+)\}/g,
    (full, doubleKey, singleKey) => {
      const key = doubleKey || singleKey;
      return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : full;
    }
  );
}

export function normalizePhone(phone) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `92${digits.slice(1)}`;
  if (digits.length < 10 || digits.length > 15) return "";
  return digits;
}

export function whatsappLink(phone, message) {
  const digits = normalizePhone(phone);
  if (!digits || !message) return "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
