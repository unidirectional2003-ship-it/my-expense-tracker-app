import { formatMoney, parseMoney, roundMoney } from "./money.js";
import { formatDate, today } from "./dates.js";
import { state, saveBills, saveChecklist } from "./store.js";
import { save as saveRecord } from "./storage.js";
import { render } from "./render.js";
import { addTemplate, clampDay, ensureMonth } from "./checklist-model.js";
import { billTypeLabel } from "./bill-parse.js";
import {
  rememberBillProfile,
  saveBillScan,
  duplicateBillScan,
  matchChecklistTemplate,
  markTemplateBillPaid,
  latestOpenScan,
  scansForTemplate,
} from "./bill-book.js";

const TYPES = [
  ["electricity", "Electricity"],
  ["gas", "Gas"],
  ["water", "Water"],
  ["internet", "Internet"],
  ["mobile", "Mobile"],
  ["other", "Other"],
];

const SCAN_TIP = "Lay the bill flat in good light, and keep the due date and the amount in the photo.";

export function hideBillScan() {
  const form = document.getElementById("bill-scan-form");
  if (form) form.hidden = true;
}

export function presentBillScan({ parsed, image, failedLoad, confidence, request, showStep, setTitle, close }) {
  const form = ensureForm();
  const weak =
    failedLoad ||
    ((!parsed.company && !parsed.dueDate && !parsed.consumerNumber && parsed.amountWithin == null) &&
      (!confidence || confidence < 20));
  setTitle("Check this bill");
  form.replaceChildren();
  const preview = document.createElement("img");
  preview.className = "receipt-preview";
  preview.alt = "Scanned bill";
  preview.src = image;

  const intro = document.createElement("p");
  intro.className = "form-error";
  intro.setAttribute("role", "status");
  if (failedLoad) {
    intro.textContent = `The scanner could not read this photo. Enter the bill yourself. ${SCAN_TIP}`;
  } else if (weak) {
    intro.textContent = `This photo could not be read. Enter the bill yourself. ${SCAN_TIP}`;
  } else {
    intro.textContent = "Check these values. Nothing is saved until you tap Confirm and Save.";
  }

  const typeField = selectField("billType", "Bill type", TYPES, parsed.billType || "other", Boolean(parsed.billType));
  const company = textField("company", "Company", parsed.company || "", Boolean(parsed.company));
  const consumer = textField("consumer", "Consumer / reference / account number", parsed.consumerNumber || "", Boolean(parsed.consumerNumber));
  const billingMonth = textField("billingMonth", "Billing month", parsed.billingMonth || "", Boolean(parsed.billingMonth), "month");
  const due = textField("due", "Due date", parsed.dueDate || "", Boolean(parsed.dueDate), "date");
  const within = moneyField("within", "Amount payable within due date", parsed.amountWithin, parsed.amountWithin != null);
  const after = moneyField("after", "Amount payable after due date", parsed.amountAfter, parsed.amountAfter != null);
  const units = textField("units", "Units consumed", parsed.units || "", Boolean(parsed.units));

  const suggestions = document.createElement("p");
  suggestions.className = "meta";
  if (parsed.otherDates && parsed.otherDates.length) {
    suggestions.textContent = `Other dates on the bill: ${parsed.otherDates
      .map((item) => `${item.label} ${formatDate(item.date)}`)
      .join(" · ")}`;
  } else {
    suggestions.hidden = true;
  }

  const duplicate = document.createElement("p");
  duplicate.className = "form-error";
  duplicate.setAttribute("role", "alert");
  duplicate.hidden = true;

  const ask = document.createElement("div");
  ask.hidden = true;
  const askCopy = document.createElement("p");
  askCopy.className = "meta";
  askCopy.textContent = "Add this as a new checklist bill?";
  const askAdd = document.createElement("button");
  askAdd.type = "button";
  askAdd.className = "primary";
  askAdd.textContent = "Add to checklist";
  const askSkip = document.createElement("button");
  askSkip.type = "button";
  askSkip.className = "edit-cancel";
  askSkip.textContent = "Save bill only";
  ask.append(askCopy, askAdd, askSkip);

  const error = document.createElement("p");
  error.className = "form-error";
  error.setAttribute("role", "alert");
  error.hidden = true;

  const actions = document.createElement("div");
  actions.className = "edit-actions";
  const confirm = document.createElement("button");
  confirm.type = "submit";
  confirm.className = "primary";
  confirm.textContent = "Confirm and Save";
  const later = document.createElement("button");
  later.type = "button";
  later.className = "edit-cancel";
  later.textContent = "Save for Approval";
  actions.append(confirm, later);

  form.append(
    preview,
    intro,
    typeField.field,
    company.field,
    consumer.field,
    billingMonth.field,
    due.field,
    suggestions,
    within.field,
    after.field,
    units.field,
    duplicate,
    ask,
    error,
    actions
  );

  const refreshDuplicate = () => {
    const hit = duplicateBillScan(consumer.control.value, billingMonth.control.value);
    duplicate.hidden = !hit;
    duplicate.textContent = hit
      ? "This consumer number already has a bill for that month."
      : "";
  };
  [consumer.control, billingMonth.control].forEach((field) => field.addEventListener("input", refreshDuplicate));
  refreshDuplicate();

  form.onsubmit = (event) => {
    event.preventDefault();
    const values = readValues(form);
    const target = chooseTemplate(values, request);
    if (!target) {
      ask.hidden = false;
      askAdd.onclick = () => {
        const template = addTemplate(
          state.checklist,
          {
            name: values.company || billTypeLabel(values.billType) || "Bill",
            dueDay: values.dueDate ? Number(values.dueDate.slice(8, 10)) : 1,
            expectedAmount: values.amountWithin || 0,
            category: "Bills",
          },
          today().slice(0, 7)
        );
        finish(template.id, values, image, error, close);
      };
      askSkip.onclick = () => finish("", values, image, error, close);
      return;
    }
    finish(target, values, image, error, close);
  };

  later.addEventListener("click", () => saveForApproval(readValues(form), image, error, close));
  showStep("bill");
  if (!parsed.dueDate) due.control.focus();
}

export function noteChecklistPaid(templateId, paidOn) {
  const scan = latestOpenScan(templateId);
  markTemplateBillPaid(templateId);
  if (!scan || !scan.dueDate || !paidOn || paidOn <= scan.dueDate) return null;
  if (!(scan.amountAfter > 0) || !(scan.amountWithin > 0) || scan.amountAfter <= scan.amountWithin) return null;
  return {
    name: scan.company || scan.name || "Bill",
    surcharge: roundMoney(scan.amountAfter - scan.amountWithin),
  };
}

export function receiptForTemplate(templateId) {
  const scan = scansForTemplate(templateId).find((item) => item.receiptId);
  return scan ? scan.receiptId : "";
}

function finish(templateId, values, image, error, close, request) {
  try {
    const receiptId = storeImage(image, templateId || "bill");
    let checklistItemId = "";
    if (templateId) {
      checklistItemId = applyChecklist(templateId, values, request && request.checklistMonth);
      rememberBillProfile({ ...values, templateId });
    } else if (values.dueDate && values.amountWithin > 0) {
      const billId = crypto.randomUUID();
      state.bills.unshift({
        id: billId,
        name: values.company || billTypeLabel(values.billType) || "Bill",
        amount: values.amountWithin,
        dueDate: values.dueDate,
        paid: false,
        space: "home",
        receiptId,
      });
      saveBills();
    } else if (!templateId) {
      error.textContent = "Enter a due date and an amount within the due date to save this bill.";
      error.hidden = false;
      return;
    }
    saveBillScan({
      billType: values.billType,
      company: values.company,
      consumerNumber: values.consumerNumber,
      billingMonth: values.billingMonth,
      dueDate: values.dueDate,
      amountWithin: values.amountWithin,
      amountAfter: values.amountAfter,
      units: values.units,
      templateId: templateId || "",
      checklistItemId,
      receiptId,
      paid: false,
      name: values.company || billTypeLabel(values.billType) || "Bill",
    });
    saveChecklist();
  } catch {
    error.textContent = "This photo could not be stored on this device. You can still type the bill in by hand.";
    error.hidden = false;
    return;
  }
  close();
  import("./alerts.js").then((module) => module.refreshAlerts()).catch(() => {});
  render();
}

async function saveForApproval(values, image, error, close) {
  if (!values.dueDate || !(values.amountWithin > 0)) {
    error.textContent = "Enter a due date and an amount within the due date before saving this for approval.";
    error.hidden = false;
    return;
  }
  const sourceKey = `bill-scan:${values.consumerNumber || values.company || "bill"}:${values.billingMonth || values.dueDate.slice(0, 7)}:${values.amountWithin}`;
  try {
    const receiptId = storeImage(image, "approval");
    const { queuePendingApproval, renderApprovals, updateApprovalsBadge } = await import("./approvals.js");
    const saved = queuePendingApproval({
      id: crypto.randomUUID(),
      title: values.company || billTypeLabel(values.billType) || "Bill",
      note: billNote(values),
      source: "Auto",
      sourceKey,
      kind: "expense",
      space: "home",
      category: "Bills",
      amount: values.amountWithin,
      date: values.dueDate,
      merchant: values.company,
      receiptId,
    });
    if (!saved) {
      error.textContent = "This bill is already waiting in Pending Approvals.";
      error.hidden = false;
      return;
    }
    renderApprovals();
    updateApprovalsBadge();
  } catch {
    error.textContent = "This photo could not be stored on this device.";
    error.hidden = false;
    return;
  }
  close();
}

function applyChecklist(templateId, values, openedMonth) {
  const template = state.checklist.items.find((item) => item.id === templateId);
  if (!template) return "";
  const dueDay = values.dueDate ? clampDay(Number(values.dueDate.slice(8, 10))) : template.dueDay;
  if (values.dueDate) template.dueDay = dueDay;
  if (values.amountWithin > 0) template.expectedAmount = values.amountWithin;
  const months = new Set([today().slice(0, 7)]);
  if (openedMonth) months.add(openedMonth);
  if (values.dueDate) months.add(values.dueDate.slice(0, 7));
  let checklistItemId = "";
  months.forEach((month) => {
    ensureMonth(state.checklist, month);
    const row = state.checklist.months[month]?.find((item) => item.templateId === templateId);
    if (!row) return;
    if (values.dueDate) row.dueDay = dueDay;
    if (values.amountWithin > 0) row.expectedAmount = values.amountWithin;
    if (values.dueDate && month === values.dueDate.slice(0, 7)) checklistItemId = row.id;
    else if (!checklistItemId && month === openedMonth) checklistItemId = row.id;
  });
  return checklistItemId;
}

function chooseTemplate(values, request) {
  const matched = matchChecklistTemplate(state.checklist.items, values);
  if (matched) return matched;
  if (request && request.checklistTemplateId) return request.checklistTemplateId;
  return "";
}

function readValues(form) {
  const within = parseMoney(form.elements.within.value);
  const after = parseMoney(form.elements.after.value);
  return {
    billType: form.elements.billType.value || "other",
    company: form.elements.company.value.trim().slice(0, 80),
    consumerNumber: form.elements.consumer.value.replace(/[^\d]/g, "").slice(0, 20),
    billingMonth: /^\d{4}-\d{2}$/.test(form.elements.billingMonth.value) ? form.elements.billingMonth.value : "",
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(form.elements.due.value) ? form.elements.due.value : "",
    amountWithin: within.ok ? within.value : null,
    amountAfter: after.ok ? after.value : null,
    units: form.elements.units.value.trim().slice(0, 20),
  };
}

function storeImage(image, entityId) {
  if (!image) return "";
  const id = crypto.randomUUID();
  saveRecord("receipts", {
    id,
    dataUrl: image,
    entityType: "bill",
    entityId,
    createdAt: new Date().toISOString(),
  });
  return id;
}

function billNote(values) {
  const parts = [values.company || billTypeLabel(values.billType) || "Bill"];
  if (values.consumerNumber) parts.push(values.consumerNumber);
  if (values.billingMonth) parts.push(values.billingMonth);
  return parts.join(" · ").slice(0, 120);
}

function ensureForm() {
  let form = document.getElementById("bill-scan-form");
  if (form) return form;
  form = document.createElement("form");
  form.id = "bill-scan-form";
  form.dataset.receiptStep = "bill";
  form.noValidate = true;
  form.hidden = true;
  document.getElementById("receipt-dialog").append(form);
  return form;
}

function textField(name, labelText, value, detected, type = "text") {
  const control = document.createElement("input");
  control.name = name;
  control.id = `bill-${name}`;
  control.type = type;
  control.value = value;
  return { control, field: wrapField(labelText, control, detected) };
}

function moneyField(name, labelText, value, detected) {
  const control = document.createElement("input");
  control.name = name;
  control.id = `bill-${name}`;
  control.type = "number";
  control.min = "0.01";
  control.step = "0.01";
  control.inputMode = "decimal";
  control.value = value != null ? Number(value).toFixed(2) : "";
  return { control, field: wrapField(labelText, control, detected) };
}

function selectField(name, labelText, options, value, detected) {
  const control = document.createElement("select");
  control.name = name;
  control.id = `bill-${name}`;
  options.forEach(([optionValue, text]) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = text;
    option.selected = optionValue === value;
    control.append(option);
  });
  return { control, field: wrapField(labelText, control, detected) };
}

function wrapField(labelText, control, detected) {
  const field = document.createElement("div");
  field.className = "field";
  const label = document.createElement("label");
  label.htmlFor = control.id;
  label.textContent = labelText;
  const status = document.createElement("span");
  status.className = "meta";
  status.textContent = detected ? "Detected" : "Not found, please enter";
  field.append(label, status, control);
  return field;
}
