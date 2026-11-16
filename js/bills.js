import { parseMoney, formatMoney } from "./money.js";
import { today, formatDate } from "./dates.js";
import { state, saveBills } from "./store.js";
import { isDuplicateBill, upcomingBills } from "./calc.js";
import { render } from "./render.js";

const form = document.getElementById("bill-form");
const nameInput = document.getElementById("bill-name");
const amountInput = document.getElementById("bill-amount");
const dueInput = document.getElementById("bill-due");
const spaceInput = document.getElementById("bill-space");
const errorEl = document.getElementById("bill-error");
const listEl = document.getElementById("bill-list");
const emptyEl = document.getElementById("bill-empty");

export function bindBills() {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    clearInvalid();
    const parsed = parseMoney(amountInput.value);
    const name = nameInput.value.trim();
    const dueDate = dueInput.value;
    const space = spaceInput.value === "business" ? "business" : "home";
    const invalid = [];
    if (!name) invalid.push(nameInput);
    if (!parsed.ok) invalid.push(amountInput);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) invalid.push(dueInput);
    if (invalid.length) {
      invalid.forEach((field) => field.classList.add("invalid"));
      errorEl.textContent = "Enter a name, a due date, and an amount greater than 0 with at most 2 decimal places.";
      errorEl.hidden = false;
      invalid[0].focus();
      return;
    }
    const bill = { name, amount: parsed.value, dueDate, space, paid: false };
    if (isDuplicateBill(state.bills, bill)) {
      errorEl.textContent = "This bill is already saved.";
      errorEl.hidden = false;
      nameInput.focus();
      return;
    }
    state.bills.unshift({ id: crypto.randomUUID(), ...bill });
    saveBills();
    render();
    form.reset();
    dueInput.value = today();
    spaceInput.value = "home";
    nameInput.focus();
  });

  listEl.addEventListener("click", (event) => {
    const paidButton = event.target.closest("[data-bill-paid]");
    const deleteButton = event.target.closest("[data-bill-id]");
    if (paidButton) {
      const bill = state.bills.find((item) => item.id === paidButton.dataset.billPaid);
      if (!bill) return;
      bill.paid = !bill.paid;
      saveBills();
      render();
      return;
    }
    if (!deleteButton) return;
    state.bills = state.bills.filter((bill) => bill.id !== deleteButton.dataset.billId);
    saveBills();
    render();
  });
}

export function prepareBills() {
  dueInput.value = today();
}

export function renderBills(month) {
  const todayValue = today();
  const rows = state.bills
    .filter((bill) => bill.dueDate.slice(0, 7) === month)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name));
  const upcoming = upcomingBills(state.bills, month, todayValue);

  listEl.replaceChildren(
    ...rows.map((bill) => {
      const item = document.createElement("li");
      item.className = bill.space === "business" ? "expense is-business" : "expense";
      const main = document.createElement("div");
      main.className = "expense-main";
      const top = document.createElement("div");
      top.className = "expense-top";
      const title = document.createElement("span");
      title.className = "category";
      const tag = document.createElement("span");
      tag.className = `space-tag space-tag-${bill.space}`;
      tag.textContent = bill.space === "home" ? "Home" : "Business";
      const name = document.createElement("span");
      name.textContent = bill.name;
      title.append(tag, name);
      const amount = document.createElement("span");
      amount.className = "amount";
      amount.textContent = formatMoney(bill.amount);
      const meta = document.createElement("p");
      meta.className = "meta";
      meta.textContent = `${formatDate(bill.dueDate)} · ${billState(bill, todayValue)}`;
      top.append(title, amount);
      main.append(top, meta);

      const actions = document.createElement("div");
      actions.className = "expense-actions";
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "edit";
      toggle.dataset.billPaid = bill.id;
      toggle.textContent = bill.paid ? "Mark unpaid" : "Mark paid";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "delete";
      remove.dataset.billId = bill.id;
      remove.textContent = "Delete";
      remove.setAttribute("aria-label", `Delete bill ${bill.name}`);
      actions.append(toggle, remove);
      item.append(main, actions);
      return item;
    })
  );

  emptyEl.textContent = upcoming.length
    ? ""
    : "No upcoming bills for this month. Add one above, or switch months.";
}

function billState(bill, todayValue) {
  if (bill.paid) return "Paid";
  if (bill.dueDate < todayValue) return "Overdue";
  if (bill.dueDate === todayValue) return "Due today";
  return "Upcoming";
}

function clearInvalid() {
  [nameInput, amountInput, dueInput].forEach((field) => field.classList.remove("invalid"));
  errorEl.hidden = true;
}
