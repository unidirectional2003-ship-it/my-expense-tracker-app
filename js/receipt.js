import { formatMoney, parseMoney, sameMoney } from "./money.js";
import { today } from "./dates.js";
import { SPACES } from "./spaces.js";
import { session } from "./session.js";
import { state, receiptPhotos, saveBills } from "./store.js";
import { deleteRecord, get, save } from "./storage.js";
import { parseGroceryReceipt, parseReceipt } from "./receipt-parse.js";
import { parseBill } from "./bill-parse.js";
import { hideBillScan, presentBillScan } from "./bill-scan.js";
import { isReceiptImage } from "./receipt-thumb.js";
import { armReceipt, attachReceipt, clearArm, pinReceipt, removeReceipt } from "./receipt-hook.js";
import { registerScreen } from "./router.js";

const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5";
const CATEGORY_FOR_KIND = {
  groceries: "Groceries",
  beauty: "Beauty",
  clothing: "Clothing",
  household: "Household",
  bills: "Bills",
  supplies: "Business Supplies",
  expense: "Other",
};

const scanButton = document.getElementById("scan-receipt");
const receiptModal = document.getElementById("receipt-modal");
const receiptDialog = document.getElementById("receipt-dialog");
const receiptTitle = document.getElementById("receipt-title");
const cameraInput = document.getElementById("receipt-camera-input");
const galleryInput = document.getElementById("receipt-gallery-input");
const chooseError = document.getElementById("receipt-choose-error");
const chooseStatus = document.getElementById("receipt-choose-status");
const chooseCopy = document.querySelector("#receipt-step-choose .meta");
const previewImage = document.getElementById("receipt-preview");
const confirmImage = document.getElementById("receipt-confirm-preview");
const fullImage = document.getElementById("receipt-full");
const progressEl = document.getElementById("receipt-progress");
const receiptForm = document.getElementById("receipt-form");
const amountInput = document.getElementById("receipt-amount");
const dateInput = document.getElementById("receipt-date");
const merchantInput = document.getElementById("receipt-merchant");
const categoryInput = document.getElementById("receipt-category");
const noteInput = document.getElementById("receipt-note");
const spaceInput = document.getElementById("receipt-space");
const amountHint = document.getElementById("receipt-amount-hint");
const formError = document.getElementById("receipt-form-error");
const applyButton = receiptForm?.querySelector("[type=submit]");
let laterButton = document.getElementById("receipt-later");

let request = null;
let receiptImage = "";
let scanToken = 0;
let scanBusy = false;
let scanWorker = null;
let tesseractLoad = null;
let returnFocus = null;
let unsure = false;

export class ReceiptScanner {
  open(options) {
    openScanner(options);
  }
}

export function bindReceipt() {
  if (!scanButton || !receiptModal || !receiptForm) return;
  scanButton.dataset.scan = scanButton.dataset.scan || "expense";
  scanButton.dataset.scanHost = scanButton.dataset.scanHost || "expense-form";
  if (!laterButton && applyButton) {
    laterButton = document.createElement("button");
    laterButton.type = "button";
    laterButton.id = "receipt-later";
    laterButton.className = "edit-cancel";
    laterButton.textContent = "Save for later";
    laterButton.hidden = true;
    applyButton.before(laterButton);
  }

  document.addEventListener("click", onScanClick);
  cameraInput.addEventListener("change", (event) => onFileChange(event, true));
  galleryInput.addEventListener("change", (event) => onFileChange(event, false));
  document.getElementById("receipt-scan").addEventListener("click", scanReceiptImage);
  receiptForm.addEventListener("submit", (event) => {
    event.preventDefault();
    useValues();
  });
  if (laterButton) laterButton.addEventListener("click", saveForLater);
  spaceInput.addEventListener("change", () => fillReceiptCategories(selectedSpace(), categoryInput.value));
  amountInput.addEventListener("input", refreshPaymentCopy);
  receiptModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-receipt-close]")) closeReceiptModal();
  });
  document.getElementById("receipt-preview-cancel").addEventListener("click", closeReceiptModal);
  document.getElementById("receipt-scan-cancel").addEventListener("click", closeReceiptModal);
  document.getElementById("receipt-confirm-cancel").addEventListener("click", closeReceiptModal);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !receiptModal.hidden) {
      event.preventDefault();
      closeReceiptModal();
    }
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-view-receipt]");
    if (!button) return;
    const src = imageFromButton(button);
    if (!src) return;
    event.preventDefault();
    openReceiptViewer(src);
  });

  const expenseCategory = document.getElementById("category");
  if (expenseCategory) expenseCategory.addEventListener("change", syncBillScanOnExpense);
  mountScanButtons(document);
  const observer = new MutationObserver(() => mountScanButtons(document));
  observer.observe(document.body, { childList: true, subtree: true });
}

let groceryHandler = null;

export function onGroceryScan(handler) {
  groceryHandler = typeof handler === "function" ? handler : null;
}

function scanMode(button) {
  if (button.dataset.scan === "payment") return "payment";
  if (button.dataset.scan === "grocery") return "grocery";
  if (button.dataset.scan === "bill") return "bill";
  return "expense";
}

function onScanClick(event) {
  const button = event.target.closest("[data-scan]");
  if (!button || receiptModal.contains(button)) return;
  event.preventDefault();
  const host = button.closest("form") || button.closest("[data-spend-panel]") || button.closest("section");
  openScanner({
    mode: scanMode(button),
    host,
    hostKey: button.dataset.scanHost || host?.dataset.paymentForm || host?.dataset.entryForm || host?.id || "expense",
    category: button.dataset.scanCategory || "",
    checklistTemplateId: button.dataset.checklistTemplate || "",
    checklistMonth: button.dataset.checklistMonth || "",
    button,
  });
}

function openScanner(options) {
  request = options;
  resetReceiptFlow();
  returnFocus = document.activeElement;
  receiptModal.hidden = false;
  document.body.classList.add("receipt-open");
  const payment = options.mode === "payment";
  const bill = options.mode === "bill";
  receiptTitle.textContent = bill
    ? "Scan bill"
    : options.mode === "grocery"
      ? "Scan grocery receipt"
      : payment
        ? "Scan payment proof"
        : "Scan receipt";
  if (chooseCopy) {
    chooseCopy.textContent = bill
      ? "Take a photo, choose one from your gallery, or use a screenshot from a bill app."
      : payment
        ? "Take a photo of an Easypaisa, JazzCash, or bank receipt, or choose one from your gallery."
        : "Take a photo of a paper receipt, or choose one from your gallery.";
  }
  showStep("choose");
  receiptDialog.focus();
}

function openReceiptViewer(src) {
  resetReceiptFlow();
  returnFocus = document.activeElement;
  fullImage.src = src;
  receiptModal.hidden = false;
  document.body.classList.add("receipt-open");
  showStep("view");
  receiptDialog.focus();
}

function closeReceiptModal() {
  scanToken += 1;
  scanBusy = false;
  receiptModal.hidden = true;
  document.body.classList.remove("receipt-open");
  resetReceiptFlow();
  if (returnFocus && returnFocus.focus) returnFocus.focus();
  returnFocus = null;
}

function resetReceiptFlow() {
  receiptImage = "";
  unsure = false;
  previewImage.removeAttribute("src");
  confirmImage.removeAttribute("src");
  fullImage.removeAttribute("src");
  receiptForm.reset();
  chooseError.hidden = true;
  formError.hidden = true;
  amountHint.hidden = true;
  chooseStatus.hidden = true;
  clearInvalid();
  showStep("choose");
}

function showStep(step) {
  receiptModal.querySelectorAll("[data-receipt-step]").forEach((section) => {
    section.hidden = section.dataset.receiptStep !== step;
  });
  if (step === "view") receiptTitle.textContent = "Receipt";
  receiptDialog.scrollTop = 0;
}

function onFileChange(event, fromCamera) {
  const input = event.target;
  const file = input.files && input.files[0];
  input.value = "";
  if (!file) {
    showChooseError(
      fromCamera
        ? "No photo was added. If the camera was blocked, allow camera access in your browser settings, or upload a photo from your gallery."
        : "No photo was selected."
    );
    return;
  }
  readReceiptFile(file);
}

async function readReceiptFile(file) {
  chooseError.hidden = true;
  if (!isImageFile(file)) {
    showChooseError("Please choose a photo. That file is not an image.");
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    showChooseError("That photo is too large. Please choose one under 12 MB.");
    return;
  }
  chooseStatus.hidden = false;
  chooseStatus.textContent = "Preparing photo...";
  try {
    receiptImage = await compressReceipt(file);
    previewImage.src = receiptImage;
    confirmImage.src = receiptImage;
    showStep("preview");
  } catch (error) {
    showChooseError(error.message || "That photo could not be opened. Please try another one.");
  } finally {
    chooseStatus.hidden = true;
  }
}

function showChooseError(message) {
  chooseError.textContent = message;
  chooseError.hidden = false;
  showStep("choose");
}

function isImageFile(file) {
  if (file.type && file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(file.name || "");
}

function compressReceipt(file) {
  return loadImage(file).then((image) => canvasFrom(image, 1000, true));
}

function prepareForOcr(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        resolve(canvasFrom(image, 1400, false));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error("That photo could not be opened."));
    image.src = dataUrl;
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This photo format is not supported. Please choose a JPG or PNG."));
    };
    image.src = url;
  });
}

function canvasFrom(image, maxWidth, compress) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) throw new Error("That photo could not be opened. Please try another one.");
  const scale = width > maxWidth ? maxWidth / width : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("That photo could not be opened. Please try another one.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  if (!compress) {
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const data = pixels.data;
    for (let i = 0; i < data.length; i += 4) {
      let tone = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11;
      tone = Math.max(0, Math.min(255, (tone - 128) * 1.4 + 128));
      data[i] = data[i + 1] = data[i + 2] = tone;
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/png");
  }
  let quality = 0.72;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > 180000 && quality > 0.45) {
    quality = Math.round((quality - 0.08) * 100) / 100;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  return dataUrl;
}

export async function recognizeImageText(dataUrl) {
  const Tesseract = await loadTesseract();
  if (!scanWorker) {
    scanWorker = await Tesseract.createWorker("eng", 1, { logger() {} });
  }
  const ocrImage = await prepareForOcr(dataUrl).catch(() => dataUrl);
  const result = await scanWorker.recognize(ocrImage);
  return result && result.data && result.data.text ? result.data.text : "";
}

async function scanReceiptImage() {
  if (!receiptImage || scanBusy || !request) return;
  const token = ++scanToken;
  scanBusy = true;
  showStep("scanning");
  progressEl.textContent = "Scanning... 0%";
  try {
    const Tesseract = await loadTesseract();
    if (token !== scanToken) return;
    if (!scanWorker) {
      scanWorker = await Tesseract.createWorker("eng", 1, {
        logger: (message) => {
          if (token !== scanToken) return;
          updateScanProgress(message);
        },
      });
    }
    if (token !== scanToken) return;
    const ocrImage = await prepareForOcr(receiptImage).catch(() => receiptImage);
    const result = await scanWorker.recognize(ocrImage);
    if (token !== scanToken) return;
    progressEl.textContent = "Scanning... 100%";
    const text = result && result.data ? result.data.text : "";
    const confidence = result && result.data ? result.data.confidence : 0;
    const lines = result && result.data && Array.isArray(result.data.lines) ? result.data.lines : [];
    if (request && request.mode === "grocery") {
      deliverGroceryScan(parseGroceryReceipt(text, confidence, lines), confidence, false);
      return;
    }
    if (request && request.mode === "bill") {
      showBillConfirm(parseBill(text), confidence, false);
      return;
    }
    hideBillScan();
    showConfirm(parseReceipt(text), confidence, false);
  } catch (error) {
    if (token !== scanToken) return;
    const failedLoad = /load|internet|network|script|fetch/i.test(String(error && error.message));
    if (request && request.mode === "grocery") {
      deliverGroceryScan(parseGroceryReceipt(""), 0, true);
      return;
    }
    if (request && request.mode === "bill") {
      showBillConfirm(parseBill(""), 0, true);
      return;
    }
    hideBillScan();
    showConfirm(parseReceipt(""), 0, failedLoad);
  } finally {
    if (token === scanToken) scanBusy = false;
  }
}

function deliverGroceryScan(parsed, confidence, failed) {
  const image = receiptImage;
  closeReceiptModal();
  if (groceryHandler) groceryHandler({ parsed, confidence, failed, image });
}

function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (!tesseractLoad) {
    tesseractLoad = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = TESSERACT_URL;
      script.async = true;
      script.onload = () => {
        if (window.Tesseract) resolve(window.Tesseract);
        else reject(new Error("The scanner could not load."));
      };
      script.onerror = () => {
        tesseractLoad = null;
        reject(new Error("The scanner could not load. Check your internet connection and try again."));
      };
      document.head.appendChild(script);
    });
  }
  return tesseractLoad;
}

function updateScanProgress(message) {
  if (!message || typeof message.status !== "string") return;
  const fraction = typeof message.progress === "number" ? message.progress : 0;
  let percent = 8;
  if (message.status === "recognizing text") percent = 35 + fraction * 65;
  else if (message.status.indexOf("language") !== -1) percent = 15 + fraction * 20;
  else percent = 8 + fraction * 10;
  percent = Math.max(1, Math.min(99, Math.round(percent)));
  progressEl.textContent = `Scanning... ${percent}%`;
}

function showBillConfirm(parsed, confidence, failedLoad) {
  presentBillScan({
    parsed,
    image: receiptImage,
    failedLoad,
    confidence,
    request,
    showStep,
    setTitle(title) {
      receiptTitle.textContent = title;
    },
    close: closeReceiptModal,
  });
}

function showConfirm(parsed, confidence, failedLoad) {
  hideBillScan();
  const payment = request && request.mode === "payment";
  unsure = failedLoad || !parsed.amount || (typeof confidence === "number" && confidence < 45);
  amountInput.value = parsed.amount ? parsed.amount.toFixed(2) : "";
  dateInput.value = parsed.date || (payment ? "" : today());
  merchantInput.value = parsed.merchant || "";
  noteInput.value = parsed.merchant || "";
  const spaceName = session.space === "business" || request?.hostKey === "supplies" ? "business" : "home";
  spaceInput.value = spaceName;
  const suggested = request?.category || (parsed.suggestions && parsed.suggestions[spaceName]) || "Other";
  fillReceiptCategories(spaceName, suggested);
  toggleExtraFields(payment);
  confirmImage.src = receiptImage;
  if (failedLoad) {
    formError.textContent = "The scanner could not load. Check your internet connection, then enter the details yourself.";
    formError.hidden = false;
  } else if (!parsed.amount && !parsed.date && !parsed.merchant) {
    formError.textContent = "I couldn't read this photo. Please enter the details yourself.";
    formError.hidden = false;
  } else if (unsure) {
    formError.textContent = payment
      ? "I couldn't read this proof clearly. Check the amount and date, then compare it with what you entered."
      : "I couldn't read this clearly. Please check the amount, date, and shop before you save.";
    formError.hidden = false;
  } else {
    formError.textContent = "Check these values. Nothing is saved until you confirm on the form.";
    formError.hidden = false;
  }
  amountHint.hidden = Boolean(parsed.amount);
  if (!parsed.amount) amountHint.textContent = "I couldn't read the total. Enter it yourself.";
  refreshPaymentCopy();
  clearInvalid();
  showStep("confirm");
  if (!parsed.amount) amountInput.focus();
}

function toggleExtraFields(payment) {
  [categoryInput, noteInput, spaceInput, merchantInput].forEach((field) => {
    const wrap = field.closest(".field");
    if (wrap) wrap.hidden = payment && field !== merchantInput;
  });
  merchantInput.closest(".field").hidden = false;
  if (applyButton) applyButton.textContent = payment ? "Use this proof" : "Use these values";
  if (laterButton) laterButton.hidden = payment;
}

function refreshPaymentCopy() {
  if (!request || request.mode !== "payment") {
    amountHint.hidden = amountHint.hidden && Boolean(amountInput.value.trim());
    return;
  }
  const proof = parseMoney(amountInput.value);
  const message = paymentMessage(proof.ok ? proof.value : null, enteredRaw(request.host));
  amountHint.textContent = message;
  amountHint.hidden = false;
  amountHint.classList.toggle("is-match", message === "Matches");
  amountHint.classList.toggle("is-differ", message.startsWith("Amount differs"));
}

export function paymentMessage(proofAmount, entered) {
  if (proofAmount == null) {
    return "I couldn't read the amount on this proof. Enter it yourself. This payment stays unverified.";
  }
  const parsed = parseMoney(entered, { allowZero: true });
  if (!parsed.ok) {
    return `I read ${formatMoney(proofAmount)} on the proof. Enter the payment amount so I can compare it.`;
  }
  if (sameMoney(proofAmount, parsed.value)) return "Matches";
  return `Amount differs: proof says ${formatMoney(proofAmount)}, entered ${formatMoney(parsed.value)}`;
}

function enteredRaw(host) {
  if (!host) return "";
  const cash = named(host, "cash");
  if (cash && cash.value.trim()) return cash.value.trim();
  const amount = named(host, "amount");
  return amount ? amount.value.trim() : "";
}

function useValues() {
  if (!request || !receiptImage) return;
  clearInvalid();
  const proof = parseMoney(amountInput.value);
  const merchant = merchantInput.value.trim().slice(0, 80);
  const date = dateInput.value;
  const payment = request.mode === "payment";
  if (payment && amountInput.value.trim() && !proof.ok) {
    amountInput.classList.add("invalid");
    formError.textContent = "Use an amount greater than 0 with at most 2 decimal places, or clear it and type the amount on the form.";
    formError.hidden = false;
    amountInput.focus();
    return;
  }
  const fields = resolveFields(request.host);
  if (!payment && proof.ok && fields.amount && fields.amount.type !== "date") fields.amount.value = proof.value.toFixed(2);
  if (date && fields.date && !payment) fields.date.value = date;
  if (!payment && merchant) writeShop(fields, merchant);
  if (!payment && fields.category && categoryInput.value) setSelect(fields.category, categoryInput.value);
  if (payment && proof.ok && !enteredRaw(request.host) && fields.amount) fields.amount.value = proof.value.toFixed(2);
  if (payment && date && fields.date && !fields.date.value) fields.date.value = date;

  const host = request.host;
  const hostKey = request.hostKey;
  const proofAmount = proof.ok ? proof.value : null;
  const entityType = payment ? "payment" : hostKey === "bill-form" ? "bill" : "expense";
  armReceipt(hostKey, entityType, {
    image: receiptImage,
    merchant,
    proofAmount,
    proofDate: date,
    category: categoryInput.value || request.category || "Other",
    space: selectedSpace(),
    note: noteInput.value.trim(),
    enteredNow: () => enteredRaw(host),
  });
  const message = payment
    ? paymentMessage(proofAmount, enteredRaw(host))
    : "Receipt photo attached. Check the fields, then save. Nothing is stored until you do.";
  showStaged(host, hostKey, receiptImage, message, proofAmount);
  closeReceiptModal();
}

function writeShop(fields, merchant) {
  const shop = textField(fields.shop);
  if (shop && shop !== fields.amount) {
    if (!shop.value.trim() || shop.id === "grocery-shop") shop.value = merchant;
  }
  const item = textField(fields.item);
  if (item && !item.value.trim()) item.value = merchant;
  const note = textField(fields.note);
  if (note && !note.value.trim()) note.value = merchant;
  const name = textField(fields.name);
  if (name && !name.value.trim()) name.value = merchant;
}

function textField(field) {
  if (!field || typeof field.value !== "string") return null;
  return field;
}

async function saveForLater() {
  if (!request || request.mode === "payment" || !receiptImage) return;
  clearInvalid();
  const parsed = parseMoney(amountInput.value);
  const date = dateInput.value;
  const merchant = merchantInput.value.trim().slice(0, 80);
  const note = (noteInput.value.trim() || merchant).slice(0, 120);
  const category = categoryInput.value || request.category || "Other";
  if (!parsed.ok || !date || !note) {
    formError.textContent = "Enter the amount, date, and a note before saving this for later. Nothing has been saved.";
    formError.hidden = false;
    if (!parsed.ok) amountInput.classList.add("invalid");
    if (!date) dateInput.classList.add("invalid");
    if (!note) noteInput.classList.add("invalid");
    return;
  }
  const id = crypto.randomUUID();
  const receiptId = crypto.randomUUID();
  try {
    save("receipts", { id: receiptId, dataUrl: receiptImage, entityType: "approval", entityId: id, createdAt: new Date().toISOString() });
    const { queuePendingApproval, renderApprovals, updateApprovalsBadge } = await import("./approvals.js");
    const saved = queuePendingApproval({
      id,
      title: merchant || note,
      note,
      source: "Auto: Receipt scan",
      sourceKey: `receipt:${receiptId}`,
      kind: "expense",
      space: selectedSpace(),
      category,
      amount: parsed.value,
      date,
      merchant,
      receiptId,
    });
    if (!saved) {
      formError.textContent = "This suggestion is already waiting in Pending Approvals.";
      formError.hidden = false;
      return;
    }
    renderApprovals();
    updateApprovalsBadge();
  } catch {
    formError.textContent = "This photo could not be stored on this device. Enter the expense yourself, without the photo.";
    formError.hidden = false;
    return;
  }
  clearArm(request.hostKey);
  closeReceiptModal();
}

function showStaged(host, hostKey, image, message, proofAmount) {
  if (!host) return;
  let note = host.querySelector(".scan-staged");
  if (!note) {
    note = document.createElement("div");
    note.className = "scan-staged";
    host.append(note);
  }
  note.replaceChildren();
  const img = document.createElement("img");
  img.className = "receipt-preview";
  img.alt = "Photo attached, not saved yet";
  img.src = image;
  const copy = document.createElement("p");
  copy.className = "meta scan-result";
  paintVerdict(copy, message);
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "edit-cancel";
  remove.textContent = "Remove photo";
  remove.addEventListener("click", () => {
    clearArm(hostKey);
    note.remove();
  });
  note.append(img, copy, remove);
  if (host.dataset.paymentForm || host.id === "sale-form") {
    const refresh = () => paintVerdict(copy, paymentMessage(proofAmount, enteredRaw(host)));
    const amount = named(host, "amount");
    const cash = named(host, "cash");
    if (amount) amount.addEventListener("input", refresh);
    if (cash) cash.addEventListener("input", refresh);
  }
}

function paintVerdict(copy, message) {
  copy.textContent = message;
  copy.classList.toggle("is-match", message === "Matches");
  copy.classList.toggle("is-differ", message.startsWith("Amount differs"));
}

export function clearStaged(host) {
  host?.querySelector(".scan-staged")?.remove();
}

function resolveFields(host) {
  if (!host) return {};
  return {
    amount: named(host, "amount"),
    date: named(host, "date") || named(host, "due") || host.querySelector("#grocery-date"),
    shop: named(host, "shop") || host.querySelector("#grocery-shop"),
    item: named(host, "item"),
    note: named(host, "note") || named(host, "notes"),
    name: named(host, "name"),
    category: named(host, "category"),
  };
}

function named(host, name) {
  if (host.elements && typeof host.elements.namedItem === "function") {
    const found = host.elements.namedItem(name);
    if (found) return found;
  }
  return host.querySelector(`[name="${CSS.escape(name)}"]`);
}

function setSelect(select, value) {
  const option = [...select.options].find((item) => item.value === value);
  if (option) select.value = value;
}

function fillReceiptCategories(spaceName, selected) {
  const names = SPACES[spaceName] ? SPACES[spaceName].categories : [];
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select a category";
  const options = names.map((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    option.selected = name === selected;
    return option;
  });
  categoryInput.replaceChildren(placeholder, ...options);
}

function selectedSpace() {
  return spaceInput.value === "business" ? "business" : "home";
}

function clearInvalid() {
  [amountInput, dateInput, merchantInput, categoryInput, noteInput, spaceInput].forEach((field) => {
    field.classList.remove("invalid");
  });
}

export function mountScanButtons(root) {
  root.querySelectorAll("form").forEach((form) => {
    if (form.id === "receipt-form" || form.classList.contains("edit-form")) return;
    if (form.id === "expense-form") ensureButton(form, "expense", "expense-form", "");
    if (form.id === "sale-form") ensureButton(form, "payment", "sale-form", "");
    if (form.id === "bill-form") ensureButton(form, "bill", "bill-form", "Bills");
    if (form.dataset.entryForm) {
      const kind = form.dataset.entryForm;
      const mode = kind === "bills" ? "bill" : "expense";
      ensureButton(form, mode, kind, CATEGORY_FOR_KIND[kind] || "");
    }
    if (form.dataset.paymentForm) ensureButton(form, "payment", form.dataset.paymentForm, "");
  });
  root.querySelectorAll("[data-spend-panel='groceries']").forEach((panel) => {
    ensureButton(panel, "grocery", "groceries", "Groceries");
  });
  syncBillScanOnExpense();
}

function ensureButton(host, mode, hostKey, category) {
  if (host.querySelector(`[data-scan-host="${cssEscape(hostKey)}"]`)) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "primary scan-receipt";
  button.dataset.scan = mode;
  button.dataset.scanHost = hostKey;
  if (category) button.dataset.scanCategory = category;
  button.textContent =
    mode === "payment"
      ? "Scan payment proof"
      : mode === "grocery"
        ? "Scan Grocery Receipt"
        : mode === "bill"
          ? "Scan Bill"
          : "Scan receipt";
  const submit = host.querySelector("[type=submit]");
  if (submit) submit.before(button);
  else host.append(button);
}

function syncBillScanOnExpense() {
  const form = document.getElementById("expense-form");
  const category = document.getElementById("category");
  if (!form || !category) return;
  const existing = form.querySelector('[data-scan-host="expense-bill"]');
  if (category.value === "Bills") {
    if (!existing) ensureButton(form, "bill", "expense-bill", "Bills");
  } else if (existing) existing.remove();
}

function cssEscape(value) {
  return window.CSS && CSS.escape ? CSS.escape(value) : value.replace(/"/g, "");
}

export function imageById(id) {
  if (!id) return "";
  const legacy = receiptPhotos()[id];
  if (isReceiptImage(legacy)) return legacy;
  const row = get("receipts").find((item) => item.id === id);
  return row && isReceiptImage(row.dataUrl) ? row.dataUrl : "";
}

function imageFromButton(button) {
  if (button.dataset.receipt) {
    const stored = imageById(button.dataset.receipt);
    if (stored) return stored;
  }
  const record = findRecord(button.dataset.viewReceipt);
  if (!record) return "";
  return imageById(record.receiptId || record.paymentProofId) || (isReceiptImage(record.receipt) ? record.receipt : "");
}

function findRecord(id) {
  if (!id) return null;
  for (const list of Object.values(state.spaces)) {
    const expense = list.find((item) => item.id === id);
    if (expense) return expense;
  }
  return state.sales.find((item) => item.id === id) || state.bills.find((item) => item.id === id) || null;
}

export function viewReceiptButton(record, field = "receiptId") {
  const id = record[field];
  if (!id && !isReceiptImage(record.receipt)) return null;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "edit";
  button.dataset.viewReceipt = record.id;
  if (id) button.dataset.receipt = id;
  button.textContent = "View receipt";
  return button;
}

function installApprovals() {
  try {
    registerScreen("approvals", { show: showApprovals });
  } catch {
    // The router is optional. The dashboard card still lists anything waiting.
  }
  renderApprovals();
}

function showApprovals() {
  const screen = document.querySelector('[data-screen="approvals"]');
  if (!screen) return;
  let panel = screen.querySelector("#approvals-screen");
  if (!panel) {
    screen.replaceChildren();
    const app = document.createElement("main");
    app.className = "app";
    app.id = "approvals-screen";
    const intro = document.createElement("header");
    intro.className = "intro";
    const heading = document.createElement("h1");
    heading.textContent = "Pending Approvals";
    intro.append(heading);
    const sheet = document.createElement("div");
    sheet.className = "sheet";
    sheet.id = "approvals-sheet";
    app.append(intro, sheet);
    screen.append(app);
    panel = app;
  }
  paintApprovalList(screen.querySelector("#approvals-sheet"));
}

export function renderApprovals() {
  const waiting = pendingItems();
  let card = document.getElementById("pending-approvals-card");
  const dashboard = document.getElementById("dashboard-panel");
  if (!waiting.length) {
    if (card) card.hidden = true;
  } else if (dashboard) {
    if (!card) {
      card = document.createElement("section");
      card.className = "card";
      card.id = "pending-approvals-card";
      const title = document.createElement("h2");
      title.textContent = "Pending Approvals";
      const list = document.createElement("ul");
      list.className = "expense-list";
      list.id = "pending-approvals-list";
      card.append(title, list);
      dashboard.prepend(card);
    }
    card.hidden = false;
    paintApprovalList(card);
  }
  const sheet = document.getElementById("approvals-sheet");
  if (sheet) paintApprovalList(sheet);
}

function pendingItems() {
  return get("pendingApprovals").filter((item) => String(item.status || "waiting").toLowerCase() === "waiting");
}

function paintApprovalList(host) {
  if (!host) return;
  let list = host.querySelector(".expense-list");
  if (!list) {
    list = document.createElement("ul");
    list.className = "expense-list";
    host.append(list);
  }
  const items = pendingItems();
  if (!items.length) {
    list.replaceChildren();
    let empty = host.querySelector(".empty");
    if (!empty) {
      empty = document.createElement("p");
      empty.className = "empty";
      host.append(empty);
    }
    empty.hidden = false;
    empty.textContent = "Nothing is waiting for approval.";
    return;
  }
  const empty = host.querySelector(".empty");
  if (empty) empty.hidden = true;
  list.replaceChildren(
    ...items.map((item) => {
      const row = document.createElement("li");
      row.className = "expense";
      const main = document.createElement("div");
      main.className = "expense-main";
      const top = document.createElement("div");
      top.className = "expense-top";
      const title = document.createElement("span");
      title.className = "category";
      title.textContent = item.merchant || item.category || "Receipt";
      const amount = document.createElement("span");
      amount.className = "amount";
      amount.textContent = formatMoney(item.amount);
      const meta = document.createElement("p");
      meta.className = "meta";
      meta.textContent = `${item.date} · ${item.category || "Expense"} · ${item.note || ""}`;
      top.append(title, amount);
      main.append(top, meta);
      const actions = document.createElement("div");
      actions.className = "expense-actions";
      const approve = document.createElement("button");
      approve.type = "button";
      approve.className = "primary";
      approve.textContent = "Approve";
      approve.addEventListener("click", () => approveItem(item));
      const dismiss = document.createElement("button");
      dismiss.type = "button";
      dismiss.className = "delete";
      dismiss.textContent = "Dismiss";
      dismiss.addEventListener("click", () => dismissItem(item));
      actions.append(approve, dismiss);
      const view = viewReceiptButton({ id: item.id, receiptId: item.receiptId });
      if (view) actions.append(view);
      row.append(main, actions);
      return row;
    })
  );
}

async function approveItem(item) {
  const expense = {
    id: crypto.randomUUID(),
    amount: item.amount,
    category: item.category || "Other",
    date: item.date,
    note: item.note || item.merchant || "Receipt",
    receiptId: item.receiptId,
  };
  if (item.merchant) expense.merchant = item.merchant;
  const spaceName = item.space === "business" ? "business" : "home";
  const { addExpense } = await import("./expenses.js");
  addExpense(spaceName, expense);
  deleteRecord("pendingApprovals", item.id);
  renderApprovals();
}

function dismissItem(item) {
  removeReceipt(item.receiptId);
  deleteRecord("pendingApprovals", item.id);
  renderApprovals();
}

export function attachBillReceipt(bill) {
  pinReceipt("bill-form", bill.id);
  attachReceipt("bill", bill.id);
  saveBills();
}
