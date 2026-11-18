const registry = new Map();
let onChange = () => {};
let current = { name: "home", params: {} };

export function registerScreen(name, screen) {
  registry.set(name, screen || {});
}

export function onRoute(listener) {
  onChange = listener;
}

export function currentScreen() {
  return { name: current.name, params: { ...current.params } };
}

export function screenNames() {
  return [...registry.keys()];
}

export function ensureScreen(name) {
  const root = document.getElementById("screen-root");
  let screen = root.querySelector(`[data-screen="${name}"]`);
  if (!screen) {
    screen = document.createElement("div");
    screen.className = "screen";
    screen.dataset.screen = name;
    screen.hidden = true;
    root.append(screen);
  }
  return screen;
}

function buildHash(name, params) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value == null || value === "") return;
    query.set(key, String(value));
  });
  const search = query.toString();
  return search ? `#${name}?${search}` : `#${name}`;
}

function parseHash(hash) {
  const raw = String(hash || "").replace(/^#/, "");
  if (!raw) return { name: "home", params: {} };
  const [name, query = ""] = raw.split("?");
  const params = {};
  new URLSearchParams(query).forEach((value, key) => {
    params[key] = value;
  });
  if (!registry.has(name)) return { name: "home", params: {} };
  return { name, params };
}

function show(name, params) {
  current = { name, params: { ...params } };
  document.querySelectorAll("#screen-root [data-screen]").forEach((screen) => {
    screen.hidden = screen.dataset.screen !== name;
  });
  const entry = registry.get(name);
  if (entry && typeof entry.show === "function") entry.show(params);
  onChange(name, params);
}

export function goTo(screenName, params = {}, options = {}) {
  if (!registry.has(screenName)) return;
  show(screenName, params);
  const next = buildHash(screenName, params);
  if (location.hash === next) return;
  const url = `${location.pathname}${location.search}${next}`;
  if (options.replace) history.replaceState({ screenName, params }, "", url);
  else history.pushState({ screenName, params }, "", url);
}

if (typeof window !== "undefined") window.goTo = goTo;

let started = false;

export function startRouter() {
  if (started) {
    const route = parseHash(location.hash);
    show(route.name, route.params);
    return;
  }
  started = true;
  window.addEventListener("popstate", () => {
    const route = parseHash(location.hash);
    show(route.name, route.params);
  });
  const route = parseHash(location.hash);
  goTo(route.name, route.params, { replace: true });
}

export function initRouter() {
  startRouter();
}
