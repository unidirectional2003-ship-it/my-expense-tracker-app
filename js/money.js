export function roundMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function formatMoney(value) {
  const amount = Number(value);
  const safe = Number.isFinite(amount) ? amount : 0;
  const negative = safe < 0;
  const rounded = Math.round((Math.abs(safe) + Number.EPSILON) * 100) / 100;
  const [whole, fraction = "00"] = rounded.toFixed(2).split(".");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const decimals = fraction === "00" ? "" : `.${fraction.replace(/0$/, "")}`;
  return `${negative ? "-" : ""}Rs ${withCommas}${decimals}`;
}

export function parseMoney(raw, { allowZero = false } = {}) {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, empty: true };
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return { ok: false, empty: false };
  const value = roundMoney(Number(text));
  if (!Number.isFinite(value)) return { ok: false, empty: false };
  if (allowZero ? value < 0 : value <= 0) return { ok: false, empty: false };
  return { ok: true, empty: false, value };
}

export function sameMoney(left, right) {
  return roundMoney(left) === roundMoney(right);
}
