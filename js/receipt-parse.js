import { roundMoney } from "./money.js";

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

const MERCHANT_SKIP =
  /^(receipt|tax\s*invoice|invoice|cash\s*memo|sales\s*receipt|bill|welcome|original|duplicate|customer\s*copy|thank\s*you|thanks|date|time|cashier|counter|pos|paid|cash|change)$/i;

const CATEGORY_RULES = [
  {
    key: "utilities",
    terms: ["k-electric", "kelectric", "sui gas", "utility", "utilities", "ptcl", "internet", "wapda", "electricity", "water bill"],
  },
  {
    key: "fuel",
    terms: ["petrol", "diesel", "fuel", "cng", "pso", "shell", "gas station", "total parco", "attock"],
  },
  {
    key: "groceries",
    terms: ["grocery", "groceries", "supermarket", "super market", "imtiaz", "hyperstar", "al-fatah", "alfatah", "naheed", "carrefour", "vegetable", "fruit", "mart"],
  },
  {
    key: "food",
    terms: ["restaurant", "cafe", "coffee", "pizza", "burger", "bakery", "kitchen", "dine", "food"],
  },
  {
    key: "materials",
    terms: ["material", "materials", "hardware", "cement", "steel", "timber", "paint", "sanitary", "plywood"],
  },
  {
    key: "transport",
    terms: ["transport", "uber", "careem", "taxi", "rickshaw", "railway", "indrive", "bykea", "bus fare"],
  },
  {
    key: "health",
    terms: ["pharmacy", "pharma", "hospital", "clinic", "medical", "medicine"],
  },
  { key: "rent", terms: ["rent"] },
  { key: "kids", terms: ["school", "tuition", "kids"] },
  { key: "shopping", terms: ["mall", "boutique", "garment"] },
  { key: "marketing", terms: ["marketing", "advertis"] },
  { key: "salary", terms: ["salary", "salaries", "wages"] },
  { key: "tools", terms: ["tools", "equipment"] },
  { key: "delivery", terms: ["delivery", "courier", "tcs", "leopards"] },
];

const CATEGORY_FOR_SPACE = {
  home: {
    groceries: "Groceries",
    food: "Groceries",
    fuel: "Transport",
    utilities: "Bills",
    materials: "Shopping",
    transport: "Transport",
    health: "Health",
    rent: "Rent",
    kids: "Kids",
    shopping: "Shopping",
    marketing: "Other",
    salary: "Other",
    tools: "Shopping",
    delivery: "Transport",
  },
  business: {
    groceries: "Other",
    food: "Other",
    fuel: "Delivery",
    utilities: "Other",
    materials: "Materials",
    transport: "Delivery",
    health: "Other",
    rent: "Rent",
    kids: "Other",
    shopping: "Other",
    marketing: "Marketing",
    salary: "Salaries",
    tools: "Tools",
    delivery: "Delivery",
  },
};

export function parseReceipt(text) {
  const source = String(text || "");
  const merchant = extractMerchant(source);
  const amount = extractAmount(source);
  return {
    amount,
    date: extractDate(source),
    merchant,
    suggestions: suggestCategories(source, merchant),
  };
}

function extractAmount(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let best = null;

  lines.forEach((line, index) => {
    const rank = lineRank(line);
    if (!rank) return;
    let value = pickAmount(line);
    if (value == null && index + 1 < lines.length && !lineRank(lines[index + 1])) {
      value = pickAmount(lines[index + 1]);
    }
    if (value == null) return;
    if (!best || rank > best.rank || (rank === best.rank && index > best.index)) {
      best = { value, rank, index };
    }
  });

  if (best) return roundMoney(best.value);
  const fallback = largestAmount(lines.flatMap((line) => findAmounts(line)));
  return fallback == null ? null : roundMoney(fallback);
}

function lineRank(line) {
  if (/sub\s*-?\s*total/i.test(line) && !/grand\s*total/i.test(line)) return 0;
  if (/\btax\b/i.test(line) && !/grand\s*total|amount\s*due|net\s*amount/i.test(line)) return 0;
  if (/grand\s*total/i.test(line)) return 5;
  if (/amount\s*due|net\s*amount|balance\s*due|amount\s*payable/i.test(line)) return 5;
  if (/total\s*amount/i.test(line)) return 4;
  if (/\b(qty|quantity|items|item)\b/i.test(line) && !/(rs\.?|pkr|₨)/i.test(line)) return 0;
  if (/\btotal\b/i.test(line)) return 3;
  return 0;
}

function pickAmount(line) {
  const amounts = findAmounts(line);
  if (!amounts.length) return null;
  const strong = amounts.filter((item) => item.hasCurrency || item.hasComma || item.hasDecimal);
  const pool = strong.length ? strong : amounts;
  return pool[pool.length - 1].value;
}

function largestAmount(amounts) {
  let pool = amounts.filter((item) => item.hasCurrency || item.hasComma || item.hasDecimal);
  if (!pool.length) pool = amounts.filter((item) => String(Math.round(item.value)).length < 6);
  if (!pool.length) pool = amounts.slice();
  if (!pool.length) return null;
  return pool.reduce((max, item) => (item.value > max.value ? item : max)).value;
}

function findAmounts(text) {
  const line = normalizeAmountLine(text);
  const results = [];
  const pattern =
    /(?:(rs\.?|pkr|₨)\s*)?(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d{1,2}))?(?:\s*(rs\.?|pkr|₨))?/gi;
  let match;
  while ((match = pattern.exec(line))) {
    const hasCurrency = Boolean(match[1] || match[4]);
    const hasComma = match[2].includes(",");
    const hasDecimal = Boolean(match[3]);
    const token = hasDecimal ? `${match[2]}.${match[3]}` : match[2];
    if (isDateContext(line, match.index, match[0].length) && !hasCurrency) continue;
    const value = Number(token.replace(/,/g, ""));
    if (!Number.isFinite(value) || value <= 0) continue;
    if (!hasComma && !hasDecimal && value >= 1900 && value <= 2100) continue;
    if (!hasComma && !hasDecimal && !hasCurrency && String(Math.round(value)).length >= 8) continue;
    results.push({ value, hasCurrency, hasComma, hasDecimal, raw: match[0] });
  }
  return results;
}

function normalizeAmountLine(line) {
  let next = String(line || "")
    .replace(/(\d)\s*,\s*(\d)/g, "$1,$2")
    .replace(/(\d)\s*\.\s*(\d)/g, "$1.$2");
  if (/(total|amount|rs\.?|pkr|₨)/i.test(next)) {
    next = next.replace(/\b(\d{1,3})\s(\d{3})(?!\d)/g, "$1$2");
  }
  return next;
}

function isDateContext(text, index, length) {
  const before = text.slice(Math.max(0, index - 3), index);
  const after = text.slice(index + length, index + length + 3);
  return /\d\s*[/-]\s*$/.test(before) || /^[/-]\s*\d/.test(after);
}

function extractDate(text) {
  const source = String(text || "");
  const numeric = /\b(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{2,4})\b/g;
  let match;
  while ((match = numeric.exec(source))) {
    const iso = toIsoDate(match[1], match[2], match[3]);
    if (iso) return iso;
  }
  const dayFirst = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9}),?\s+(\d{4})\b/g;
  while ((match = dayFirst.exec(source))) {
    const month = MONTHS[match[2].toLowerCase()];
    if (!month) continue;
    const iso = toIsoDate(match[1], month, match[3]);
    if (iso) return iso;
  }
  const monthFirst = /\b([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g;
  while ((match = monthFirst.exec(source))) {
    const month = MONTHS[match[1].toLowerCase()];
    if (!month) continue;
    const iso = toIsoDate(match[2], month, match[3]);
    if (iso) return iso;
  }
  return null;
}

function toIsoDate(day, month, year) {
  let d = Number(day);
  let m = Number(month);
  let y = Number(year);
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

function extractMerchant(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  for (const line of lines) {
    if (line.length < 3) continue;
    if (MERCHANT_SKIP.test(line)) continue;
    if (/^date\b/i.test(line)) continue;
    if (/(grand\s*total|amount\s*due|net\s*amount|sub\s*total|\btotal\b)/i.test(line) && findAmounts(line).length) {
      continue;
    }
    const letters = line.replace(/[^A-Za-z]/g, "");
    if (letters.length < 3) continue;
    if (extractDate(line) && letters.length < 8) continue;
    const digits = (line.match(/\d/g) || []).length;
    if (digits > line.length / 2) continue;
    return line.slice(0, 80).trim();
  }
  return "";
}

function suggestCategories(text, merchant) {
  const key = guessCategoryKey(text, merchant);
  return {
    home: (key && CATEGORY_FOR_SPACE.home[key]) || "Other",
    business: (key && CATEGORY_FOR_SPACE.business[key]) || "Other",
  };
}

function guessCategoryKey(text, merchant) {
  const body = String(text || "").toLowerCase();
  const store = String(merchant || "").toLowerCase();
  let bestKey = "";
  let bestScore = 0;
  CATEGORY_RULES.forEach((rule) => {
    let score = 0;
    rule.terms.forEach((term) => {
      if (hasTerm(store, term)) score += 3;
      else if (hasTerm(body, term)) score += 1;
    });
    if (score > bestScore) {
      bestScore = score;
      bestKey = rule.key;
    }
  });
  return bestKey;
}

function hasTerm(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, "i").test(text);
}

const SKIP_LINE =
  /^(tel|phone|ph|mob|mobile|ntn|strn|pos|inv|invoice|bill|cash|card|change|discount|vat|gst|tax|sub\s*total|subtotal|grand|total|amount|balance|paid|thank|welcome|customer|qty|item|description|price|rate)\b/i;

/**
 * Reads one shop receipt line by line.
 * Returns the shop, date, receipt total, and each item with quantity,
 * unit price, and line total. Nothing is saved.
 */
export function parseGroceryReceipt(text, confidence = 0, ocrLines = []) {
  const header = parseReceipt(text);
  const rawLines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const byLine = new Map();
  ocrLines.forEach((line) => {
    const key = String(line?.text || "").trim();
    if (key) byLine.set(key, Number(line.confidence));
  });
  const overall = Number(confidence);
  const items = [];
  rawLines.forEach((line) => {
    const lineConfidence = byLine.has(line) ? byLine.get(line) : overall;
    const item = readGroceryLine(line, lineConfidence);
    if (item) items.push(item);
  });
  const weak = overall > 0 && overall < 30;
  return {
    merchant: header.merchant,
    date: header.date,
    total: header.amount,
    items,
    readable: items.length > 0 && !weak,
  };
}

function readGroceryLine(line, confidence) {
  if (line.length < 2 || line.length > 140) return null;
  if (SKIP_LINE.test(line)) return null;
  if (lineRank(line) > 0) return null;
  if (extractDate(line) && line.replace(/[0-9/.-]/g, "").trim().length < 8) return null;
  const sized = line.replace(/\b\d+(?:[./]\d+)?\s?(?:kg|g|gm|gms|ml|ltr|litre|liter|l|pcs|pc|pkt|pack)\b/gi, " ");
  const amounts = findAmounts(sized);
  if (!amounts.length) return null;
  if (
    amounts.length === 1 &&
    !amounts[0].hasDecimal &&
    !amounts[0].hasCurrency &&
    /shop|plot|block|street|road|phase|sector|floor|near/i.test(line)
  ) {
    return null;
  }
  const parsed = splitQtyPrice(amounts);
  const name = itemName(sized, amounts);
  if (!name || /^(rs|pkr|qty|pcs|pc|kg|g|ml|ltr)$/i.test(name)) return null;
  const mismatch =
    parsed.qty != null &&
    parsed.unitPrice != null &&
    parsed.lineTotal != null &&
    Math.abs(parsed.qty * parsed.unitPrice - parsed.lineTotal) > 1.5;
  const lowConfidence = Number(confidence) > 0 && Number(confidence) < 60;
  return {
    ocrName: name,
    name,
    qty: parsed.qty,
    unitPrice: parsed.unitPrice,
    lineTotal: parsed.lineTotal,
    unsure: lowConfidence || mismatch || parsed.unsure || parsed.unitPrice == null,
  };
}

function splitQtyPrice(amounts) {
  const values = amounts.map((amount) => amount.value);
  if (values.length >= 3) {
    const qty = values[values.length - 3];
    const unit = values[values.length - 2];
    const total = values[values.length - 1];
    const looksLikeQty = qty > 0 && qty <= 50 && Math.abs(qty - Math.round(qty)) < 0.01;
    const count = looksLikeQty ? Math.round(qty) : 1;
    return {
      qty: count,
      unitPrice: unit,
      lineTotal: total,
      unsure: !looksLikeQty || Math.abs(count * unit - total) > 1.5,
    };
  }
  if (values.length === 2) {
    const first = values[0];
    const second = values[1];
    const firstIsQty = first > 0 && first <= 30 && Math.abs(first - Math.round(first)) < 0.01 && first < second;
    if (firstIsQty) {
      return { qty: Math.round(first), unitPrice: roundMoney(second / first), lineTotal: second, unsure: false };
    }
    return { qty: 1, unitPrice: first, lineTotal: second, unsure: Math.abs(first - second) > 1.5 };
  }
  return { qty: 1, unitPrice: values[0], lineTotal: values[0], unsure: false };
}

function itemName(line, amounts) {
  let name = line;
  amounts.forEach((amount) => {
    if (amount.raw) name = name.replace(amount.raw, " ");
  });
  name = name
    .replace(/[x×=*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return name.slice(0, 80);
}
