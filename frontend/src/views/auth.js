import { state, appConfig, setToken } from "../state.js";
import { api } from "../api.js";
import { toast } from "../utils.js";
import { setView } from "../router.js";
import { loadListings } from "./home.js";
import { loadFavorites } from "./favorites.js";
import { loadChatThreads } from "./chat.js";
import { updateMoreUI } from "./more.js";
import { connectRealtime, disconnectRealtime } from "../realtime.js";
import { ensurePushSubscription } from "../push.js";

export function openAuth() {
  const m = document.getElementById("modalAuth");
  if (m) m.hidden = false;
}
export function closeAuth() {
  const m = document.getElementById("modalAuth");
  if (m) m.hidden = true;
}

function loadRecaptchaScript(siteKey) {
  if (!siteKey || window.grecaptcha) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    s.async = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function getRecaptchaToken(action) {
  if (!appConfig.recaptchaSiteKey || !window.grecaptcha) return "";
  return new Promise((resolve) => {
    window.grecaptcha.ready(() => {
      window.grecaptcha
        .execute(appConfig.recaptchaSiteKey, { action: action || "submit" })
        .then(resolve)
        .catch(() => resolve(""));
    });
  });
}

export async function ensureRecaptcha() {
  if (!appConfig.recaptchaSiteKey) return;
  try {
    await loadRecaptchaScript(appConfig.recaptchaSiteKey);
  } catch {
    /* ignore */
  }
}

async function handleAuthSuccess(token, user, greeting) {
  setToken(token);
  state.user = user;
  closeAuth();
  updateMoreUI();
  if (greeting) toast(greeting);
  setView("home");
  loadListings();
  loadFavorites();
  loadChatThreads();
  connectRealtime();
  ensurePushSubscription();
}

async function handleGoogleCredential(credential) {
  try {
    const { token, user } = await api("/auth/google", {
      method: "POST",
      body: { credential },
    });
    handleAuthSuccess(token, user, `Добро пожаловать, ${user.email}`);
  } catch (err) {
    toast(err.message);
  }
}

export async function initGoogleSignIn() {
  if (!appConfig.googleClientId) return;
  const wrap = document.getElementById("authGoogleWrap");
  if (!wrap) return;
  wrap.hidden = false;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  if (!window.google?.accounts?.id) return;
  window.google.accounts.id.initialize({
    client_id: appConfig.googleClientId,
    callback: (res) => {
      if (res.credential) handleGoogleCredential(res.credential);
    },
  });
  const btn = document.getElementById("googleSignInBtn");
  if (btn) {
    window.google.accounts.id.renderButton(btn, {
      theme: "outline",
      size: "large",
      width: "100%",
      text: "continue_with",
      locale: "ru",
    });
  }
}

export function bindAuthForms() {
  document.querySelectorAll("[data-close-auth]").forEach((el) =>
    el.addEventListener("click", closeAuth)
  );
  document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".auth-tab").forEach((t) => t.classList.remove("is-active"));
      tab.classList.add("is-active");
      const mode = tab.getAttribute("data-auth");
      state.authMode = mode;
      document.getElementById("formLogin").hidden = mode !== "login";
      document.getElementById("formRegister").hidden = mode !== "register";
    });
  });
  const loginForm = document.getElementById("formLogin");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const recaptchaToken = await getRecaptchaToken("login");
        const { token, user } = await api("/auth/login", {
          method: "POST",
          body: {
            email: fd.get("email"),
            password: fd.get("password"),
            recaptchaToken,
          },
        });
        handleAuthSuccess(token, user, `Добро пожаловать, ${user.email}`);
      } catch (err) {
        toast(err.message);
      }
    });
  }
  const regForm = document.getElementById("formRegister");
  if (regForm) {
    regForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const recaptchaToken = await getRecaptchaToken("register");
        const { token, user } = await api("/auth/register", {
          method: "POST",
          body: {
            email: fd.get("email"),
            password: fd.get("password"),
            name: fd.get("name") || undefined,
            phone: fd.get("phone") || undefined,
            recaptchaToken,
          },
        });
        handleAuthSuccess(token, user, "Аккаунт создан");
      } catch (err) {
        toast(err.message);
      }
    });
  }
}

export function logout() {
  setToken(null);
  state.user = null;
  updateMoreUI();
  toast("Вы вышли");
  loadListings();
  loadFavorites();
  loadChatThreads();
  disconnectRealtime();
}
