import { update, get } from "./storage.js";
import { today, formatDate } from "./dates.js";
import { roundMoney } from "./money.js";
import { orderTotal } from "./order-book.js";

export const COURIER_STATUSES = ["Not shipped", "Shipped", "Delivered", "Returned"];

export function courierOf(order) {
  const saved = order && order.courier && typeof order.courier === "object" ? order.courier : {};
  return {
    company: String(saved.company || ""),
    tracking: String(saved.tracking || ""),
    cod: Number(saved.cod) > 0 ? Number(saved.cod) : 0,
    status: COURIER_STATUSES.includes(saved.status) ? saved.status : "Not shipped",
  };
}

export function isOpenDelivery(order) {
  if (!order || order.status === "Cancelled" || order.status === "Fulfilled") return false;
  const status = courierOf(order).status;
  return status !== "Delivered" && status !== "Returned";
}

export function setCourier(orderId, input) {
  const order = get("orders", orderId);
  if (!order) return { ok: false, error: "That order is no longer here." };
  const status = String(input.status || "");
  if (!COURIER_STATUSES.includes(status)) return { ok: false, error: "Choose a delivery status." };
  const company = String(input.company || "").trim().slice(0, 60);
  const tracking = String(input.tracking || "").trim().slice(0, 60);
  const rawCod = String(input.cod ?? "").trim();
  const cod = rawCod === "" ? 0 : roundMoney(Number(rawCod));
  if (!(cod >= 0)) return { ok: false, error: "Cash on delivery must be 0 or more." };
  if (cod - orderTotal(order) > 0.001) return { ok: false, error: "Cash on delivery cannot be more than the order total." };
  if ((status === "Shipped" || status === "Delivered") && !company) {
    return { ok: false, error: "Enter the courier name before marking it shipped." };
  }
  update("orders", orderId, { courier: { company, tracking, cod, status } });
  return { ok: true };
}

export function deliveryProblems(todayValue = today()) {
  return get("orders")
    .filter((order) => {
      if (!isOpenDelivery(order)) return false;
      const due = typeof order.deliveryDate === "string" ? order.deliveryDate.slice(0, 10) : "";
      return courierOf(order).status === "Shipped" && /^\d{4}-\d{2}-\d{2}$/.test(due) && due < todayValue;
    })
    .map((order) => ({
      id: `delivery:${order.id}`,
      title: "Delivery is late",
      message: `${order.customerName || "An order"} · #${order.orderNumber} was due ${formatDate(order.deliveryDate)} and is still on its way.`,
      severity: "danger",
      screen: "deliveries",
      params: { id: order.id },
    }));
}
