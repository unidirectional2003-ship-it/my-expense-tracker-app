import { formatMoney } from "./money.js";
import { formatDate } from "./dates.js";
import { get } from "./storage.js";
import { ensureScreen, registerScreen } from "./router.js";
import { balanceOf } from "./order-book.js";
import { COURIER_STATUSES, courierOf, isOpenDelivery, setCourier } from "./delivery.js";
import { refreshAlerts } from "./alerts.js";

let listEl;
let emptyEl;
let focusId = "";
const errors = new Map();

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function field(labelText, control) {
  const wrap = el("div", "field");
  const label = el("label", "", labelText);
  label.htmlFor = control.id;
  wrap.append(label, control);
  return wrap;
}

function inputFor(orderId, name, type, value, extra = {}) {
  const control = document.createElement("input");
  control.id = `delivery-${name}-${orderId}`;
  control.name = name;
  control.type = type;
  control.value = value;
  if (extra.placeholder) control.placeholder = extra.placeholder;
  if (extra.step) control.step = extra.step;
  if (extra.min != null) control.min = extra.min;
  if (extra.inputMode) control.inputMode = extra.inputMode;
  return control;
}

function orderCard(order) {
  const courier = courierOf(order);
  const card = el("article", "card");
  card.dataset.orderId = order.id;
  card.append(el("h3", "", `#${order.orderNumber} · ${order.customerName || "Order"}`));
  card.append(
    el("p", "meta", `${order.cityName || ""} · Due ${formatDate(order.deliveryDate)} · Balance ${formatMoney(balanceOf(order))}`),
  );
  const form = document.createElement("form");
  form.noValidate = true;
  form.dataset.courierForm = order.id;

  const status = document.createElement("select");
  status.id = `delivery-status-${order.id}`;
  status.name = "status";
  COURIER_STATUSES.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    status.append(option);
  });
  status.value = courier.status;

  form.append(
    field("Status", status),
    field("Courier", inputFor(order.id, "company", "text", courier.company, { placeholder: "TCS, Leopards, M&P…" })),
    field("Tracking number", inputFor(order.id, "tracking", "text", courier.tracking)),
    field(
      "Cash to collect on delivery (Rs)",
      inputFor(order.id, "cod", "number", courier.cod ? String(courier.cod) : "", { step: "0.01", min: 0, inputMode: "decimal" }),
    ),
  );
  const error = el("p", "form-error", errors.get(order.id) || "");
  error.setAttribute("role", "alert");
  error.hidden = !errors.has(order.id);
  const save = el("button", "primary", "Save delivery");
  save.type = "submit";
  form.append(error, save);
  card.append(form);
  return card;
}

export function renderDeliveries() {
  if (!listEl) return;
  const rows = get("orders")
    .filter(isOpenDelivery)
    .sort((a, b) => String(a.deliveryDate || "").localeCompare(String(b.deliveryDate || "")));
  listEl.replaceChildren(...rows.map(orderCard));
  emptyEl.hidden = rows.length > 0;
  if (focusId) {
    const card = listEl.querySelector(`[data-order-id="${focusId}"]`);
    if (card) card.scrollIntoView({ block: "start" });
    focusId = "";
  }
}

export function registerDeliveries() {
  const screen = ensureScreen("deliveries");
  const intro = el("header", "intro");
  intro.append(el("p", "eyebrow", "Deliveries"), el("h1", "", "Courier and cash on delivery"));
  const sheet = el("div", "sheet");
  listEl = el("div", "");
  listEl.id = "delivery-list";
  emptyEl = el("p", "empty", "Nothing waiting to be delivered. Open orders appear here.");
  emptyEl.id = "delivery-empty";
  sheet.append(listEl, emptyEl);
  screen.append(intro, sheet);

  listEl.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-courier-form]");
    if (!form) return;
    event.preventDefault();
    const orderId = form.dataset.courierForm;
    const data = new FormData(form);
    const result = setCourier(orderId, {
      status: data.get("status"),
      company: data.get("company"),
      tracking: data.get("tracking"),
      cod: data.get("cod"),
    });
    if (result.ok) errors.delete(orderId);
    else errors.set(orderId, result.error);
    renderDeliveries();
    if (result.ok) refreshAlerts();
  });

  registerScreen("deliveries", {
    show(params) {
      focusId = params && params.id ? String(params.id) : "";
      renderDeliveries();
    },
  });
}
