const MONTHS = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const COMPANIES = [
  { type: "electricity", name: "K-Electric", pattern: /k\s*-?\s*electric/i },
  { type: "electricity", name: "GEPCO", pattern: /\bgepco\b/i },
  { type: "electricity", name: "LESCO", pattern: /\blesco\b/i },
  { type: "electricity", name: "IESCO", pattern: /\biesco\b/i },
  { type: "electricity", name: "MEPCO", pattern: /\bmepco\b/i },
  { type: "electricity", name: "FESCO", pattern: /\bfesco\b/i },
  { type: "electricity", name: "HESCO", pattern: /\bhesco\b/i },
  { type: "electricity", name: "PESCO", pattern: /\bpesco\b/i },
  { type: "electricity", name: "QESCO", pattern: /\bqesco\b/i },
  { type: "electricity", name: "SEPCO", pattern: /\bsepco\b/i },
  { type: "gas", name: "SNGPL", pattern: /\bsngpl\b|sui\s+northern/i },
  { type: "gas", name: "SSGC", pattern: /\bssgc\b|sui\s+southern/i },
  { type: "water", name: "WASA", pattern: /\bwasa\b/i },
  { type: "internet", name: "StormFiber", pattern: /storm\s*-?\s*fiber/i },
  { type: "internet", name: "PTCL", pattern: /\bptcl\b/i },
  { type: "mobile", name: "Jazz", pattern: /\bjazz\b(?!\s*cash)/i },
  { type: "mobile", name: "Zong", pattern: /\bzong\b/i },
  { type: "mobile", name: "Ufone", pattern: /\bufone\b/i },
  { type: "mobile", name: "Telenor", pattern: /\btelenor\b/i },
];

const DUE_LABEL = /due\s*date|payable\s*by|آخری\s*تاریخ/i;
const WITHIN_LABEL = /payable\s+within\s+due|within\s+due\s+date|amount\s+payable\s+within|pay\s+within\s+due/i;
const AFTER_LABEL = /after\s+due\s+date|payable\s+after|late\s+payment|amount\s+after\s+due/i;
const OTHER_DATE_LABEL = /issue\s*date|reading\s*date|bill\s*date|print\s*date|billing\s*date/i;
const CONSUMER_LABEL = /(consumer|reference|account|customer)\s*(number|no\.?|id|#)?|\bref(?:erence)?\s*(?:no\.?|number|#)/i;
const MONTH_LABEL = /billing\s*month|bill\s*month|for\s+the\s+month/i;
const UNITS_LABEL = /units?\s*consumed|consumed\s*units|\bkwh\b|\bhm3\b|\bmmbtu\b/i;

const DATE_TOKEN =
  /(\d{1,2})\s*[/\-.]\s*([A-Za-z]{3,9}|\d{1,2})\s*[/\-.]\s*(\d{2,4})|(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9}),?\s+(\d{2,4})|([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{2,4})/g;

export function emptyBill() {
  return {
    billType: "",
    company: "",
    consumerNumber: "",
    billingMonth: "",
    dueDate: "",
    amountWithin: null,
    amountAfter: null,
    units: "",
    otherDates: [],
  };
}

export function parseBill(text) {
  const source = String(text || "");
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const found = emptyBill();
  const company = detectCompany(source);
  if (company) {
    found.billType = company.type;
    found.company = company.name;
  }
  found.consumerNumber = labeledValue(lines, CONSUMER_LABEL, consumerOnLine) || "";
  found.billingMonth = labeledValue(lines, MONTH_LABEL, monthOnLine) || "";
  found.dueDate = labeledValue(lines, DUE_LABEL, dateOnLine) || "";
  found.amountWithin = labeledValue(lines, (line) => WITHIN_LABEL.test(line) && !AFTER_LABEL.test(line), amountOnLine);
  found.amountAfter = labeledValue(lines, AFTER_LABEL, amountOnLine);
  found.units = labeledValue(lines, UNITS_LABEL, unitsOnLine) || "";
  found.otherDates = otherDates(lines, found.dueDate);
  if (found.amountWithin == null) found.amountWithin = null;
  if (found.amountAfter == null) found.amountAfter = null;
  return found;
}

export function billTypeLabel(type) {
  if (type === "electricity") return "Electricity";
  if (type === "gas") return "Gas";
  if (type === "water") return "Water";
  if (type === "internet") return "Internet";
  if (type === "mobile") return "Mobile";
  if (type === "other") return "Other";
  return "";
}

function detectCompany(text) {
  const source = String(text || "");
  for (const company of COMPANIES) {
    if (company.pattern.test(source)) return company;
  }
  return null;
}

function labeledValue(lines, labelTest, read) {
  const test = typeof labelTest === "function" ? labelTest : (line) => labelTest.test(line);
  for (let index = 0; index < lines.length; index += 1) {
    if (!test(lines[index])) continue;
    const onLine = read(lines[index]);
    if (onLine) return onLine;
    if (index + 1 < lines.length) {
      const next = read(lines[index + 1]);
      if (next) return next;
    }
  }
  return null;
}

function consumerOnLine(line) {
  const matches = String(line).match(/\d[\d\s-]{4,}\d/g) || [];
  const token = matches
    .map((item) => item.replace(/[^\d]/g, ""))
    .find((item) => item.length >= 6 && item.length <= 20);
  return token || "";
}

function monthOnLine(line) {
  const named = line.match(/([A-Za-z]{3,9})[\s\-/]*(\d{4}|\d{2})\b/);
  if (named && MONTHS[named[1].toLowerCase()]) {
    return monthKey(MONTHS[named[1].toLowerCase()], named[2]);
  }
  const numeric = line.match(/\b(\d{1,2})\s*[/\-]\s*(\d{4})\b/);
  if (numeric) return monthKey(Number(numeric[1]), numeric[2]);
  return "";
}

function monthKey(month, year) {
  let y = Number(year);
  if (y < 100) y += 2000;
  const m = Number(month);
  if (m < 1 || m > 12 || y < 2000 || y > 2100) return "";
  return `${y}-${String(m).padStart(2, "0")}`;
}

function dateOnLine(line) {
  const dates = datesIn(line);
  return dates[0] || "";
}

function datesIn(line) {
  const found = [];
  const pattern = new RegExp(DATE_TOKEN.source, "g");
  let match;
  while ((match = pattern.exec(line))) {
    const iso = match[1]
      ? toIso(match[1], match[2], match[3])
      : match[4]
        ? toIso(match[4], match[5], match[6])
        : toIso(match[8], match[7], match[9]);
    if (iso) found.push(iso);
  }
  return found;
}

function toIso(day, month, year) {
  const monthNumber = MONTHS[String(month).toLowerCase()] || Number(month);
  let y = Number(year);
  const d = Number(day);
  if (y < 100) y += 2000;
  if (!monthNumber || monthNumber < 1 || monthNumber > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return "";
  const date = new Date(y, monthNumber - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== monthNumber - 1 || date.getDate() !== d) return "";
  return `${y}-${String(monthNumber).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function amountOnLine(line) {
  const pattern = /(?:rs\.?|pkr|₨)?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/gi;
  let match;
  let last = null;
  while ((match = pattern.exec(line))) {
    const value = Number(`${match[1].replace(/,/g, "")}${match[2] ? `.${match[2]}` : ""}`);
    if (!Number.isFinite(value) || value <= 0) continue;
    if (!match[1].includes(",") && !match[2] && value >= 1900 && value <= 2100) continue;
    last = Math.round((value + Number.EPSILON) * 100) / 100;
  }
  return last;
}

function unitsOnLine(line) {
  const match = String(line).match(/(\d+(?:\.\d+)?)/);
  return match ? match[1] : "";
}

function otherDates(lines, dueDate) {
  const rows = [];
  lines.forEach((line, index) => {
    if (!OTHER_DATE_LABEL.test(line) || DUE_LABEL.test(line)) return;
    const iso = dateOnLine(line) || (lines[index + 1] ? dateOnLine(lines[index + 1]) : "");
    if (!iso || iso === dueDate) return;
    const label = line.match(OTHER_DATE_LABEL);
    rows.push({ label: label ? label[0].replace(/\s+/g, " ") : "Date", date: iso });
  });
  return rows;
}
