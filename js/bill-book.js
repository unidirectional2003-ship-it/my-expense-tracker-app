import { formatMoney } from "./money.js";
import { formatDate, addDays } from "./dates.js";

export const BILL_SCANS_KEY = "bill-scans";

function emptyBook() {
  return { scans: [], profiles: [] };
}

export function loadBillBook() {
  try {
    const raw = localStorage.getItem(BILL_SCANS_KEY);
    if (!raw) return emptyBook();
    const parsed = JSON.parse(raw);
    return {
      scans: Array.isArray(parsed?.scans) ? parsed.scans : [],
      profiles: Array.isArray(parsed?.profiles) ? parsed.profiles : [],
    };
  } catch {
    return emptyBook();
  }
}

function saveBook(book) {
  localStorage.setItem(BILL_SCANS_KEY, JSON.stringify(book));
}

export function rememberBillProfile(profile) {
  if (!profile || !profile.templateId) return;
  const book = loadBillBook();
  const consumer = digits(profile.consumerNumber);
  const company = String(profile.company || "").trim();
  const next = {
    billType: profile.billType || "",
    consumerNumber: consumer,
    company,
    templateId: profile.templateId,
  };
  const index = book.profiles.findIndex(
    (item) =>
      item.templateId === next.templateId ||
      (consumer && digits(item.consumerNumber) === consumer) ||
      (company && item.company.toLowerCase() === company.toLowerCase())
  );
  if (index === -1) book.profiles.push(next);
  else book.profiles[index] = { ...book.profiles[index], ...next };
  saveBook(book);
}

export function saveBillScan(record) {
  const book = loadBillBook();
  const next = { ...record, id: record.id || crypto.randomUUID() };
  const index = book.scans.findIndex((item) => item.id === next.id);
  if (index === -1) book.scans.unshift(next);
  else book.scans[index] = { ...book.scans[index], ...next };
  saveBook(book);
  return next;
}

export function scansForTemplate(templateId) {
  if (!templateId) return [];
  return loadBillBook().scans.filter((item) => item.templateId === templateId);
}

export function duplicateBillScan(consumerNumber, billingMonth, ignoreId = "") {
  const consumer = digits(consumerNumber);
  if (!consumer || !/^\d{4}-\d{2}$/.test(billingMonth || "")) return null;
  return (
    loadBillBook().scans.find(
      (item) => item.id !== ignoreId && digits(item.consumerNumber) === consumer && item.billingMonth === billingMonth
    ) || null
  );
}

export function matchChecklistTemplate(items, parsed) {
  const book = loadBillBook();
  const consumer = digits(parsed.consumerNumber);
  if (consumer) {
    const profile = book.profiles.find((item) => digits(item.consumerNumber) === consumer);
    if (profile && items.some((item) => item.id === profile.templateId)) return profile.templateId;
    const previous = book.scans.find((item) => digits(item.consumerNumber) === consumer && item.templateId);
    if (previous && items.some((item) => item.id === previous.templateId)) return previous.templateId;
  }
  const company = String(parsed.company || "").trim().toLowerCase();
  if (company) {
    const named = items.find((item) => item.name.toLowerCase().includes(company));
    if (named) return named.id;
    const profile = book.profiles.find((item) => item.company.toLowerCase() === company);
    if (profile && items.some((item) => item.id === profile.templateId)) return profile.templateId;
  }
  return "";
}

export function markTemplateBillPaid(templateId) {
  if (!templateId) return;
  const book = loadBillBook();
  let changed = false;
  book.scans.forEach((item) => {
    if (item.templateId === templateId && !item.paid) {
      item.paid = true;
      changed = true;
    }
  });
  if (changed) saveBook(book);
}

export function markTemplateBillUnpaid(templateId) {
  if (!templateId) return;
  const book = loadBillBook();
  const scan = book.scans.find((item) => item.templateId === templateId && item.paid);
  if (!scan) return;
  scan.paid = false;
  saveBook(book);
}

export function markBillScanPaidByReceipt(receiptId) {
  if (!receiptId) return;
  const book = loadBillBook();
  let changed = false;
  book.scans.forEach((item) => {
    if (item.receiptId === receiptId && !item.paid) {
      item.paid = true;
      changed = true;
    }
  });
  if (changed) saveBook(book);
}

export function latestOpenScan(templateId) {
  return scansForTemplate(templateId).find((item) => !item.paid) || null;
}

export function billAlertPlans(records, todayValue) {
  const plans = [];
  records.forEach((record) => {
    if (!record || record.paid || !/^\d{4}-\d{2}-\d{2}$/.test(record.dueDate || "")) return;
    const due = record.dueDate;
    const name = record.company || record.name || "Bill";
    const within = record.amountWithin > 0 ? record.amountWithin : null;
    const after = record.amountAfter > 0 ? record.amountAfter : null;
    const params = {
      id: record.checklistItemId || "",
      month: due.slice(0, 7),
    };
    if (todayValue === addDays(due, -3)) {
      plans.push({
        id: `bill-scan:${record.id}:soon`,
        title: "Bill due in 3 days",
        message: within
          ? `${name} is due ${formatDate(due)}. Amount within due date: ${formatMoney(within)}.`
          : `${name} is due ${formatDate(due)}.`,
        severity: "warning",
        screen: "checklist",
        params,
      });
    } else if (todayValue === due) {
      plans.push({
        id: `bill-scan:${record.id}:due`,
        title: "Bill due today",
        message: within
          ? `${name} is due today. Amount within due date: ${formatMoney(within)}.`
          : `${name} is due today.`,
        severity: "warning",
        screen: "checklist",
        params,
      });
    } else if (todayValue > due) {
      plans.push({
        id: `bill-scan:${record.id}:overdue`,
        title: "Bill overdue",
        message: after
          ? `${name} is overdue. Amount after due date: ${formatMoney(after)}.`
          : `${name} is overdue.`,
        severity: "danger",
        screen: "checklist",
        params,
      });
    }
  });
  return plans;
}

export function digits(value) {
  return String(value || "").replace(/\D/g, "");
}
