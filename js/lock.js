import {
  STORAGE_KEY,
  SALES_KEY,
  SAVINGS_KEY,
  HOME_BUDGET_KEY,
  BUDGET_KEY,
  BILLS_KEY,
  RECEIPTS_KEY,
  CHECKLIST_KEY,
} from "./store.js";

const LOCK_KEY = "expense-app-lock";
const LEFT_KEY = "expense-app-left-at";
const ITERATIONS = 150000;
const MAX_FAILS = 5;
const WAIT_MS = 30000;
const TIMEOUTS = [0, 1, 2, 5];
const DATA_KEYS = [
  STORAGE_KEY,
  SALES_KEY,
  SAVINGS_KEY,
  BUDGET_KEY,
  HOME_BUDGET_KEY,
  BILLS_KEY,
  RECEIPTS_KEY,
  CHECKLIST_KEY,
  "category-budgets",
  "alerts",
  "grocery-catalog",
  "grocery-template",
  "grocery-lists",
  "tracker-db",
  "tracker-db-previous",
  "tracker-db-unreadable",
  "bill-scans",
];

let unlocked = false;
let busy = false;
let platformOk = false;
let waitTimer = 0;
let pendingBackup = null;
let hooks = { onUnlock() {}, onLock() {} };

export function bootLock(nextHooks) {
  hooks = nextHooks;
  bindSettings();
  bindLockScreen();
  watchBackground();
  const record = readRecord();
  if (!record) showSetup();
  else showUnlock();
  platformAvailable().then((ok) => {
    platformOk = ok;
    syncBiometricControl();
    syncUnlockButton();
  });
}

function $(id) {
  return document.getElementById(id);
}

function readRecord() {
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.hash !== "string" || typeof parsed.salt !== "string") return null;
    if (!TIMEOUTS.includes(parsed.timeoutMin)) parsed.timeoutMin = 2;
    if (typeof parsed.fails !== "number") parsed.fails = 0;
    if (typeof parsed.lockedUntil !== "number") parsed.lockedUntil = 0;
    const hasCredential = typeof parsed.credentialId === "string" && parsed.credentialId.length > 0;
    parsed.biometric = Boolean(parsed.biometric) && hasCredential;
    return parsed;
  } catch {
    return null;
  }
}

function saveRecord(record) {
  localStorage.setItem(LOCK_KEY, JSON.stringify(record));
}

function timeoutMinutes(record) {
  return record && TIMEOUTS.includes(record.timeoutMin) ? record.timeoutMin : 2;
}

async function hashPassword(password, saltBytes, iterations) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations, hash: "SHA-256" },
    material,
    256
  );
  return new Uint8Array(bits);
}

function sameBytes(left, right) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

function bytesToBase64(bytes) {
  let text = "";
  bytes.forEach((byte) => {
    text += String.fromCharCode(byte);
  });
  return btoa(text);
}

function base64ToBytes(value) {
  const text = atob(value);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
  return bytes;
}

async function createSecret(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPassword(password, salt, ITERATIONS);
  return { salt: bytesToBase64(salt), hash: bytesToBase64(hash), iterations: ITERATIONS };
}

async function passwordMatches(password, record) {
  const salt = base64ToBytes(record.salt);
  const expected = base64ToBytes(record.hash);
  const actual = await hashPassword(password, salt, record.iterations || ITERATIONS);
  return sameBytes(actual, expected);
}

function passwordProblem(password, confirm) {
  if (password.length < 6) return "Use at least 6 characters.";
  if (password !== confirm) return "Those passwords do not match.";
  return "";
}

function setLocked(locked) {
  document.body.classList.toggle("is-locked", locked);
  document.querySelectorAll(".topbar, .tabbar").forEach((el) => {
    el.inert = locked;
  });
}

function showError(id, message) {
  const el = $(id);
  el.hidden = !message;
  el.textContent = message;
}

function clearWaitTimer() {
  if (waitTimer) window.clearInterval(waitTimer);
  waitTimer = 0;
}

function showSetup() {
  unlocked = false;
  hooks.onLock();
  pendingBackup = null;
  $("lock-screen").hidden = false;
  setLocked(true);
  $("lock-title").textContent = "Create a password";
  $("lock-help").textContent =
    "Pick a password you can remember. You will need it each time you open the app. If you forget it, the data on this device is erased unless you have an exported backup.";
  $("setup-form").hidden = false;
  $("unlock-form").hidden = true;
  $("forgot-form").hidden = true;
  showError("setup-error", "");
  $("setup-password").value = "";
  $("setup-confirm").value = "";
  $("setup-submit").disabled = false;
  clearWaitTimer();
  $("setup-password").focus();
}

function showUnlock() {
  unlocked = false;
  hooks.onLock();
  closeSettings();
  $("lock-screen").hidden = false;
  setLocked(true);
  $("lock-title").textContent = "App locked";
  $("lock-help").textContent = "Enter your password to open the app.";
  $("setup-form").hidden = true;
  $("unlock-form").hidden = false;
  $("forgot-form").hidden = true;
  $("unlock-password").value = "";
  showError("unlock-error", "");
  syncUnlockButton();
  refreshWaitState();
  startWaitClock();
  if (!$("unlock-password").disabled) $("unlock-password").focus();
}

function showForgot() {
  $("lock-title").textContent = "Reset password";
  $("lock-help").textContent = "This does not open or show your data.";
  $("setup-form").hidden = true;
  $("unlock-form").hidden = true;
  $("forgot-form").hidden = false;
  $("forgot-phrase").value = "";
  showError("forgot-error", "");
  $("forgot-phrase").focus();
}

function finishUnlock() {
  unlocked = true;
  clearWaitTimer();
  sessionStorage.removeItem(LEFT_KEY);
  $("lock-screen").hidden = true;
  setLocked(false);
  $("setup-password").value = "";
  $("setup-confirm").value = "";
  $("unlock-password").value = "";
  hooks.onUnlock();
}

function cooldownRemaining(record) {
  if (!record || !record.lockedUntil) return 0;
  return Math.max(0, record.lockedUntil - Date.now());
}

let waitSecondsShown = -1;

function refreshWaitState() {
  const record = readRecord();
  const remaining = cooldownRemaining(record);
  const waiting = remaining > 0;
  $("unlock-password").disabled = waiting || busy;
  $("unlock-submit").disabled = waiting || busy;
  const bio = $("unlock-biometric");
  if (bio && !bio.hidden) bio.disabled = busy;
  if (waiting) {
    const seconds = Math.ceil(remaining / 1000);
    if (seconds !== waitSecondsShown) {
      waitSecondsShown = seconds;
      showError("unlock-error", `Too many tries. Wait ${seconds} ${seconds === 1 ? "second" : "seconds"}.`);
    }
    return;
  }
  waitSecondsShown = -1;
  if (record && record.lockedUntil) {
    record.lockedUntil = 0;
    record.fails = 0;
    saveRecord(record);
    if ($("unlock-error").textContent.startsWith("Too many tries")) showError("unlock-error", "");
  }
}

function startWaitClock() {
  clearWaitTimer();
  waitTimer = window.setInterval(refreshWaitState, 250);
}

function syncUnlockButton() {
  const record = readRecord();
  const button = $("unlock-biometric");
  const show = platformOk && record && record.biometric && record.credentialId;
  button.hidden = !show;
}

async function platformAvailable() {
  if (!window.isSecureContext || !window.PublicKeyCredential) return false;
  if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== "function") return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function syncBiometricControl() {
  const record = readRecord();
  $("biometric-unsupported").hidden = platformOk;
  $("biometric-row").hidden = !platformOk;
  $("biometric-toggle").checked = Boolean(platformOk && record && record.biometric);
  $("biometric-toggle").disabled = !record;
}

function bindLockScreen() {
  $("setup-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    const password = $("setup-password").value;
    const confirm = $("setup-confirm").value;
    const problem = passwordProblem(password, confirm);
    if (problem) {
      showError("setup-error", problem);
      return;
    }
    busy = true;
    $("setup-submit").disabled = true;
    try {
      const secret = await createSecret(password);
      const previous = readRecord();
      saveRecord({
        ...secret,
        timeoutMin: previous ? timeoutMinutes(previous) : 2,
        fails: 0,
        lockedUntil: 0,
        biometric: false,
        credentialId: "",
      });
      showError("setup-error", "");
      finishUnlock();
    } catch {
      showError("setup-error", "The password could not be saved in this browser.");
    } finally {
      busy = false;
      $("setup-submit").disabled = false;
    }
  });

  $("unlock-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    const record = readRecord();
    if (!record) {
      showSetup();
      return;
    }
    if (cooldownRemaining(record) > 0) {
      refreshWaitState();
      return;
    }
    const password = $("unlock-password").value;
    if (!password) {
      showError("unlock-error", "Enter your password.");
      return;
    }
    busy = true;
    $("unlock-submit").disabled = true;
    try {
      const matches = await passwordMatches(password, record);
      if (!matches) {
        record.fails += 1;
        if (record.fails >= MAX_FAILS) {
          record.fails = 0;
          record.lockedUntil = Date.now() + WAIT_MS;
          saveRecord(record);
          refreshWaitState();
        } else {
          const left = MAX_FAILS - record.fails;
          saveRecord(record);
          showError("unlock-error", `Wrong password. ${left} ${left === 1 ? "try" : "tries"} left.`);
        }
        $("unlock-password").value = "";
        return;
      }
      record.fails = 0;
      record.lockedUntil = 0;
      saveRecord(record);
      showError("unlock-error", "");
      finishUnlock();
    } catch {
      showError("unlock-error", "The password could not be checked. Try again.");
    } finally {
      busy = false;
      refreshWaitState();
    }
  });

  $("unlock-biometric").addEventListener("click", async () => {
    if (busy) return;
    const record = readRecord();
    if (!record || !record.biometric || !record.credentialId) return;
    busy = true;
    $("unlock-biometric").disabled = true;
    try {
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          timeout: 60000,
          userVerification: "required",
          allowCredentials: [
            {
              type: "public-key",
              id: base64ToBytes(record.credentialId),
              transports: ["internal"],
            },
          ],
        },
      });
      if (!credential) {
        showError("unlock-error", "Face ID was cancelled. Use your password.");
        return;
      }
      record.fails = 0;
      record.lockedUntil = 0;
      saveRecord(record);
      showError("unlock-error", "");
      finishUnlock();
    } catch (error) {
      const cancelled = error && (error.name === "NotAllowedError" || error.name === "AbortError");
      showError(
        "unlock-error",
        cancelled
          ? "Face ID was cancelled. Use your password."
          : "Face ID could not unlock this app. Use your password."
      );
    } finally {
      busy = false;
      refreshWaitState();
    }
  });

  $("forgot-open").addEventListener("click", showForgot);
  $("forgot-back").addEventListener("click", () => {
    if (readRecord()) showUnlock();
    else showSetup();
  });
  $("forgot-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if ($("forgot-phrase").value !== "ERASE") {
      showError("forgot-error", "Type ERASE to erase the data on this device.");
      return;
    }
    eraseDeviceData();
    showSetup();
  });
}

function eraseDeviceData() {
  DATA_KEYS.forEach((key) => localStorage.removeItem(key));
  localStorage.removeItem(LOCK_KEY);
  sessionStorage.removeItem(LEFT_KEY);
  pendingBackup = null;
}

function bindSettings() {
  $("open-settings").addEventListener("click", openSettings);
  $("settings-close").addEventListener("click", closeSettings);
  $("settings-backdrop").addEventListener("click", closeSettings);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("settings-modal").hidden) closeSettings();
  });

  $("change-password-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    const record = readRecord();
    if (!record) return;
    const current = $("current-password").value;
    const next = $("new-password").value;
    const confirm = $("confirm-password").value;
    showError("change-password-error", "");
    $("change-password-ok").hidden = true;
    const problem = passwordProblem(next, confirm);
    if (!current) {
      showError("change-password-error", "Enter your current password.");
      return;
    }
    if (problem) {
      showError("change-password-error", problem);
      return;
    }
    busy = true;
    try {
      const matches = await passwordMatches(current, record);
      if (!matches) {
        showError("change-password-error", "That current password is not right.");
        return;
      }
      const secret = await createSecret(next);
      saveRecord({
        ...record,
        ...secret,
        fails: 0,
        lockedUntil: 0,
      });
      $("current-password").value = "";
      $("new-password").value = "";
      $("confirm-password").value = "";
      $("change-password-ok").hidden = false;
      $("change-password-ok").textContent = "Password changed.";
    } catch {
      showError("change-password-error", "The password could not be changed.");
    } finally {
      busy = false;
    }
  });

  $("biometric-toggle").addEventListener("change", async () => {
    const toggle = $("biometric-toggle");
    const want = toggle.checked;
    const record = readRecord();
    showError("biometric-error", "");
    if (!record || !platformOk) {
      toggle.checked = false;
      return;
    }
    toggle.disabled = true;
    try {
      if (!want) {
        record.biometric = false;
        record.credentialId = "";
        saveRecord(record);
        syncUnlockButton();
        return;
      }
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { name: "My Expenses" },
          user: {
            id: crypto.getRandomValues(new Uint8Array(16)),
            name: "owner",
            displayName: "Owner",
          },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 },
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
            residentKey: "discouraged",
          },
          timeout: 60000,
          attestation: "none",
        },
      });
      if (!credential || credential.type !== "public-key") throw new Error("cancelled");
      if (credential.authenticatorAttachment && credential.authenticatorAttachment !== "platform") {
        throw new Error("not-platform");
      }
      record.biometric = true;
      record.credentialId = bytesToBase64(new Uint8Array(credential.rawId));
      saveRecord(record);
      syncUnlockButton();
    } catch (error) {
      toggle.checked = false;
      const cancelled = error && (error.name === "NotAllowedError" || error.name === "AbortError");
      showError(
        "biometric-error",
        cancelled
          ? "Face ID was cancelled. Password unlock is still on."
          : "Face ID could not be turned on. Password unlock is still on."
      );
    } finally {
      toggle.disabled = false;
    }
  });

  $("lock-timeout").addEventListener("change", () => {
    const record = readRecord();
    if (!record) return;
    const minutes = Number($("lock-timeout").value);
    record.timeoutMin = TIMEOUTS.includes(minutes) ? minutes : 2;
    saveRecord(record);
  });

  $("lock-now").addEventListener("click", () => {
    if (readRecord()) showUnlock();
  });

  $("export-backup").addEventListener("click", () => {
    clearBackupStatus();
    try {
      const payload = {
        app: "my-expense-tracker",
        version: 1,
        exportedAt: new Date().toISOString(),
        data: collectData(),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      const day = new Date().toISOString().slice(0, 10);
      link.href = URL.createObjectURL(blob);
      link.download = `my-expenses-backup-${day}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      $("backup-ok").hidden = false;
      $("backup-ok").textContent = "Backup downloaded.";
    } catch {
      showError("backup-error", "The backup could not be saved.");
    }
  });

  $("import-backup").addEventListener("change", async () => {
    clearBackupStatus();
    const file = $("import-backup").files && $("import-backup").files[0];
    $("import-backup").value = "";
    pendingBackup = null;
    $("import-confirm").hidden = true;
    if (!file) return;
    try {
      const text = await file.text();
      pendingBackup = parseBackup(text);
      $("import-confirm-text").textContent = `Replace the data on this device with ${file.name}? Your password does not change.`;
      $("import-confirm").hidden = false;
    } catch {
      showError("backup-error", "That file is not a backup from this app.");
    }
  });

  $("import-cancel").addEventListener("click", () => {
    pendingBackup = null;
    $("import-confirm").hidden = true;
  });

  $("import-replace").addEventListener("click", () => {
    if (!pendingBackup) return;
    try {
      writeData(pendingBackup);
      pendingBackup = null;
      $("import-confirm").hidden = true;
      $("backup-ok").hidden = false;
      $("backup-ok").textContent = "Backup imported.";
      if (unlocked) hooks.onUnlock();
    } catch {
      showError("backup-error", "The backup could not be imported.");
    }
  });
}

function clearBackupStatus() {
  showError("backup-error", "");
  $("backup-ok").hidden = true;
}

function collectData() {
  const data = {};
  DATA_KEYS.forEach((key) => {
    data[key] = localStorage.getItem(key);
  });
  return data;
}

function parseBackup(text) {
  const parsed = JSON.parse(text);
  if (
    !parsed ||
    parsed.app !== "my-expense-tracker" ||
    parsed.version !== 1 ||
    !parsed.data ||
    typeof parsed.data !== "object" ||
    Array.isArray(parsed.data)
  ) {
    throw new Error("format");
  }
  return parsed.data;
}

function writeData(data) {
  DATA_KEYS.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(data, key)) return;
    const value = data[key];
    if (value == null || value === "") localStorage.removeItem(key);
    else if (typeof value === "string") localStorage.setItem(key, value);
    else localStorage.setItem(key, JSON.stringify(value));
  });
}

function openSettings() {
  if (!unlocked) return;
  const record = readRecord();
  clearBackupStatus();
  pendingBackup = null;
  $("import-confirm").hidden = true;
  showError("change-password-error", "");
  showError("biometric-error", "");
  $("change-password-ok").hidden = true;
  $("current-password").value = "";
  $("new-password").value = "";
  $("confirm-password").value = "";
  $("lock-timeout").value = String(timeoutMinutes(record));
  syncBiometricControl();
  $("settings-modal").hidden = false;
  document.body.classList.add("settings-open");
  document.querySelector(".intro").inert = true;
  document.querySelector(".folder").inert = true;
  $("settings-close").focus();
}

function closeSettings() {
  $("settings-modal").hidden = true;
  document.body.classList.remove("settings-open");
  const intro = document.querySelector(".intro");
  const folder = document.querySelector(".folder");
  if (intro) intro.inert = false;
  if (folder) folder.inert = false;
}

function watchBackground() {
  const markLeft = () => {
    if (!unlocked) return;
    sessionStorage.setItem(LEFT_KEY, String(Date.now()));
  };
  const markBack = () => {
    if (!unlocked) return;
    const raw = sessionStorage.getItem(LEFT_KEY);
    sessionStorage.removeItem(LEFT_KEY);
    if (!raw) return;
    const record = readRecord();
    const minutes = timeoutMinutes(record);
    if (!(minutes > 0)) return;
    const elapsed = Date.now() - Number(raw);
    if (elapsed >= minutes * 60 * 1000) showUnlock();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") markLeft();
    else markBack();
  });
  window.addEventListener("pagehide", markLeft);
}
