import { state, appConfig, setToken } from "../state.js";
import { api } from "../api.js";
import { toast } from "../utils.js";
import { t, getCurrentLang } from "../i18n.js";
import { setView } from "../router.js";
import { loadListings } from "./home.js";
import { loadFavorites } from "./favorites.js";
import { loadChatThreads } from "./chat.js";
import { updateMoreUI } from "./more.js";
import { connectRealtime, disconnectRealtime } from "../realtime.js";
import { ensurePushSubscription } from "../push.js";

let recaptchaV2WidgetId = null;

/** @param {"login"|"register"|"forgot"|"reset"|undefined} mode */
export function openAuth(mode) {
  const m = document.getElementById("modalAuth");
  if (m) {
    m.hidden = false;
    if (mode) showAuthForms(mode);
    else showAuthForms("login");
    if (appConfig.recaptchaSiteKey && isRecaptchaV2()) void mountRecaptchaV2();
  }
}

export function closeAuth() {
  const m = document.getElementById("modalAuth");
  if (m) m.hidden = true;
}

function isRecaptchaV2() {
  return (appConfig.recaptchaVersion || "v3").toLowerCase() === "v2";
}

function requireRecaptchaV2Token(token) {
  if (!appConfig.recaptchaSiteKey || !isRecaptchaV2()) return true;
  if (token && String(token).length > 0) return true;
  toast(t("auth.recaptcha.required", "Отметьте «Я не робот» и попробуйте снова."));
  return false;
}

function loadRecaptchaScriptV3(siteKey) {
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

function loadRecaptchaScriptV2() {
  if (!appConfig.recaptchaSiteKey || window.grecaptcha?.render) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cb = `__rc2_${Date.now()}`;
    window[cb] = () => resolve();
    const s = document.createElement("script");
    s.src = `https://www.google.com/recaptcha/api.js?onload=${cb}&render=explicit`;
    s.async = true;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function mountRecaptchaV2() {
  if (!isRecaptchaV2() || !appConfig.recaptchaSiteKey) return;
  const host = document.getElementById("recaptchaHost");
  if (!host) return;
  await loadRecaptchaScriptV2();
  await new Promise((resolve) => {
    const run = () => {
      if (recaptchaV2WidgetId !== null) {
        window.grecaptcha.reset(recaptchaV2WidgetId);
      } else {
        recaptchaV2WidgetId = window.grecaptcha.render(host, {
          sitekey: appConfig.recaptchaSiteKey,
          theme: document.body.getAttribute("data-theme") === "light" ? "light" : "dark",
        });
      }
      resolve();
    };
    if (window.grecaptcha?.ready) window.grecaptcha.ready(run);
    else setTimeout(run, 100);
  });
}

async function getRecaptchaToken(action) {
  if (!appConfig.recaptchaSiteKey) return "";
  if (isRecaptchaV2()) {
    await mountRecaptchaV2();
    return window.grecaptcha?.getResponse(recaptchaV2WidgetId) || "";
  }
  if (!window.grecaptcha) return "";
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
    if (isRecaptchaV2()) await loadRecaptchaScriptV2();
    else await loadRecaptchaScriptV3(appConfig.recaptchaSiteKey);
  } catch {
    /* ignore */
  }
}

function showAuthForms(mode) {
  state.authMode = mode;
  const ids = ["formLogin", "formRegister", "formForgot", "formReset"];
  const map = { login: "formLogin", register: "formRegister", forgot: "formForgot", reset: "formReset" };
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.hidden = id !== map[mode];
  });
  document.querySelectorAll(".auth-tab").forEach((t) => {
    const tabMode = t.getAttribute("data-auth");
    t.classList.toggle(
      "is-active",
      (mode === "login" && tabMode === "login") || (mode === "register" && tabMode === "register")
    );
  });
  const host = document.getElementById("recaptchaHost");
  if (host) {
    const needHost =
      isRecaptchaV2() &&
      appConfig.recaptchaSiteKey &&
      ["login", "register", "forgot", "reset"].includes(mode);
    host.hidden = !needHost;
  }
  if (isRecaptchaV2() && recaptchaV2WidgetId !== null && ["login", "register", "forgot", "reset"].includes(mode)) {
    window.grecaptcha?.reset(recaptchaV2WidgetId);
  }
}

function bindCalmToggle() {
  const calm = document.getElementById("authCalmToggle");
  if (!calm) return;
  const saved = localStorage.getItem("apartAuthCalm") === "1";
  calm.checked = saved;
  document.documentElement.classList.toggle("auth-calm", saved);
  calm.addEventListener("change", () => {
    const on = calm.checked;
    localStorage.setItem("apartAuthCalm", on ? "1" : "0");
    document.documentElement.classList.toggle("auth-calm", on);
  });
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
  const wrap = document.getElementById("authGoogleWrap");
  const hint = document.getElementById("authGoogleHint");
  const btnHost = document.getElementById("googleSignInBtn");
  if (!wrap) return;

  if (!appConfig.googleClientId) {
    wrap.hidden = false;
    if (hint) {
      hint.hidden = false;
      hint.textContent = t(
        "auth.google.setup",
        "Вход через Google: добавьте GOOGLE_CLIENT_ID в переменные окружения сервера и перезапустите API."
      );
    }
    if (btnHost) btnHost.innerHTML = "";
    return;
  }

  if (hint) hint.hidden = true;
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
    const localeMap = { ru: "ru", kg: "ky", en: "en", zh: "zh_CN" };
    const locale = localeMap[getCurrentLang()] || "ru";
    window.google.accounts.id.renderButton(btn, {
      theme: "outline",
      size: "large",
      width: "100%",
      text: "continue_with",
      locale,
    });
  }
}

function initFacebookLogin() {
  if (!appConfig.facebookAppId) return;
  const btn = document.getElementById("btnFacebookLogin");
  if (!btn || btn.dataset.fbBound === "1") return;
  btn.dataset.fbBound = "1";
  btn.hidden = false;
  btn.addEventListener("click", () => {
    if (!window.FB) {
      toast("Facebook SDK ещё загружается");
      return;
    }
    window.FB.login(
      async (resp) => {
        try {
          const tok = resp.authResponse?.accessToken;
          if (!tok) {
            toast("Не удалось получить доступ Facebook");
            return;
          }
          const { token, user } = await api("/auth/facebook", { method: "POST", body: { accessToken: tok } });
          handleAuthSuccess(token, user, `Добро пожаловать, ${user.email}`);
        } catch (e) {
          toast(e.message);
        }
      },
      { scope: "public_profile,email" }
    );
  });
}

/** Показать подсказку, если Facebook не настроен на сервере (без SDK). */
export function initFacebookAuthUI() {
  const hint = document.getElementById("authFacebookHint");
  const btn = document.getElementById("btnFacebookLogin");
  if (appConfig.facebookAppId) {
    if (hint) hint.hidden = true;
    return;
  }
  if (btn) btn.hidden = true;
  if (hint) {
    hint.hidden = false;
    hint.textContent = t(
      "auth.facebook.setup",
      "Вход через Facebook: задайте FACEBOOK_APP_ID и корректный CLIENT_ORIGIN (HTTPS) в настройках сервера, затем перезапустите API."
    );
  }
}

export async function initFacebookSdk() {
  if (!appConfig.facebookAppId || window.__fbSdkLoaded) return;
  window.__fbSdkLoaded = true;
  if (!document.getElementById("fb-root")) {
    const root = document.createElement("div");
    root.id = "fb-root";
    document.body.insertBefore(root, document.body.firstChild);
  }
  await new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      try {
        window.FB.init({
          appId: appConfig.facebookAppId,
          cookie: true,
          xfbml: false,
          version: "v19.0",
        });
        initFacebookLogin();
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/ru_RU/sdk.js";
    s.async = true;
    s.defer = true;
    s.crossOrigin = "anonymous";
    s.onerror = () => reject(new Error("Facebook SDK load error"));
    document.body.appendChild(s);
  });
}

export function bindAuthForms() {
  bindCalmToggle();

  document.querySelectorAll("[data-close-auth]").forEach((el) => el.addEventListener("click", closeAuth));

  document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const mode = tab.getAttribute("data-auth");
      if (mode === "login" || mode === "register") showAuthForms(mode);
    });
  });

  document.getElementById("linkForgotPassword")?.addEventListener("click", (e) => {
    e.preventDefault();
    showAuthForms("forgot");
  });
  document.getElementById("linkBackToLogin")?.addEventListener("click", (e) => {
    e.preventDefault();
    showAuthForms("login");
  });
  document.getElementById("linkBackToLoginFromReset")?.addEventListener("click", (e) => {
    e.preventDefault();
    showAuthForms("login");
  });

  const loginForm = document.getElementById("formLogin");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const recaptchaToken = await getRecaptchaToken("login");
        if (!requireRecaptchaV2Token(recaptchaToken)) return;
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
        if (!requireRecaptchaV2Token(recaptchaToken)) return;
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

  const forgotForm = document.getElementById("formForgot");
  if (forgotForm) {
    forgotForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const recaptchaToken = await getRecaptchaToken("forgot");
        if (!requireRecaptchaV2Token(recaptchaToken)) return;
        const r = await api("/auth/forgot-password", {
          method: "POST",
          body: { email: fd.get("email"), recaptchaToken },
        });
        toast(r.message || "Готово");
        showAuthForms("login");
      } catch (err) {
        toast(err.message);
      }
    });
  }

  const resetForm = document.getElementById("formReset");
  if (resetForm) {
    resetForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const recaptchaToken = await getRecaptchaToken("reset");
        if (!requireRecaptchaV2Token(recaptchaToken)) return;
        const r = await api("/auth/reset-password", {
          method: "POST",
          body: {
            token: fd.get("token"),
            password: fd.get("password"),
            recaptchaToken,
          },
        });
        toast(r.message || "Пароль обновлён");
        showAuthForms("login");
        const url = new URL(window.location.href);
        url.searchParams.delete("resetToken");
        window.history.replaceState({}, "", url.pathname + url.search);
      } catch (err) {
        toast(err.message);
      }
    });
  }

  showAuthForms("login");
}

export function openAuthResetFromUrl(token) {
  const input = document.querySelector('#formReset input[name="token"]');
  if (input) input.value = token;
  openAuth("reset");
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
