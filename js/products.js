import { formatMoney, parseMoney, roundMoney } from "./money.js";
import { get, save, deleteRecord } from "./storage.js";
import { ensureScreen, registerScreen } from "./router.js";
import {
  costBreakdown,
  pieceProfit,
  pieceMargin,
  marginClass,
  formatPercent,
  suggestedPrice,
  labourHourlyRate,
  renderCostNotice,
} from "./costing.js";

const CATEGORY_IDEAS = ["Keychain", "Coaster", "Bookmark", "Ornament", "Gift set"];

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
  if (extra.list) control.setAttribute("list", extra.list);
  control.autocomplete = "off";
  return control;
}

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function moneyField(id, placeholder) {
  return textInput(id, {
    type: "number",
    placeholder,
    min: "0",
    step: "0.01",
    inputMode: "decimal",
  });
}

function readMoney(raw, label, { required = false } = {}) {
  const text = String(raw ?? "").trim();
  if (!text) {
    if (required) return { ok: false, error: `Enter a ${label.toLowerCase()} greater than 0.` };
    return { ok: true, value: 0 };
  }
  const parsed = parseMoney(text, { allowZero: !required });
  if (!parsed.ok) {
    return { ok: false, error: required ? `${label} must be greater than 0.` : `${label} must be 0 or more.` };
  }
  return { ok: true, value: parsed.value };
}

function readHours(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: true, value: 0 };
  if (!/^\d+(\.\d{1,3})?$/.test(text)) return { ok: false, error: "Labour time must be hours, such as 0.5." };
  const value = Math.round(Number(text) * 1000) / 1000;
  if (!(value >= 0)) return { ok: false, error: "Labour time must be 0 or more." };
  return { ok: true, value };
}

function readQty(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: false, empty: true };
  if (!/^\d+(\.\d{1,3})?$/.test(text)) return { ok: false, empty: false };
  const value = Math.round(Number(text) * 1000) / 1000;
  if (!(value > 0)) return { ok: false, empty: false };
  return { ok: true, empty: false, value };
}

function lineCostText(materialId, qty) {
  if (!materialId) return "";
  const material = get("materials", materialId);
  if (!material) return "That material is no longer in the list.";
  if (material.costPerUnit == null) return `${material.name} has no price yet.`;
  if (!(qty > 0)) return `${formatMoney(material.costPerUnit)} per ${material.unit}`;
  return `${qty} ${material.unit} · ${formatMoney(roundMoney(qty * material.costPerUnit))} per piece`;
}

export function registerProducts() {
  const screen = ensureScreen("products");
  const intro = document.createElement("header");
  intro.className = "intro";
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Products";
  const heading = document.createElement("h1");
  heading.textContent = "Cost and profit per piece";
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
  formTitle.id = "product-form-title";
  formTitle.textContent = "Add a product";
  const form = document.createElement("form");
  form.id = "product-form";
  form.noValidate = true;

  const name = textInput("product-name", { maxLength: 80, placeholder: "Flower keychain" });
  const category = textInput("product-category", { maxLength: 40, placeholder: "Keychain", list: "product-categories" });
  const categories = document.createElement("datalist");
  categories.id = "product-categories";
  const selling = moneyField("product-price", "0.00");
  const materials = document.createElement("div");
  materials.id = "product-materials";
  materials.className = "item-editor";
  const addMaterial = document.createElement("button");
  addMaterial.type = "button";
  addMaterial.className = "edit";
  addMaterial.id = "product-add-material";
  addMaterial.textContent = "Add material";
  const packaging = moneyField("product-packaging", "0.00");
  const delivery = moneyField("product-delivery", "0.00");
  const labour = textInput("product-labour", {
    type: "number",
    placeholder: "Hours per piece",
    min: "0",
    step: "0.01",
    inputMode: "decimal",
  });
  const electricity = moneyField("product-electricity", "0.00");
  const other = moneyField("product-other", "0.00");
  const otherLabel = textInput("product-other-label", { maxLength: 40, placeholder: "What is the other cost?" });
  const target = textInput("product-target", {
    type: "number",
    placeholder: "40",
    min: "0",
    max: "99",
    step: "0.01",
    inputMode: "decimal",
  });
  const quote = document.createElement("div");
  quote.id = "product-quote";
  quote.className = "cost-figures";
  const error = document.createElement("p");
  error.className = "form-error";
  error.id = "product-error";
  error.setAttribute("role", "alert");
  error.hidden = true;
  const actions = document.createElement("div");
  actions.className = "add-actions";
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "primary";
  submit.textContent = "Add product";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "edit-cancel";
  cancel.id = "product-cancel";
  cancel.textContent = "Cancel";
  cancel.hidden = true;
  actions.append(submit, cancel);

  const materialsField = field("Materials per piece", materials);
  const materialsHelp = document.createElement("p");
  materialsHelp.className = "meta";
  materialsHelp.textContent = "Quantity is how much of that material goes into one piece.";
  materialsField.append(materialsHelp);

  form.append(
    field("Name", name),
    field("Category", category),
    categories,
    field("Selling price", selling),
    materialsField,
    addMaterial,
    field("Packaging", packaging),
    field("Delivery share", delivery),
    field("Labour time (hours)", labour),
    field("Electricity share", electricity),
    field("Any other cost", other),
    field("Other cost label", otherLabel),
    field("Target margin %", target),
    quote,
    error,
    actions
  );
  const rateHelp = document.createElement("p");
  rateHelp.className = "meta";
  rateHelp.id = "product-rate-help";
  formCard.append(formTitle, rateHelp, form);

  const listCard = document.createElement("section");
  listCard.className = "card";
  const listTitle = document.createElement("h2");
  listTitle.textContent = "Products";
  const list = document.createElement("div");
  list.id = "product-list";
  list.className = "order-list";
  const empty = document.createElement("p");
  empty.id = "product-empty";
  empty.className = "empty";
  empty.textContent = "No products yet.";
  listCard.append(listTitle, list, empty);
  sheet.append(notice, formCard, listCard);
  screen.append(intro, sheet);

  let editingId = null;

  function showError(message) {
    error.textContent = message || "";
    error.hidden = !message;
  }

  function fillCategories() {
    const seen = new Set(CATEGORY_IDEAS);
    get("products").forEach((product) => {
      if (product.category) seen.add(product.category);
    });
    categories.replaceChildren(
      ...[...seen].sort((a, b) => a.localeCompare(b)).map((value) => {
        const option = document.createElement("option");
        option.value = value;
        return option;
      })
    );
  }

  function fillMaterialSelect(control, selected) {
    const options = [new Option("Select a material", "")];
    get("materials")
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((material) => options.push(new Option(material.name, material.id)));
    control.replaceChildren(...options);
    if ([...control.options].some((option) => option.value === selected)) control.value = selected;
  }

  function materialRow(selected = "", qty = "") {
    const row = document.createElement("div");
    row.className = "material-row";
    const select = document.createElement("select");
    select.name = "material-id";
    select.setAttribute("aria-label", "Material");
    fillMaterialSelect(select, selected);
    const amount = textInput("", { type: "number", placeholder: "Qty", min: "0.001", step: "0.001", inputMode: "decimal" });
    amount.name = "material-qty";
    amount.setAttribute("aria-label", "Quantity per piece");
    amount.value = qty;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "edit-cancel";
    remove.dataset.removeMaterial = "true";
    remove.textContent = "Remove";
    const hint = document.createElement("p");
    hint.className = "meta";
    hint.dataset.lineCost = "true";
    row.append(select, amount, remove, hint);
    refreshLineHint(row);
    return row;
  }

  function refreshLineHint(row) {
    const hint = row.querySelector("[data-line-cost]");
    const materialId = row.querySelector("[name=material-id]").value;
    const qty = readQty(row.querySelector("[name=material-qty]").value);
    hint.textContent = lineCostText(materialId, qty.ok ? qty.value : 0);
  }

  function resetMaterials() {
    materials.replaceChildren(materialRow());
  }

  function readLines(strict) {
    const lines = [];
    const rows = [...materials.querySelectorAll(".material-row")];
    for (const row of rows) {
      const materialId = row.querySelector("[name=material-id]").value;
      const qtyRaw = row.querySelector("[name=material-qty]").value;
      if (!materialId && !String(qtyRaw).trim()) continue;
      if (!materialId || !String(qtyRaw).trim()) {
        if (strict) return { error: "Each material needs a name and a quantity per piece." };
        continue;
      }
      const qty = readQty(qtyRaw);
      if (!qty.ok) {
        if (strict) return { error: "Quantity per piece must be greater than 0." };
        continue;
      }
      lines.push({ materialId, qty: qty.value });
    }
    if (strict) {
      const seen = new Set();
      for (const line of lines) {
        if (seen.has(line.materialId)) {
          const material = get("materials", line.materialId);
          return { error: `${material ? material.name : "A material"} is listed twice. Put the full quantity on one row.` };
        }
        seen.add(line.materialId);
      }
    }
    return { lines };
  }

  function readExtras(strict) {
    const packagingResult = readMoney(packaging.value, "Packaging");
    const deliveryResult = readMoney(delivery.value, "Delivery share");
    const electricityResult = readMoney(electricity.value, "Electricity share");
    const otherResult = readMoney(other.value, "Any other cost");
    const hours = readHours(labour.value);
    const problem = [packagingResult, deliveryResult, electricityResult, otherResult, hours].find((result) => !result.ok);
    if (problem) return strict ? { error: problem.error } : { error: problem.error, extras: null };
    return {
      extras: {
        packaging: packagingResult.value,
        deliveryShare: deliveryResult.value,
        labourHours: hours.value,
        electricityShare: electricityResult.value,
        other: otherResult.value,
        otherLabel: cleanName(otherLabel.value).slice(0, 40),
      },
    };
  }

  function draftProduct() {
    const lines = readLines(false);
    const extras = readExtras(false);
    const price = readMoney(selling.value, "Selling price", { required: true });
    return {
      product: {
        materials: lines.lines || [],
        extras: extras.extras || {
          packaging: 0,
          deliveryShare: 0,
          labourHours: 0,
          electricityShare: 0,
          other: 0,
          otherLabel: "",
        },
      },
      sellingPrice: price.ok ? price.value : null,
      priceError: price.ok || !selling.value.trim() ? "" : price.error,
      extrasError: extras.error || "",
    };
  }

  function quoteLine(text, className) {
    const line = document.createElement("p");
    line.className = className || "meta";
    line.textContent = text;
    return line;
  }

  function renderQuote() {
    const rate = labourHourlyRate();
    rateHelp.textContent = rate == null
      ? "Labour uses the hourly rate in Settings. It is not set yet."
      : `Labour uses the Settings hourly rate of ${formatMoney(rate)}.`;
    const draft = draftProduct();
    if (draft.extrasError) {
      quote.replaceChildren(quoteLine(draft.extrasError));
      return;
    }
    const breakdown = costBreakdown(draft.product, get("materials"), rate);
    const nodes = [];
    if (!breakdown.complete) {
      nodes.push(quoteLine("Cost not set", "order-balance"));
      if (breakdown.missingPrices) nodes.push(quoteLine("Add a price for every material on this piece."));
      if (breakdown.missingRate) nodes.push(quoteLine("Set the hourly labour rate in Settings."));
    } else {
      nodes.push(quoteLine(`Cost per piece ${formatMoney(breakdown.cost)}`, "order-balance"));
    }
    nodes.push(quoteLine(`Materials ${formatMoney(breakdown.materialsCost)}`));
    if (breakdown.packaging) nodes.push(quoteLine(`Packaging ${formatMoney(breakdown.packaging)}`));
    if (breakdown.deliveryShare) nodes.push(quoteLine(`Delivery share ${formatMoney(breakdown.deliveryShare)}`));
    if (breakdown.labourHours > 0) {
      nodes.push(quoteLine(
        breakdown.missingRate
          ? `Labour ${breakdown.labourHours} h · rate not set`
          : `Labour ${breakdown.labourHours} h · ${formatMoney(breakdown.labour)}`
      ));
    }
    if (breakdown.electricityShare) nodes.push(quoteLine(`Electricity ${formatMoney(breakdown.electricityShare)}`));
    if (breakdown.other) {
      const label = breakdown.otherLabel ? `${breakdown.otherLabel} ` : "Other ";
      nodes.push(quoteLine(`${label}${formatMoney(breakdown.other)}`));
    }
    if (draft.priceError) nodes.push(quoteLine(draft.priceError));
    else if (draft.sellingPrice == null) nodes.push(quoteLine("Add a selling price to see profit and margin."));
    else if (breakdown.complete) {
      const profit = pieceProfit(draft.sellingPrice, breakdown);
      const margin = pieceMargin(draft.sellingPrice, breakdown);
      nodes.push(quoteLine(`Profit per piece ${formatMoney(profit)}`, "order-balance"));
      const marginLine = quoteLine(`Margin ${formatPercent(margin)}`, marginClass(margin));
      nodes.push(marginLine);
    }
    const targetResult = readMoney(target.value, "Target margin");
    const targetValue = target.value.trim() ? Number(target.value) : null;
    if (target.value.trim() && (!Number.isFinite(targetValue) || targetValue < 0 || targetValue >= 100)) {
      nodes.push(quoteLine("Use a target margin under 100%."));
    } else if (targetValue != null && breakdown.complete && !targetResult.error) {
      const suggestion = suggestedPrice(breakdown.cost, targetValue);
      if (suggestion != null) {
        const suggestionLine = quoteLine(`Suggested selling price at ${formatPercent(targetValue)} margin: ${formatMoney(suggestion)}`, "order-balance");
        const use = document.createElement("button");
        use.type = "button";
        use.className = "edit";
        use.id = "product-use-price";
        use.textContent = "Use suggested price";
        use.addEventListener("click", () => {
          selling.value = String(suggestion);
          renderQuote();
        });
        nodes.push(suggestionLine, use);
      }
    } else if (targetValue != null && !breakdown.complete) {
      nodes.push(quoteLine("Set the missing prices before a suggested selling price."));
    }
    quote.replaceChildren(...nodes);
  }

  function renderList() {
    const rows = get("products").slice().sort((a, b) => a.name.localeCompare(b.name));
    list.replaceChildren(...rows.map(productCard));
    empty.hidden = rows.length > 0;
    renderCostNotice(notice);
    fillCategories();
    renderQuote();
  }

  function productCard(product) {
    const rate = labourHourlyRate();
    const breakdown = costBreakdown(product, get("materials"), rate);
    const card = document.createElement("article");
    card.className = "order-card";
    const title = document.createElement("h3");
    title.className = "category";
    title.textContent = product.category ? `${product.name} · ${product.category}` : product.name;
    const price = document.createElement("p");
    price.className = "order-balance";
    price.textContent = `Selling price ${formatMoney(product.sellingPrice)}`;
    const cost = document.createElement("p");
    cost.className = "meta";
    const profit = document.createElement("p");
    profit.className = "order-balance";
    if (!breakdown.complete) {
      cost.textContent = "Cost not set";
      profit.textContent = "Profit not set";
    } else {
      cost.textContent = `Cost per piece ${formatMoney(breakdown.cost)}`;
      const margin = pieceMargin(product.sellingPrice, breakdown);
      profit.textContent = `Profit ${formatMoney(pieceProfit(product.sellingPrice, breakdown))} · `;
      const marginText = document.createElement("span");
      marginText.className = marginClass(margin);
      marginText.textContent = `Margin ${formatPercent(margin)}`;
      profit.append(marginText);
    }
    const used = document.createElement("p");
    used.className = "meta";
    const names = (product.materials || []).map((line) => {
      const material = get("materials", line.materialId);
      return material ? `${material.name} ${line.qty} ${material.unit}` : "Removed material";
    });
    used.textContent = names.length ? names.join(" · ") : "No materials listed";
    const buttons = document.createElement("div");
    buttons.className = "expense-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "edit";
    edit.dataset.editProduct = product.id;
    edit.textContent = "Edit";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete";
    remove.dataset.deleteProduct = product.id;
    remove.textContent = "Delete";
    buttons.append(edit, remove);
    card.append(title, price, cost, profit, used, buttons);
    return card;
  }

  function resetForm() {
    editingId = null;
    form.reset();
    resetMaterials();
    formTitle.textContent = "Add a product";
    submit.textContent = "Add product";
    cancel.hidden = true;
    showError("");
    renderQuote();
  }

  function startEdit(product) {
    editingId = product.id;
    name.value = product.name;
    category.value = product.category || "";
    selling.value = String(product.sellingPrice);
    const extras = product.extras || {};
    packaging.value = extras.packaging ? String(extras.packaging) : "";
    delivery.value = extras.deliveryShare ? String(extras.deliveryShare) : "";
    labour.value = extras.labourHours ? String(extras.labourHours) : "";
    electricity.value = extras.electricityShare ? String(extras.electricityShare) : "";
    other.value = extras.other ? String(extras.other) : "";
    otherLabel.value = extras.otherLabel || "";
    const lines = product.materials || [];
    materials.replaceChildren(...(lines.length ? lines.map((line) => materialRow(line.materialId, String(line.qty))) : [materialRow()]));
    formTitle.textContent = "Edit product";
    submit.textContent = "Save product";
    cancel.hidden = false;
    showError("");
    renderQuote();
    name.focus();
  }

  addMaterial.addEventListener("click", () => {
    materials.append(materialRow());
    renderQuote();
  });

  materials.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-material]");
    if (!button) return;
    const row = button.closest(".material-row");
    if (materials.children.length === 1) {
      row.querySelectorAll("input").forEach((control) => {
        control.value = "";
      });
      const select = row.querySelector("select");
      if (select) select.value = "";
      refreshLineHint(row);
    } else {
      row.remove();
    }
    renderQuote();
  });

  materials.addEventListener("input", (event) => {
    const row = event.target.closest(".material-row");
    if (row) refreshLineHint(row);
    renderQuote();
  });
  materials.addEventListener("change", (event) => {
    const row = event.target.closest(".material-row");
    if (row) refreshLineHint(row);
    renderQuote();
  });
  form.addEventListener("input", (event) => {
    if (event.target.closest(".material-row")) return;
    renderQuote();
  });

  cancel.addEventListener("click", resetForm);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const productName = cleanName(name.value).slice(0, 80);
    const productCategory = cleanName(category.value).slice(0, 40);
    const price = readMoney(selling.value, "Selling price", { required: true });
    const lines = readLines(true);
    const extras = readExtras(true);
    if (!productName) {
      showError("Enter a product name.");
      name.focus();
      return;
    }
    if (!productCategory) {
      showError("Enter a category.");
      category.focus();
      return;
    }
    if (!price.ok) {
      showError(price.error);
      selling.focus();
      return;
    }
    if (lines.error) {
      showError(lines.error);
      return;
    }
    if (extras.error) {
      showError(extras.error);
      return;
    }
    const duplicate = get("products").find(
      (product) => product.id !== editingId && product.name.toLowerCase() === productName.toLowerCase()
    );
    if (duplicate) {
      showError("That product is already in the list. Edit it instead.");
      name.focus();
      return;
    }
    const existing = editingId ? get("products", editingId) : null;
    if (editingId && !existing) {
      showError("That product is no longer here.");
      resetForm();
      renderList();
      return;
    }
    save("products", {
      id: existing?.id,
      name: productName,
      category: productCategory,
      sellingPrice: price.value,
      materials: lines.lines,
      extras: extras.extras,
    });
    resetForm();
    renderList();
  });

  list.addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit-product]");
    if (edit) {
      const product = get("products", edit.dataset.editProduct);
      if (!product) {
        renderList();
        return;
      }
      startEdit(product);
      formCard.scrollIntoView({ block: "start" });
      return;
    }
    const remove = event.target.closest("[data-delete-product]");
    if (!remove) return;
    deleteRecord("products", remove.dataset.deleteProduct);
    if (editingId === remove.dataset.deleteProduct) resetForm();
    showError("");
    renderList();
  });

  resetMaterials();
  registerScreen("products", {
    show() {
      [...materials.querySelectorAll("[name=material-id]")].forEach((select) => {
        fillMaterialSelect(select, select.value);
        refreshLineHint(select.closest(".material-row"));
      });
      renderList();
    },
  });
}
