import { roundMoney, sameMoney } from "./money.js";
import { inMonth } from "./dates.js";

export function earnedOf(sale) {
  return sale.kind === "advance" ? 0 : roundMoney(sale.earnedAmount);
}

export function cashOf(sale) {
  return roundMoney(sale.cashReceived);
}

export function advanceOf(sale) {
  return sale.kind === "advance" ? roundMoney(sale.cashReceived) : 0;
}

export function receivableOf(sale) {
  if (sale.kind === "advance") return 0;
  return roundMoney(Math.max(0, roundMoney(sale.earnedAmount) - roundMoney(sale.cashReceived)));
}

export function sumAmounts(items) {
  return roundMoney(items.reduce((sum, item) => sum + Number(item.amount), 0));
}

export function sumInMonth(items, month) {
  if (!month) return 0;
  return sumAmounts(items.filter((item) => inMonth(item.date, month)));
}

export function monthBusiness(sales, businessExpenses, month) {
  const rows = sales.filter((sale) => inMonth(sale.date, month));
  const earned = roundMoney(rows.reduce((sum, sale) => sum + earnedOf(sale), 0));
  const cash = roundMoney(rows.reduce((sum, sale) => sum + cashOf(sale), 0));
  const advances = roundMoney(rows.reduce((sum, sale) => sum + advanceOf(sale), 0));
  const outstanding = roundMoney(rows.reduce((sum, sale) => sum + receivableOf(sale), 0));
  const expenses = sumInMonth(businessExpenses, month);
  return {
    earned,
    cash,
    advances,
    outstanding,
    expenses,
    profit: roundMoney(earned - expenses),
  };
}

export function totalReceivable(sales) {
  return roundMoney(sales.reduce((sum, sale) => sum + receivableOf(sale), 0));
}

export function businessBalance(sales, businessExpenses) {
  const cash = roundMoney(sales.reduce((sum, sale) => sum + cashOf(sale), 0));
  return roundMoney(cash - sumAmounts(businessExpenses));
}

export function savingsApplied(savings, month) {
  if (!savings || savings.appliedMonth !== month) return 0;
  return roundMoney(Math.max(0, Number(savings.appliedAmount) || 0));
}

export function personalBalance(budgets, homeExpenses, savings, month) {
  const budget = budgets[month];
  if (typeof budget !== "number" || !(budget > 0)) return null;
  const spent = sumInMonth(homeExpenses, month);
  return roundMoney(budget - spent - savingsApplied(savings, month));
}

export function openReceivables(sales) {
  return sales
    .map((sale) => ({ sale, due: receivableOf(sale) }))
    .filter((row) => row.due > 0)
    .sort((a, b) => b.sale.date.localeCompare(a.sale.date) || a.sale.note.localeCompare(b.sale.note));
}

export function upcomingBills(bills, month, todayValue) {
  return bills.filter(
    (bill) => !bill.paid && inMonth(bill.dueDate, month) && bill.dueDate >= todayValue
  );
}

export function overdueBills(bills, month, todayValue) {
  return bills.filter(
    (bill) => !bill.paid && inMonth(bill.dueDate, month) && bill.dueDate < todayValue
  );
}

export function isDuplicateExpense(expenses, candidate, ignoreId = "") {
  const note = candidate.note.trim().toLowerCase();
  return expenses.some((item) => {
    if (item.id === ignoreId) return false;
    return (
      sameMoney(item.amount, candidate.amount) &&
      item.category === candidate.category &&
      item.date === candidate.date &&
      item.note.trim().toLowerCase() === note
    );
  });
}

export function isDuplicateSale(sales, candidate, ignoreId = "") {
  const note = candidate.note.trim().toLowerCase();
  const customer = candidate.customer.trim().toLowerCase();
  return sales.some((item) => {
    if (item.id === ignoreId) return false;
    return (
      item.kind === candidate.kind &&
      item.date === candidate.date &&
      item.note.trim().toLowerCase() === note &&
      item.customer.trim().toLowerCase() === customer &&
      sameMoney(item.earnedAmount, candidate.earnedAmount) &&
      sameMoney(item.cashReceived, candidate.cashReceived)
    );
  });
}

export function isDuplicateBill(bills, candidate, ignoreId = "") {
  const name = candidate.name.trim().toLowerCase();
  return bills.some((item) => {
    if (item.id === ignoreId) return false;
    return (
      item.space === candidate.space &&
      item.dueDate === candidate.dueDate &&
      item.name.trim().toLowerCase() === name &&
      sameMoney(item.amount, candidate.amount)
    );
  });
}

export function saleStatus(sale) {
  if (sale.kind === "advance") return { code: "advance", due: 0 };
  const due = receivableOf(sale);
  if (due <= 0) return { code: "paid", due: 0 };
  if (roundMoney(sale.cashReceived) <= 0) return { code: "unpaid", due };
  return { code: "partial", due };
}
