// Authentication: login / register / password recovery dialog, session state
// and the guest-backlog upload that runs right after a successful sign-in.

import { api } from "./api.js";
import { store } from "./store.js";
import { $, toast } from "./ui.js";
import { t, applyStatic } from "./i18n.js";

let authenticated = false;
let currentUser = null;
let mode = "login";
let pendingUser = null;
const listeners = new Set();

function setState(nextAuthenticated, nextUser) {
  authenticated = nextAuthenticated;
  currentUser = nextUser;
  const button = $("#auth-button");
  button.dataset.i18n = authenticated ? "header.signOut" : "header.signIn";
  button.textContent = t(button.dataset.i18n);
  button.classList.toggle("btn-primary", !authenticated);
  button.classList.toggle("btn-ghost", authenticated);
  listeners.forEach((fn) => fn(authenticated, currentUser));
}

async function syncBacklog() {
  if (!store.hasBacklog()) return;
  try {
    const result = await api.sync(store.backlog());
    store.clearBacklog();
    toast(t("sync.done", { n: result.imported }), "good");
  } catch (err) {
    toast(t("sync.failed", { msg: err.message }), "bad");
  }
}

export const auth = {
  isAuthenticated: () => authenticated,
  user: () => currentUser,
  // toggle signs out when signed in, otherwise opens the sign-in dialog.
  toggle: () => handleAuthAction(),
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  async init() {
    try {
      const me = await api.me();
      setState(Boolean(me.authenticated), me.user);
    } catch {
      setState(false, null);
    }
    wireDialog();
  },
};

async function handleAuthAction() {
  if (auth.isAuthenticated()) {
    await api.logout();
    setState(false, null);
    toast(t("signedOut"));
    return;
  }
  const dialog = $("#auth-dialog");
  const form = $("#auth-form");
  const codePanel = $("#auth-code-panel");
  $("#auth-error").textContent = "";
  form.classList.remove("hidden");
  codePanel.classList.add("hidden");
  setMode("login");
  dialog.showModal();
  $("#auth-username").focus();
}

function setMode(next) {
  mode = next;
  pendingUser = null;
  const dialog = $("#auth-dialog");
  const tabs = $("#auth-tabs");
  const recoveryField = $("#auth-recovery-field");
  const recoverLink = $("#auth-recover-link");
  const passwordLabel = $("#auth-password-label");
  const password = $("#auth-password");

  tabs.classList.toggle("hidden", mode === "recover");
  recoveryField.classList.toggle("hidden", mode !== "recover");
  recoverLink.classList.toggle("hidden", mode === "register");
  $("#auth-recovery").required = mode === "recover";

  if (mode === "recover") {
    $("#auth-title").dataset.i18n = "auth.recoverTitle";
    $("#auth-submit").dataset.i18n = "auth.submitRecover";
    recoverLink.dataset.i18n = "auth.backToLogin";
    passwordLabel.dataset.i18n = "auth.newPassword";
    password.autocomplete = "new-password";
  } else {
    $("#auth-title").dataset.i18n = mode === "register" ? "auth.registerTitle" : "auth.loginTitle";
    $("#auth-submit").dataset.i18n = mode === "register" ? "auth.submitRegister" : "auth.submitLogin";
    recoverLink.dataset.i18n = "auth.recoverLink";
    passwordLabel.dataset.i18n = "auth.password";
    password.autocomplete = mode === "register" ? "new-password" : "current-password";
  }
  applyStatic(dialog);
}

function showRecoveryPanel(code, user) {
  pendingUser = user;
  $("#auth-form").classList.add("hidden");
  $("#auth-code-panel").classList.remove("hidden");
  $("#auth-code-value").textContent = code;
  applyStatic($("#auth-dialog"));
}

function finishSignIn(user) {
  setState(true, user);
  syncBacklog();
}

function wireDialog() {
  const dialog = $("#auth-dialog");
  const form = $("#auth-form");
  const error = $("#auth-error");
  const submit = $("#auth-submit");
  const codePanel = $("#auth-code-panel");

  $("#auth-button").addEventListener("click", handleAuthAction);

  $("#auth-tabs").querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $("#auth-tabs").querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === tab));
      error.textContent = "";
      setMode(tab.dataset.mode);
    });
  });

  $("#auth-recover-link").addEventListener("click", () => {
    error.textContent = "";
    setMode(mode === "recover" ? "login" : "recover");
  });

  $("#auth-cancel").addEventListener("click", () => dialog.close());

  $("#auth-copy").addEventListener("click", async () => {
    const code = $("#auth-code-value").textContent;
    try {
      await navigator.clipboard.writeText(code);
      toast(t("auth.recoveryCopied"), "good");
    } catch {
      /* clipboard unavailable: the code is selectable anyway */
    }
  });

  $("#auth-continue").addEventListener("click", () => {
    const user = pendingUser;
    pendingUser = null;
    dialog.close();
    form.reset();
    form.classList.remove("hidden");
    codePanel.classList.add("hidden");
    if (user) finishSignIn(user);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    submit.disabled = true;
    try {
      const username = $("#auth-username").value.trim();
      const password = $("#auth-password").value;

      if (mode === "recover") {
        const res = await api.recover(username, $("#auth-recovery").value, password);
        showRecoveryPanel(res.recovery_code, res.user);
      } else if (mode === "register") {
        const res = await api.register(username, password);
        showRecoveryPanel(res.recovery_code, res.user);
      } else {
        const res = await api.login(username, password);
        dialog.close();
        form.reset();
        finishSignIn(res.user);
      }
    } catch (err) {
      error.textContent = err.message;
    } finally {
      submit.disabled = false;
    }
  });
}
