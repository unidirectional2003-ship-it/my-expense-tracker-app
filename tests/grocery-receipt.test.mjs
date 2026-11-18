import assert from "node:assert/strict";
import { parseGroceryReceipt } from "../js/receipt-parse.js";
import { learnAlias, matchGroceryLine, totalsDisagree } from "../js/grocery-receipt.js";
import { seedCatalog } from "../js/grocery.js";

const catalog = seedCatalog();

const imtiaz = `IMTIAZ SUPER MARKET
12 Nov 2026
Shan Biryani Masala 50g  2  85.00  170.00
Surf Excel 1kg  1  450.00  450.00
Atta 5kg  1  220.00  220.00
Grand Total Rs 840.00`;

const alfatah = `AL-FATAH
03/11/2026
Chawal 5kg          900
Cooking oil 1ltr    2 x 540 = 1080
Doodh 1ltr          250
Total Rs 2500`;

const naheed = `NAHEED SUPERMARKET
16-11-2026
Haldi 100g     80
Lal mirch      2    60    120
Cheeni 1kg     150
Total Rs 350`;

function names(parsed) {
  return parsed.items.map((item) => item.name);
}

const first = parseGroceryReceipt(imtiaz, 88);
assert.equal(first.readable, true);
assert.equal(first.merchant, "IMTIAZ SUPER MARKET");
assert.equal(first.date, "2026-11-12");
assert.equal(first.total, 840);
assert.deepEqual(names(first), ["Shan Biryani Masala", "Surf Excel", "Atta"]);
assert.equal(first.items[0].qty, 2);
assert.equal(first.items[0].unitPrice, 85);
assert.equal(first.items[0].lineTotal, 170);
assert.equal(matchGroceryLine(first.items[0].ocrName, catalog, []).item.name, "Biryani masala");
assert.equal(matchGroceryLine(first.items[1].ocrName, catalog, []).item.name, "Surf (detergent)");
assert.equal(matchGroceryLine(first.items[2].ocrName, catalog, []).item.name, "Atta");
assert.equal(totalsDisagree(840, first.total), false);

const second = parseGroceryReceipt(alfatah, 80);
assert.equal(second.merchant, "AL-FATAH");
assert.equal(second.date, "2026-11-03");
assert.equal(second.total, 2500);
assert.equal(second.items[0].name, "Chawal");
assert.equal(second.items[0].qty, 1);
assert.equal(second.items[0].unitPrice, 900);
assert.equal(second.items[1].name, "Cooking oil");
assert.equal(second.items[1].qty, 2);
assert.equal(second.items[1].unitPrice, 540);
assert.equal(second.items[1].lineTotal, 1080);
assert.equal(second.items[2].name, "Doodh");
assert.equal(matchGroceryLine("Chawal 5kg", catalog, []).item.name, "Chawal");
assert.equal(matchGroceryLine(second.items[1].ocrName, catalog, []).item.name, "Cooking oil");
const sum = second.items.reduce((total, item) => total + item.lineTotal, 0);
assert.equal(totalsDisagree(sum, second.total), true);

const third = parseGroceryReceipt(naheed, 76);
assert.equal(third.date, "2026-11-16");
assert.equal(third.total, 350);
assert.deepEqual(names(third), ["Haldi", "Lal mirch", "Cheeni"]);
assert.equal(third.items[1].qty, 2);
assert.equal(third.items[1].unitPrice, 60);
assert.equal(third.items[1].lineTotal, 120);
assert.equal(matchGroceryLine(third.items[0].ocrName, catalog, []).item.name, "Haldi");
assert.equal(matchGroceryLine(third.items[1].ocrName, catalog, []).item.name, "Lal mirch");
assert.equal(matchGroceryLine(third.items[2].ocrName, catalog, []).item.name, "Cheeni");

const blurry = parseGroceryReceipt("||||\n@#$%\n", 12);
assert.equal(blurry.readable, false);
assert.equal(parseGroceryReceipt("", 0).readable, false);

const lowLine = parseGroceryReceipt(imtiaz, 90, [{ text: "Shan Biryani Masala 50g  2  85.00  170.00", confidence: 40 }]);
assert.equal(lowLine.items[0].unsure, true);
assert.equal(lowLine.items[1].unsure, false);

let aliases = [];
assert.equal(matchGroceryLine("Blue powder 1kg", catalog, aliases), null);
const surf = catalog.items.find((item) => item.name === "Surf (detergent)");
aliases = learnAlias(aliases, "Blue powder 1kg", surf.id);
assert.equal(matchGroceryLine("Blue powder 1kg", catalog, aliases).item.name, "Surf (detergent)");
assert.equal(matchGroceryLine("Blue powder 1kg", catalog, aliases).via, "alias");

console.log("grocery receipt tests passed");
