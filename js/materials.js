import { formatMoney } from "./money.js";
import { parseMoney } from "./money.js";
import { today, formatDate } from "./dates.js";
import { get, save, deleteRecord } from "./storage.js";
import { ensureScreen, registerScreen } from "./router.js";
import {
  UNITS,
  pricesDiffer,
  impactLines,
  saveCostNotice,
  renderCostNotice,
} from "./costing.js";

function field(labelText, control) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const label = document.createElement("label");
  label.htmlFor = control.id;
  label.textContent = labelText;
  wrap.append(label, control);
  return wrap;
}

function textInput(id, extra = {}) {
  const control = document.createElement("input");
  control.id = id;
  control.name = extra.name || id;
  control.type = extra.type || "text";
  if (extra.placeholder) control.placeholder = extra.placeholder;
  if (extra.maxLength) control.maxLength = extra.maxLength;
  if (extra.inputMode) control.inputMode = extra.inputMode;
  if (extra.min != null) control.min = extra.min;
  if (extra.step) control.step = extra.step;
  control.autocomplete = "off";
  return control;
}

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function readCost(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: true, value: null };
  const parsed = parseMoney(text, { allowZero: true });
  if (!parsed.ok) return { ok: false, error: "Cost per unit must be 0 or more, or left blank." };
  return { ok: true, value: parsed.value };
}

function unitChoices(selected) {
  const control = document.createElement("select");
  control.id = "material-unit";
  control.name = "unit";
  UNITS.forEach((unit) => control.append(new Option(unit, unit)));
  control.append(new Option("Other", "other"));
  const known = UNITS.includes(selected);
  control.value = selected && !known ? "other" : selected || "piece";
  return control;
}

export function registerMaterials() {
  const screen = ensureScreen("materials");
  const intro = document.createElement("header");
  intro.className = "intro";
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Materials";
  const heading = document.createElement("h1");
  heading.textContent = "Material prices";
  intro.append(eyebrow, heading);

  const sheet = document.createElement("div");
  sheet.className = "sheet";

  const notice = document.createElement("section");
  notice.className = "card cost-notice";
  notice.dataset.costNotice = "true";
  notice.hidden = true;

  const formCard = document.createElement("section");
  formCard.className = "card";
  const formTitle = document.createElement("h2");
  formTitle.id = "material-form-title";
  formTitle.textContent = "Add a material";
  const form = document.createElement("form");
  form.id = "material-form";
  form.noValidate = true;

  const name = textInput("material-name", { maxLength: 80, placeholder: "Epoxy resin" });
  const unit = unitChoices("ml");
  const customUnitWrap = document.createElement("div");
  customUnitWrap.className = "field";
  customUnitWrap.hidden = true;
  const customUnit = textInput("material-unit-custom", { maxLength: 20, placeholder: "drop, set, pair" });
  customUnitWrap.append(field("Unit name", customUnit));
  const cost = textInput("material-cost", {
    type: "number",
    placeholder: "Leave blank until you know the price",
    min: "0",
    step: "0.01",
    inputMode: "decimal",
  });
  const shop = textInput("material-shop", { maxLength: 80, placeholder: "Where you buy it" });
  const error = document.createElement("p");
  error.className = "form-error";
  error.id = "material-error";
  error.setAttribute("role", "alert");
  error.hidden = true;
  const actions = document.createElement("div");
  actions.className = "add-actions";
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "primary";
  submit.textContent = "Add material";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "edit-cancel";
  cancel.id = "material-cancel";
  cancel.textContent = "Cancel";
  cancel.hidden = true;
  actions.append(submit, cancel);
  form.append(
    field("Name", name),
    field("Unit", unit),
    customUnitWrap,
    field("Cost per unit", cost),
    field("Shop", shop),
    error,
    actions
  );
  const help = document.createElement("p");
  help.className = "meta";
  help.textContent = "These prices are used for product costing and for new orders. A price change does not rewrite orders you already saved.";
  formCard.append(formTitle, help, form);

  const listCard = document.createElement("section");
  listCard.className = "card";
  const listTitle = document.createElement("h2");
  listTitle.textContent = "Materials";
  const list = document.createElement("div");
  list.id = "material-list";
  list.className = "order-list";
  const empty = document.createElement("p");
  empty.id = "material-empty";
  empty.className = "empty";
  empty.textContent = "No materials yet.";
  listCard.append(listTitle, list, empty);

  sheet.append(notice, formCard, listCard);
  screen.append(intro, sheet);

  let editingId = null;

  function showError(message) {
    error.textContent = message || "";
    error.hidden = !message;
  }

  function syncUnit() {
    customUnitWrap.hidden = unit.value !== "other";
  }

  function resetForm() {
    editingId = null;
    form.reset();
    unit.value = "ml";
    syncUnit();
    formTitle.textContent = "Add a material";
    submit.textContent = "Add material";
    cancel.hidden = true;
    showError("");
  }

  function chosenUnit() {
    if (unit.value !== "other") return unit.value;
    return cleanName(customUnit.value).slice(0, 20);
  }

  function renderList() {
    const rows = get("materials").slice().sort((a, b) => a.name.localeCompare(b.name));
    list.replaceChildren(...rows.map(materialCard));
    empty.hidden = rows.length > 0;
    renderCostNotice(notice);
  }

  function materialCard(material) {
    const card = document.createElement("article");
    card.className = "order-card";
    const title = document.createElement("h3");
    title.className = "category";
    title.textContent = material.name;
    const price = document.createElement("p");
    price.className = "order-balance";
    price.textContent =
      material.costPerUnit == null ? "Price not set" : `${formatMoney(material.costPerUnit)} per ${material.unit}`;
    const meta = document.createElement("p");
    meta.className = "meta";
    const shopText = material.shop ? `${material.shop} · ` : "";
    const updated = material.updatedAt ? `Updated ${formatDate(material.updatedAt)}` : "Not updated yet";
    meta.textContent = `${material.unit} · ${shopText}${updated}`;
    const buttons = document.createElement("div");
    buttons.className = "expense-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "edit";
    edit.dataset.editMaterial = material.id;
    edit.textContent = "Edit";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete";
    remove.dataset.deleteMaterial = material.id;
    remove.textContent = "Delete";
    buttons.append(edit, remove);
    card.append(title, price, meta, buttons);
    return card;
  }

  function startEdit(material) {
    editingId = material.id;
    name.value = material.name;
    const known = UNITS.includes(material.unit);
    unit.value = known ? material.unit : "other";
    customUnit.value = known ? "" : material.unit || "";
    syncUnit();
    cost.value = material.costPerUnit == null ? "" : String(material.costPerUnit);
    shop.value = material.shop || "";
    formTitle.textContent = "Edit material";
    submit.textContent = "Save material";
    cancel.hidden = false;
    showError("");
    name.focus();
  }

  unit.addEventListener("change", syncUnit);
  cancel.addEventListener("click", resetForm);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const materialName = cleanName(name.value).slice(0, 80);
    const materialUnit = chosenUnit();
    const costResult = readCost(cost.value);
    if (!materialName) {
      showError("Enter a material name.");
      name.focus();
      return;
    }
    if (!materialUnit) {
      showError("Enter a unit, such as ml, gram, piece, or sheet.");
      (unit.value === "other" ? customUnit : unit).focus();
      return;
    }
    if (!costResult.ok) {
      showError(costResult.error);
      cost.focus();
      return;
    }
    const duplicate = get("materials").find(
      (material) => material.id !== editingId && material.name.toLowerCase() === materialName.toLowerCase()
    );
    if (duplicate) {
      showError("That material is already in the list. Edit it instead.");
      name.focus();
      return;
    }
    const existing = editingId ? get("materials", editingId) : null;
    if (editingId && !existing) {
      showError("That material is no longer here.");
      resetForm();
      renderList();
      return;
    }
    const record = {
      id: existing?.id,
      name: materialName,
      unit: materialUnit,
      costPerUnit: costResult.value,
      shop: cleanName(shop.value).slice(0, 80),
      updatedAt: today(),
      stockQty: existing && Object.prototype.hasOwnProperty.call(existing, "stockQty") ? existing.stockQty : null,
      reorderAt: existing && Object.prototype.hasOwnProperty.call(existing, "reorderAt") ? existing.reorderAt : null,
    };
    const previousCost = existing ? existing.costPerUnit : null;
    const saved = save("materials", record);
    if (existing && pricesDiffer(previousCost, saved.costPerUnit)) {
      saveCostNotice(saved.name, impactLines(saved.name, saved.id, previousCost, saved.costPerUnit));
    }
    resetForm();
    renderList();
  });

  list.addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit-material]");
    if (edit) {
      const material = get("materials", edit.dataset.editMaterial);
      if (!material) {
        renderList();
        return;
      }
      startEdit(material);
      formCard.scrollIntoView({ block: "start" });
      return;
    }
    const remove = event.target.closest("[data-delete-material]");
    if (!remove) return;
    const material = get("materials", remove.dataset.deleteMaterial);
    if (!material) {
      renderList();
      return;
    }
    const used = get("products").filter((product) =>
      (product.materials || []).some((line) => line.materialId === material.id)
    );
    if (used.length) {
      const names = used.map((product) => product.name).join(", ");
      showError(`${material.name} is used by ${names}. Remove it from those products first.`);
      return;
    }
    deleteRecord("materials", material.id);
    if (editingId === material.id) resetForm();
    showError("");
    renderList();
  });

  registerScreen("materials", {
    show() {
      renderList();
    },
  });
}
