export function isReceiptImage(value) {
  return typeof value === "string" && value.startsWith("data:image/");
}

export function buildReceiptThumb(expense, spaceName) {
  if (!expense || !isReceiptImage(expense.receipt)) return null;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "receipt-thumb";
  button.dataset.viewReceipt = expense.id;
  button.dataset.receiptSpace = spaceName;
  if (expense.receiptId) button.dataset.receipt = expense.receiptId;
  const label = expense.note || expense.merchant || "this expense";
  button.setAttribute("aria-label", `View receipt for ${label}`);
  const image = document.createElement("img");
  image.src = expense.receipt;
  image.alt = "";
  button.append(image);
  return button;
}
