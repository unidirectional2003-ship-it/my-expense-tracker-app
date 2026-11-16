export function today() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function formatDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function monthName(yearMonth) {
  const [year, month] = String(yearMonth).split("-").map(Number);
  if (!year || !month) return yearMonth;
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long" });
}

export function nextMonth(yearMonth) {
  const [year, month] = String(yearMonth).split("-").map(Number);
  if (!year || !month) return "";
  const date = new Date(year, month, 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function dateInMonth(yearMonth, day) {
  const [year, month] = String(yearMonth).split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const safeDay = Math.min(Math.max(day || 1, 1), lastDay);
  return `${yearMonth}-${String(safeDay).padStart(2, "0")}`;
}

export function daysRemainingInMonth(month, todayValue = today()) {
  if (!/^\d{4}-\d{2}$/.test(month || "")) return 0;
  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const currentMonth = todayValue.slice(0, 7);
  if (month > currentMonth) return daysInMonth;
  if (month < currentMonth) return 0;
  const day = Number(todayValue.slice(8, 10));
  return Math.max(daysInMonth - day + 1, 0);
}

export function recentMonths(endMonth, count) {
  const match = /^(\d{4})-(\d{2})$/.exec(endMonth);
  const end = match ? new Date(Number(match[1]), Number(match[2]) - 1, 1) : new Date();
  const months = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(end.getFullYear(), end.getMonth() - i, 1);
    months.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: date.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
    });
  }
  return months;
}

export function inMonth(date, month) {
  return Boolean(month) && typeof date === "string" && date.slice(0, 7) === month;
}
