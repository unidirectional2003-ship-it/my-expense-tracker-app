/**
 * Matches receipt lines to the grocery catalog.
 * Brand names and pack sizes are ignored. A correction the owner
 * already taught (receiptAliases) wins over a fresh guess.
 */

const BRANDS = new Set([
  "shan",
  "national",
  "excel",
  "nestle",
  "nestlé",
  "olper",
  "olpers",
  "everyday",
  "tapal",
  "lipton",
  "knorr",
  "maggi",
  "kolson",
  "sufi",
  "habib",
  "dalda",
  "rafhan",
  "unilever",
  "lifebuoy",
  "dettol",
  "lux",
  "dove",
  "ponds",
  "sunsilk",
  "pantene",
  "colgate",
  "closeup",
  "safeguard",
  "ariel",
  "bonus",
  "meezan",
  "guard",
  "shangrila",
  "mitchells",
  "kissan",
]);

const SIZE = /\b\d+(?:[./]\d+)?\s?(?:kg|g|gm|gms|ml|ltr|litre|liter|l|pcs|pc|pkt|pack)\b/gi;

export function aliasKey(phrase) {
  return String(phrase || "")
    .toLowerCase()
    .replace(SIZE, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function learnAlias(aliases, phrase, itemId) {
  const phraseKey = aliasKey(phrase);
  if (!phraseKey || !itemId) return aliases.slice();
  const next = aliases.filter((alias) => alias.phrase !== phraseKey);
  next.push({ id: phraseKey, phrase: phraseKey, itemId });
  return next;
}

export function matchGroceryLine(name, catalog, aliases = []) {
  const items = (catalog?.items || []).filter((item) => item && !item.hidden);
  const key = aliasKey(name);
  const taught = aliases.find((alias) => alias.phrase === key);
  if (taught) {
    const item = items.find((entry) => entry.id === taught.itemId);
    if (item) return { item, via: "alias" };
  }
  const lineTokens = tokens(name);
  const compact = lineTokens.join("");
  let best = null;
  items.forEach((item) => {
    const required = tokens(item.name);
    if (!required.length) return;
    const hits = required.filter((token) => lineTokens.includes(token) || (token.length >= 4 && compact.includes(token)));
    if (hits.length !== required.length) return;
    if (!best || required.length > best.score) best = { item, score: required.length };
  });
  return best ? { item: best.item, via: "fuzzy" } : null;
}

export function totalsDisagree(itemsTotal, receiptTotal) {
  if (receiptTotal == null || !Number.isFinite(Number(receiptTotal))) return false;
  return Math.abs(Number(itemsTotal) - Number(receiptTotal)) > 0.5;
}

function tokens(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(SIZE, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token && !BRANDS.has(token) && !/^\d+$/.test(token));
}
