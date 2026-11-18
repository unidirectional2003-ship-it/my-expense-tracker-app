import { formatMoney } from "./money.js";
import { today, formatDate } from "./dates.js";
import { get } from "./storage.js";
import { ensureScreen, registerScreen } from "./router.js";
import { attachReceipt, pinReceipt } from "./receipt-hook.js";
import { viewReceiptButton } from "./receipt.js";
import {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  PAYMENT_METHODS,
  orderTotal,
  amountPaid,
  balanceOf,
  addCity,
  createOrder,
  addPayment,
  setOrderStatus,
  filterOrders,
} from "./order-book.js";

export { attachReceipt };

const paymentErrors = new Map();

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
  if (extra.inputMode) control.inputMode = extra.inputMode;
  if (extra.min != null) control.min = extra.min;
  if (extra.step) control.step = extra.step;
  if (extra.required) control.required = true;
  return control;
}

function select(id, options, blank) {
  const control = document.createElement("select");
  control.id = id;
  control.name = id;
  if (blank) control.append(new Option(blank, ""));
  options.forEach((option) => {
    const value = typeof option === "string" ? option : option.value;
    const label = typeof option === "string" ? option : option.label;
    control.append(new Option(label, value));
  });
  return control;
}

function cities() {
  return get("cities").slice().sort((a, b) => a.name.localeCompare(b.name));
}

function fillCitySelect(control, includeNew, selected) {
  const current = selected == null ? control.value : selected;
  const options = [new Option(includeNew ? "Select a city" : "All cities", "")];
  cities().forEach((city) => options.push(new Option(city.name, city.id)));
  if (includeNew) options.push(new Option("Add new city", "__new__"));
  control.replaceChildren(...options);
  if ([...control.options].some((option) => option.value === current)) control.value = current;
}

function itemRow() {
  const row = document.createElement("div");
  row.className = "item-row";
  const name = input("", "text", { placeholder: "Item name", maxLength: 80 });
  name.name = "item-name";
  name.setAttribute("aria-label", "Item name");
  const qty = input("", "number", { placeholder: "Qty", min: "0.01", step: "0.01", inputMode: "decimal" });
  qty.name = "item-qty";
  qty.setAttribute("aria-label", "Quantity");
  const price = input("", "number", { placeholder: "Price", min: "0.01", step: "0.01", inputMode: "decimal" });
  price.name = "item-price";
  price.setAttribute("aria-label", "Price");
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "edit-cancel";
  remove.dataset.removeItem = "true";
  remove.textContent = "Remove";
  row.append(name, qty, price, remove);
  return row;
}

function readItems(form) {
  const rows = [...form.querySelectorAll(".item-row")];
  return rows.map((row) => ({
    name: row.querySelector("[name=item-name]").value,
    qty: row.querySelector("[name=item-qty]").value,
    price: row.querySelector("[name=item-price]").value,
  }));
}

function orderCard(order) {
  const card = document.createElement("article");
  card.className = "order-card";
  card.dataset.orderId = order.id;

  const title = document.createElement("div");
  title.className = "expense-top";
  const name = document.createElement("h3");
  name.className = "category";
  name.textContent = `${order.customerName} · #${order.orderNumber}`;
  const total = document.createElement("p");
  total.className = "amount";
  total.textContent = formatMoney(orderTotal(order));
  title.append(name, total);

  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = `${order.phone} · ${order.cityName}${order.address ? ` · ${order.address}` : ""}`;

  const dates = document.createElement("p");
  dates.className = "meta";
  dates.textContent = `Ordered ${formatDate(order.orderDate)} · Delivery ${formatDate(order.deliveryDate)}`;

  const items = document.createElement("ul");
  items.className = "order-items";
  order.items.forEach((item) => {
    const line = document.createElement("li");
    line.textContent = `${item.name} · ${item.qty} × ${formatMoney(item.price)}`;
    items.append(line);
  });

  const money = document.createElement("p");
  money.className = "order-balance";
  const paid = amountPaid(order);
  money.textContent = `Advance ${formatMoney(paid)} of ${formatMoney(orderTotal(order))}, remaining ${formatMoney(balanceOf(order))}`;

  if (order.notes) {
    const notes = document.createElement("p");
    notes.className = "meta";
    notes.textContent = order.notes;
    card.append(title, meta, dates, items, money, notes);
  } else {
    card.append(title, meta, dates, items, money);
  }

  const statusField = field("Order status", select(`order-status-${order.id}`, ORDER_STATUSES));
  const statusSelect = statusField.querySelector("select");
  statusSelect.dataset.orderStatus = order.id;
  statusSelect.value = order.status;

  const payLabel = document.createElement("p");
  payLabel.className = "summary-label";
  payLabel.textContent = order.paymentStatus;

  const payments = document.createElement("ul");
  payments.className = "order-items";
  if (!order.payments.length) {
    const empty = document.createElement("li");
    empty.textContent = "No payments yet.";
    payments.append(empty);
  } else {
    order.payments.forEach((payment) => {
      const line = document.createElement("li");
      line.textContent = `${formatDate(payment.date)} · ${formatMoney(payment.amount)} · ${payment.method}`;
      if (payment.verified === true) {
        const badge = document.createElement("span");
        badge.className = "verified-badge";
        badge.textContent = "Verified";
        line.append(document.createTextNode(" "), badge);
      } else if (payment.verified === false) {
        const note = document.createElement("span");
        note.className = "meta";
        note.textContent = " Not verified";
        line.append(note);
      }
      const view = viewReceiptButton({ id: payment.id, receiptId: payment.receiptId });
      if (view) line.append(document.createTextNode(" "), view);
      payments.append(line);
    });
  }

  const payForm = document.createElement("form");
  payForm.className = "payment-form";
  payForm.dataset.paymentForm = order.id;
  payForm.noValidate = true;
  const amount = input(`pay-amount-${order.id}`, "number", {
    placeholder: "0.00",
    min: "0.01",
    step: "0.01",
    inputMode: "decimal",
  });
  amount.name = "amount";
  const date = input(`pay-date-${order.id}`, "date");
  date.name = "date";
  date.value = today();
  const method = select(`pay-method-${order.id}`, PAYMENT_METHODS);
  method.name = "method";
  const error = document.createElement("p");
  error.className = "form-error";
  error.setAttribute("role", "alert");
  const message = paymentErrors.get(order.id) || "";
  error.hidden = !message;
  error.textContent = message;
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "primary";
  submit.textContent = "Add payment";
  payForm.append(
    field("Payment amount", amount),
    field("Payment date", date),
    field("Method", method),
    error,
    submit
  );

  card.append(statusField, payLabel, payments);
  if (balanceOf(order) > 0) card.append(payForm);
  return card;
}

function renderOrderList() {
  const list = document.getElementById("order-list");
  const empty = document.getElementById("order-empty");
  if (!list || !empty) return;
  const filters = {
    query: document.getElementById("order-search").value,
    status: document.getElementById("order-filter-status").value,
    paymentStatus: document.getElementById("order-filter-payment").value,
    cityId: document.getElementById("order-filter-city").value,
    from: document.getElementById("order-filter-from").value,
    to: document.getElementById("order-filter-to").value,
  };
  const rows = filterOrders(get("orders"), filters).sort((a, b) => b.orderNumber - a.orderNumber);
  list.replaceChildren(...rows.map(orderCard));
  const addOrder = document.getElementById("order-add-jump");
  const noneYet = get("orders").length === 0;
  empty.hidden = rows.length > 0;
  if (addOrder) addOrder.hidden = !noneYet;
  empty.textContent = noneYet ? "No orders yet." : "No orders match these filters.";
}

function resetItems(form) {
  const box = form.querySelector("#order-items");
  box.replaceChildren(itemRow());
}

export function registerOrders() {
  const screen = ensureScreen("orders");
  const intro = document.createElement("header");
  intro.className = "intro";
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Orders";
  const heading = document.createElement("h1");
  heading.textContent = "Customer orders";
  intro.append(eyebrow, heading);

  const sheet = document.createElement("div");
  sheet.className = "sheet";

  const formCard = document.createElement("section");
  formCard.className = "card";
  const formTitle = document.createElement("h2");
  formTitle.textContent = "New order";
  const form = document.createElement("form");
  form.id = "order-form";
  form.noValidate = true;

  const customer = input("order-customer", "text", { maxLength: 80, placeholder: "Customer name", required: true });
  const phone = input("order-phone", "tel", { maxLength: 20, placeholder: "03xx", required: true });
  const city = select("order-city", [], "Select a city");
  const newCityWrap = document.createElement("div");
  newCityWrap.className = "new-city";
  newCityWrap.hidden = true;
  const newCity = input("order-new-city", "text", { maxLength: 40, placeholder: "City name" });
  const saveCity = document.createElement("button");
  saveCity.type = "button";
  saveCity.className = "edit";
  saveCity.id = "order-save-city";
  saveCity.textContent = "Save city";
  newCityWrap.append(field("New city", newCity), saveCity);
  const address = input("order-address", "text", { maxLength: 160, placeholder: "Optional" });
  const orderDate = input("order-date", "date", { required: true });
  const deliveryDate = input("order-delivery", "date", { required: true });
  const notes = input("order-notes", "text", { maxLength: 240, placeholder: "Optional" });
  const items = document.createElement("div");
  items.id = "order-items";
  items.className = "item-editor";
  items.append(itemRow());
  const addItem = document.createElement("button");
  addItem.type = "button";
  addItem.className = "edit";
  addItem.id = "order-add-item";
  addItem.textContent = "Add item";
  const advance = input("order-advance", "number", {
    placeholder: "Leave blank if nothing paid yet",
    min: "0",
    step: "0.01",
    inputMode: "decimal",
  });
  const advanceMethod = select("order-advance-method", PAYMENT_METHODS);
  const error = document.createElement("p");
  error.className = "form-error";
  error.id = "order-error";
  error.setAttribute("role", "alert");
  error.hidden = true;
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "primary";
  submit.textContent = "Save order";

  form.append(
    field("Customer name", customer),
    field("Phone", phone),
    field("City", city),
    newCityWrap,
    field("Address (optional)", address),
    field("Items", items),
    addItem,
    field("Order date", orderDate),
    field("Delivery date", deliveryDate),
    field("Notes", notes),
    field("Advance amount", advance),
    field("Advance method", advanceMethod),
    error,
    submit
  );
  formCard.append(formTitle, form);

  const listCard = document.createElement("section");
  listCard.className = "card";
  const listTitle = document.createElement("h2");
  listTitle.textContent = "Orders";
  const filters = document.createElement("div");
  filters.className = "filters order-filters";
  const search = input("order-search", "search", { placeholder: "Name, phone, or order number" });
  const statusFilter = select("order-filter-status", ORDER_STATUSES, "All statuses");
  const paymentFilter = select("order-filter-payment", PAYMENT_STATUSES, "All payments");
  const cityFilter = select("order-filter-city", [], "All cities");
  const from = input("order-filter-from", "date");
  const to = input("order-filter-to", "date");
  filters.append(
    field("Search", search),
    field("Status", statusFilter),
    field("Payment", paymentFilter),
    field("City", cityFilter),
    field("From", from),
    field("To", to)
  );
  const list = document.createElement("div");
  list.id = "order-list";
  list.className = "order-list";
  const empty = document.createElement("p");
  empty.id = "order-empty";
  empty.className = "empty";
  empty.textContent = "No orders yet.";
  const addOrder = document.createElement("button");
  addOrder.type = "button";
  addOrder.className = "primary";
  addOrder.id = "order-add-jump";
  addOrder.textContent = "Add order";
  addOrder.addEventListener("click", () => {
    const form = document.getElementById("order-form");
    document.getElementById("order-customer")?.focus();
    if (form) form.scrollIntoView({ block: "start" });
  });
  listCard.append(listTitle, filters, list, empty, addOrder);
  sheet.append(formCard, listCard);
  screen.append(intro, sheet);

  function showError(message) {
    error.textContent = message;
    error.hidden = !message;
  }

  city.addEventListener("change", () => {
    newCityWrap.hidden = city.value !== "__new__";
    if (!newCityWrap.hidden) newCity.focus();
  });

  saveCity.addEventListener("click", () => {
    const result = addCity(newCity.value);
    if (!result.ok) {
      showError(result.error);
      newCity.focus();
      return;
    }
    showError("");
    newCity.value = "";
    newCityWrap.hidden = true;
    fillCitySelect(city, true, result.city.id);
    fillCitySelect(cityFilter, false);
  });

  addItem.addEventListener("click", () => items.append(itemRow()));
  items.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-item]");
    if (!button) return;
    const row = button.closest(".item-row");
    if (items.children.length === 1) {
      row.querySelectorAll("input").forEach((control) => {
        control.value = "";
      });
      return;
    }
    row.remove();
  });

  filters.addEventListener("input", renderOrderList);
  filters.addEventListener("change", renderOrderList);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (city.value === "__new__") {
      showError("Save the new city before the order, or choose one from the list.");
      return;
    }
    const result = createOrder({
      customerName: customer.value,
      phone: phone.value,
      cityId: city.value,
      address: address.value,
      items: readItems(form),
      orderDate: orderDate.value,
      deliveryDate: deliveryDate.value,
      notes: notes.value,
      advanceAmount: advance.value,
      advanceMethod: advanceMethod.value,
      advanceDate: orderDate.value,
    });
    if (!result.ok) {
      showError(result.error);
      return;
    }
    showError("");
    form.reset();
    orderDate.value = today();
    deliveryDate.value = today();
    resetItems(form);
    newCityWrap.hidden = true;
    fillCitySelect(city, true);
    fillCitySelect(cityFilter, false);
    renderOrderList();
    customer.focus();
  });

  list.addEventListener("change", (event) => {
    const status = event.target.closest("[data-order-status]");
    if (!status) return;
    setOrderStatus(status.dataset.orderStatus, status.value);
    renderOrderList();
  });

  list.addEventListener("submit", (event) => {
    const payForm = event.target.closest("[data-payment-form]");
    if (!payForm) return;
    event.preventDefault();
    const result = addPayment(payForm.dataset.paymentForm, {
      amount: payForm.elements.amount.value,
      date: payForm.elements.date.value,
      method: payForm.elements.method.value,
    });
    if (!result.ok) {
      paymentErrors.set(payForm.dataset.paymentForm, result.error);
      renderOrderList();
      return;
    }
    paymentErrors.delete(payForm.dataset.paymentForm);
    const payment = result.order.payments[result.order.payments.length - 1];
    if (payment) {
      pinReceipt(payForm.dataset.paymentForm, payment.id);
      try {
        attachReceipt("payment", payment.id);
      } catch {
        paymentErrors.set(payForm.dataset.paymentForm, "The payment was saved, but the photo could not be stored on this device.");
      }
    }
    renderOrderList();
  });

  registerScreen("orders", {
    show(params = {}) {
      orderDate.value = orderDate.value || today();
      deliveryDate.value = deliveryDate.value || today();
      fillCitySelect(city, true);
      fillCitySelect(cityFilter, false);
      if (params.id) {
        search.value = "";
        statusFilter.value = "";
        paymentFilter.value = "";
        cityFilter.value = "";
        from.value = "";
        to.value = "";
      }
      renderOrderList();
      if (!params.id) return;
      requestAnimationFrame(() => {
        const node = document.querySelector(`[data-order-id="${CSS.escape(params.id)}"]`);
        if (node) node.scrollIntoView({ block: "nearest" });
      });
    },
  });
}
