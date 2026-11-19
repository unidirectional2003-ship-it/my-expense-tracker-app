import { formatMoney, roundMoney } from "./money.js";
import { formatDate, today } from "./dates.js";
import { get, save } from "./storage.js";
import { amountPaid, balanceOf, orderTotal } from "./order-book.js";

const PDF_URL = "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js";
const PROFILE_ID = "businessProfile";
const NUMBER_SETTING = "nextInvoiceNumber";

let pdfLibrary = null;
let modal = null;
let current = null;

function clip(value, max) {
  return String(value || "").trim().slice(0, max);
}

function optionalMoney(record, keys) {
  if (!record) return 0;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return roundMoney(value);
    if (typeof value === "string" && /^\d+(\.\d{1,2})?$/.test(value.trim())) return roundMoney(Number(value));
  }
  return 0;
}

export function takeSerial(collection, numberKey, settingId, start = 1000) {
  const highest = get(collection).reduce((max, row) => Math.max(max, Number(row[numberKey]) || 0), start);
  const setting = get("settings", settingId);
  const next = Math.max(highest + 1, Number(setting?.value) || start + 1);
  save("settings", { id: settingId, value: next + 1 });
  return next;
}

export function businessProfile() {
  const stored = get("settings", PROFILE_ID) || {};
  const logo = typeof stored.logo === "string" && stored.logo.startsWith("data:image/") ? stored.logo : "";
  return {
    shopName: clip(stored.shopName, 80),
    phone: clip(stored.phone, 40),
    address: clip(stored.address, 240),
    bank: clip(stored.bank, 240),
    easypaisa: clip(stored.easypaisa, 80),
    jazzcash: clip(stored.jazzcash, 80),
    footer: clip(stored.footer, 240),
    logo,
  };
}

export function saveBusinessProfile(input) {
  const next = {
    id: PROFILE_ID,
    shopName: clip(input.shopName, 80),
    phone: clip(input.phone, 40),
    address: clip(input.address, 240),
    bank: clip(input.bank, 240),
    easypaisa: clip(input.easypaisa, 80),
    jazzcash: clip(input.jazzcash, 80),
    footer: clip(input.footer, 240),
    logo: typeof input.logo === "string" && input.logo.startsWith("data:image/") ? input.logo : "",
  };
  save("settings", next);
  return businessProfile();
}

export function invoiceFigures(order) {
  const balance = balanceOf(order);
  return {
    delivery: optionalMoney(order, ["deliveryCharge", "deliveryFee", "deliveryAmount", "delivery"]),
    discount: optionalMoney(order, ["discount", "discountAmount"]),
    total: orderTotal(order),
    advance: amountPaid(order),
    balance,
    paid: balance <= 0,
  };
}

export function invoiceDocument(order, invoice, profile = businessProfile()) {
  const figures = invoiceFigures(order);
  return {
    title: figures.paid ? "RECEIPT" : "INVOICE",
    number: invoice.number,
    date: invoice.issuedOn,
    orderNumber: order.orderNumber,
    customer: {
      name: order.customerName || "",
      phone: order.phone || "",
      address: order.address || "",
      city: order.cityName || "",
    },
    deliveryDate: order.deliveryDate || "",
    items: (order.items || []).map((item) => ({
      name: item.name,
      qty: item.qty,
      price: item.price,
      amount: roundMoney(Number(item.qty) * Number(item.price)),
    })),
    ...figures,
    profile,
  };
}

export function issueInvoice(orderId) {
  const order = get("orders", orderId);
  if (!order) return { ok: false, error: "That order is no longer here." };
  const existing = get("invoices").find((row) => row.orderId === orderId);
  if (existing) return { ok: true, invoice: existing, order };
  const invoice = save("invoices", {
    number: takeSerial("invoices", "number", NUMBER_SETTING),
    orderId,
    issuedOn: today(),
  });
  return { ok: true, invoice, order: get("orders", orderId) };
}

function formatQty(value) {
  const rounded = roundMoney(value);
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/0$/, "");
}

function filename(model) {
  return `invoice-${model.number}.pdf`;
}

function loadPdfLibrary() {
  if (typeof window !== "undefined" && window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
  if (!pdfLibrary) {
    pdfLibrary = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = PDF_URL;
      script.async = true;
      script.onload = () => {
        if (window.jspdf?.jsPDF) resolve(window.jspdf.jsPDF);
        else reject(new Error("The PDF library did not load."));
      };
      script.onerror = () => {
        reject(new Error("The PDF library could not be loaded. Check your connection and try again."));
      };
      document.head.append(script);
    }).catch((error) => {
      pdfLibrary = null;
      throw error;
    });
  }
  return pdfLibrary;
}

function writeBlock(doc, text, x, y, width) {
  const lines = String(text || "")
    .split(/\n/)
    .flatMap((line) => doc.splitTextToSize(line || " ", width));
  lines.forEach((line) => {
    doc.text(line, x, y);
    y += 5;
  });
  return y;
}

function room(doc, y, needed) {
  const limit = doc.internal.pageSize.getHeight() - 16;
  if (y + needed <= limit) return y;
  doc.addPage();
  return 18;
}

export function buildInvoicePdf(JsPDF, model) {
  const doc = new JsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const right = pageWidth - margin;
  let y = 18;
  const profile = model.profile || {};

  if (profile.logo) {
    try {
      const format = profile.logo.includes("image/png") ? "PNG" : "JPEG";
      doc.addImage(profile.logo, format, margin, y - 4, 18, 18);
    } catch {
      // A logo that the PDF library cannot draw still leaves the rest of the invoice intact.
    }
  }

  const nameX = profile.logo ? margin + 22 : margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(40, 40, 40);
  if (profile.shopName) doc.text(profile.shopName, nameX, y + 2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  let infoY = y + (profile.shopName ? 8 : 2);
  [profile.phone, profile.address].filter(Boolean).forEach((line) => {
    infoY = writeBlock(doc, line, nameX, infoY, 90);
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(model.title, right, y + 2, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`No. ${model.number}`, right, y + 10, { align: "right" });
  doc.text(formatDate(model.date), right, y + 16, { align: "right" });
  if (model.orderNumber) doc.text(`Order #${model.orderNumber}`, right, y + 22, { align: "right" });

  y = Math.max(infoY + 6, 46);
  y = room(doc, y, 28);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Customer", margin, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const place = [model.customer.address, model.customer.city].filter(Boolean).join(", ");
  [model.customer.name, model.customer.phone, place].filter(Boolean).forEach((line) => {
    doc.text(String(line), margin, y);
    y += 5;
  });
  if (model.deliveryDate) {
    doc.text(`Delivery date ${formatDate(model.deliveryDate)}`, margin, y);
    y += 6;
  } else {
    y += 2;
  }

  y = room(doc, y, 16);
  doc.setFillColor(221, 235, 200);
  doc.rect(margin, y - 5, pageWidth - margin * 2, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Item", margin + 2, y);
  doc.text("Qty", 118, y);
  doc.text("Price", 142, y);
  doc.text("Amount", right - 2, y, { align: "right" });
  y += 8;
  doc.setFont("helvetica", "normal");

  model.items.forEach((item) => {
    const nameLines = doc.splitTextToSize(String(item.name), 88);
    y = room(doc, y, nameLines.length * 5 + 2);
    doc.text(nameLines, margin + 2, y);
    doc.text(formatQty(item.qty), 118, y);
    doc.text(formatMoney(item.price), 142, y);
    doc.text(formatMoney(item.amount), right - 2, y, { align: "right" });
    y += Math.max(6, nameLines.length * 5);
  });

  y += 2;
  const rows = [
    ["Delivery", model.delivery],
    ["Discount", model.discount],
    ["Total", model.total],
    ["Advance paid", model.advance],
    ["Balance due", model.balance],
  ];
  rows.forEach(([label, amount], index) => {
    y = room(doc, y, 7);
    doc.setFont("helvetica", index >= 2 ? "bold" : "normal");
    doc.text(label, 130, y);
    doc.text(formatMoney(amount), right - 2, y, { align: "right" });
    y += 6;
  });

  const accounts = [];
  if (profile.bank) accounts.push(`Bank: ${profile.bank}`);
  if (profile.easypaisa) accounts.push(`Easypaisa: ${profile.easypaisa}`);
  if (profile.jazzcash) accounts.push(`JazzCash: ${profile.jazzcash}`);
  if (accounts.length) {
    y = room(doc, y + 4, 12);
    doc.setFont("helvetica", "bold");
    doc.text("Pay to", margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    accounts.forEach((line) => {
      y = room(doc, y, 6);
      y = writeBlock(doc, line, margin, y, pageWidth - margin * 2);
    });
  }

  if (profile.footer) {
    y = room(doc, y + 4, 10);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    writeBlock(doc, profile.footer, margin, y, pageWidth - margin * 2);
  }

  if (model.paid) {
    doc.setTextColor(196, 40, 40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(28);
    try {
      doc.setGState(new doc.GState({ opacity: 0.9 }));
    } catch {
      // A solid stamp is enough when transparency is unavailable.
    }
    doc.text("PAID", right - 8, 58, { align: "right", angle: 18 });
    doc.setTextColor(40, 40, 40);
  }

  doc.setProperties({ title: `${model.title} ${model.number}` });
  return doc;
}

function line(label, value, strong) {
  const row = document.createElement("p");
  row.className = strong ? "invoice-line is-strong" : "invoice-line";
  const name = document.createElement("span");
  name.textContent = label;
  const amount = document.createElement("span");
  amount.textContent = value;
  row.append(name, amount);
  return row;
}

function renderPreview(model) {
  const sheet = document.createElement("div");
  sheet.className = "invoice-preview";
  const head = document.createElement("div");
  head.className = "invoice-head";
  if (model.profile.logo) {
    const logo = document.createElement("img");
    logo.className = "logo-preview";
    logo.alt = "";
    logo.src = model.profile.logo;
    head.append(logo);
  }
  const shop = document.createElement("div");
  const title = document.createElement("p");
  title.className = "invoice-title";
  title.textContent = model.profile.shopName || model.title;
  shop.append(title);
  [model.profile.phone, model.profile.address].filter(Boolean).forEach((text) => {
    const meta = document.createElement("p");
    meta.className = "meta";
    meta.textContent = text;
    shop.append(meta);
  });
  head.append(shop);
  const identity = document.createElement("p");
  identity.className = "meta";
  identity.textContent = `${model.title} No. ${model.number} · ${formatDate(model.date)}${
    model.orderNumber ? ` · Order #${model.orderNumber}` : ""
  }`;

  const customer = document.createElement("p");
  customer.className = "meta";
  const place = [model.customer.address, model.customer.city].filter(Boolean).join(", ");
  customer.textContent = ["Customer", model.customer.name, model.customer.phone, place].filter(Boolean).join(" · ");

  const delivery = document.createElement("p");
  delivery.className = "meta";
  delivery.textContent = model.deliveryDate ? `Delivery date ${formatDate(model.deliveryDate)}` : "";
  delivery.hidden = !model.deliveryDate;

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["Item", "Qty", "Price", "Amount"].forEach((label) => {
    const cell = document.createElement("th");
    cell.textContent = label;
    headRow.append(cell);
  });
  thead.append(headRow);
  const tbody = document.createElement("tbody");
  model.items.forEach((item) => {
    const row = document.createElement("tr");
    [item.name, formatQty(item.qty), formatMoney(item.price), formatMoney(item.amount)].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = String(value);
      row.append(cell);
    });
    tbody.append(row);
  });
  table.append(thead, tbody);

  const totals = document.createElement("div");
  totals.className = "invoice-lines";
  totals.append(
    line("Delivery", formatMoney(model.delivery)),
    line("Discount", formatMoney(model.discount)),
    line("Total", formatMoney(model.total), true),
    line("Advance paid", formatMoney(model.advance), true),
    line("Balance due", formatMoney(model.balance), true)
  );

  const pay = document.createElement("div");
  const accounts = [];
  if (model.profile.bank) accounts.push(`Bank: ${model.profile.bank}`);
  if (model.profile.easypaisa) accounts.push(`Easypaisa: ${model.profile.easypaisa}`);
  if (model.profile.jazzcash) accounts.push(`JazzCash: ${model.profile.jazzcash}`);
  if (accounts.length) {
    const label = document.createElement("p");
    label.className = "summary-label";
    label.textContent = "Pay to";
    pay.append(label);
    accounts.forEach((text) => {
      const row = document.createElement("p");
      row.className = "meta";
      row.textContent = text;
      pay.append(row);
    });
  }
  if (model.profile.footer) {
    const footer = document.createElement("p");
    footer.className = "meta";
    footer.textContent = model.profile.footer;
    pay.append(footer);
  }

  sheet.append(head, identity, customer, delivery, table, totals, pay);
  if (model.paid) {
    const stamp = document.createElement("p");
    stamp.className = "paid-stamp";
    stamp.textContent = "PAID";
    sheet.append(stamp);
  }
  return sheet;
}

function showStatus(message, isError) {
  const error = document.getElementById("invoice-error");
  const ok = document.getElementById("invoice-ok");
  if (!error || !ok) return;
  error.hidden = !isError || !message;
  error.textContent = isError ? message : "";
  ok.hidden = isError || !message;
  ok.textContent = isError ? "" : message;
}

async function withPdf(action) {
  if (!current) return;
  showStatus("", false);
  const buttons = modal.querySelectorAll("button");
  buttons.forEach((button) => {
    button.disabled = true;
  });
  try {
    const JsPDF = await loadPdfLibrary();
    const doc = buildInvoicePdf(JsPDF, current);
    await action(doc);
  } catch (error) {
    showStatus(error && error.message ? error.message : "The PDF could not be created.", true);
  } finally {
    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
}

function downloadPdf(doc) {
  doc.save(filename(current));
  showStatus("PDF downloaded.", false);
}

async function sharePdf(doc) {
  const blob = doc.output("blob");
  const file = new File([blob], filename(current), { type: "application/pdf" });
  const payload = { files: [file], title: filename(current) };
  const canShare = typeof navigator.share === "function" && (typeof navigator.canShare !== "function" || navigator.canShare(payload));
  if (canShare) {
    try {
      await navigator.share(payload);
      showStatus("Share sheet opened.", false);
      return;
    } catch (error) {
      if (error && error.name === "AbortError") return;
    }
  }
  downloadPdf(doc);
  showStatus("WhatsApp sharing is not available in this browser, so the PDF was downloaded.", false);
}

function printPdf(doc) {
  doc.autoPrint();
  const url = doc.output("bloburl");
  const frame = document.createElement("iframe");
  frame.title = "Print invoice";
  frame.className = "invoice-print-frame";
  frame.src = url;
  document.body.append(frame);
  frame.onload = () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch {
      window.open(url, "_blank");
    }
  };
  showStatus("Print opened.", false);
}

function closeInvoice() {
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove("invoice-open");
  current = null;
}

function ensureModal() {
  if (modal) return modal;
  modal = document.createElement("div");
  modal.className = "settings-modal";
  modal.id = "invoice-modal";
  modal.hidden = true;
  const backdrop = document.createElement("button");
  backdrop.type = "button";
  backdrop.className = "settings-backdrop";
  backdrop.setAttribute("aria-label", "Close invoice");
  const dialog = document.createElement("div");
  dialog.className = "settings-dialog invoice-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "invoice-title");
  dialog.tabIndex = -1;
  const heading = document.createElement("h2");
  heading.id = "invoice-title";
  heading.textContent = "Invoice";
  const preview = document.createElement("div");
  preview.id = "invoice-preview";
  const error = document.createElement("p");
  error.className = "form-error";
  error.id = "invoice-error";
  error.setAttribute("role", "alert");
  error.hidden = true;
  const ok = document.createElement("p");
  ok.className = "meta";
  ok.id = "invoice-ok";
  ok.setAttribute("role", "status");
  ok.hidden = true;
  const actions = document.createElement("div");
  actions.className = "invoice-actions";
  const download = document.createElement("button");
  download.type = "button";
  download.className = "primary";
  download.id = "invoice-download";
  download.textContent = "Download";
  const share = document.createElement("button");
  share.type = "button";
  share.className = "edit";
  share.id = "invoice-share";
  share.textContent = "Share on WhatsApp";
  const print = document.createElement("button");
  print.type = "button";
  print.className = "edit";
  print.id = "invoice-print";
  print.textContent = "Print";
  actions.append(download, share, print);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "edit-cancel";
  close.textContent = "Close";
  dialog.append(heading, preview, error, ok, actions, close);
  modal.append(backdrop, dialog);
  document.querySelector(".app").append(modal);

  backdrop.addEventListener("click", closeInvoice);
  close.addEventListener("click", closeInvoice);
  download.addEventListener("click", () => withPdf(downloadPdf));
  share.addEventListener("click", () => withPdf(sharePdf));
  print.addEventListener("click", () => withPdf(printPdf));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal && !modal.hidden) closeInvoice();
  });
  return modal;
}

export function openInvoice(orderId) {
  const result = issueInvoice(orderId);
  ensureModal();
  const preview = document.getElementById("invoice-preview");
  const heading = document.getElementById("invoice-title");
  showStatus("", false);
  if (!result.ok) {
    current = null;
    heading.textContent = "Invoice";
    preview.replaceChildren();
    modal.hidden = false;
    document.body.classList.add("invoice-open");
    showStatus(result.error, true);
    return;
  }
  current = invoiceDocument(result.order, result.invoice);
  heading.textContent = `${current.title === "RECEIPT" ? "Receipt" : "Invoice"} ${current.number}`;
  preview.replaceChildren(renderPreview(current));
  modal.hidden = false;
  document.body.classList.add("invoice-open");
  document.getElementById("invoice-download").focus();
}

function profileError(message) {
  const error = document.getElementById("profile-error");
  const ok = document.getElementById("profile-ok");
  if (error) {
    error.hidden = !message;
    error.textContent = message || "";
  }
  if (ok && message) ok.hidden = true;
}

function fillProfileForm() {
  const form = document.getElementById("business-profile-form");
  if (!form) return;
  const profile = businessProfile();
  form.elements.shopName.value = profile.shopName;
  form.elements.phone.value = profile.phone;
  form.elements.address.value = profile.address;
  form.elements.bank.value = profile.bank;
  form.elements.easypaisa.value = profile.easypaisa;
  form.elements.jazzcash.value = profile.jazzcash;
  form.elements.footer.value = profile.footer;
  form.dataset.logo = profile.logo;
  const preview = document.getElementById("profile-logo-preview");
  const clear = document.getElementById("profile-logo-clear");
  if (preview) {
    preview.hidden = !profile.logo;
    preview.src = profile.logo || "";
  }
  if (clear) clear.hidden = !profile.logo;
  profileError("");
}

function readLogo(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const max = 320;
      const scale = Math.min(1, max / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      let quality = 0.72;
      let dataUrl = canvas.toDataURL("image/jpeg", quality);
      while (dataUrl.length > 120000 && quality > 0.4) {
        quality -= 0.12;
        dataUrl = canvas.toDataURL("image/jpeg", quality);
      }
      if (dataUrl.length > 180000) {
        reject(new Error("That logo is too large. Try a smaller image."));
        return;
      }
      resolve(dataUrl);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That image could not be read."));
    };
    image.src = url;
  });
}

export function bindInvoices() {
  const form = document.getElementById("business-profile-form");
  document.getElementById("open-settings")?.addEventListener("click", fillProfileForm);
  if (!form) return;
  const preview = document.getElementById("profile-logo-preview");
  const clear = document.getElementById("profile-logo-clear");
  const file = document.getElementById("profile-logo");
  file.addEventListener("change", async () => {
    const chosen = file.files && file.files[0];
    file.value = "";
    if (!chosen) return;
    profileError("");
    try {
      const logo = await readLogo(chosen);
      form.dataset.logo = logo;
      preview.src = logo;
      preview.hidden = false;
      clear.hidden = false;
    } catch (error) {
      profileError(error.message || "That image could not be read.");
    }
  });
  clear.addEventListener("click", () => {
    form.dataset.logo = "";
    preview.hidden = true;
    preview.removeAttribute("src");
    clear.hidden = true;
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveBusinessProfile({
      shopName: form.elements.shopName.value,
      phone: form.elements.phone.value,
      address: form.elements.address.value,
      bank: form.elements.bank.value,
      easypaisa: form.elements.easypaisa.value,
      jazzcash: form.elements.jazzcash.value,
      footer: form.elements.footer.value,
      logo: form.dataset.logo || "",
    });
    profileError("");
    const ok = document.getElementById("profile-ok");
    ok.hidden = false;
    ok.textContent = "Business profile saved.";
  });
}
