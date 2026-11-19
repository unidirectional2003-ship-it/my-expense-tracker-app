import { formatMoney } from "./money.js";
import { today, formatDate } from "./dates.js";
import { get } from "./storage.js";
import { ensureScreen, registerScreen, goTo } from "./router.js";
import { refreshAlerts } from "./alerts.js";
import { customerOrderSummary, fillWhatsAppTemplate, readWhatsAppTemplates, whatsAppUrl } from "./customer-book.js";
import {
  addRepayment,
  createUdhaar,
  customerOptions,
  deleteUdhaar,
  linkedOrderBalances,
  listUdhaar,
  phoneForName,
  remainingOf,
  removeRepayment,
  statusOf,
  udhaarTotals,
} from "./udhaar-book.js";

let direction = "receivable";
let focusId = "";
const repaymentErrors = new Map();
const phoneErrors = new Map();

function field(labelText, control) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const label = document.createElement("label");
  label.htmlFor = control.id;
  label.textContent = labelText;
  wrap.append(label, control);
  return wrap;
}

function input(id, type, extra = {}) {
  const control = document.createElement("input");
  control.id = id;
  control.name = extra.name || id;
  control.type = type;
  if (extra.placeholder) control.placeholder = extra.placeholder;
  if (extra.maxLength) control.maxLength = extra.maxLength;
  if (extra.min != null) control.min = extra.min;
  if (extra.step) control.step = extra.step;
  if (extra.inputMode) control.inputMode = extra.inputMode;
  if (extra.required) control.required = true;
  return control;
}

function reminderHref(row) {
  const named =
    (row.customerId && get("customers", row.customerId)) ||
    get("customers").find((customer) => String(customer.name || "").trim().toLowerCase() === row.person.trim().toLowerCase());
  const summary = named ? customerOrderSummary(named.id) : null;
  const message = fillWhatsAppTemplate(readWhatsAppTemplates().paymentReminder, {
    name: named?.name || row.person,
    balance: formatMoney(row.balance),
    orders: summary ? summary.count : row.orderNumber ? 1 : 0,
    phone: named?.phone || row.phone || "",
  });
  return whatsAppUrl(named?.whatsapp || named?.phone || row.phone, message);
}

function sortRows(rows) {
  const rank = { Open: 0, "Partly Paid": 1, Settled: 2 };
  return rows.slice().sort((a, b) => {
    const statusGap = (rank[a.status] ?? 0) - (rank[b.status] ?? 0);
    if (statusGap) return statusGap;
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    const dueGap = String(a.dueDate || "9999-99-99").localeCompare(String(b.dueDate || "9999-99-99"));
    if (dueGap) return dueGap;
    return a.person.localeCompare(b.person);
  });
}

function rowsFor(tab) {
  const manual = listUdhaar()
    .filter((entry) => entry.direction === tab)
    .map((entry) => {
      const balance = remainingOf(entry);
      return {
        kind: "entry",
        id: entry.id,
        person: entry.person,
        phone: entry.phone || phoneForName(entry.person),
        customerId: entry.customerId || "",
        amount: entry.amount,
        balance,
        status: statusOf(entry),
        reason: entry.reason,
        givenDate: entry.givenDate,
        dueDate: entry.dueDate,
        notes: entry.notes,
        repayments: entry.repayments,
        overdue: Boolean(entry.dueDate && entry.dueDate < today() && balance > 0),
      };
    });
  if (tab !== "receivable") return sortRows(manual);
  const linked = linkedOrderBalances().map((order) => ({
    kind: "order",
    id: order.orderId,
    orderNumber: order.orderNumber,
    person: order.person,
    phone: phoneForName(order.person) || order.phone || "",
    customerId: order.customerId || "",
    amount: order.amount,
    balance: order.balance,
    status: order.paid > 0 ? "Partly Paid" : "Open",
    reason: `Order #${order.orderNumber}`,
    givenDate: order.givenDate,
    dueDate: order.dueDate,
    notes: "Linked to the order. Paying on the order updates this balance.",
    repayments: [],
    overdue: Boolean(order.dueDate && order.dueDate < today() && order.balance > 0),
  }));
  return sortRows([...manual, ...linked]);
}

function fillCustomers(list) {
  list.replaceChildren(
    ...customerOptions().map((customer) => {
      const option = document.createElement("option");
      option.value = customer.name;
      option.label = customer.phone ? `${customer.name} · ${customer.phone}` : customer.name;
      return option;
    })
  );
}

function card(row) {
  const article = document.createElement("article");
  article.className = "order-card udhaar-card";
  if (row.kind === "order") article.classList.add("is-linked");
  if (row.overdue) article.classList.add("is-overdue");
  if (row.kind === "entry" && row.id === focusId) article.classList.add("is-target");
  if (row.kind === "entry") article.dataset.udhaarId = row.id;
  else article.dataset.orderLink = row.id;

  const title = document.createElement("div");
  title.className = "expense-top";
  const name = document.createElement("h3");
  name.className = "category";
  name.textContent = row.person;
  const status = document.createElement("p");
  status.className = "udhaar-status";
  status.textContent = row.status;
  title.append(name, status);

  const balance = document.createElement("p");
  balance.className = "order-balance";
  balance.textContent = `Remaining ${formatMoney(row.balance)} of ${formatMoney(row.amount)}`;

  const meta = document.createElement("p");
  meta.className = "meta";
  const promised = row.dueDate ? `Promised ${formatDate(row.dueDate)}` : "No promised date";
  const given = row.givenDate ? `Given ${formatDate(row.givenDate)}` : "";
  meta.textContent = [row.reason, given, promised, row.overdue ? "Overdue" : ""].filter(Boolean).join(" · ");

  article.append(title, balance, meta);

  if (row.notes) {
    const notes = document.createElement("p");
    notes.className = "meta";
    notes.textContent = row.notes;
    article.append(notes);
  }

  if (row.kind === "entry" && row.repayments.length) {
    const payments = document.createElement("ul");
    payments.className = "order-items";
    row.repayments.forEach((payment) => {
      const line = document.createElement("li");
      line.textContent = `${formatDate(payment.date)} · ${formatMoney(payment.amount)}${payment.note ? ` · ${payment.note}` : ""}`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "edit-cancel";
      remove.dataset.removeRepayment = payment.id;
      remove.dataset.udhaarId = row.id;
      remove.textContent = "Remove";
      line.append(document.createTextNode(" "), remove);
      payments.append(line);
    });
    article.append(payments);
  }

  if (row.kind === "entry" && row.balance > 0) {
    const form = document.createElement("form");
    form.className = "payment-form";
    form.dataset.repayForm = row.id;
    form.noValidate = true;
    const amount = input(`udhaar-repay-amount-${row.id}`, "number", {
      name: "amount",
      placeholder: "0.00",
      min: "0.01",
      step: "0.01",
      inputMode: "decimal",
    });
    const date = input(`udhaar-repay-date-${row.id}`, "date", { name: "date" });
    date.value = today();
    const note = input(`udhaar-repay-note-${row.id}`, "text", {
      name: "note",
      maxLength: 120,
      placeholder: "Optional",
    });
    const error = document.createElement("p");
    error.className = "form-error";
    error.setAttribute("role", "alert");
    const message = repaymentErrors.get(row.id) || "";
    error.hidden = !message;
    error.textContent = message;
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "primary";
    submit.textContent = "Add repayment";
    form.append(
      field("Repayment amount", amount),
      field("Repayment date", date),
      field("Repayment note", note),
      error,
      submit
    );
    article.append(form);
  }

  const actions = document.createElement("div");
  actions.className = "udhaar-actions";
  if (direction === "receivable" && row.balance > 0) {
    const href = reminderHref(row);
    if (href) {
      const link = document.createElement("a");
      link.className = "edit";
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "WhatsApp reminder";
      actions.append(link);
    } else {
      const missing = document.createElement("button");
      missing.type = "button";
      missing.className = "edit";
      missing.dataset.needPhone = row.kind === "entry" ? row.id : `order:${row.id}`;
      missing.textContent = "WhatsApp reminder";
      actions.append(missing);
      const phoneError = phoneErrors.get(missing.dataset.needPhone);
      if (phoneError) {
        const error = document.createElement("p");
        error.className = "form-error";
        error.setAttribute("role", "alert");
        error.textContent = phoneError;
        article.append(error);
      }
    }
  }
  if (row.kind === "order") {
    const open = document.createElement("button");
    open.type = "button";
    open.className = "edit-cancel";
    open.dataset.openOrder = row.id;
    open.textContent = "Open order";
    actions.append(open);
  } else {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete";
    remove.dataset.deleteUdhaar = row.id;
    remove.textContent = "Delete";
    actions.append(remove);
  }
  if (actions.childNodes.length) article.append(actions);
  return article;
}

function paint(errorNode) {
  const totals = udhaarTotals();
  const owed = document.getElementById("udhaar-owed");
  const owe = document.getElementById("udhaar-owe");
  if (owed) owed.textContent = formatMoney(totals.owedToMe);
  if (owe) owe.textContent = formatMoney(totals.iOwe);

  document.querySelectorAll("[data-udhaar-tab]").forEach((button) => {
    const active = button.dataset.udhaarTab === direction;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });

  const formNote = document.getElementById("udhaar-form-note");
  if (formNote) {
    formNote.textContent =
      direction === "payable"
        ? "This entry goes under I owe."
        : "This entry goes under They owe me.";
  }

  const list = document.getElementById("udhaar-list");
  const empty = document.getElementById("udhaar-empty");
  if (!list || !empty) return;
  const rows = rowsFor(direction);
  list.replaceChildren(...rows.map(card));
  empty.hidden = rows.length > 0;
  empty.textContent =
    direction === "payable" ? "You do not owe anyone right now." : "Nobody owes you right now.";
  if (errorNode) errorNode.hidden = !errorNode.textContent;
}

export function registerUdhaar() {
  const screen = ensureScreen("udhaar");
  const intro = document.createElement("header");
  intro.className = "intro";
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Udhaar";
  const heading = document.createElement("h1");
  heading.textContent = "Who owes whom";
  intro.append(eyebrow, heading);

  const sheet = document.createElement("div");
  sheet.className = "sheet";

  const totals = document.createElement("div");
  totals.className = "dash-cards";
  totals.setAttribute("aria-live", "polite");
  totals.innerHTML = `
    <article class="dash-card dash-card-income">
      <p class="summary-label">Total owed to me</p>
      <p class="meta">Udhaar plus unpaid orders</p>
      <p class="dash-figure" id="udhaar-owed">Rs 0</p>
    </article>
    <article class="dash-card dash-card-left">
      <p class="summary-label">Total I owe</p>
      <p class="meta">Udhaar still to return</p>
      <p class="dash-figure" id="udhaar-owe">Rs 0</p>
    </article>`;

  const tabs = document.createElement("div");
  tabs.className = "udhaar-tabs";
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Udhaar");
  ["receivable", "payable"].forEach((name) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "udhaar-tab";
    button.dataset.udhaarTab = name;
    button.setAttribute("role", "tab");
    button.textContent = name === "payable" ? "I owe" : "They owe me";
    button.addEventListener("click", () => {
      direction = name;
      focusId = "";
      paint();
    });
    tabs.append(button);
  });

  const formCard = document.createElement("section");
  formCard.className = "card";
  const formTitle = document.createElement("h2");
  formTitle.textContent = "New udhaar";
  const formNote = document.createElement("p");
  formNote.id = "udhaar-form-note";
  formNote.className = "meta";
  const form = document.createElement("form");
  form.id = "udhaar-form";
  form.noValidate = true;

  const person = input("udhaar-person", "text", {
    maxLength: 80,
    placeholder: "Pick a customer or type a name",
    required: true,
  });
  person.setAttribute("list", "udhaar-customers");
  person.autocomplete = "off";
  const customers = document.createElement("datalist");
  customers.id = "udhaar-customers";
  const phone = input("udhaar-phone", "tel", { maxLength: 20, placeholder: "Optional" });
  phone.autocomplete = "tel";
  const amount = input("udhaar-amount", "number", {
    min: "0.01",
    step: "0.01",
    inputMode: "decimal",
    placeholder: "0.00",
    required: true,
  });
  const reason = input("udhaar-reason", "text", { maxLength: 120, placeholder: "Why this was given", required: true });
  const given = input("udhaar-given", "date", { required: true });
  const due = input("udhaar-due", "date");
  const notes = input("udhaar-notes", "text", { maxLength: 240, placeholder: "Optional" });
  const error = document.createElement("p");
  error.className = "form-error";
  error.id = "udhaar-error";
  error.setAttribute("role", "alert");
  error.hidden = true;
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "primary";
  submit.textContent = "Save udhaar";

  person.addEventListener("input", () => {
    const match = customerOptions().find((customer) => customer.name.toLowerCase() === person.value.trim().toLowerCase());
    if (match) phone.value = match.phone || "";
  });

  form.append(
    field("Person", person),
    customers,
    field("Phone (optional)", phone),
    field("Amount", amount),
    field("Reason", reason),
    field("Date given", given),
    field("Promised return date", due),
    field("Notes", notes),
    error,
    submit
  );
  formCard.append(formTitle, formNote, form);

  const listCard = document.createElement("section");
  listCard.className = "card";
  const listTitle = document.createElement("h2");
  listTitle.id = "udhaar-list-heading";
  listTitle.textContent = "Entries";
  const list = document.createElement("div");
  list.id = "udhaar-list";
  list.className = "udhaar-list";
  list.setAttribute("aria-labelledby", "udhaar-list-heading");
  const empty = document.createElement("p");
  empty.id = "udhaar-empty";
  empty.className = "empty";
  empty.textContent = "Nobody owes you right now.";
  listCard.append(listTitle, list, empty);

  sheet.append(totals, tabs, formCard, listCard);
  screen.append(intro, sheet);

  function showError(message) {
    error.textContent = message;
    error.hidden = !message;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const result = createUdhaar({
      direction,
      person: person.value,
      phone: phone.value,
      amount: amount.value,
      reason: reason.value,
      givenDate: given.value,
      dueDate: due.value,
      notes: notes.value,
    });
    if (!result.ok) {
      showError(result.error);
      return;
    }
    showError("");
    form.reset();
    given.value = today();
    focusId = result.entry.id;
    paint();
    refreshAlerts();
    person.focus();
  });

  list.addEventListener("submit", (event) => {
    const repayForm = event.target.closest("[data-repay-form]");
    if (!repayForm) return;
    event.preventDefault();
    const id = repayForm.dataset.repayForm;
    const result = addRepayment(id, {
      amount: repayForm.elements.amount.value,
      date: repayForm.elements.date.value,
      note: repayForm.elements.note.value,
    });
    if (!result.ok) {
      repaymentErrors.set(id, result.error);
      paint();
      return;
    }
    repaymentErrors.delete(id);
    paint();
    refreshAlerts();
  });

  list.addEventListener("click", (event) => {
    const open = event.target.closest("[data-open-order]");
    if (open) {
      goTo("orders", { id: open.dataset.openOrder });
      return;
    }
    const missing = event.target.closest("[data-need-phone]");
    if (missing) {
      phoneErrors.set(
        missing.dataset.needPhone,
        "This person has no phone number yet. Add one on the entry, or pick a customer who has a number."
      );
      paint();
      return;
    }
    const removePayment = event.target.closest("[data-remove-repayment]");
    if (removePayment) {
      if (!window.confirm("Remove this repayment?")) return;
      removeRepayment(removePayment.dataset.udhaarId, removePayment.dataset.removeRepayment);
      paint();
      refreshAlerts();
      return;
    }
    const removeEntry = event.target.closest("[data-delete-udhaar]");
    if (!removeEntry) return;
    if (!window.confirm("Delete this udhaar?")) return;
    deleteUdhaar(removeEntry.dataset.deleteUdhaar);
    repaymentErrors.delete(removeEntry.dataset.deleteUdhaar);
    paint();
    refreshAlerts();
  });

  registerScreen("udhaar", {
    show(params = {}) {
      const entry = params.id ? listUdhaar().find((row) => row.id === params.id) : null;
      if (params.tab === "payable" || entry?.direction === "payable") direction = "payable";
      else if (params.tab === "receivable" || params.id) direction = "receivable";
      focusId = params.id || "";
      given.value = given.value || today();
      fillCustomers(customers);
      paint();
      refreshAlerts();
      if (!params.id) return;
      requestAnimationFrame(() => {
        const node = document.querySelector(`[data-udhaar-id="${CSS.escape(params.id)}"]`);
        if (node) node.scrollIntoView({ block: "nearest" });
      });
    },
  });
}
