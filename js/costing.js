import { formatMoney, parseMoney, roundMoney } from "./money.js";
import { today } from "./dates.js";
import { get, save, deleteRecord } from "./storage.js";

export const UNITS = ["ml", "gram", "piece", "sheet", "meter", "cm"];

export const MATERIAL_SUGGESTIONS = [
  { name: "Epoxy resin", unit: "ml" },
  { name: "Hardener", unit: "ml" },
  { name: "Silicone mold", unit: "piece" },
  { name: "Dried flowers", unit: "gram" },
  { name: "Pigment", unit: "gram" },
  { name: "Glitter", unit: "gram" },
  { name: "Keychain rings", unit: "piece" },
  { name: "Packaging box", unit: "piece" },
  { name: "Gift bag", unit: "piece" },
  { name: "Sticker label", unit: "piece" },
];

const RATE_ID = "labourHourlyRate";
const SEEDED_ID = "materialsSeeded";
const NOTICE_ID = "materialCostNotice";

function numberOrZero(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function storedCost(value) {
  if (value == null || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return roundMoney(amount);
}

export function marginPercent(price, cost) {
  const selling = Number(price);
  const spent = Number(cost);
  if (!(selling > 0) || !Number.isFinite(spent)) return null;
  return roundMoney(((selling - spent) / selling) * 100);
}

export function marginBand(percent) {
  if (percent == null || !Number.isFinite(Number(percent))) return "";
  const value = Number(percent);
  if (value < 15) return "low";
  if (value <= 30) return "mid";
  return "high";
}

export function marginClass(percent) {
  const band = marginBand(percent);
  if (band === "low") return "margin-low";
  if (band === "mid") return "margin-mid";
  if (band === "high") return "margin-high";
  return "";
}

export function formatPercent(value) {
  if (value == null || !Number.isFinite(Number(value))) return "";
  return `${Number(roundMoney(value))}%`;
}

export function suggestedPrice(cost, targetPercent) {
  const spent = Number(cost);
  const target = Number(targetPercent);
  if (!Number.isFinite(spent) || spent < 0) return null;
  if (!Number.isFinite(target) || target < 0 || target >= 100) return null;
  return roundMoney(spent / (1 - target / 100));
}

export function costBreakdown(product, materials, hourlyRate) {
  const byId = new Map((materials || []).map((material) => [material.id, material]));
  let materialsCost = 0;
  let missingPrices = false;
  (product.materials || []).forEach((line) => {
    const material = byId.get(line.materialId);
    const qty = Number(line.qty) || 0;
    if (!material || material.costPerUnit == null || material.costPerUnit === "") {
      missingPrices = true;
      return;
    }
    materialsCost += qty * Number(material.costPerUnit);
  });
  const extras = product.extras || {};
  const packaging = numberOrZero(extras.packaging);
  const deliveryShare = numberOrZero(extras.deliveryShare);
  const electricityShare = numberOrZero(extras.electricityShare);
  const other = numberOrZero(extras.other);
  const labourHours = numberOrZero(extras.labourHours);
  const rate = hourlyRate == null || hourlyRate === "" ? null : Number(hourlyRate);
  const missingRate = labourHours > 0 && !(rate >= 0);
  const labour = missingRate ? 0 : labourHours * (rate || 0);
  const cost = roundMoney(materialsCost + packaging + deliveryShare + electricityShare + other + labour);
  return {
    cost,
    complete: !missingPrices && !missingRate,
    missingPrices,
    missingRate,
    materialsCost: roundMoney(materialsCost),
    packaging: roundMoney(packaging),
    deliveryShare: roundMoney(deliveryShare),
    electricityShare: roundMoney(electricityShare),
    other: roundMoney(other),
    otherLabel: typeof extras.otherLabel === "string" ? extras.otherLabel : "",
    labourHours,
    labour: roundMoney(labour),
  };
}

export function pieceCost(product, materials, hourlyRate) {
  const breakdown = costBreakdown(product, materials, hourlyRate);
  return {
    cost: breakdown.cost,
    complete: breakdown.complete,
    missingPrices: breakdown.missingPrices,
    missingRate: breakdown.missingRate,
  };
}

export function pieceProfit(sellingPrice, breakdown) {
  if (!breakdown || !breakdown.complete) return null;
  const price = Number(sellingPrice);
  if (!Number.isFinite(price)) return null;
  return roundMoney(price - breakdown.cost);
}

export function pieceMargin(sellingPrice, breakdown) {
  if (!breakdown || !breakdown.complete) return null;
  return marginPercent(sellingPrice, breakdown.cost);
}

export function pricesDiffer(left, right) {
  return storedCost(left) !== storedCost(right);
}

export function productCostImpact(materialId, previousCost, nextCost) {
  const stored = get("materials");
  const before = stored.map((material) =>
    material.id === materialId ? { ...material, costPerUnit: storedCost(previousCost) } : material
  );
  const after = stored.map((material) =>
    material.id === materialId ? { ...material, costPerUnit: storedCost(nextCost) } : material
  );
  const rate = labourHourlyRate();
  const changes = [];
  get("products").forEach((product) => {
    const used = (product.materials || []).some((line) => line.materialId === materialId);
    if (!used) return;
    const previous = pieceCost(product, before, rate);
    const next = pieceCost(product, after, rate);
    changes.push({
      productId: product.id,
      productName: product.name,
      previousCost: previous.complete ? previous.cost : null,
      nextCost: next.complete ? next.cost : null,
      delta: roundMoney(next.cost - previous.cost),
    });
  });
  return changes;
}

function describeChange(change) {
  const name = change.productName;
  if (change.previousCost != null && change.nextCost != null) {
    const delta = roundMoney(change.nextCost - change.previousCost);
    if (delta === 0) return `${name}: cost per piece stays ${formatMoney(change.nextCost)}.`;
    const direction = delta > 0 ? "up" : "down";
    return `${name}: cost per piece is ${direction} ${formatMoney(Math.abs(delta))} (${formatMoney(change.previousCost)} to ${formatMoney(change.nextCost)}).`;
  }
  if (change.previousCost == null && change.nextCost != null) {
    return `${name}: cost per piece is now ${formatMoney(change.nextCost)} (was not fully set).`;
  }
  if (change.previousCost != null && change.nextCost == null) {
    return `${name}: cost per piece is no longer fully set (was ${formatMoney(change.previousCost)}).`;
  }
  if (change.delta === 0) return `${name}: known cost per piece is unchanged. Some prices are still not set.`;
  const direction = change.delta > 0 ? "higher" : "lower";
  return `${name}: known cost per piece is ${formatMoney(Math.abs(change.delta))} ${direction}. Some prices are still not set.`;
}

export function impactLines(materialName, materialId, previousCost, nextCost) {
  const changes = productCostImpact(materialId, previousCost, nextCost);
  if (!changes.length) return [`${materialName} price was updated. No product costs changed.`];
  return changes.map(describeChange);
}

export function labourHourlyRate() {
  const row = get("settings", RATE_ID);
  if (!row || row.value == null || row.value === "") return null;
  const value = Number(row.value);
  if (!Number.isFinite(value) || value < 0) return null;
  return roundMoney(value);
}

export function setLabourHourlyRate(value) {
  const text = value == null ? "" : String(value).trim();
  if (!text) {
    save("settings", { id: RATE_ID, value: null });
    return { ok: true, value: null };
  }
  const parsed = parseMoney(text, { allowZero: true });
  if (!parsed.ok) return { ok: false, error: "Enter an hourly rate of 0 or more, or leave it blank." };
  save("settings", { id: RATE_ID, value: parsed.value });
  return { ok: true, value: parsed.value };
}

export function seedMaterials() {
  if (get("settings", SEEDED_ID)) return;
  if (get("materials").length === 0) {
    MATERIAL_SUGGESTIONS.forEach((item) => {
      save("materials", {
        name: item.name,
        unit: item.unit,
        costPerUnit: null,
        shop: "",
        updatedAt: today(),
        stockQty: null,
        reorderAt: null,
      });
    });
  }
  save("settings", { id: SEEDED_ID, value: true });
}

export function saveCostNotice(materialName, lines) {
  return save("settings", { id: NOTICE_ID, materialName, lines });
}

export function costNotice() {
  const row = get("settings", NOTICE_ID);
  if (!row || !Array.isArray(row.lines) || !row.lines.length) return null;
  return row;
}

export function clearCostNotice() {
  deleteRecord("settings", NOTICE_ID);
}

export function renderCostNotice(container) {
  if (!container) return;
  const notice = costNotice();
  if (!notice) {
    container.replaceChildren();
    container.hidden = true;
    return;
  }
  container.hidden = false;
  const title = document.createElement("p");
  title.className = "summary-label";
  title.textContent = `${notice.materialName} price changed`;
  const list = document.createElement("ul");
  list.className = "order-items";
  notice.lines.forEach((line) => {
    const item = document.createElement("li");
    item.textContent = line;
    list.append(item);
  });
  const note = document.createElement("p");
  note.className = "meta";
  note.textContent = "Saved orders keep the cost they were given. This does not change them.";
  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "edit-cancel";
  dismiss.textContent = "Dismiss";
  dismiss.addEventListener("click", () => {
    clearCostNotice();
    document.querySelectorAll("[data-cost-notice]").forEach((node) => renderCostNotice(node));
  });
  container.replaceChildren(title, list, note, dismiss);
}
