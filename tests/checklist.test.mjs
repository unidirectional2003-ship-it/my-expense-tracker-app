import assert from "node:assert/strict";
import {
  emptyChecklist,
  ensureMonth,
  ensureMonthsThrough,
  payChecklistItem,
  updateTemplate,
  listOverdueChecklistItems,
  checklistProgress,
} from "../js/checklist-model.js";

let seq = 0;
const ids = () => {
  seq += 1;
  return `id-${seq}`;
};

const november = "2026-11";
const december = "2026-12";

const checklist = emptyChecklist(ids);
assert.equal(ensureMonth(checklist, november, ids), true);
assert.equal(checklist.months[november].length, 8);
assert.equal(checklist.months[november].every((item) => item.paid === false), true);
assert.deepEqual(
  checklist.months[november].map((item) => item.name),
  ["Electricity bill", "Gas bill", "Water bill", "Rent", "Grocery", "Internet", "Mobile bill", "Others"]
);

const electricity = checklist.months[november][0];
const payment = payChecklistItem(checklist, november, electricity.id, 3200, "expense-1");
assert.equal(payment.ok, true);
assert.equal(payment.expense.category, "Bills");
assert.equal(payment.expense.amount, 3200);
assert.equal(payment.expense.note, "Electricity bill");
assert.equal(electricity.paid, true);
assert.equal(electricity.paidAmount, 3200);
assert.equal(checklistProgress(checklist.months[november]).label, "1 of 8 done");

assert.equal(ensureMonth(checklist, december, ids), true);
assert.equal(checklist.months[december].every((item) => item.paid === false && item.paidAmount === 0), true);
assert.equal(checklist.months[december].length, 8);
assert.notEqual(checklist.months[december][0].id, electricity.id);

const rent = checklist.items.find((item) => item.name === "Rent");
updateTemplate(checklist, rent.id, { name: "House rent", dueDay: 3, expectedAmount: 45000, category: "Rent" }, december);
assert.equal(checklist.months[december].find((item) => item.templateId === rent.id).name, "House rent");
assert.equal(checklist.months[november].find((item) => item.templateId === rent.id).name, "Rent");
assert.equal(checklist.months[november][0].paid, true);

const overdue = listOverdueChecklistItems(checklist, "2026-11-19");
assert.equal(overdue.some((item) => item.name === "Electricity bill"), false);
assert.equal(overdue.some((item) => item.name === "Rent" && item.month === november), true);
assert.equal(overdue.some((item) => item.month === december), false);

const fresh = emptyChecklist(ids);
ensureMonth(fresh, "2026-10", ids);
fresh.months["2026-10"][0].paid = true;
assert.equal(ensureMonthsThrough(fresh, "2026-12", ids), true);
assert.equal(fresh.months["2026-11"].every((item) => item.paid === false), true);
assert.equal(fresh.months["2026-12"].every((item) => item.paid === false), true);
assert.equal(fresh.months["2026-10"][0].paid, true);

console.log("checklist tests passed");
