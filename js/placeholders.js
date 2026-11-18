import { ensureScreen, registerScreen } from "./router.js";

const PLACEHOLDERS = [
  ["expenses", "Expenses"],
  ["groceries", "Groceries"],
  ["beauty", "Beauty"],
  ["clothing", "Clothing"],
  ["approvals", "Pending Approvals"],
  ["reports", "Reports"],
  ["settings", "Settings"],
];

function comingSoon(title) {
  const app = document.createElement("div");
  app.className = "screen-sheet";

  const intro = document.createElement("header");
  intro.className = "intro";
  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = title;
  const heading = document.createElement("h1");
  heading.textContent = title;
  intro.append(eyebrow, heading);

  const sheet = document.createElement("div");
  sheet.className = "sheet";
  const message = document.createElement("p");
  message.className = "empty";
  message.textContent = "Coming soon";
  sheet.append(message);

  app.append(intro, sheet);
  return app;
}

export function registerPlaceholders() {
  PLACEHOLDERS.forEach(([name, title]) => {
    const screen = ensureScreen(name);
    screen.replaceChildren(comingSoon(title));
    registerScreen(name, { show() {} });
  });
}
