import { formatDate, today } from "./dates.js";
import { get } from "./storage.js";
import { ensureScreen, registerScreen } from "./router.js";
import { WORK_STATUSES, setWorkStatus, confirmWorkDelivered } from "./order-book.js";

let confirmingId = "";

function workCard(work, order) {
  const due = order?.deliveryDate || work.dueDate;
  const overdue =
    order &&
    order.status !== "Cancelled" &&
    order.status !== "Fulfilled" &&
    work.status !== "Delivered" &&
    due &&
    due < today();

  const card = document.createElement("article");
  card.className = overdue ? "work-card is-overdue" : "work-card";
  card.dataset.workId = work.id;

  const title = document.createElement("h3");
  title.className = "category";
  title.textContent = order
    ? `${order.customerName} · #${order.orderNumber}`
    : "Order removed";

  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = order ? `${order.cityName} · ${order.status}` : "";

  const dueLine = document.createElement("p");
  dueLine.className = overdue ? "due-date" : "meta";
  dueLine.textContent = due ? `Due ${formatDate(due)}${overdue ? " · Overdue" : ""}` : "No due date";

  const choices = document.createElement("div");
  choices.className = "status-choices";
  choices.setAttribute("role", "group");
  choices.setAttribute("aria-label", `Work status for order ${order ? order.orderNumber : ""}`);
  WORK_STATUSES.forEach((status) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.workId = work.id;
    button.dataset.workStatus = status;
    button.textContent = status;
    button.className = status === work.status ? "is-active" : "";
    button.setAttribute("aria-pressed", status === work.status ? "true" : "false");
    choices.append(button);
  });

  card.append(title, meta, dueLine, choices);

  if (confirmingId === work.id) {
    const ask = document.createElement("div");
    ask.className = "confirm-row";
    const prompt = document.createElement("p");
    prompt.className = "meta";
    prompt.textContent = "Mark this order as Fulfilled?";
    const yes = document.createElement("button");
    yes.type = "button";
    yes.className = "primary";
    yes.dataset.confirmDelivered = work.id;
    yes.textContent = "Yes, mark fulfilled";
    const no = document.createElement("button");
    no.type = "button";
    no.className = "edit-cancel";
    no.dataset.cancelDelivered = work.id;
    no.textContent = "Not now";
    ask.append(prompt, yes, no);
    card.append(ask);
  }

  return card;
}

function renderWork() {
  const root = document.getElementById("work-groups");
  const empty = document.getElementById("work-empty");
  if (!root || !empty) return;
  const items = get("workItems");
  const orders = new Map(get("orders").map((order) => [order.id, order]));
  root.replaceChildren();
  WORK_STATUSES.forEach((status) => {
    const groupItems = items.filter((item) => item.status === status);
    if (!groupItems.length) return;
    const section = document.createElement("section");
    section.className = "work-group";
    const heading = document.createElement("h2");
    heading.textContent = status;
    const list = document.createElement("div");
    list.className = "order-list";
    groupItems
      .slice()
      .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
      .forEach((work) => list.append(workCard(work, orders.get(work.orderId))));
    section.append(heading, list);
    root.append(section);
  });
  empty.hidden = items.length > 0;
}

export function registerWork() {
  const screen = ensureScreen("work");
  const intro = document.createElement("header");
  intro.className = "intro";
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Work";
  const heading = document.createElement("h1");
  heading.textContent = "Work in progress";
  intro.append(eyebrow, heading);

  const sheet = document.createElement("div");
  sheet.className = "sheet";
  const groups = document.createElement("div");
  groups.id = "work-groups";
  const empty = document.createElement("p");
  empty.id = "work-empty";
  empty.className = "empty";
  empty.textContent = "No work items yet. They appear when you add an order.";
  sheet.append(groups, empty);
  screen.append(intro, sheet);

  groups.addEventListener("click", (event) => {
    const yes = event.target.closest("[data-confirm-delivered]");
    if (yes) {
      confirmWorkDelivered(yes.dataset.confirmDelivered);
      confirmingId = "";
      renderWork();
      return;
    }
    if (event.target.closest("[data-cancel-delivered]")) {
      confirmingId = "";
      renderWork();
      return;
    }
    const button = event.target.closest("[data-work-status]");
    if (!button) return;
    const result = setWorkStatus(button.dataset.workId, button.dataset.workStatus);
    confirmingId = result.needsConfirm ? button.dataset.workId : "";
    renderWork();
  });

  registerScreen("work", {
    show() {
      renderWork();
    },
  });
}
