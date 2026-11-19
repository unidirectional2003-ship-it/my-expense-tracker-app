import { parseMoney, formatMoney } from "./money.js";
import { today, formatDate } from "./dates.js";
import { session } from "./session.js";
import { state, saveSales } from "./store.js";
import { isDuplicateSale, saleStatus, monthBusiness, receivableOf } from "./calc.js";
import { render } from "./render.js";
import { attachReceipt, pinReceipt } from "./receipt-hook.js";
import { clearStaged, viewReceiptButton } from "./receipt.js";
import { accountField } from "./accounts.js";

const saleForm = document.getElementById("sale-form");
const saleAmountInput = document.getElementById("sale-amount");
const saleDateInput = document.getElementById("sale-date");
const saleNoteInput = document.getElementById("sale-note");
const saleCustomerInput = document.getElementById("sale-customer");
const saleKindInput = document.getElementById("sale-kind");
const saleCashField = document.getElementById("sale-cash-field");
const saleCashInput = document.getElementById("sale-cash");
const saleHelp = document.getElementById("sale-kind-help");
const saleErrorEl = document.getElementById("sale-error");
const saleListEl = document.getElementById("sale-list");
const profitMonthInput = document.getElementById("profit-month");
const profitEarnedEl = document.getElementById("profit-earned");
const profitCashEl = document.getElementById("profit-cash");
const profitAdvancesEl = document.getElementById("profit-advances");
const profitOutstandingEl = document.getElementById("profit-outstanding");
const profitExpensesEl = document.getElementById("profit-expenses");
const profitAmountEl = document.getElementById("profit-amount");

const amountHint = "Use an amount greater than 0 with at most 2 decimal places.";

export function bindSales() {
  saleKindInput.addEventListener("change", syncSaleKind);
  saleForm.addEventListener("submit", (event) => {
    event.preventDefault();
    clearSaleInvalid();
    const built = readSaleFields(saleForm, saleAmountInput, saleDateInput, saleNoteInput, saleCashInput, saleKindInput);
    if (built.error) {
      built.invalid.forEach((field) => field.classList.add("invalid"));
      saleErrorEl.textContent = built.error;
      saleErrorEl.hidden = false;
      (built.invalid[0] || saleAmountInput).focus();
      return;
    }
    if (isDuplicateSale(state.sales, built.sale)) {
      saleErrorEl.textContent = "This matches a sale you already saved.";
      saleErrorEl.hidden = false;
      saleAmountInput.focus();
      return;
    }
    const sale = { id: crypto.randomUUID(), ...built.sale };
    state.sales.unshift(sale);
    pinReceipt("sale-form", sale.id);
    try {
      attachReceipt("payment", sale.id);
    } catch {
      saleErrorEl.textContent = "The payment was saved, but the photo could not be stored on this device.";
      saleErrorEl.hidden = false;
    }
    saveSales();
    render();
    clearStaged(saleForm);
    saleForm.reset();
    saleDateInput.value = today();
    syncSaleKind();
    saleErrorEl.hidden = true;
    saleAmountInput.focus();
  });

  saleListEl.addEventListener("click", (event) => {
    if (event.target.closest("[data-cancel-sale]")) {
      session.editingSaleId = null;
      render();
      return;
    }
    const editButton = event.target.closest("[data-sale-edit]");
    if (editButton) {
      session.editingSaleId = editButton.dataset.saleEdit;
      render();
      const field = saleListEl.querySelector(".edit-form [name=amount]");
      if (field) field.focus();
      return;
    }
    const button = event.target.closest("[data-sale-id]");
    if (!button) return;
    if (session.editingSaleId === button.dataset.saleId) session.editingSaleId = null;
    state.sales = state.sales.filter((sale) => sale.id !== button.dataset.saleId);
    saveSales();
    render();
  });

  saleListEl.addEventListener("submit", (event) => {
    const editForm = event.target.closest(".edit-form");
    if (!editForm) return;
    event.preventDefault();
    saveSaleEdit(editForm);
  });

  saleListEl.addEventListener("change", (event) => {
    if (event.target.name === "kind") syncEditCash(event.target.closest(".edit-form"));
  });

  profitMonthInput.addEventListener("input", render);
}

export function prepareSalesForm() {
  saleDateInput.value = today();
  profitMonthInput.value = today().slice(0, 7);
  syncSaleKind();
}

export function renderSales() {
  saleListEl.replaceChildren(
    ...state.sales.map((sale) => {
      const item = document.createElement("li");
      item.className = "expense";
      if (sale.id === session.editingSaleId) {
        item.classList.add("expense-editing");
        item.append(buildSaleEdit(sale));
        return item;
      }
      const main = document.createElement("div");
      main.className = "expense-main";
      const top = document.createElement("div");
      top.className = "expense-top";
      const title = document.createElement("span");
      title.className = "category";
      title.textContent = sale.customer || (sale.kind === "advance" ? "Advance" : "Sale");
      if (sale.verified === true) {
        const badge = document.createElement("span");
        badge.className = "verified-badge";
        badge.textContent = "Verified";
        title.append(document.createTextNode(" "), badge);
      }
      const amount = document.createElement("span");
      amount.className = "amount";
      amount.textContent = formatMoney(sale.amount);
      const meta = document.createElement("p");
      meta.className = "meta";
      meta.textContent = `${formatDate(sale.date)} · ${statusText(sale)} · ${sale.note}`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "delete";
      button.dataset.saleId = sale.id;
      button.textContent = "Delete";
      button.setAttribute("aria-label", `Delete ${title.textContent} of ${formatMoney(sale.amount)}`);
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "edit";
      editButton.dataset.saleEdit = sale.id;
      editButton.textContent = "Edit";
      editButton.setAttribute("aria-label", `Edit ${title.textContent} of ${formatMoney(sale.amount)}`);
      const actions = document.createElement("div");
      actions.className = "expense-actions";
      const view = viewReceiptButton(sale, "paymentProofId");
      if (view) actions.append(view);
      actions.append(editButton, button);
      top.append(title, amount);
      main.append(top, meta);
      item.append(main, actions);
      return item;
    })
  );
}

export function renderProfit() {
  const month = profitMonthInput.value;
  const figures = monthBusiness(state.sales, state.spaces.business, month);
  profitEarnedEl.textContent = formatMoney(figures.earned);
  profitCashEl.textContent = formatMoney(figures.cash);
  profitAdvancesEl.textContent = formatMoney(figures.advances);
  profitOutstandingEl.textContent = formatMoney(figures.outstanding);
  profitExpensesEl.textContent = formatMoney(figures.expenses);
  profitAmountEl.textContent = formatMoney(figures.profit);
  profitAmountEl.classList.toggle("profit-positive", figures.profit > 0);
  profitAmountEl.classList.toggle("profit-negative", figures.profit < 0);
}

function saveSaleEdit(editForm) {
  const sale = state.sales.find((item) => item.id === editForm.dataset.saleId);
  const error = editForm.querySelector(".form-error");
  if (!sale) {
    session.editingSaleId = null;
    render();
    return;
  }
  const built = readSaleFields(
    editForm,
    editForm.elements.amount,
    editForm.elements.date,
    editForm.elements.note,
    editForm.elements.cash,
    editForm.elements.kind,
    editForm.elements.customer
  );
  [...editForm.querySelectorAll("input, select")].forEach((field) => field.classList.remove("invalid"));
  if (built.error) {
    built.invalid.forEach((field) => field.classList.add("invalid"));
    error.textContent = built.error;
    error.hidden = false;
    (built.invalid[0] || editForm.elements.amount).focus();
    return;
  }
  if (isDuplicateSale(state.sales, built.sale, sale.id)) {
    error.textContent = "This matches a sale you already saved.";
    error.hidden = false;
    return;
  }
  Object.assign(sale, built.sale);
  if (!built.sale.accountId) delete sale.accountId;
  session.editingSaleId = null;
  saveSales();
  render();
}

function readSaleFields(source, amountField, dateField, noteField, cashField, kindField, customerField = saleCustomerInput) {
  const parsed = parseMoney(amountField.value);
  const date = dateField.value;
  const note = noteField.value.trim();
  const customer = customerField.value.trim();
  const kind = kindField.value === "advance" ? "advance" : "earned";
  const invalid = [];
  if (!parsed.ok) invalid.push(amountField);
  if (!date) invalid.push(dateField);
  if (!note) invalid.push(noteField);
  if (invalid.length) {
    return { error: `Amount, date, and note are required. ${amountHint}`, invalid };
  }

  let earnedAmount = 0;
  let cashReceived = 0;
  if (kind === "advance") {
    cashReceived = parsed.value;
  } else if (!cashField.value.trim()) {
    earnedAmount = parsed.value;
    cashReceived = parsed.value;
  } else {
    const cash = parseMoney(cashField.value, { allowZero: true });
    if (!cash.ok) {
      return {
        error: "Cash received must be 0 or more, with at most 2 decimal places.",
        invalid: [cashField],
      };
    }
    if (cash.value > parsed.value) {
      return { error: "Cash received cannot be more than the sale amount.", invalid: [cashField] };
    }
    earnedAmount = parsed.value;
    cashReceived = cash.value;
  }

  const sale = {
    amount: kind === "advance" ? cashReceived : earnedAmount,
    date,
    note,
    customer,
    kind,
    earnedAmount,
    cashReceived,
  };
  const accountSelect = source.elements.account || source.querySelector("[name=account]");
  if (accountSelect && accountSelect.value) sale.accountId = accountSelect.value;
  return { sale };
}

function buildSaleEdit(sale) {
  const editForm = document.createElement("form");
  editForm.className = "edit-form";
  editForm.noValidate = true;
  editForm.dataset.saleId = sale.id;

  const title = document.createElement("p");
  title.className = "edit-title";
  title.textContent = "Edit sale";
  const amount = input("amount", "number", sale.amount.toFixed(2));
  amount.min = "0.01";
  amount.step = "0.01";
  amount.inputMode = "decimal";
  const date = input("date", "date", sale.date);
  const note = input("note", "text", sale.note);
  note.maxLength = 120;
  const customer = input("customer", "text", sale.customer);
  customer.maxLength = 120;
  customer.required = false;
  const kind = document.createElement("select");
  kind.name = "kind";
  kind.id = `edit-sale-kind-${sale.id}`;
  ["earned", "advance"].forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value === "advance" ? "Customer advance" : "Earned sale";
    option.selected = sale.kind === value;
    kind.append(option);
  });
  const cash = input("cash", "number", sale.kind === "advance" ? "" : sale.cashReceived.toFixed(2));
  cash.min = "0";
  cash.step = "0.01";
  cash.inputMode = "decimal";
  cash.required = false;
  const cashWrap = editField("Cash received now", cash);
  cashWrap.hidden = sale.kind === "advance";
  const error = document.createElement("p");
  error.className = "form-error";
  error.setAttribute("role", "alert");
  error.hidden = true;
  const actions = document.createElement("div");
  actions.className = "edit-actions";
  const save = document.createElement("button");
  save.type = "submit";
  save.className = "primary";
  save.textContent = "Save";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "edit-cancel";
  cancel.dataset.cancelSale = "";
  cancel.textContent = "Cancel";
  actions.append(save, cancel);
  editForm.append(
    title,
    editField("Amount", amount),
    editField("Date", date),
    editField("Note", note),
    editField("Customer name (optional)", customer),
    editField("Type", kind),
    editField("Account", accountField(sale.accountId || "")),
    cashWrap,
    error,
    actions
  );
  return editForm;
}

function syncEditCash(editForm) {
  if (!editForm) return;
  const cashWrap = editForm.elements.cash?.closest(".field");
  if (cashWrap) cashWrap.hidden = editForm.elements.kind.value === "advance";
}

function input(name, type, value) {
  const field = document.createElement("input");
  field.name = name;
  field.id = `edit-sale-${name}-${crypto.randomUUID()}`;
  field.type = type;
  field.required = type !== "text";
  field.value = value;
  return field;
}

function editField(labelText, control) {
  const field = document.createElement("div");
  field.className = "field";
  const label = document.createElement("label");
  label.htmlFor = control.id;
  label.textContent = labelText;
  field.append(label, control);
  return field;
}

function statusText(sale) {
  const status = saleStatus(sale);
  if (status.code === "advance") return "Customer advance · not profit";
  if (status.code === "paid") return "Paid in full";
  if (status.code === "unpaid") return `Unpaid · ${formatMoney(status.due)} outstanding`;
  return `Part paid · ${formatMoney(receivableOf(sale))} outstanding`;
}

function syncSaleKind() {
  const advance = saleKindInput.value === "advance";
  saleCashField.hidden = advance;
  saleHelp.textContent = advance
    ? "This cash is a customer advance. It raises cash received and is not profit."
    : "Leave cash blank when the customer paid in full. Enter 0 when nothing has been paid. The unpaid part stays a receivable and the full sale still counts as earned revenue.";
}

function clearSaleInvalid() {
  [saleAmountInput, saleDateInput, saleNoteInput, saleCashInput].forEach((field) => {
    field.classList.remove("invalid");
  });
  saleErrorEl.hidden = true;
}
