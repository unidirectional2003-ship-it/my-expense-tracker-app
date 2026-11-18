import { roundMoney, formatMoney } from "./money.js";
import { monthName } from "./dates.js";
import { balanceOf } from "./order-book.js";
import {
  monthBusiness,
  sumInMonth,
  overdueBills,
  upcomingBills,
  receivableOf,
} from "./calc.js";

const CLOSED = new Set(["resolved", "dismissed", "read", "done", "approved", "rejected"]);

export function percentChange(current, previous) {
  if (!(previous > 0) || !Number.isFinite(current)) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function snapshotFromData(data) {
  const month = data.month;
  const todayValue = data.today;
  const previous = previousMonth(month);
  const sales = Array.isArray(data.sales) ? data.sales : [];
  const home = Array.isArray(data.homeExpenses) ? data.homeExpenses : [];
  const business = Array.isArray(data.businessExpenses) ? data.businessExpenses : [];
  const figures = monthBusiness(sales, business, month);
  const last = monthBusiness(sales, business, previous);
  const homeSpending = sumInMonth(home, month);
  const previousHome = sumInMonth(home, previous);
  const totalSpending = roundMoney(homeSpending + figures.expenses);
  const previousTotal = roundMoney(previousHome + last.expenses);
  const budget = budgetFor(data.budgets, month);
  const hasBudget = typeof budget === "number" && budget > 0;
  const orders = Array.isArray(data.orders) ? data.orders.filter((order) => order && typeof order === "object") : [];
  const ordersKnown = data.ordersKnown !== false;
  const overdue = overdueBills(data.bills || [], month, todayValue);
  const upcoming = upcomingBills(data.bills || [], month, todayValue);
  const categories = categoryComparisons(home, business, month, previous);
  const orderFacts = summarizeOrders(orders, month, todayValue);
  const looseSales = sales.filter((sale) => !sale.orderId);
  const fulfilledSales = looseSales.filter(
    (sale) => sale.kind !== "advance" && inMonth(sale.date, month) && receivableOf(sale) <= 0
  ).length;
  const looseUnpaid = roundMoney(
    looseSales.reduce((sum, sale) => sum + receivableOf(sale), 0)
  );
  const looseUnpaidCount = looseSales.filter((sale) => receivableOf(sale) > 0).length;
  const savedAlerts = countOpenAlerts(data.storedAlerts, todayValue);
  const warnings = warningCount({
    overdue: overdue.length,
    upcoming: upcoming.length,
    hasBudget,
    homeSpending,
    budget,
    profit: figures.profit,
  });

  return {
    month,
    previousMonth: previous,
    income: figures.earned,
    previousIncome: last.earned,
    businessExpenses: figures.expenses,
    previousBusinessExpenses: last.expenses,
    homeSpending,
    previousHome,
    totalSpending,
    previousTotal,
    profit: figures.profit,
    previousProfit: last.profit,
    cashReceived: figures.cash,
    advances: figures.advances,
    hasBudget,
    budget: hasBudget ? budget : 0,
    categoryBudgets: mergeBudgetLimits(data, month, home, business),
    savingsSaved: roundMoney(Number(data.savings?.saved) || 0),
    savingsTarget: roundMoney(Number(data.savings?.target) > 0 ? data.savings.target : 0),
    savingsName: typeof data.savings?.name === "string" ? data.savings.name.trim() : "",
    ordersKnown,
    fulfilledOrders: orderFacts.fulfilled,
    lateCount: orderFacts.late,
    lateKnown: ordersKnown,
    unpaidOrders: orderFacts.unpaidTotal,
    unpaidOrderCount: orderFacts.unpaidCount,
    fulfilledSales,
    looseUnpaid,
    looseUnpaidCount,
    overdueCount: overdue.length,
    overdueTotal: roundMoney(overdue.reduce((sum, bill) => sum + Number(bill.amount), 0)),
    categories,
    savedAlerts,
    warnings,
    openAlerts: savedAlerts,
    pendingApprovals: countWaiting(data.pendingApprovals),
    aiEndpoint: httpUrl(data.aiEndpoint),
  };
}

export function buildInsights(snapshot) {
  const good = [];
  const bad = [];
  const month = snapshot.month;

  const profitChange = changeFrom(snapshot.profit, snapshot.previousProfit);
  if (snapshot.profit > 0) {
    good.push(insight("good", profitText(snapshot.profit, snapshot.previousProfit, profitChange), "reports", month));
  } else if (snapshot.profit < 0) {
    bad.push(insight("bad", profitText(snapshot.profit, snapshot.previousProfit, profitChange), "reports", month));
  }

  const incomeChange = changeFrom(snapshot.income, snapshot.previousIncome);
  if (incomeChange && incomeChange.pct > 0) {
    good.push(insight("good", moneyChange("Income", snapshot.income, snapshot.previousIncome, incomeChange), "reports", month));
  } else if (incomeChange && incomeChange.pct < 0) {
    bad.push(insight("bad", moneyChange("Income", snapshot.income, snapshot.previousIncome, incomeChange), "reports", month));
  } else if (!(snapshot.previousIncome > 0) && snapshot.income > 0) {
    good.push(
      insight(
        "good",
        `Income this month is ${formatMoney(snapshot.income)}. Last month had no earned income.`,
        "reports",
        month
      )
    );
  }

  if (snapshot.fulfilledOrders > 0) {
    const count = snapshot.fulfilledOrders;
    good.push(
      insight(
        "good",
        `${count} ${count === 1 ? "order was" : "orders were"} fulfilled this month.`,
        "orders",
        month
      )
    );
  }
  if (snapshot.fulfilledSales > 0) {
    const count = snapshot.fulfilledSales;
    good.push(
      insight(
        "good",
        `${count} ${count === 1 ? "sale was" : "sales were"} paid in full this month.`,
        "orders",
        month
      )
    );
  }

  if (snapshot.cashReceived > 0) {
    let text = `Payments received this month are ${formatMoney(snapshot.cashReceived)}.`;
    if (snapshot.advances > 0) {
      text += ` ${formatMoney(snapshot.advances)} of that is customer advances, not profit.`;
    }
    good.push(insight("good", text, "orders", month));
  }

  if (snapshot.hasBudget && snapshot.homeSpending < snapshot.budget) {
    good.push(
      insight(
        "good",
        `The home budget is under control, with ${formatMoney(snapshot.homeSpending)} of ${formatMoney(snapshot.budget)} used.`,
        "budgets",
        month
      )
    );
  } else if (snapshot.hasBudget && snapshot.homeSpending === snapshot.budget) {
    bad.push(
      insight("bad", `The home budget of ${formatMoney(snapshot.budget)} is finished.`, "budgets", month)
    );
  } else if (snapshot.hasBudget && snapshot.homeSpending > snapshot.budget) {
    bad.push(
      insight(
        "bad",
        `The home budget is exceeded by ${formatMoney(roundMoney(snapshot.homeSpending - snapshot.budget))}.`,
        "budgets",
        month
      )
    );
  }

  snapshot.categoryBudgets.forEach((row) => {
    if (row.spent < row.limit) {
      good.push(
        insight(
          "good",
          `The ${row.category} budget is under control, with ${formatMoney(row.spent)} of ${formatMoney(row.limit)} used.`,
          "budgets",
          month,
          "home",
          row.category
        )
      );
    } else if (row.spent === row.limit) {
      bad.push(
        insight(
          "bad",
          `The ${row.category} budget of ${formatMoney(row.limit)} is finished.`,
          "budgets",
          month,
          "home",
          row.category
        )
      );
    } else {
      bad.push(
        insight(
          "bad",
          `The ${row.category} budget is exceeded by ${formatMoney(roundMoney(row.spent - row.limit))}.`,
          "budgets",
          month,
          "home",
          row.category
        )
      );
    }
  });

  if (snapshot.savingsSaved > 0) {
    let text = `Savings so far are ${formatMoney(snapshot.savingsSaved)}.`;
    if (snapshot.savingsTarget > 0 && snapshot.savingsName) {
      text = `Saved ${formatMoney(snapshot.savingsSaved)} of ${formatMoney(snapshot.savingsTarget)} toward ${snapshot.savingsName}.`;
    } else if (snapshot.savingsTarget > 0) {
      text = `Saved ${formatMoney(snapshot.savingsSaved)} of ${formatMoney(snapshot.savingsTarget)} toward the savings goal.`;
    }
    good.push(insight("good", text, "budgets", month));
  }

  const spendingChange = changeFrom(snapshot.totalSpending, snapshot.previousTotal);
  if (spendingChange && spendingChange.pct > 0) {
    bad.push(
      insight(
        "bad",
        `Home and business spending is ${formatMoney(snapshot.totalSpending)}, up ${spendingChange.pct}% from last month (${formatMoney(snapshot.previousTotal)}).`,
        "expenses",
        month,
        snapshot.homeSpending - snapshot.previousHome >= snapshot.businessExpenses - snapshot.previousBusinessExpenses
          ? "home"
          : "business"
      )
    );
  } else if (spendingChange && spendingChange.pct < 0) {
    good.push(
      insight(
        "good",
        `Home and business spending is ${formatMoney(snapshot.totalSpending)}, down ${Math.abs(spendingChange.pct)}% from last month (${formatMoney(snapshot.previousTotal)}).`,
        "expenses",
        month
      )
    );
  }

  snapshot.categories.forEach((row) => {
    const change = changeFrom(row.amount, row.previousAmount);
    if (!change || change.pct === 0) return;
    const higher = change.pct > 0;
    const text = `Spending on ${row.category} is ${Math.abs(change.pct)}% ${higher ? "higher" : "lower"} than last month, ${formatMoney(row.amount)} compared with ${formatMoney(row.previousAmount)}.`;
    const card = insight(higher ? "bad" : "good", text, "expenses", month, row.space);
    if (higher) bad.push(card);
    else good.push(card);
  });

  if (snapshot.overdueCount > 0) {
    const count = snapshot.overdueCount;
    bad.push(
      insight(
        "bad",
        `${count} overdue ${count === 1 ? "bill" : "bills"}, ${formatMoney(snapshot.overdueTotal)} still to pay.`,
        "alerts",
        month
      )
    );
  }

  if (snapshot.unpaidOrders > 0) {
    bad.push(
      insight("bad", `Unpaid order balances are ${formatMoney(snapshot.unpaidOrders)}.`, "orders", month)
    );
  }
  if (snapshot.looseUnpaid > 0) {
    bad.push(insight("bad", `Unpaid balances are ${formatMoney(snapshot.looseUnpaid)}.`, "orders", month));
  }

  if (snapshot.lateKnown && snapshot.lateCount > 0) {
    const count = snapshot.lateCount;
    bad.push(insight("bad", `${count} ${count === 1 ? "order is" : "orders are"} late.`, "orders", month));
  }

  return { good, bad };
}

export function ruleSummary(snapshot) {
  const insights = buildInsights(snapshot);
  const year = snapshot.month.slice(0, 4);
  const parts = [
    `In ${monthName(snapshot.month)} ${year}, earned income is ${formatMoney(snapshot.income)}.`,
    `Business expenses are ${formatMoney(snapshot.businessExpenses)}, so profit is ${formatMoney(snapshot.profit)}.`,
    `Home and business spending together is ${formatMoney(snapshot.totalSpending)}.`,
    ...insights.good.map((item) => item.text),
    ...insights.bad.map((item) => item.text),
    `Pending approvals: ${snapshot.pendingApprovals}. Open alerts: ${snapshot.openAlerts}.`,
  ];
  return parts.join(" ");
}

export function summaryPayload(snapshot) {
  const totals = {
    month: snapshot.month,
    income: snapshot.income,
    businessExpenses: snapshot.businessExpenses,
    homeSpending: snapshot.homeSpending,
    totalSpending: snapshot.totalSpending,
    profit: snapshot.profit,
    previousIncome: snapshot.previousIncome,
    previousBusinessExpenses: snapshot.previousBusinessExpenses,
    previousHomeSpending: snapshot.previousHome,
    previousTotalSpending: snapshot.previousTotal,
    previousProfit: snapshot.previousProfit,
    cashReceived: snapshot.cashReceived,
    customerAdvances: snapshot.advances,
    ordersFulfilled: snapshot.fulfilledOrders,
    salesPaidInFull: snapshot.fulfilledSales,
    unpaidOrderBalances: snapshot.unpaidOrders,
    unpaidSaleBalances: snapshot.looseUnpaid,
    overdueBillCount: snapshot.overdueCount,
    overdueBillTotal: snapshot.overdueTotal,
    pendingApprovals: snapshot.pendingApprovals,
    savedOpenAlerts: snapshot.savedAlerts,
    dashboardWarnings: snapshot.warnings,
    openAlerts: snapshot.openAlerts,
    categories: snapshot.categories.map((row) => ({
      space: row.space,
      category: row.category,
      amount: row.amount,
      previousAmount: row.previousAmount,
    })),
  };
  if (snapshot.hasBudget) totals.homeBudget = snapshot.budget;
  if (snapshot.savingsSaved > 0 || snapshot.savingsTarget > 0) {
    totals.savingsSaved = snapshot.savingsSaved;
    if (snapshot.savingsTarget > 0) totals.savingsTarget = snapshot.savingsTarget;
  }
  snapshot.categoryBudgets.forEach((row) => {
    totals.categories.push({
      space: "home",
      category: row.category,
      amount: row.spent,
      budget: row.limit,
    });
  });
  if (snapshot.lateKnown) totals.lateOrders = snapshot.lateCount;
  return totals;
}

export function readAiEndpoint(settings) {
  const rows = Array.isArray(settings) ? settings : settings ? [settings] : [];
  for (const row of rows) {
    const found = endpointOn(row);
    if (found) return found;
  }
  return "";
}

export async function explainMonth(snapshot, fetcher = globalThis.fetch) {
  const rules = ruleSummary(snapshot);
  const endpoint = httpUrl(snapshot.aiEndpoint);
  if (!endpoint || typeof fetcher !== "function") return { text: rules, source: "rules" };
  try {
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ totals: summaryPayload(snapshot) }),
    });
    if (!response || !response.ok) {
      return { text: rules, source: "rules", note: "The explanation service did not reply, so this is the on-device summary." };
    }
    const body = await response.text();
    const reply = replyText(body);
    if (!reply) {
      return { text: rules, source: "rules", note: "The explanation service did not reply, so this is the on-device summary." };
    }
    return { text: reply, source: "endpoint" };
  } catch {
    return { text: rules, source: "rules", note: "The explanation service did not reply, so this is the on-device summary." };
  }
}

function insight(type, text, screen, month, space, category) {
  return { type, text, screen, month, space: space || "", category: category || "" };
}

function previousMonth(month) {
  const [year, mon] = String(month).split("-").map(Number);
  const date = new Date(year, mon - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function inMonth(date, month) {
  return typeof date === "string" && date.slice(0, 7) === month;
}

function budgetFor(budgets, month) {
  if (!budgets || typeof budgets !== "object" || Array.isArray(budgets)) return null;
  const amount = budgets[month];
  if (typeof amount === "number" && amount > 0) return roundMoney(amount);
  return null;
}

function categoryLimits(limits, month, home) {
  const monthLimits = limits && typeof limits === "object" ? limits[month] : null;
  if (!monthLimits || typeof monthLimits !== "object" || Array.isArray(monthLimits)) return [];
  const spent = categoryTotals(home, month);
  return Object.entries(monthLimits)
    .map(([category, limit]) => ({
      category,
      limit: roundMoney(limit),
      spent: spent.get(category) || 0,
    }))
    .filter((row) => row.category && row.limit > 0);
}

function mergeBudgetLimits(data, month, home, business) {
  const fromScreen = [];
  const seen = new Set();
  (Array.isArray(data.budgetRows) ? data.budgetRows : []).forEach((row) => {
    if (!row || row.month !== month || typeof row.category !== "string") return;
    const limit = roundMoney(Number(row.limit));
    if (!(limit > 0) || seen.has(row.category)) return;
    seen.add(row.category);
    fromScreen.push({
      category: row.category,
      limit,
      spent: spentForLimit(row.category, month, home, business),
    });
  });
  categoryLimits(data.categoryBudgets, month, home).forEach((row) => {
    if (seen.has(row.category)) return;
    fromScreen.push(row);
  });
  return fromScreen;
}

function spentForLimit(category, month, home, business) {
  const rows = [...(home || []), ...(business || [])];
  return roundMoney(
    rows.reduce((sum, expense) => {
      if (!expense || !inMonth(expense.date, month)) return sum;
      if (category !== "Total" && expense.category !== category) return sum;
      return sum + (Number(expense.amount) || 0);
    }, 0)
  );
}

function categoryComparisons(home, business, month, previous) {
  const rows = [];
  const add = (space, current, prior) => {
    const names = new Set([...current.keys(), ...prior.keys()]);
    names.forEach((category) => {
      rows.push({
        space,
        category,
        amount: current.get(category) || 0,
        previousAmount: prior.get(category) || 0,
      });
    });
  };
  add("home", categoryTotals(home, month), categoryTotals(home, previous));
  add("business", categoryTotals(business, month), categoryTotals(business, previous));
  return rows;
}

function categoryTotals(expenses, month) {
  const totals = new Map();
  (expenses || []).forEach((expense) => {
    if (!expense || !inMonth(expense.date, month)) return;
    const name = typeof expense.category === "string" && expense.category ? expense.category : "Other";
    const amount = roundMoney(Number(expense.amount) || 0);
    totals.set(name, roundMoney((totals.get(name) || 0) + amount));
  });
  return totals;
}

function summarizeOrders(orders, month, todayValue) {
  let fulfilled = 0;
  let late = 0;
  let unpaidTotal = 0;
  let unpaidCount = 0;
  orders.forEach((order) => {
    if (order.status === "Cancelled") return;
    const delivery = typeof order.deliveryDate === "string" ? order.deliveryDate : "";
    const dated = /^\d{4}-\d{2}-\d{2}$/.test(delivery);
    if (order.status === "Fulfilled" && dated && delivery.slice(0, 7) === month) fulfilled += 1;
    if (dated && delivery < todayValue && order.status !== "Fulfilled") late += 1;
    let balance = 0;
    try {
      balance = balanceOf(order);
    } catch {
      balance = 0;
    }
    if (balance > 0) {
      unpaidCount += 1;
      unpaidTotal = roundMoney(unpaidTotal + balance);
    }
  });
  return { fulfilled, late, unpaidTotal, unpaidCount };
}

function warningCount({ overdue, upcoming, hasBudget, homeSpending, budget, profit }) {
  let count = 0;
  if (overdue > 0) count += 1;
  if (upcoming > 0) count += 1;
  if (hasBudget && (homeSpending / budget) * 100 > 80) count += 1;
  if (profit < 0) count += 1;
  return count;
}

function countOpenAlerts(records, todayValue) {
  const seen = new Set();
  let count = 0;
  (records || []).forEach((alert) => {
    if (!alert || typeof alert !== "object") return;
    const status = String(alert.status || "open").toLowerCase();
    if (CLOSED.has(status)) return;
    if (status === "snoozed" || status === "ignored") {
      const until = typeof alert.snoozeUntil === "string" ? alert.snoozeUntil : "";
      if (until > todayValue) return;
    }
    const id = String(alert.key || alert.id || "");
    if (id) {
      if (seen.has(id)) return;
      seen.add(id);
    }
    count += 1;
  });
  return count;
}

function countWaiting(records) {
  const seen = new Set();
  let count = 0;
  (records || []).forEach((item) => {
    if (!item || typeof item !== "object") return;
    const status = String(item.status || "waiting").toLowerCase();
    if (CLOSED.has(status)) return;
    const id = String(item.id || "");
    if (id) {
      if (seen.has(id)) return;
      seen.add(id);
    }
    count += 1;
  });
  return count;
}

function changeFrom(current, previous) {
  const pct = percentChange(current, previous);
  if (pct == null || pct === 0) return null;
  return { pct };
}

function moneyChange(label, current, previous, change) {
  const direction = change.pct > 0 ? "up" : "down";
  return `${label} is ${formatMoney(current)}, ${direction} ${Math.abs(change.pct)}% from last month (${formatMoney(previous)}).`;
}

function profitText(current, previous, change) {
  if (change && previous > 0) {
    const direction = change.pct > 0 ? "up" : "down";
    return `Profit this month is ${formatMoney(current)}, ${direction} ${Math.abs(change.pct)}% from last month (${formatMoney(previous)}).`;
  }
  if (previous < 0) {
    return `Profit this month is ${formatMoney(current)}. Last month profit was ${formatMoney(previous)}.`;
  }
  return `Profit this month is ${formatMoney(current)}.`;
}

function httpUrl(value) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function endpointOn(row) {
  if (!row || typeof row !== "object") return "";
  const id = String(row.id || row.key || row.name || "");
  if (/^(aiEndpoint|explainEndpoint)$/i.test(id)) return httpUrl(row.value);
  return httpUrl(row.aiEndpoint) || httpUrl(row.explainEndpoint) || httpUrl(row.ai && row.ai.endpoint);
}

function replyText(body) {
  const trimmed = String(body || "").trim();
  if (!trimmed) return "";
  try {
    const data = JSON.parse(trimmed);
    if (typeof data === "string") return data.trim();
    if (data && typeof data === "object") {
      const value = data.summary || data.text || data.reply || data.message;
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return "";
  } catch {
    return trimmed;
  }
}
