import assert from "node:assert/strict";
import { parseBill } from "../js/bill-parse.js";
import { billAlertPlans, duplicateBillScan, matchChecklistTemplate } from "../js/bill-book.js";

const electric = parseBill(`
LESCO
Lahore Electric Supply Company
Consumer Number: 12345678901234
Billing Month: OCT-2026
Issue Date: 01-NOV-26
Reading Date: 30-OCT-26
Due Date: 15-NOV-26
Units Consumed: 240
Amount Payable Within Due Date: Rs 8,450.00
Amount Payable After Due Date: Rs 8,890.50
`);

assert.equal(electric.billType, "electricity");
assert.equal(electric.company, "LESCO");
assert.equal(electric.consumerNumber, "12345678901234");
assert.equal(electric.billingMonth, "2026-10");
assert.equal(electric.dueDate, "2026-11-15");
assert.equal(electric.amountWithin, 8450);
assert.equal(electric.amountAfter, 8890.5);
assert.equal(electric.units, "240");
assert.equal(electric.otherDates.some((item) => item.date === "2026-11-01"), true);
assert.equal(electric.otherDates.some((item) => item.date === "2026-10-30"), true);

const gas = parseBill(`
SNGPL
Sui Northern Gas Pipelines
Account No 99887766
Bill Month November 2026
Due Date 20/11/2026
Payable within due date Rs 3,200
Payable after due date Rs 3,450
`);
assert.equal(gas.billType, "gas");
assert.equal(gas.company, "SNGPL");
assert.equal(gas.consumerNumber, "99887766");
assert.equal(gas.billingMonth, "2026-11");
assert.equal(gas.dueDate, "2026-11-20");
assert.equal(gas.amountWithin, 3200);
assert.equal(gas.amountAfter, 3450);

const phone = parseBill(`
Jazz
Mobile Bill
Reference Number 03001234567
Billing Month Nov 2026
Payable by 05 Dec 2026
Amount Payable Within Due Date PKR 1,500
`);
assert.equal(phone.billType, "mobile");
assert.equal(phone.company, "Jazz");
assert.equal(phone.consumerNumber, "03001234567");
assert.equal(phone.billingMonth, "2026-11");
assert.equal(phone.dueDate, "2026-12-05");
assert.equal(phone.amountWithin, 1500);
assert.equal(phone.amountAfter, null);

const internet = parseBill(`
PTCL
Consumer ID 44556677
Billing Month: 11/2026
Issue Date: 01 Nov 2026
Due Date: 15 Nov 2026
Amount payable within due date: 4,100
`);
assert.equal(internet.billType, "internet");
assert.equal(internet.company, "PTCL");
assert.equal(internet.dueDate, "2026-11-15");
assert.equal(internet.amountWithin, 4100);
assert.equal(internet.otherDates[0].date, "2026-11-01");

const missing = parseBill(`
WASA
Account Number 5551234
Billing Month Oct 2026
Issue Date 01-11-2026
Amount 2000
`);
assert.equal(missing.billType, "water");
assert.equal(missing.dueDate, "");
assert.equal(missing.amountWithin, null);
assert.equal(missing.amountAfter, null);
assert.equal(missing.otherDates[0].date, "2026-11-01");

const blank = parseBill("");
assert.equal(blank.dueDate, "");
assert.equal(blank.amountWithin, null);
assert.equal(blank.company, "");

const urdu = parseBill("GEPCO\nآخری تاریخ 18-NOV-26\nPayable within due date Rs 500");
assert.equal(urdu.dueDate, "2026-11-18");
assert.equal(urdu.amountWithin, 500);

const plans = billAlertPlans(
  [
    {
      id: "scan-1",
      paid: false,
      dueDate: "2026-11-18",
      company: "LESCO",
      amountWithin: 8450,
      amountAfter: 8890,
      checklistItemId: "row-1",
    },
  ],
  "2026-11-15"
);
assert.equal(plans.length, 1);
assert.equal(plans[0].id, "bill-scan:scan-1:soon");
assert.equal(plans[0].screen, "checklist");

const due = billAlertPlans(
  [{ id: "scan-1", paid: false, dueDate: "2026-11-18", company: "LESCO", amountWithin: 100, checklistItemId: "row-1" }],
  "2026-11-18"
);
assert.equal(due[0].id, "bill-scan:scan-1:due");

const late = billAlertPlans(
  [{ id: "scan-1", paid: false, dueDate: "2026-11-18", company: "LESCO", amountAfter: 120, checklistItemId: "row-1" }],
  "2026-11-19"
);
assert.equal(late[0].id, "bill-scan:scan-1:overdue");
assert.match(late[0].message, /120/);

const paid = billAlertPlans(
  [{ id: "scan-1", paid: true, dueDate: "2026-11-18", company: "LESCO", amountAfter: 120 }],
  "2026-11-19"
);
assert.equal(paid.length, 0);

assert.equal(matchChecklistTemplate([{ id: "t1", name: "LESCO" }], { company: "LESCO", consumerNumber: "" }), "t1");
assert.equal(duplicateBillScan("", "2026-10"), null);

console.log("bill parse tests passed");
