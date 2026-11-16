import { parseMoney } from "./money.js";
import { today } from "./dates.js";
import { SPACES } from "./spaces.js";
import { session } from "./session.js";
import { state } from "./store.js";
import { isDuplicateExpense } from "./calc.js";
import { render } from "./render.js";
import { addExpense, fillCategories, fillFilterCategories } from "./expenses.js";
import { parseReceipt } from "./receipt-parse.js";
import { isReceiptImage } from "./receipt-thumb.js";

const MISSING_TOTAL = "Couldn't read the total, please enter it manually.";
const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5";

const scanButton = document.getElementById("scan-receipt");
const receiptModal = document.getElementById("receipt-modal");
const receiptDialog = document.getElementById("receipt-dialog");
const receiptTitle = document.getElementById("receipt-title");
const cameraInput = document.getElementById("receipt-camera-input");
const galleryInput = document.getElementById("receipt-gallery-input");
const chooseError = document.getElementById("receipt-choose-error");
const chooseStatus = document.getElementById("receipt-choose-status");
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
const saveWithoutButton = document.getElementById("receipt-save-without");

let afterSave = null;
let receiptImage = "";
let receiptSuggestions = { home: "Other", business: "Other" };
let scanToken = 0;
let scanBusy = false;
let scanWorker = null;
let tesseractLoad = null;
let returnFocus = null;

export function bindReceipt(options = {}) {
  if (!scanButton || !receiptModal || !receiptForm) return;
  afterSave = options.afterSave || null;

  scanButton.addEventListener("click", openReceiptChooser);
  cameraInput.addEventListener("change", (event) => onFileChange(event, true));
  galleryInput.addEventListener("change", (event) => onFileChange(event, false));
  document.getElementById("receipt-scan").addEventListener("click", scanReceiptImage);
  receiptForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveScannedExpense();
  });
  saveWithoutButton.addEventListener("click", () => saveScannedExpense({ dropPhoto: true }));
  spaceInput.addEventListener("change", () => {
    const spaceName = selectedSpace();
    fillReceiptCategories(spaceName, receiptSuggestions[spaceName] || "Other");
  });
  amountInput.addEventListener("input", () => {
    if (amountInput.value.trim()) amountHint.hidden = true;
  });
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
    const list = state.spaces[button.dataset.receiptSpace] || [];
    const expense = list.find((item) => item.id === button.dataset.viewReceipt);
    if (!expense || !isReceiptImage(expense.receipt)) return;
    event.preventDefault();
    openReceiptViewer(expense.receipt);
  });
}

function openReceiptChooser() {
  resetReceiptFlow();
  returnFocus = document.activeElement;
  receiptModal.hidden = false;
  document.body.classList.add("receipt-open");
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

function closeReceiptModal(options = {}) {
  scanToken += 1;
  scanBusy = false;
  const worker = scanWorker;
  scanWorker = null;
  if (worker) worker.terminate().catch(() => {});
  receiptModal.hidden = true;
  document.body.classList.remove("receipt-open");
  resetReceiptFlow();
  const restore = options.restoreFocus !== false;
  if (restore && returnFocus && returnFocus.focus) returnFocus.focus();
  returnFocus = null;
}

function resetReceiptFlow() {
  receiptImage = "";
  receiptSuggestions = { home: "Other", business: "Other" };
  previewImage.removeAttribute("src");
  confirmImage.removeAttribute("src");
  fullImage.removeAttribute("src");
  receiptForm.reset();
  chooseError.hidden = true;
  formError.hidden = true;
  amountHint.hidden = true;
  saveWithoutButton.hidden = true;
  chooseStatus.hidden = true;
  clearReceiptInvalid();
  showStep("choose");
}

function showStep(step) {
  receiptModal.querySelectorAll("[data-receipt-step]").forEach((section) => {
    section.hidden = section.dataset.receiptStep !== step;
  });
  receiptTitle.textContent = step === "view" ? "Receipt" : "Scan receipt";
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
    showChooseError("Please choose a photo of your receipt. That file is not an image.");
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
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      if (!width || !height) {
        reject(new Error("That photo could not be opened. Please try another one."));
        return;
      }
      const scale = width > 800 ? 800 / width : 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("That photo could not be opened. Please try another one."));
        return;
      }
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let quality = 0.72;
      let dataUrl = canvas.toDataURL("image/jpeg", quality);
      while (dataUrl.length > 180000 && quality > 0.45) {
        quality = Math.round((quality - 0.08) * 100) / 100;
        dataUrl = canvas.toDataURL("image/jpeg", quality);
      }
      resolve(dataUrl);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This photo format is not supported. Please choose a JPG or PNG."));
    };
    image.src = url;
  });
}

async function scanReceiptImage() {
  if (!receiptImage || scanBusy) return;
  const token = ++scanToken;
  scanBusy = true;
  showStep("scanning");
  progressEl.textContent = "Scanning... 0%";
  let worker = null;
  try {
    const Tesseract = await loadTesseract();
    if (token !== scanToken) return;
    worker = await Tesseract.createWorker("eng", 1, {
      logger: (message) => {
        if (token !== scanToken) return;
        updateScanProgress(message);
      },
    });
    scanWorker = worker;
    if (token !== scanToken) return;
    const result = await worker.recognize(receiptImage);
    if (token !== scanToken) return;
    progressEl.textContent = "Scanning... 100%";
    const text = result && result.data ? result.data.text : "";
    showReceiptConfirm(parseReceipt(text), false);
  } catch (error) {
    if (token !== scanToken) return;
    const failedLoad = error && /load|internet|network|script|fetch/i.test(String(error && error.message));
    showReceiptConfirm(parseReceipt(""), true, failedLoad);
  } finally {
    if (worker) worker.terminate().catch(() => {});
    if (scanWorker === worker) scanWorker = null;
    if (token === scanToken) scanBusy = false;
  }
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
  else if (message.status.indexOf("initial") !== -1) percent = 12;
  else percent = 8 + fraction * 10;
  percent = Math.max(1, Math.min(99, Math.round(percent)));
  progressEl.textContent = `Scanning... ${percent}%`;
}

function showReceiptConfirm(parsed, failed, failedLoad) {
  const spaceName = session.space === "business" ? "business" : "home";
  receiptSuggestions = parsed.suggestions || { home: "Other", business: "Other" };
  amountInput.value = parsed.amount ? parsed.amount.toFixed(2) : "";
  dateInput.value = parsed.date || today();
  merchantInput.value = parsed.merchant || "";
  noteInput.value = parsed.merchant || "";
  spaceInput.value = spaceName;
  fillReceiptCategories(spaceName, receiptSuggestions[spaceName] || "Other");
  confirmImage.src = receiptImage;
  amountHint.hidden = Boolean(parsed.amount);
  if (!parsed.amount) amountHint.textContent = MISSING_TOTAL;
  if (failedLoad) {
    formError.textContent = "The scanner could not load. Check your internet connection, or enter the details yourself.";
    formError.hidden = false;
  } else if (failed) {
    formError.textContent = "The receipt could not be read. Please enter the details yourself.";
    formError.hidden = false;
  } else {
    formError.hidden = true;
  }
  saveWithoutButton.hidden = true;
  clearReceiptInvalid();
  showStep("confirm");
  if (!parsed.amount) amountInput.focus();
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

function saveScannedExpense(options = {}) {
  clearReceiptInvalid();
  formError.hidden = true;
  const spaceName = selectedSpace();
  const parsed = parseMoney(amountInput.value);
  const category = categoryInput.value.trim();
  const date = dateInput.value;
  const merchant = merchantInput.value.trim().slice(0, 80);
  let note = noteInput.value.trim();
  if (!note) note = merchant;
  note = note.slice(0, 120);
  const allowed = SPACES[spaceName] ? SPACES[spaceName].categories : [];
  const invalid = [];

  if (!amountInput.value.trim()) {
    amountInput.classList.add("invalid");
    amountHint.textContent = MISSING_TOTAL;
    amountHint.hidden = false;
    invalid.push(amountInput);
  } else if (!parsed.ok) {
    amountInput.classList.add("invalid");
    invalid.push(amountInput);
  }
  if (!date) invalid.push(dateInput);
  if (!category || !allowed.includes(category)) invalid.push(categoryInput);
  if (!note) invalid.push(noteInput);

  if (invalid.length) {
    invalid.forEach((field) => field.classList.add("invalid"));
    if (!amountInput.value.trim()) formError.textContent = MISSING_TOTAL;
    else if (!parsed.ok) formError.textContent = "Use an amount greater than 0 with at most 2 decimal places.";
    else if (!date) formError.textContent = "Pick a date.";
    else if (!note) formError.textContent = "Add a note for this expense.";
    else formError.textContent = "Choose a category.";
    formError.hidden = false;
    invalid[0].focus();
    return;
  }

  const expense = {
    id: crypto.randomUUID(),
    amount: parsed.value,
    category,
    date,
    note,
  };
  if (merchant) expense.merchant = merchant;
  if (!options.dropPhoto && isReceiptImage(receiptImage)) expense.receipt = receiptImage;

  if (isDuplicateExpense(state.spaces[spaceName], expense)) {
    formError.textContent = "This matches an expense you already saved.";
    formError.hidden = false;
    amountInput.focus();
    return;
  }

  try {
    addExpense(spaceName, expense);
  } catch (error) {
    const index = state.spaces[spaceName].indexOf(expense);
    if (index !== -1) state.spaces[spaceName].splice(index, 1);
    if (expense.receipt && isQuotaError(error)) {
      saveWithoutButton.hidden = false;
      formError.textContent = "This photo could not be stored on this device. You can save the expense without the photo.";
      formError.hidden = false;
      return;
    }
    formError.textContent = "The expense could not be saved. Please try again.";
    formError.hidden = false;
    return;
  }

  closeReceiptModal({ restoreFocus: false });
  revealSpace(spaceName);
  const first = document.querySelector("#expense-list .expense");
  if (first && first.scrollIntoView) first.scrollIntoView({ behavior: "smooth", block: "center" });
}

function revealSpace(spaceName) {
  session.space = spaceName;
  if (spaceName === "home") session.homeView = "expenses";
  if (spaceName === "business") session.businessView = "expenses";
  session.editingId = null;
  session.editingSaleId = null;
  const app = document.querySelector(".app");
  if (app) app.dataset.space = spaceName;
  const panel = document.getElementById("space-panel");
  document.querySelectorAll(".tab").forEach((tab) => {
    const active = tab.dataset.space === spaceName;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    if (active && panel) panel.setAttribute("aria-labelledby", tab.id);
  });
  const search = document.getElementById("search");
  if (search) search.value = "";
  fillCategories();
  fillFilterCategories();
  render();
}

function clearReceiptInvalid() {
  [amountInput, dateInput, merchantInput, categoryInput, noteInput, spaceInput].forEach((field) => {
    if (field) field.classList.remove("invalid");
  });
}

function isQuotaError(error) {
  if (!error) return false;
  return error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED" || error.code === 22;
}
