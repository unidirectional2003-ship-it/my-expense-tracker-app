import { parseMoney, formatMoney, roundMoney } from "./money.js";
import { today, formatDate } from "./dates.js";
import { session } from "./session.js";
import { state } from "./store.js";
import { isDuplicateExpense } from "./calc.js";
import { addExpense } from "./expenses.js";
import { syncAutoApprovals, updateApprovalsBadge } from "./approvals.js";
import { goTo, ensureScreen, registerScreen, currentScreen } from "./router.js";
import {
  loadCatalog,
  saveCatalog,
  loadTemplate,
  saveTemplate,
  loadLists,
  rememberPrice,
  applyMonthlyGroceryDraft,
  visibleItems,
  itemsInGroup,
  draftTitle,
} from "./grocery.js";

const KINDS = [
  { id: "groceries", label: "Groceries", space: "home", screen: "groceries", category: "Groceries" },
  { id: "beauty", label: "Beauty", space: "home", screen: "beauty", category: "Beauty" },
  { id: "clothing", label: "Clothing", space: "home", screen: "clothing", category: "Clothing" },
  { id: "household", label: "Household", space: "home", screen: "household", category: "Household" },
  { id: "bills", label: "Bills", space: "home", screen: "bills", category: "Bills" },
  { id: "supplies", label: "Business Supplies", space: "business", screen: "supplies", category: "Business Supplies" },
  { id: "other", label: "Other", space: "home", screen: "other", category: "Other" },
];

const BEAUTY = ["Skincare", "Haircare", "Makeup", "Nails", "Salon / parlour", "Fragrance", "Other"];
const CLOTHING = ["Garments", "Shoes", "Bags / accessories", "Fabric / stitching", "Other"];
const HOUSEHOLD = ["Cleaning", "Kitchen", "Furniture", "Linens", "Other"];
const BILLS = ["Electricity", "Gas", "Water", "Internet", "Phone", "Rent", "Other"];
const SUPPLIES = ["Packaging", "Fabric", "Stationery", "Tools", "Other"];
const PEOPLE = ["Me", "Family", "Business stock"];

const builder = { qty: {}, price: {}, checked: {} };
const built = new Set();
let showSpace = () => {};

export function bindSpend(options) {
  showSpace = options.showSpace || (() => {});
  fillMenus();
  const root = document.getElementById("screen-root");
  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-spend]");
    if (button && root.contains(button)) {
      openSpend(button.dataset.openSpend);
      return;
    }
    onSpendClick(event);
  });
  root.addEventListener("submit", onSpendSubmit);
  root.addEventListener("input", onSpendInput);
  root.addEventListener("change", onSpendChange);
}

export function registerSpendScreens() {
  registerScreen("expenses", { show: showExpenses });
  KINDS.forEach((kind) => {
    registerScreen(kind.screen, {
      show() {
        showKind(kind);
      },
    });
  });
}

export function syncSpend() {
  const name = currentScreen().name;
  markLinks(name);
  if (name === "groceries" && built.has("groceries")) {
    paintDrafts();
    paintTemplateNote();
  }
  const kind = KINDS.find((item) => item.screen === name);
  if (kind && built.has(kind.screen)) paintRecent(kind);
}

export function openSpend(name) {
  if (name === "expenses") {
    goTo("expenses");
    return;
  }
  const kind = KINDS.find((item) => item.id === name);
  if (!kind) return;
  session.spend = kind.id;
  goTo(kind.screen);
}

function kindButton(kind) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "spend-link";
  button.dataset.openSpend = kind.id;
  button.textContent = kind.label;
  return button;
}

function fillMenus() {
  const host = document.getElementById("expense-menu");
  if (!host) return;
  host.replaceChildren(...KINDS.map(kindButton));
}

function markLinks(name) {
  document.querySelectorAll("[data-open-spend]").forEach((button) => {
    const active = button.dataset.openSpend === name;
    button.classList.toggle("is-active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
}

function showExpenses() {
  const screen = ensureScreen("expenses");
  if (!screen.dataset.ready) {
    const page = document.createElement("div");
    page.className = "screen-sheet";
    const intro = document.createElement("header");
    intro.className = "intro";
    const eyebrow = document.createElement("p");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = "Expenses";
    const heading = document.createElement("h1");
    heading.textContent = "Expenses";
    intro.append(eyebrow, heading);
    const sheet = document.createElement("div");
    sheet.className = "sheet";
    const copy = document.createElement("p");
    copy.className = "meta";
    copy.textContent = "Groceries, Beauty, Clothing, Household, Bills, Business Supplies, and Other. Each one saves into your expenses.";
    const links = document.createElement("div");
    links.className = "spend-links";
    links.append(...KINDS.map(kindButton));
    sheet.append(copy, links);
    page.append(intro, sheet);
    screen.replaceChildren(page);
    screen.dataset.ready = "yes";
  }
  markLinks("expenses");
}

function showKind(kind) {
  if (!built.has(kind.screen)) {
    const screen = ensureScreen(kind.screen);
    const page = document.createElement("div");
    page.className = "screen-sheet";
    const sheet = document.createElement("div");
    sheet.className = "sheet";
    const host = document.createElement("div");
    host.className = "spend-host";
    host.append(buildScreen(kind.id));
    const recent = document.createElement("section");
    recent.className = "card";
    recent.id = `spend-recent-${kind.id}`;
    sheet.append(host, recent);
    page.append(sheet);
    screen.replaceChildren(page);
    built.add(kind.screen);
  }
  if (kind.id === "groceries") {
    paintDrafts();
    paintTemplateNote();
  }
  paintRecent(kind);
  markLinks(kind.screen);
}

function paintRecent(kind) {
  const host = document.getElementById(`spend-recent-${kind.id}`);
  if (!host) return;
  const rows = recentExpenses(kind).slice(0, 8);
  host.replaceChildren();
  const heading = document.createElement("h2");
  heading.textContent = "Saved in expenses";
  host.append(heading);
  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Nothing saved here yet.";
    host.append(empty);
    return;
  }
  const list = document.createElement("ul");
  list.className = "expense-list";
  rows.forEach((expense) => {
    const item = document.createElement("li");
    item.className = "expense";
    const main = document.createElement("div");
    const title = document.createElement("p");
    title.className = "summary-label";
    title.textContent = expense.subcategory ? `${expense.category} · ${expense.subcategory}` : expense.category;
    const amount = document.createElement("p");
    amount.className = "amount";
    amount.textContent = formatMoney(expense.amount);
    const meta = document.createElement("p");
    meta.className = "meta";
    meta.textContent = `${formatDate(expense.date)} · ${expense.note}`;
    main.append(title, amount, meta);
    item.append(main);
    list.append(item);
  });
  host.append(list);
}

function recentExpenses(kind) {
  const home = state.spaces.home.filter((expense) => expense.category === kind.category);
  const business = state.spaces.business.filter((expense) => expense.category === kind.category);
  const rows = kind.id === "clothing" ? [...home, ...business] : kind.space === "business" ? business : home;
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

function buildScreen(name) {
  if (name === "groceries") return buildGroceries();
  if (name === "beauty") {
    return buildEntry({
      title: "Beauty",
      intro: "Skincare, makeup, salon visits, and everything you keep for yourself.",
      kind: "beauty",
      categories: BEAUTY,
      categoryLabel: "Category",
      fields: ["item", "brand", "notes", "receipt"],
    });
  }
  if (name === "clothing") {
    return buildEntry({
      title: "Clothing",
      intro: "Garments, shoes, bags, and fabric. Business stock is saved with the business.",
      kind: "clothing",
      categories: CLOTHING,
      categoryLabel: "Category",
      fields: ["item", "size", "person", "notes"],
    });
  }
  if (name === "household") {
    return buildEntry({
      title: "Household",
      intro: "Home things that are not part of the grocery run.",
      kind: "household",
      categories: HOUSEHOLD,
      categoryLabel: "Category",
      fields: ["item", "notes"],
    });
  }
  if (name === "bills") {
    return buildEntry({
      title: "Bills",
      intro: "This saves a bill as a home expense. Upcoming bills on the dashboard stay separate.",
      kind: "bills",
      categories: BILLS,
      categoryLabel: "Bill",
      fields: ["item", "notes"],
      itemLabel: "Bill name",
    });
  }
  if (name === "supplies") {
    return buildEntry({
      title: "Business Supplies",
      intro: "Shop supplies. These are saved with the business.",
      kind: "supplies",
      categories: SUPPLIES,
      categoryLabel: "Category",
      fields: ["item", "notes"],
    });
  }
  return buildEntry({
    title: "Other",
    intro: "Anything that does not fit the other lists.",
    kind: "other",
    categories: [],
    fields: ["item", "notes"],
  });
}

function buildGroceries() {
  const wrap = document.createElement("section");
  wrap.dataset.spendPanel = "groceries";
  const title = document.createElement("h2");
  title.textContent = "Groceries";
  const intro = document.createElement("p");
  intro.className = "meta";
  intro.textContent = "Tick what you need, type today’s price, and save the shop as one expense. Prices are never fixed.";
  const total = document.createElement("p");
  total.className = "grocery-total";
  total.append("List total ");
  const totalValue = document.createElement("span");
  totalValue.id = "grocery-total";
  totalValue.textContent = formatMoney(0);
  total.append(totalValue);
  const builderHost = document.createElement("div");
  builderHost.id = "grocery-builder";
  const dateField = document.createElement("div");
  dateField.className = "field";
  const dateLabel = document.createElement("label");
  dateLabel.htmlFor = "grocery-date";
  dateLabel.textContent = "Date";
  const date = document.createElement("input");
  date.id = "grocery-date";
  date.type = "date";
  date.value = today();
  dateField.append(dateLabel, date);
  const shopField = document.createElement("div");
  shopField.className = "field";
  const shopLabel = document.createElement("label");
  shopLabel.htmlFor = "grocery-shop";
  shopLabel.textContent = "Shop";
  const shop = document.createElement("input");
  shop.id = "grocery-shop";
  shop.name = "shop";
  shop.type = "text";
  shop.maxLength = 80;
  shop.placeholder = "Shop name";
  shopField.append(shopLabel, shop);
  const error = document.createElement("p");
  error.id = "grocery-error";
  error.className = "form-error";
  error.setAttribute("role", "alert");
  error.hidden = true;
  const actions = document.createElement("div");
  actions.className = "add-actions";
  const save = document.createElement("button");
  save.type = "button";
  save.className = "primary";
  save.id = "grocery-save";
  save.textContent = "Save as bought";
  const mark = document.createElement("button");
  mark.type = "button";
  mark.className = "edit-cancel";
  mark.id = "grocery-template";
  mark.textContent = "My monthly grocery list";
  actions.append(save, mark);
  const templateNote = document.createElement("p");
  templateNote.id = "grocery-template-note";
  templateNote.className = "meta";
  const drafts = document.createElement("div");
  drafts.id = "grocery-drafts";
  const catalogDetails = document.createElement("details");
  catalogDetails.className = "catalog-details";
  const summary = document.createElement("summary");
  summary.textContent = "Edit items and groups";
  const catalog = document.createElement("div");
  catalog.id = "grocery-catalog";
  catalogDetails.append(summary, catalog);
  const back = backButton();
  wrap.append(back, title, intro, total, builderHost, dateField, error, actions, templateNote, drafts, catalogDetails);
  paintBuilder(builderHost);
  paintCatalog(catalog);
  paintDrafts(drafts);
  paintTemplateNote(templateNote);
  updateGroceryTotal();
  return wrap;
}

function paintBuilder(host = document.getElementById("grocery-builder")) {
  if (!host) return;
  const catalog = loadCatalog();
  host.replaceChildren();
  catalog.groups.forEach((group) => {
    const items = itemsInGroup(catalog, group.id, { hidden: false });
    if (!items.length) return;
    const block = document.createElement("section");
    block.className = "grocery-block";
    const heading = document.createElement("h3");
    heading.textContent = group.name;
    block.append(heading);
    items.forEach((item) => {
      block.append(builderRow(item));
    });
    host.append(block);
  });
  if (!visibleItems(catalog).length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Your item list is empty. Add items under Edit items and groups.";
    host.append(empty);
  }
}

function builderRow(item) {
  const row = document.createElement("div");
  row.className = "grocery-row";
  const checkLabel = document.createElement("label");
  checkLabel.className = "grocery-check";
  const check = document.createElement("input");
  check.type = "checkbox";
  check.className = "repeat-toggle";
  check.dataset.groceryCheck = item.id;
  check.checked = builder.checked[item.id] === true;
  check.setAttribute("aria-label", `Tick ${item.name}`);
  const name = document.createElement("span");
  name.className = "grocery-name";
  name.textContent = item.name;
  checkLabel.append(check, name);
  const qty = document.createElement("input");
  qty.type = "number";
  qty.className = "grocery-qty";
  qty.min = "0.01";
  qty.step = "0.01";
  qty.inputMode = "decimal";
  qty.dataset.groceryQty = item.id;
  qty.value = builder.qty[item.id] || "1";
  qty.setAttribute("aria-label", `Quantity for ${item.name}`);
  const price = document.createElement("input");
  price.type = "number";
  price.className = "grocery-price";
  price.min = "0.01";
  price.step = "0.01";
  price.inputMode = "decimal";
  price.placeholder = "Price";
  price.dataset.groceryPrice = item.id;
  if (Object.prototype.hasOwnProperty.call(builder.price, item.id)) price.value = builder.price[item.id];
  else if (item.lastPrice != null) price.value = String(item.lastPrice);
  price.setAttribute("aria-label", `Price for ${item.name}`);
  row.append(checkLabel, qty, price);
  return row;
}

function paintCatalog(host = document.getElementById("grocery-catalog")) {
  if (!host) return;
  const catalog = loadCatalog();
  host.replaceChildren();
  host.append(catalogForms(catalog), ...catalog.groups.map((group) => catalogGroup(catalog, group)));
  const hidden = catalog.items.filter((item) => item.hidden);
  if (hidden.length) {
    const box = document.createElement("section");
    box.className = "grocery-block";
    const heading = document.createElement("h3");
    heading.textContent = "Hidden items";
    box.append(heading);
    hidden.forEach((item) => {
      const row = document.createElement("div");
      row.className = "catalog-line";
      const name = document.createElement("span");
      name.textContent = item.name;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "edit tiny";
      button.dataset.unhideItem = item.id;
      button.textContent = "Show";
      row.append(name, button);
      box.append(row);
    });
    host.append(box);
  }
}

function catalogForms(catalog) {
  const box = document.createElement("div");
  box.className = "catalog-forms";
  const groupForm = document.createElement("form");
  groupForm.dataset.catalogForm = "group";
  groupForm.noValidate = true;
  const groupInput = textInput("catalog-group-name", "Group name");
  const groupError = errorLine("catalog-group-error");
  const groupButton = document.createElement("button");
  groupButton.type = "submit";
  groupButton.className = "primary";
  groupButton.textContent = "Add group";
  groupForm.append(labeledField("New group", groupInput), groupError, groupButton);

  const itemForm = document.createElement("form");
  itemForm.dataset.catalogForm = "item";
  itemForm.noValidate = true;
  const itemInput = textInput("catalog-item-name", "Item name");
  const groupSelect = document.createElement("select");
  groupSelect.id = "catalog-item-group";
  catalog.groups.forEach((group) => {
    const option = document.createElement("option");
    option.value = group.id;
    option.textContent = group.name;
    groupSelect.append(option);
  });
  const itemError = errorLine("catalog-item-error");
  const itemButton = document.createElement("button");
  itemButton.type = "submit";
  itemButton.className = "primary";
  itemButton.textContent = "Add item";
  itemForm.append(labeledField("New item", itemInput), labeledField("Group", groupSelect), itemError, itemButton);
  box.append(groupForm, itemForm);
  return box;
}

function catalogGroup(catalog, group) {
  const section = document.createElement("section");
  section.className = "grocery-block";
  const head = document.createElement("div");
  head.className = "catalog-line";
  const name = textInput(`group-name-${group.id}`, "Group name");
  name.dataset.renameGroup = group.id;
  name.value = group.name;
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "delete tiny";
  remove.dataset.deleteGroup = group.id;
  remove.textContent = "Delete group";
  head.append(name, remove);
  section.append(head);
  itemsInGroup(catalog, group.id, { hidden: false }).forEach((item) => {
    const row = document.createElement("div");
    row.className = "catalog-line";
    const itemName = textInput(`item-name-${item.id}`, "Item name");
    itemName.dataset.renameItem = item.id;
    itemName.value = item.name;
    const move = document.createElement("select");
    move.dataset.moveItem = item.id;
    move.setAttribute("aria-label", `Group for ${item.name}`);
    catalog.groups.forEach((optionGroup) => {
      const option = document.createElement("option");
      option.value = optionGroup.id;
      option.textContent = optionGroup.name;
      option.selected = optionGroup.id === item.groupId;
      move.append(option);
    });
    const hide = document.createElement("button");
    hide.type = "button";
    hide.className = "edit tiny";
    hide.dataset.hideItem = item.id;
    hide.textContent = "Hide";
    const del = document.createElement("button");
    del.type = "button";
    del.className = "delete tiny";
    del.dataset.deleteItem = item.id;
    del.textContent = "Delete";
    row.append(itemName, move, hide, del);
    section.append(row);
  });
  return section;
}

function paintDrafts(host = document.getElementById("grocery-drafts")) {
  if (!host) return;
  host.replaceChildren();
  const lists = loadLists().filter((list) => list.draft && list.needsApproval);
  if (!lists.length) return;
  const heading = document.createElement("h3");
  heading.textContent = "Monthly lists";
  host.append(heading);
  lists.forEach((list) => {
    const card = document.createElement("article");
    card.className = "draft-list";
    card.dataset.draftId = list.id;
    card.dataset.needsApproval = list.needsApproval ? "true" : "false";
    const title = document.createElement("p");
    title.className = "summary-label";
    title.textContent = draftTitle(list);
    const flag = document.createElement("p");
    flag.className = "meta";
    flag.textContent = "Draft · needs approval. This is not saved as an expense yet.";
    const items = document.createElement("ul");
    items.className = "draft-items";
    list.lines.forEach((line) => {
      const row = document.createElement("li");
      const price = line.price == null ? "Price not remembered yet" : formatMoney(line.price);
      row.textContent = `${line.name} × ${formatQty(line.qty)} · ${price}`;
      items.append(row);
    });
    const use = document.createElement("button");
    use.type = "button";
    use.className = "edit";
    use.dataset.useDraft = list.id;
    use.textContent = "Use this list";
    card.append(title, flag, items, use);
    host.append(card);
  });
}

function paintTemplateNote(host = document.getElementById("grocery-template-note")) {
  if (!host) return;
  const count = loadTemplate().lines.length;
  host.textContent = count
    ? `My monthly grocery list has ${count} item${count === 1 ? "" : "s"}. A fresh copy is added the first time you open the app each month.`
    : "Tick items, then mark My monthly grocery list to repeat them each month.";
}

function onSpendClick(event) {
  const root = document.getElementById("spend-root");
  if (event.target.closest("[data-close-spend]")) {
    openSpend("expenses");
    return;
  }
  if (event.target.closest("#grocery-save")) {
    saveGroceriesBought();
    return;
  }
  if (event.target.closest("#grocery-template")) {
    markMonthlyTemplate();
    return;
  }
  const use = event.target.closest("[data-use-draft]");
  if (use) {
    useDraft(use.dataset.useDraft);
    return;
  }
  const hide = event.target.closest("[data-hide-item]");
  if (hide) {
    updateItem(hide.dataset.hideItem, (item) => ({ ...item, hidden: true }));
    return;
  }
  const unhide = event.target.closest("[data-unhide-item]");
  if (unhide) {
    updateItem(unhide.dataset.unhideItem, (item) => ({ ...item, hidden: false }));
    return;
  }
  const removeItem = event.target.closest("[data-delete-item]");
  if (removeItem) {
    const catalog = loadCatalog();
    catalog.items = catalog.items.filter((item) => item.id !== removeItem.dataset.deleteItem);
    saveCatalog(catalog);
    refreshGroceryEditors();
    return;
  }
  const removeGroup = event.target.closest("[data-delete-group]");
  if (removeGroup) {
    deleteGroup(removeGroup.dataset.deleteGroup);
    return;
  }
  if (!root) return;
}

function onSpendSubmit(event) {
  const form = event.target.closest("form");
  if (!form) return;
  event.preventDefault();
  if (form.dataset.catalogForm === "group") {
    addGroup(form);
    return;
  }
  if (form.dataset.catalogForm === "item") {
    addCatalogItem(form);
    return;
  }
  if (form.dataset.entryForm) saveEntry(form);
}

function onSpendInput(event) {
  const qty = event.target.closest("[data-grocery-qty]");
  if (qty) {
    builder.qty[qty.dataset.groceryQty] = qty.value;
    updateGroceryTotal();
    return;
  }
  const price = event.target.closest("[data-grocery-price]");
  if (price) {
    builder.price[price.dataset.groceryPrice] = price.value;
    updateGroceryTotal();
  }
}

function onSpendChange(event) {
  const check = event.target.closest("[data-grocery-check]");
  if (check) {
    builder.checked[check.dataset.groceryCheck] = check.checked;
    updateGroceryTotal();
    return;
  }
  const price = event.target.closest("[data-grocery-price]");
  if (price) {
    const parsed = parseMoney(price.value);
    if (!parsed.ok) return;
    const catalog = rememberPrice(loadCatalog(), price.dataset.groceryPrice, parsed.value);
    saveCatalog(catalog);
    return;
  }
  const renameItem = event.target.closest("[data-rename-item]");
  if (renameItem) {
    const name = renameItem.value.trim();
    if (!name) return;
    updateItem(renameItem.dataset.renameItem, (item) => ({ ...item, name: name.slice(0, 60) }));
    return;
  }
  const renameGroup = event.target.closest("[data-rename-group]");
  if (renameGroup) {
    const name = renameGroup.value.trim();
    if (!name) return;
    const catalog = loadCatalog();
    catalog.groups = catalog.groups.map((group) =>
      group.id === renameGroup.dataset.renameGroup ? { ...group, name: name.slice(0, 40) } : group
    );
    saveCatalog(catalog);
    paintBuilder();
    return;
  }
  const move = event.target.closest("[data-move-item]");
  if (move) {
    updateItem(move.dataset.moveItem, (item) => ({ ...item, groupId: move.value }));
  }
}

function selectedLines({ requirePrice }) {
  captureBuilder();
  const catalog = loadCatalog();
  const rows = [];
  let invalidPrice = false;
  let invalidQty = false;
  visibleItems(catalog).forEach((item) => {
    if (!builder.checked[item.id]) return;
    const qty = parseQty(builder.qty[item.id] || "1");
    const price = parseMoney(builder.price[item.id] ?? "");
    if (!qty.ok) invalidQty = true;
    if (requirePrice && !price.ok) invalidPrice = true;
    if (!qty.ok || (requirePrice && !price.ok)) return;
    rows.push({
      itemId: item.id,
      name: item.name,
      qty: qty.value,
      price: price.ok ? price.value : null,
      lineTotal: price.ok ? roundMoney(qty.value * price.value) : 0,
    });
  });
  const ticked = visibleItems(catalog).filter((item) => builder.checked[item.id]).length;
  return { rows, invalidPrice, invalidQty, ticked };
}

function saveGroceriesBought() {
  const error = document.getElementById("grocery-error");
  const date = document.getElementById("grocery-date").value;
  const { rows, invalidPrice, invalidQty, ticked } = selectedLines({ requirePrice: true });
  if (!date || !ticked || invalidPrice || invalidQty) {
    error.hidden = false;
    if (!date) error.textContent = "Choose the date of this shop.";
    else if (!ticked) error.textContent = "Tick at least one item.";
    else if (invalidQty) error.textContent = "Use a quantity greater than 0.";
    else error.textContent = "Type a price for each ticked item.";
    return;
  }
  const amount = roundMoney(rows.reduce((sum, line) => sum + line.lineTotal, 0));
  const expense = {
    id: crypto.randomUUID(),
    amount,
    category: "Groceries",
    subcategory: "Grocery list",
    date,
    note: groceryNote(rows),
    lines: rows,
    scanHost: "groceries",
  };
  const shop = document.getElementById("grocery-shop");
  if (shop && shop.value.trim()) expense.merchant = shop.value.trim();
  if (isDuplicateExpense(state.spaces.home, expense)) {
    error.hidden = false;
    error.textContent = "This matches an expense you already saved.";
    return;
  }
  let catalog = loadCatalog();
  rows.forEach((line) => {
    catalog = rememberPrice(catalog, line.itemId, line.price);
  });
  saveCatalog(catalog);
  addExpense("home", expense);
  clearStaged(document.querySelector("[data-spend-panel='groceries']"));
  error.hidden = true;
  rows.forEach((line) => {
    builder.checked[line.itemId] = false;
  });
  paintBuilder();
  updateGroceryTotal();
  paintRecent(KINDS[0]);
  document.getElementById("spend-recent-groceries")?.scrollIntoView({ block: "nearest" });
}

function markMonthlyTemplate() {
  const error = document.getElementById("grocery-error");
  const { rows, invalidQty, ticked } = selectedLines({ requirePrice: false });
  if (!ticked || invalidQty) {
    error.hidden = false;
    error.textContent = invalidQty ? "Use a quantity greater than 0." : "Tick the items that belong on your monthly list.";
    return;
  }
  saveTemplate({ lines: rows.map((line) => ({ itemId: line.itemId, qty: line.qty })) });
  let catalog = loadCatalog();
  rows.forEach((line) => {
    if (line.price != null) catalog = rememberPrice(catalog, line.itemId, line.price);
  });
  saveCatalog(catalog);
  applyMonthlyGroceryDraft(today());
  syncAutoApprovals();
  updateApprovalsBadge();
  error.hidden = true;
  paintTemplateNote();
  paintDrafts();
}

function useDraft(id) {
  const list = loadLists().find((entry) => entry.id === id);
  if (!list) return;
  Object.keys(builder.checked).forEach((key) => {
    builder.checked[key] = false;
  });
  list.lines.forEach((line) => {
    if (!line.itemId) return;
    builder.checked[line.itemId] = true;
    builder.qty[line.itemId] = String(line.qty);
    if (line.price != null) builder.price[line.itemId] = String(line.price);
  });
  paintBuilder();
  updateGroceryTotal();
  document.getElementById("grocery-builder")?.scrollIntoView({ block: "start" });
}

function updateGroceryTotal() {
  const total = document.getElementById("grocery-total");
  if (!total) return;
  let sum = 0;
  document.querySelectorAll("[data-grocery-check]:checked").forEach((box) => {
    const qty = parseQty(document.querySelector(`[data-grocery-qty="${CSS.escape(box.dataset.groceryCheck)}"]`)?.value);
    const price = parseMoney(document.querySelector(`[data-grocery-price="${CSS.escape(box.dataset.groceryCheck)}"]`)?.value);
    if (qty.ok && price.ok) sum += qty.value * price.value;
  });
  total.textContent = formatMoney(roundMoney(sum));
}

function addGroup(form) {
  const input = form.querySelector("input");
  const error = form.querySelector(".form-error");
  const name = input.value.trim();
  if (!name) {
    error.hidden = false;
    error.textContent = "Name the group.";
    input.focus();
    return;
  }
  const catalog = loadCatalog();
  catalog.groups.push({ id: crypto.randomUUID(), name: name.slice(0, 40) });
  saveCatalog(catalog);
  input.value = "";
  error.hidden = true;
  refreshGroceryEditors();
}

function addCatalogItem(form) {
  const input = form.querySelector("input");
  const select = form.querySelector("select");
  const error = form.querySelector(".form-error");
  const name = input.value.trim();
  if (!name || !select.value) {
    error.hidden = false;
    error.textContent = "Name the item and choose a group.";
    input.focus();
    return;
  }
  const catalog = loadCatalog();
  catalog.items.push({
    id: crypto.randomUUID(),
    groupId: select.value,
    name: name.slice(0, 60),
    hidden: false,
    lastPrice: null,
  });
  saveCatalog(catalog);
  input.value = "";
  error.hidden = true;
  refreshGroceryEditors();
}

function deleteGroup(groupId) {
  const catalog = loadCatalog();
  if (catalog.items.some((item) => item.groupId === groupId)) {
    const error = document.getElementById("grocery-error");
    error.hidden = false;
    error.textContent = "Move, hide, or delete the items in this group first.";
    return;
  }
  catalog.groups = catalog.groups.filter((group) => group.id !== groupId);
  saveCatalog(catalog);
  const error = document.getElementById("grocery-error");
  if (error) error.hidden = true;
  refreshGroceryEditors();
}

function updateItem(itemId, change) {
  const catalog = loadCatalog();
  catalog.items = catalog.items.map((item) => (item.id === itemId ? change(item) : item));
  saveCatalog(catalog);
  refreshGroceryEditors();
}

function refreshGroceryEditors() {
  captureBuilder();
  paintBuilder();
  paintCatalog();
  updateGroceryTotal();
}

function captureBuilder() {
  document.querySelectorAll("[data-grocery-check]").forEach((box) => {
    builder.checked[box.dataset.groceryCheck] = box.checked;
  });
  document.querySelectorAll("[data-grocery-qty]").forEach((input) => {
    builder.qty[input.dataset.groceryQty] = input.value;
  });
  document.querySelectorAll("[data-grocery-price]").forEach((input) => {
    builder.price[input.dataset.groceryPrice] = input.value;
  });
}

function buildEntry(config) {
  const wrap = document.createElement("section");
  const form = document.createElement("form");
  form.noValidate = true;
  form.dataset.entryForm = config.kind;
  form.append(backButton());
  const title = document.createElement("h2");
  title.textContent = config.title;
  const intro = document.createElement("p");
  intro.className = "meta";
  intro.textContent = config.intro;
  form.append(title, intro);
  if (config.categories.length) {
    const select = document.createElement("select");
    select.name = "subcategory";
    select.required = true;
    config.categories.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      select.append(option);
    });
    form.append(labeledField(config.categoryLabel, select));
  }
  if (config.fields.includes("item")) {
    form.append(labeledField(config.itemLabel || "Item", textInput(`${config.kind}-item`, config.itemLabel || "Item", "item")));
  }
  if (config.fields.includes("brand")) {
    form.append(labeledField("Brand", textInput(`${config.kind}-brand`, "Brand", "brand")));
  }
  if (config.fields.includes("size")) {
    form.append(labeledField("Size", textInput(`${config.kind}-size`, "Size", "size")));
  }
  if (config.fields.includes("person")) {
    const select = document.createElement("select");
    select.name = "person";
    select.required = true;
    PEOPLE.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      select.append(option);
    });
    form.append(labeledField("Who it is for", select));
  }
  const amount = document.createElement("input");
  amount.name = "amount";
  amount.type = "number";
  amount.inputMode = "decimal";
  amount.min = "0.01";
  amount.step = "0.01";
  amount.placeholder = "0.00";
  amount.required = true;
  form.append(labeledField("Amount", amount));
  const date = document.createElement("input");
  date.name = "date";
  date.type = "date";
  date.required = true;
  date.value = today();
  form.append(labeledField("Date", date));
  if (config.fields.includes("notes")) {
    form.append(labeledField("Notes", textInput(`${config.kind}-notes`, "Notes", "notes")));
  }
  if (config.fields.includes("receipt")) {
    const receipt = textInput(`${config.kind}-receipt`, "Receipt note", "receiptHook");
    receipt.placeholder = "A note about the receipt";
    form.append(labeledField("Receipt", receipt));
  }
  const error = document.createElement("p");
  error.className = "form-error";
  error.setAttribute("role", "alert");
  error.hidden = true;
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "primary";
  submit.textContent = "Save expense";
  form.append(error, submit);
  wrap.append(form);
  return wrap;
}

function saveEntry(form) {
  const error = form.querySelector(".form-error");
  const kind = form.dataset.entryForm;
  const amount = parseMoney(form.elements.amount.value);
  const date = form.elements.date.value;
  const itemName = form.elements.item ? form.elements.item.value.trim() : "";
  const notes = form.elements.notes ? form.elements.notes.value.trim() : "";
  const subcategory = form.elements.subcategory ? form.elements.subcategory.value : "";
  [form.elements.amount, form.elements.item, form.elements.date].filter(Boolean).forEach((field) => {
    field.classList.remove("invalid");
  });
  if (!amount.ok || !date || !itemName) {
    error.hidden = false;
    error.textContent = "Fill in the item, an amount greater than 0, and the date.";
    if (!itemName && form.elements.item) form.elements.item.classList.add("invalid");
    if (!amount.ok) form.elements.amount.classList.add("invalid");
    if (!date) form.elements.date.classList.add("invalid");
    return;
  }
  const expense = {
    id: crypto.randomUUID(),
    amount: amount.value,
    date,
    note: notes || itemName,
    itemName,
    scanHost: kind,
  };
  if (subcategory) expense.subcategory = subcategory;
  if (form.elements.brand && form.elements.brand.value.trim()) expense.brand = form.elements.brand.value.trim();
  if (form.elements.size && form.elements.size.value.trim()) expense.size = form.elements.size.value.trim();
  if (form.elements.person) expense.person = form.elements.person.value;
  if (form.elements.receiptHook && form.elements.receiptHook.value.trim()) {
    expense.receiptHook = form.elements.receiptHook.value.trim();
  }
  let spaceName = "home";
  if (kind === "beauty") expense.category = "Beauty";
  if (kind === "clothing") {
    expense.category = "Clothing";
    if (expense.person === "Business stock") spaceName = "business";
  }
  if (kind === "household") expense.category = "Household";
  if (kind === "bills") expense.category = "Bills";
  if (kind === "supplies") {
    expense.category = "Business Supplies";
    spaceName = "business";
  }
  if (kind === "other") expense.category = "Other";
  expense.scanHost = kind;
  if (isDuplicateExpense(state.spaces[spaceName], expense)) {
    error.hidden = false;
    error.textContent = "This matches an expense you already saved.";
    return;
  }
  addExpense(spaceName, expense);
  clearStaged(form);
  error.hidden = true;
  const keepDate = date;
  form.reset();
  if (form.elements.date) form.elements.date.value = keepDate;
  if (spaceName !== session.space) {
    session.spend = kind === "supplies" ? "supplies" : "clothing";
    if (spaceName === "business") session.businessView = "expenses";
    showSpace(spaceName);
  }
  paintRecent(KINDS.find((item) => item.id === kind));
  document.getElementById(`spend-recent-${kind}`)?.scrollIntoView({ block: "nearest" });
}

function backButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "edit-cancel spend-back";
  button.dataset.openSpend = "expenses";
  button.textContent = "All expenses";
  return button;
}

function textInput(id, label, name) {
  const input = document.createElement("input");
  input.id = id;
  input.type = "text";
  input.maxLength = 120;
  input.placeholder = label;
  input.autocomplete = "off";
  input.setAttribute("aria-label", label);
  if (name) input.name = name;
  return input;
}

function labeledField(labelText, control) {
  const field = document.createElement("div");
  field.className = "field";
  const label = document.createElement("label");
  if (!control.id) control.id = `field-${Math.random().toString(16).slice(2)}`;
  label.htmlFor = control.id;
  label.textContent = labelText;
  field.append(label, control);
  return field;
}

function errorLine(id) {
  const error = document.createElement("p");
  error.id = id;
  error.className = "form-error";
  error.setAttribute("role", "alert");
  error.hidden = true;
  return error;
}

function groceryNote(rows) {
  const text = rows.map((line) => `${line.name} × ${formatQty(line.qty)}`).join(", ");
  return text.length <= 120 ? text : `${text.slice(0, 119)}…`;
}

function formatQty(value) {
  const rounded = roundMoney(value);
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function parseQty(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return { ok: true, value: 1 };
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return { ok: false };
  const value = roundMoney(Number(text));
  if (!(value > 0)) return { ok: false };
  return { ok: true, value };
}
