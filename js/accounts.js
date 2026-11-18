import { formatMoney, parseMoney, roundMoney } from "./money.js";
import { today } from "./dates.js";
import { SPACES } from "./spaces.js";
import { state, saveSpaces, saveSales } from "./store.js";
import { get, save, deleteRecord } from "./storage.js";
import { ensureScreen, registerScreen } from "./router.js";
import { render } from "./render.js";
import { addPayment, balanceOf } from "./order-book.js";
import { recognizeImageText } from "./receipt.js";
import {
  ACCOUNT_TYPES,
  accountBalance,
  annotateImports,
  extractPdfText,
  likelyMissing,
  parseBankText,
  parseCsv,
  rowsFromMapping,
  suggestOrderMatch,
  validateAccountDraft,
} from "./accounts-logic.js";

let reviewRows = [];
let statement = null;
let screenRoot = null;

export function registerAccounts() {
  screenRoot = ensureScreen("accounts");
  screenRoot.replaceChildren(buildScreen());
  wire(screenRoot);
  mountAccountFields();
  registerScreen("accounts", {
    show() {
      paintAccounts();
      paintReview();
    },
  });
}

export function renderAccountBalances() {
  paintBalanceHost(document.getElementById("dashboard-panel"), "account-balances", true);
  paintBalanceHost(document.getElementById("home-summary-panel"), "home-account-balances", false);
  mountAccountFields();
}

export function reconcileProblems() {
  const expenses = linkedExpenses();
  return get("accounts").flatMap((account) => {
    if (!account.statedAt || !Number.isFinite(Number(account.statedBalance))) return [];
    const calc = accountBalance(account, expenses, state.sales);
    const stated = roundMoney(Number(account.statedBalance));
    const diff = roundMoney(stated - calc);
    if (diff === 0) return [];
    const direction = diff > 0 ? "higher" : "lower";
    return [{
      id: `reconcile:${account.id}`,
      title: `${account.name} balance does not match`,
      message: `${account.name} in the bank app is ${formatMoney(Math.abs(diff))} ${direction} than this account (${formatMoney(stated)} compared with ${formatMoney(calc)}).`,
      severity: "warning",
      screen: "accounts",
      params: { id: account.id },
    }];
  });
}

export function accountField(selected) {
  const select = document.createElement("select");
  select.name = "account";
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "No account";
  select.append(none);
  get("accounts").forEach((account) => {
    const option = document.createElement("option");
    option.value = account.id;
    option.textContent = accountLabel(account);
    select.append(option);
  });
  select.value = selected && [...select.options].some((option) => option.value === selected) ? selected : "";
  return select;
}

export function ingestBankText(text) {
  const parsed = parseBankText(text);
  if (!parsed.length) {
    setImportError("No amount was found in that text. Nothing was saved.");
    return parsed;
  }
  setReview(parsed);
  return parsed;
}

export async function importScreenshotFile(file) {
  if (!file || !String(file.type || "").startsWith("image/")) {
    setImportError("Choose a JPG or PNG screenshot. It stays on this device.");
    return "";
  }
  setImportError("");
  setImportStatus("Reading the screenshot on this device...");
  try {
    const dataUrl = await readDataUrl(file);
    const text = await recognizeImageText(dataUrl);
    setImportStatus("");
    ingestBankText(text);
    return text;
  } catch (error) {
    setImportStatus("");
    setImportError(error.message || "That screenshot could not be read on this device. Nothing was sent anywhere.");
    return "";
  }
}

export function loadStatementText(text, kind) {
  if (kind === "pdf") {
    const extracted = extractPdfText(text);
    if (!extracted) {
      setImportError("This PDF has no readable text. Export a CSV from the app and upload that instead. The file was not sent anywhere.");
      return;
    }
    if (extracted.includes(",") && extracted.split("\n").length > 1) {
      statement = parseCsv(extracted);
    } else {
      ingestBankText(extracted);
      return;
    }
  } else {
    statement = parseCsv(text);
  }
  if (!statement.records.length) {
    setImportError("That file has no rows. Nothing was saved.");
    return;
  }
  showMapping(statement.headers);
}

function mountAccountFields() {
  insertAccountSelect(document.getElementById("expense-form"), "expense-account");
  insertAccountSelect(document.getElementById("sale-form"), "sale-account");
}

function insertAccountSelect(form, id) {
  if (!form) return;
  let select = form.querySelector(`#${id}`);
  const current = select ? select.value : "";
  if (!select) {
    const field = document.createElement("div");
    field.className = "field";
    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = "Account";
    select = document.createElement("select");
    select.id = id;
    select.name = "account";
    field.append(label, select);
    const error = form.querySelector(".form-error");
    form.insertBefore(field, error || null);
  }
  const next = accountField(current);
  next.id = id;
  select.replaceWith(next);
}

function buildScreen() {
  const wrap = document.createElement("div");
  const intro = document.createElement("header");
  intro.className = "intro";
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Accounts";
  const title = document.createElement("h1");
  title.textContent = "Money accounts";
  const note = document.createElement("p");
  note.className = "meta";
  note.textContent = "Nothing here connects to a bank. Screenshots, messages, and files stay on this device. Passwords, PINs, OTPs, and full account numbers are never asked for or saved.";
  intro.append(eyebrow, title, note);

  const form = document.createElement("form");
  form.className = "sheet";
  form.id = "account-form";
  form.noValidate = true;
  form.append(
    field("Name", textInput("account-name", "Purse")),
    field("Type", typeSelect()),
    field("Bank or wallet name", textInput("account-provider", "HBL")),
    field("Opening balance", moneyInput("account-opening")),
    field("Last 4 digits (optional)", last4Input()),
    errorLine("account-error"),
    button("primary", "Save account", "submit")
  );

  const list = document.createElement("section");
  list.className = "card";
  const listTitle = document.createElement("h2");
  listTitle.textContent = "Balances";
  const accounts = document.createElement("div");
  accounts.id = "account-list";
  accounts.className = "expense-list";
  list.append(listTitle, accounts);

  const imports = document.createElement("section");
  imports.className = "sheet";
  const importTitle = document.createElement("h2");
  importTitle.textContent = "Import transactions";
  const shot = document.createElement("input");
  shot.id = "account-screenshot";
  shot.type = "file";
  shot.accept = "image/*";
  const shotLabel = document.createElement("label");
  shotLabel.className = "primary";
  shotLabel.htmlFor = "account-screenshot";
  shotLabel.textContent = "Scan a screenshot";
  shot.hidden = true;
  const sms = document.createElement("textarea");
  sms.id = "account-sms";
  sms.rows = 4;
  sms.placeholder = "Paste an SMS or wallet alert";
  const smsButton = button("edit", "Read pasted text", "button");
  smsButton.id = "read-sms";
  const file = document.createElement("input");
  file.id = "account-statement";
  file.type = "file";
  file.accept = ".csv,text/csv,.pdf,application/pdf,text/plain";
  const fileLabel = document.createElement("label");
  fileLabel.className = "edit";
  fileLabel.htmlFor = "account-statement";
  fileLabel.textContent = "Upload CSV or PDF";
  file.hidden = true;
  const status = document.createElement("p");
  status.id = "import-status";
  status.className = "meta";
  status.hidden = true;
  imports.append(importTitle, shotLabel, shot, field("SMS or alert", sms), smsButton, fileLabel, file, status, errorLine("import-error"));

  const mapping = document.createElement("section");
  mapping.className = "sheet";
  mapping.id = "statement-mapping";
  mapping.hidden = true;
  const mapTitle = document.createElement("h2");
  mapTitle.textContent = "Match the columns";
  mapping.append(mapTitle);

  const review = document.createElement("section");
  review.className = "sheet";
  review.id = "import-review";
  review.hidden = true;
  const reviewTitle = document.createElement("h2");
  reviewTitle.textContent = "Review before saving";
  const reviewList = document.createElement("div");
  reviewList.id = "import-rows";
  reviewList.className = "expense-list";
  const confirm = button("primary", "Confirm", "button");
  confirm.id = "confirm-import";
  const later = button("edit", "Save for Approval", "button");
  later.id = "approval-import";
  review.append(reviewTitle, reviewList, confirm, later);

  wrap.append(intro, form, list, imports, mapping, review);
  return wrap;
}

function wire(root) {
  root.querySelector("#account-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const built = validateAccountDraft({
      name: valueOf("account-name"),
      type: valueOf("account-type"),
      provider: valueOf("account-provider"),
      openingBalance: moneyOrBlank("account-opening"),
      last4: valueOf("account-last4"),
    });
    const error = root.querySelector("#account-error");
    if (!built.ok) {
      error.textContent = built.error;
      error.hidden = false;
      return;
    }
    save("accounts", { id: crypto.randomUUID(), ...built.account, statedBalance: null, statedAt: "" });
    event.target.reset();
    error.hidden = true;
    paintAccounts();
    mountAccountFields();
    render();
  });

  root.querySelector("#account-list").addEventListener("click", (event) => {
    const check = event.target.closest("[data-check-balance]");
    const remove = event.target.closest("[data-delete-account]");
    if (check) openReconcile(check.dataset.checkBalance);
    if (remove) {
      deleteRecord("accounts", remove.dataset.deleteAccount);
      paintAccounts();
      mountAccountFields();
      render();
    }
  });

  root.querySelector("#account-list").addEventListener("submit", (event) => {
    const form = event.target.closest("[data-reconcile]");
    if (!form) return;
    event.preventDefault();
    applyReconcile(form);
  });

  root.querySelector("#account-screenshot").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (file) importScreenshotFile(file);
  });

  root.querySelector("#read-sms").addEventListener("click", () => {
    ingestBankText(valueOf("account-sms"));
  });

  root.querySelector("#account-statement").addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    const pdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name || "");
    if (pdf) loadStatementText(await readText(file), "pdf");
    else loadStatementText(await readText(file), "csv");
  });

  root.querySelector("#import-rows").addEventListener("input", (event) => {
    if (event.target.matches("[data-kind]")) paintReview();
  });

  root.querySelector("#confirm-import").addEventListener("click", () => commitReview(false));
  root.querySelector("#approval-import").addEventListener("click", () => commitReview(true));
}

function paintAccounts() {
  const host = document.getElementById("account-list");
  if (!host) return;
  host.replaceChildren();
  const accounts = get("accounts");
  if (!accounts.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No accounts yet. Old entries stay as No account.";
    host.append(empty);
    return;
  }
  const expenses = linkedExpenses();
  accounts.forEach((account) => {
    const card = document.createElement("article");
    card.className = "card";
    const name = document.createElement("h3");
    name.textContent = accountLabel(account);
    const meta = document.createElement("p");
    meta.className = "meta";
    meta.textContent = `${account.type}${account.provider ? ` · ${account.provider}` : ""}${account.last4 ? ` · •••• ${account.last4}` : ""}`;
    const balance = document.createElement("p");
    balance.className = "dash-figure";
    balance.textContent = formatMoney(accountBalance(account, expenses, state.sales));
    const actions = document.createElement("div");
    actions.className = "edit-actions";
    const check = button("primary", "Check my balance", "button");
    check.dataset.checkBalance = account.id;
    const remove = button("delete", "Delete", "button");
    remove.dataset.deleteAccount = account.id;
    actions.append(check, remove);
    card.append(name, meta, balance, actions);
    host.append(card);
  });
}

function openReconcile(accountId) {
  const host = document.getElementById("account-list");
  const account = get("accounts", accountId);
  if (!host || !account) return;
  host.querySelectorAll("[data-reconcile]").forEach((node) => node.remove());
  const form = document.createElement("form");
  form.className = "sheet";
  form.dataset.reconcile = accountId;
  form.noValidate = true;
  const label = document.createElement("p");
  label.className = "meta";
  label.textContent = `Type the balance you see in the ${account.name} app.`;
  const input = moneyInput("stated-balance");
  input.name = "stated";
  if (account.statedAt) input.value = String(account.statedBalance);
  const result = document.createElement("div");
  result.className = "meta";
  result.dataset.reconcileResult = accountId;
  form.append(label, field("Balance in your app", input), button("primary", "Compare", "submit"), result);
  const card = [...host.children].find((node) => node.querySelector(`[data-check-balance="${accountId}"]`));
  if (card) card.append(form);
  if (account.statedAt) showDifference(account, result);
}

function applyReconcile(form) {
  const account = get("accounts", form.dataset.reconcile);
  const parsed = parseMoney(form.elements.stated.value, { allowZero: true });
  const result = form.querySelector("[data-reconcile-result]");
  if (!account || !parsed.ok) {
    if (result) {
      result.textContent = "Enter the balance from your app, using 0 or more and at most 2 decimal places.";
    }
    return;
  }
  save("accounts", { ...account, statedBalance: parsed.value, statedAt: today() });
  showDifference(get("accounts", account.id), result);
  render();
}

function showDifference(account, result) {
  if (!result || !account) return;
  const calc = accountBalance(account, linkedExpenses(), state.sales);
  const stated = roundMoney(Number(account.statedBalance));
  const diff = roundMoney(stated - calc);
  result.replaceChildren();
  const line = document.createElement("p");
  line.id = "reconcile-diff";
  line.textContent = `This account shows ${formatMoney(calc)}. You typed ${formatMoney(stated)}. Difference: ${formatMoney(diff)}.`;
  result.append(line);
  const pool = missingPool(account.id);
  const missing = likelyMissing(diff, pool);
  if (!missing.length || diff === 0) return;
  const title = document.createElement("p");
  title.textContent = diff > 0 ? "Likely missing money in" : "Likely missing money out";
  const list = document.createElement("ul");
  list.className = "expense-list";
  missing.forEach((item) => {
    const row = document.createElement("li");
    row.textContent = `${formatMoney(item.amount)} · ${item.date} · ${item.note}`;
    list.append(row);
  });
  result.append(title, list);
}

function missingPool(accountId) {
  const pool = [];
  linkedExpenses().forEach((expense) => {
    if (expense.accountId === accountId) return;
    pool.push({ kind: "expense", amount: expense.amount, date: expense.date, note: expense.note || "Expense" });
  });
  state.sales.forEach((sale) => {
    if (sale.accountId === accountId) return;
    const cash = Number(sale.cashReceived);
    if (!(cash > 0)) return;
    pool.push({ kind: "income", amount: cash, date: sale.date, note: sale.note || "Income" });
  });
  get("orders").forEach((order) => {
    if (order.status === "Cancelled") return;
    const due = balanceOf(order);
    if (!(due > 0)) return;
    pool.push({ kind: "income", amount: due, date: order.deliveryDate || today(), note: `Unpaid order · ${order.customerName}` });
  });
  return pool;
}

function setReview(rows) {
  const existing = existingMoney();
  reviewRows = annotateImports(rows, existing).map((row) => ({
    ...row,
    category: row.kind === "income" ? "Income" : "Groceries",
    space: "home",
    accountId: get("accounts")[0] ? get("accounts")[0].id : "",
    orderId: "",
  }));
  reviewRows.forEach((row) => {
    const match = suggestOrderMatch(row, openOrders());
    if (match) row.orderId = match.id;
  });
  setImportError("");
  paintReview();
}

function paintReview() {
  const section = document.getElementById("import-review");
  const host = document.getElementById("import-rows");
  if (!section || !host) return;
  if (!reviewRows.length) {
    section.hidden = true;
    host.replaceChildren();
    return;
  }
  section.hidden = false;
  const edited = [...host.querySelectorAll("[data-import-row]")].map(readRow);
  if (edited.length === reviewRows.length) reviewRows = edited;
  host.replaceChildren();
  reviewRows.forEach((row, index) => {
    const fresh = annotateImports([row], existingMoney().filter((item) => item !== row))[0];
    const others = reviewRows.filter((item, itemIndex) => itemIndex !== index);
    const duplicate = fresh.duplicate || annotateImports([row], others)[0].duplicate;
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.importRow = String(index);
    if (row.orderId) card.dataset.orderId = row.orderId;
    const include = document.createElement("input");
    include.type = "checkbox";
    include.dataset.include = "";
    include.checked = duplicate ? false : row.include !== false;
    const includeLabel = document.createElement("label");
    includeLabel.append(include, document.createTextNode(" Include"));
    card.append(includeLabel);
    if (duplicate) {
      const flag = document.createElement("p");
      flag.className = "meta";
      flag.dataset.duplicate = "";
      flag.textContent = "Duplicate: same amount, date, and reference.";
      card.append(flag);
    }
    card.append(
      mini("Amount", numberBox("data-amount", row.amount)),
      mini("Date", dateBox(row.date)),
      mini("Note", textBox("data-note", row.note)),
      mini("Reference", textBox("data-reference", row.reference || "")),
      mini("Income or expense", kindSelect(row.kind)),
      mini("Category", categorySelect(row)),
      mini("Account", accountChoice(row.accountId))
    );
    const order = row.orderId ? get("orders", row.orderId) : null;
    if (order && row.kind === "income") {
      const link = document.createElement("input");
      link.type = "checkbox";
      link.dataset.linkOrder = "";
      link.checked = true;
      const label = document.createElement("label");
      label.append(link, document.createTextNode(` Link to unpaid order for ${order.customerName} and mark that payment verified`));
      card.append(label);
    }
    host.append(card);
  });
}

function commitReview(forApproval) {
  const host = document.getElementById("import-rows");
  const rows = [...host.querySelectorAll("[data-import-row]")].map(readRow).filter((row) => row.include);
  if (!rows.length) {
    setImportError("Tick at least one row. Nothing is saved until you confirm.");
    return;
  }
  const bad = rows.find((row) => !(row.amount > 0) || !row.date || !row.note);
  if (bad) {
    setImportError("Each included row needs an amount greater than 0, a date, and a note.");
    return;
  }
  if (forApproval) {
    if (typeof globalThis.queuePendingApproval !== "function") {
      setImportError("Approvals are not ready yet. Nothing was saved.");
      return;
    }
    rows.forEach((row) => {
      globalThis.queuePendingApproval({
        source: "Auto: Account import",
        sourceKey: `import:${row.date}:${row.amount}:${row.reference || row.note}`,
        title: row.note,
        note: row.note,
        kind: row.kind,
        space: row.space,
        category: row.kind === "income" ? "Income" : row.category,
        amount: row.amount,
        date: row.date,
        accountId: row.accountId,
        reference: row.reference,
        customer: row.kind === "income" ? row.note : "",
      });
    });
  } else {
    rows.forEach((row) => saveImported(row));
  }
  reviewRows = [];
  paintReview();
  paintAccounts();
  setImportError("");
  setImportStatus(forApproval ? "Sent to Pending Approvals. Nothing was added to totals yet." : "Saved.");
  render();
}

function saveImported(row) {
  if (row.kind === "income" && row.orderId && row.linkOrder) {
    const account = get("accounts", row.accountId);
    const method = methodFor(account ? account.type : "Cash");
    const result = addPayment(row.orderId, { amount: row.amount, method, date: row.date });
    if (!result.ok) {
      setImportError(result.error);
      return;
    }
    const order = result.order;
    const payment = order.payments[order.payments.length - 1];
    payment.verified = true;
    save("orders", order);
    const sale = state.sales.find((item) => item.paymentId === payment.id);
    if (sale) {
      if (row.accountId) sale.accountId = row.accountId;
      if (row.reference) sale.reference = row.reference;
      sale.verified = true;
      saveSales();
    }
    return;
  }
  if (row.kind === "income") {
    const sale = {
      id: crypto.randomUUID(),
      amount: row.amount,
      date: row.date,
      note: row.note,
      customer: "",
      kind: "earned",
      earnedAmount: row.amount,
      cashReceived: row.amount,
    };
    if (row.accountId) sale.accountId = row.accountId;
    if (row.reference) sale.reference = row.reference;
    state.sales.unshift(sale);
    saveSales();
    return;
  }
  const expense = {
    id: crypto.randomUUID(),
    amount: row.amount,
    category: row.category || "Other",
    date: row.date,
    note: row.note,
  };
  if (row.accountId) expense.accountId = row.accountId;
  if (row.reference) expense.reference = row.reference;
  const space = row.space === "business" ? "business" : "home";
  state.spaces[space].unshift(expense);
  saveSpaces();
}

function readRow(card) {
  const kind = card.querySelector("[data-kind]").value === "income" ? "income" : "expense";
  const previous = reviewRows[Number(card.dataset.importRow)] || {};
  return {
    include: card.querySelector("[data-include]").checked,
    amount: roundMoney(Number(card.querySelector("[data-amount]").value)),
    date: card.querySelector("[data-date]").value,
    note: card.querySelector("[data-note]").value.trim().slice(0, 120),
    reference: card.querySelector("[data-reference]").value.trim().slice(0, 24),
    kind,
    category: card.querySelector("[data-category]").value,
    space: card.querySelector("[data-space]") ? card.querySelector("[data-space]").value : previous.space || "home",
    accountId: card.querySelector("[data-account]").value,
    linkOrder: Boolean(card.querySelector("[data-link-order]") && card.querySelector("[data-link-order]").checked),
    orderId: card.dataset.orderId || previous.orderId || "",
  };
}

function showMapping(headers) {
  const section = document.getElementById("statement-mapping");
  if (!section) return;
  section.hidden = false;
  section.replaceChildren();
  const title = document.createElement("h2");
  title.textContent = "Match the columns";
  section.append(title);
  const date = columnSelect(headers, "date", /date/i);
  const amount = columnSelect(headers, "amount", /amount|amt|debit|credit/i);
  const note = columnSelect(headers, "note", /desc|narr|detail|note|particular/i);
  const type = columnSelect(headers, "type", /type|dr|cr|debit|credit/i, true);
  const reference = columnSelect(headers, "reference", /ref|tid|trx/i, true);
  const go = button("primary", "Review rows", "button");
  go.addEventListener("click", () => {
    const mapped = rowsFromMapping(statement.records, {
      date: date.value,
      amount: amount.value,
      note: note.value,
      type: type.value,
      reference: reference.value,
    });
    if (!mapped.length) {
      setImportError("Those columns did not produce any amounts. Nothing was saved.");
      return;
    }
    section.hidden = true;
    setReview(mapped);
  });
  section.append(
    mini("Date", date),
    mini("Amount", amount),
    mini("Description", note),
    mini("Money in or out", type),
    mini("Reference", reference),
    go
  );
}

function columnSelect(headers, name, pattern, optional) {
  const select = document.createElement("select");
  select.name = name;
  if (optional) {
    const skip = document.createElement("option");
    skip.value = "";
    skip.textContent = "Skip";
    select.append(skip);
  }
  headers.forEach((header) => {
    const option = document.createElement("option");
    option.value = header;
    option.textContent = header;
    if (pattern.test(header)) option.selected = true;
    select.append(option);
  });
  return select;
}

function paintBalanceHost(host, id, afterMonth) {
  if (!host) return;
  let section = document.getElementById(id);
  if (!section) {
    section = document.createElement("section");
    section.id = id;
    section.className = "dash-cards";
    section.setAttribute("aria-label", "Account balances");
    const month = host.querySelector(".field");
    if (afterMonth && month) host.insertBefore(section, month.nextSibling);
    else host.prepend(section);
  }
  section.replaceChildren();
  const accounts = get("accounts");
  if (!accounts.length) {
    section.append(balanceCard("Accounts", "No accounts yet"));
    return;
  }
  const expenses = linkedExpenses();
  accounts.forEach((account) => {
    const detail = `${account.type}${account.last4 ? ` · •••• ${account.last4}` : ""}`;
    section.append(balanceCard(account.name, detail, formatMoney(accountBalance(account, expenses, state.sales))));
  });
}

function balanceCard(label, meta, figure) {
  const card = document.createElement("article");
  card.className = "dash-card";
  const name = document.createElement("p");
  name.className = "summary-label";
  name.textContent = label;
  const detail = document.createElement("p");
  detail.className = "meta";
  detail.textContent = meta;
  card.append(name, detail);
  if (figure) {
    const amount = document.createElement("p");
    amount.className = "dash-figure";
    amount.textContent = figure;
    card.append(amount);
  }
  return card;
}

function existingMoney() {
  return [
    ...linkedExpenses().map((expense) => ({ amount: expense.amount, date: expense.date, reference: expense.reference || "" })),
    ...state.sales.map((sale) => ({ amount: sale.amount, date: sale.date, reference: sale.reference || "" })),
  ];
}

function linkedExpenses() {
  return [...state.spaces.home, ...state.spaces.business];
}

function openOrders() {
  return get("orders")
    .filter((order) => order.status !== "Cancelled")
    .map((order) => ({ ...order, balance: balanceOf(order) }))
    .filter((order) => order.balance > 0);
}

function methodFor(type) {
  if (type === "Easypaisa" || type === "JazzCash" || type === "Cash") return type;
  return "Bank Transfer";
}

function accountLabel(account) {
  return account.last4 ? `${account.name} •••• ${account.last4}` : account.name;
}

function setImportError(message) {
  const error = document.getElementById("import-error");
  if (!error) return;
  error.textContent = message;
  error.hidden = !message;
}

function setImportStatus(message) {
  const status = document.getElementById("import-status");
  if (!status) return;
  status.textContent = message;
  status.hidden = !message;
}

function valueOf(id) {
  const node = document.getElementById(id);
  return node ? node.value.trim() : "";
}

function moneyOrBlank(id) {
  const parsed = parseMoney(valueOf(id), { allowZero: true });
  return parsed.ok ? parsed.value : -1;
}

function field(labelText, control) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const label = document.createElement("label");
  label.htmlFor = control.id;
  label.textContent = labelText;
  wrap.append(label, control);
  return wrap;
}

function mini(labelText, control) {
  return field(labelText, control);
}

function textInput(id, placeholder) {
  const input = document.createElement("input");
  input.id = id;
  input.type = "text";
  input.maxLength = 60;
  input.placeholder = placeholder;
  return input;
}

function moneyInput(id) {
  const input = document.createElement("input");
  input.id = id;
  input.type = "number";
  input.min = "0";
  input.step = "0.01";
  input.inputMode = "decimal";
  input.value = "0";
  return input;
}

function last4Input() {
  const input = textInput("account-last4", "1234");
  input.maxLength = 4;
  input.inputMode = "numeric";
  return input;
}

function typeSelect() {
  const select = document.createElement("select");
  select.id = "account-type";
  ACCOUNT_TYPES.forEach((type) => {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = type;
    select.append(option);
  });
  return select;
}

function errorLine(id) {
  const error = document.createElement("p");
  error.id = id;
  error.className = "form-error";
  error.setAttribute("role", "alert");
  error.hidden = true;
  return error;
}

function button(className, text, type) {
  const node = document.createElement("button");
  node.type = type;
  node.className = className;
  node.textContent = text;
  return node;
}

function numberBox(dataset, value) {
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0.01";
  input.step = "0.01";
  input.value = Number(value).toFixed(2);
  input.dataset.amount = "";
  return input;
}

function dateBox(value) {
  const input = document.createElement("input");
  input.type = "date";
  input.value = value;
  input.dataset.date = "";
  return input;
}

function textBox(dataset, value) {
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.dataset[dataset.replace("data-", "")] = "";
  return input;
}

function kindSelect(kind) {
  const select = document.createElement("select");
  select.dataset.kind = "";
  ["expense", "income"].forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value === "income" ? "Income" : "Expense";
    option.selected = value === kind;
    select.append(option);
  });
  return select;
}

function categorySelect(row) {
  const select = document.createElement("select");
  select.dataset.category = "";
  const space = document.createElement("select");
  space.dataset.space = "";
  space.hidden = true;
  ["home", "business"].forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    option.selected = row.space === value;
    space.append(option);
  });
  const categories = row.kind === "income" ? ["Income"] : SPACES[row.space === "business" ? "business" : "home"].categories;
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    option.selected = category === row.category;
    select.append(option);
  });
  select.dataset.spaceHolder = "1";
  select.after = null;
  const wrap = select;
  wrap._space = space;
  return select;
}

function accountChoice(selected) {
  const select = accountField(selected);
  select.id = "";
  select.dataset.account = "";
  return select;
}

function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("That screenshot could not be opened on this device."));
    reader.readAsDataURL(file);
  });
}

function readText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("That file could not be opened on this device."));
    reader.readAsText(file);
  });
}
