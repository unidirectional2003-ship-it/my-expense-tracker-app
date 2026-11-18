import { roundMoney, sameMoney } from "./money.js";

export const ACCOUNT_TYPES = ["Cash", "Bank", "Easypaisa", "JazzCash", "Other wallet"];

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export function digitRun(value) {
  const match = String(value || "").match(/\d(?:[ -]?\d){4,}/);
  if (!match) return 0;
  return match[0].replace(/\D/g, "").length;
}

export function sensitiveNumber(value) {
  return digitRun(value) >= 5;
}

export function validateAccountDraft(input) {
  const name = String(input.name || "").trim();
  const type = ACCOUNT_TYPES.includes(input.type) ? input.type : "";
  const provider = String(input.provider || "").trim();
  const opening = roundMoney(Number(input.openingBalance));
  const last4 = String(input.last4 || "").trim();
  if (sensitiveNumber(name) || sensitiveNumber(provider)) {
    return {
      ok: false,
      error: "That looks like a full account or card number. Only the last 4 digits can be saved. Passwords, PINs, and OTPs are never stored.",
    };
  }
  if (!name) return { ok: false, error: "Enter a name for this account." };
  if (!type) return { ok: false, error: "Choose Cash, Bank, Easypaisa, JazzCash, or Other wallet." };
  if (!Number.isFinite(opening) || opening < 0) return { ok: false, error: "Enter an opening balance of 0 or more." };
  if (last4 && !/^\d{4}$/.test(last4)) {
    return {
      ok: false,
      error: "Only the last 4 digits are allowed. A longer number is refused so a full account or card number is never saved.",
    };
  }
  return {
    ok: true,
    account: {
      name: name.slice(0, 60),
      type,
      provider: provider.slice(0, 60),
      openingBalance: opening,
      last4,
    },
  };
}

export function accountBalance(account, expenses, sales) {
  let total = roundMoney(Number(account.openingBalance) || 0);
  expenses.forEach((expense) => {
    if (expense.accountId === account.id) total = roundMoney(total - Number(expense.amount));
  });
  sales.forEach((sale) => {
    if (sale.accountId !== account.id) return;
    const cash = Number.isFinite(Number(sale.cashReceived)) ? Number(sale.cashReceived) : Number(sale.amount);
    total = roundMoney(total + cash);
  });
  return total;
}

export function parseBankText(text) {
  const source = String(text || "").replace(/\r/g, "");
  const lines = source.split("\n").map((line) => line.trim()).filter(Boolean);
  const chunks = lines.length > 1 ? lines : [source.trim()];
  const rows = [];
  chunks.forEach((chunk) => {
    const row = parseBankChunk(chunk);
    if (row) rows.push(row);
  });
  if (rows.length) return rows;
  const single = parseBankChunk(source);
  return single ? [single] : [];
}

function parseBankChunk(chunk) {
  const amount = findAmount(chunk);
  if (amount == null) return null;
  const kind = findKind(chunk);
  const date = findDate(chunk) || todayIso();
  const reference = findReference(chunk);
  const who = findParty(chunk);
  const note = who || cleanNote(chunk);
  return {
    amount,
    date,
    kind,
    note: note.slice(0, 120) || (kind === "income" ? "Money in" : "Money out"),
    reference,
    party: who,
  };
}

function findAmount(text) {
  const patterns = [
    /(?:rs\.?|pkr)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i,
    /([0-9][0-9,]*(?:\.\d{1,2})?)\s*(?:rs\.?|pkr)/i,
    /(?:amount|amt)[:\s]*([0-9][0-9,]*(?:\.\d{1,2})?)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = roundMoney(Number(match[1].replace(/,/g, "")));
    if (value > 0) return value;
  }
  return null;
}

function findKind(text) {
  const lower = text.toLowerCase();
  const creditAt = indexOfAny(lower, ["credited", "credit", "received", "deposited", "money in", "added"]);
  const debitAt = indexOfAny(lower, ["debited", "debit", "sent", "paid", "payment", "withdrawn", "purchase", "money out"]);
  if (creditAt === -1 && debitAt === -1) return "expense";
  if (creditAt === -1) return "expense";
  if (debitAt === -1) return "income";
  return creditAt < debitAt ? "income" : "expense";
}

function indexOfAny(text, words) {
  let found = -1;
  words.forEach((word) => {
    const at = text.indexOf(word);
    if (at !== -1 && (found === -1 || at < found)) found = at;
  });
  return found;
}

function findDate(text) {
  const numeric = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    let year = Number(numeric[3]);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return iso(year, month, day);
  }
  const named = text.match(/(\d{1,2})[-\s](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-\s,]*(\d{4})/i);
  if (named) {
    const month = MONTHS[named[2].slice(0, 3).toLowerCase()];
    return iso(Number(named[3]), month, Number(named[1]));
  }
  return "";
}

function findReference(text) {
  const match = text.match(/(?:ref(?:erence)?|tid|trx|trnx|rrn|txn)[:\s#\-]*([A-Za-z0-9]{4,24})/i);
  if (!match) return "";
  return match[1].slice(0, 24);
}

function findParty(text) {
  const match = text.match(/(?:from|to|sender|receiver|paid to|received from)\s+([A-Za-z][A-Za-z .'-]{1,40})/i);
  if (!match) return "";
  return match[1].replace(/\s+/g, " ").trim().slice(0, 60);
}

function cleanNote(text) {
  return text.replace(/\s+/g, " ").trim().slice(0, 120);
}

function iso(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function todayIso() {
  const now = new Date();
  return iso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === ",") {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell.trim());
      if (row.some((value) => value)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  row.push(cell.trim());
  if (row.some((value) => value)) rows.push(row);
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0];
  const records = rows.slice(1).map((values) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header || `Column ${index + 1}`] = values[index] || "";
    });
    return record;
  });
  return { headers, records };
}

export function extractPdfText(bytes) {
  const raw = typeof bytes === "string" ? bytes : new TextDecoder("latin1").decode(bytes);
  const parts = [];
  const pattern = /\(((?:\\.|[^\\)])*)\)\s*Tj/g;
  let match = pattern.exec(raw);
  while (match) {
    parts.push(match[1].replace(/\\n/g, "\n").replace(/\\(.)/g, "$1"));
    match = pattern.exec(raw);
  }
  return parts.join("\n").trim();
}

export function rowsFromMapping(records, mapping) {
  return records.map((record) => {
    const amountText = record[mapping.amount] || "";
    const signed = roundMoney(Number(String(amountText).replace(/[^\d.-]/g, "")));
    const typeText = mapping.type ? String(record[mapping.type] || "") : "";
    let kind = "expense";
    if (/credit|in|received|deposit/i.test(typeText)) kind = "income";
    else if (/debit|out|sent|paid|purchase/i.test(typeText)) kind = "expense";
    else if (signed < 0) kind = "expense";
    else if (mapping.signed === "in-positive") kind = "income";
    const amount = roundMoney(Math.abs(signed));
    const date = normalizeImportedDate(record[mapping.date] || "");
    const note = String(record[mapping.note] || "Imported transaction").trim().slice(0, 120);
    const reference = mapping.reference ? String(record[mapping.reference] || "").trim().slice(0, 24) : "";
    if (!(amount > 0) || !date) return null;
    return { amount, date, kind, note, reference, party: "" };
  }).filter(Boolean);
}

export function normalizeImportedDate(value) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const named = findDate(text);
  if (named) return named;
  const numeric = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!numeric) return "";
  let year = Number(numeric[3]);
  if (year < 100) year += 2000;
  return iso(year, Number(numeric[2]), Number(numeric[1]));
}

export function annotateImports(rows, existing) {
  const seen = [];
  return rows.map((row) => {
    const duplicate = isDuplicate(row, existing) || isDuplicate(row, seen);
    seen.push(row);
    return { ...row, duplicate, include: !duplicate };
  });
}

function isDuplicate(row, list) {
  return list.some((item) => {
    if (!sameMoney(item.amount, row.amount) || item.date !== row.date) return false;
    const left = String(item.reference || "").trim().toLowerCase();
    const right = String(row.reference || "").trim().toLowerCase();
    if (left && right) return left === right;
    if (!left && !right) return true;
    return false;
  });
}

export function suggestOrderMatch(row, orders) {
  if (!row || row.kind !== "income") return null;
  const text = `${row.note} ${row.party || ""}`.toLowerCase();
  const matches = orders.filter((order) => {
    const name = String(order.customerName || "").trim().toLowerCase();
    if (!name || !text.includes(name)) return false;
    const due = roundMoney(Number(order.balance));
    return sameMoney(due, row.amount);
  });
  return matches[0] || null;
}

export function likelyMissing(diff, pool) {
  const gap = roundMoney(Math.abs(diff));
  if (!(gap > 0)) return [];
  const direction = diff > 0 ? "income" : "expense";
  const exact = pool.filter((item) => item.kind === direction && sameMoney(item.amount, gap));
  if (exact.length) return exact.slice(0, 8);
  return pool
    .filter((item) => item.kind === direction)
    .slice()
    .sort((a, b) => Math.abs(a.amount - gap) - Math.abs(b.amount - gap))
    .slice(0, 3);
}
