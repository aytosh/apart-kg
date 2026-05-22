import { state, setAppConfig, getCurrentCurrency, setCurrentCurrency } from "./state.js";
import { THEME_KEY } from "./constants.js";
import { applyTheme, toggleTheme } from "./utils.js";
import { api, refreshUser } from "./api.js";
import { setView, bindRouterEvents } from "./router.js";
import { loadListings, bindHomeFilters } from "./views/home.js";
import { loadFavorites } from "./views/favorites.js";
import { bindHomeSectionsActions } from "./views/homeSections.js";
import { bindAgenciesView } from "./views/agencies.js";
import { bindCallbackModal, bindCallbackButton, bindCallbackTabs } from "./views/callbacks.js";
import { bindDetailActions, closeDetail, openDetail } from "./views/detail.js";
import { bindChatEvents } from "./views/chat.js";
import {
  bindAuthForms,
  ensureRecaptcha,
  initGoogleSignIn,
  initFacebookSdk,
  initFacebookAuthUI,
  openAuth,
  closeAuth,
  openAuthResetFromUrl,
} from "./views/auth.js";
import { bindListingForm } from "./views/listingForm.js";
import { bindMoreView, updateMoreUI } from "./views/more.js";
import { bindTour } from "./views/tour.js";
import { bindViewing } from "./views/viewing.js";
import { bindNewbuilds } from "./views/newbuilds.js";
import { bindReservations } from "./views/reservations.js";
import { bindRoommate } from "./views/roommate.js";
import { bindBuilding } from "./views/building.js";
import { connectRealtime } from "./realtime.js";
import { refreshPushStatus } from "./push.js";
import { loadLanguage, getCurrentLang } from "./i18n.js";
import { track } from "./analytics.js";

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (
    location.protocol !== "https:" &&
    location.hostname !== "localhost" &&
    location.hostname !== "127.0.0.1"
  ) {
    return;
  }
  try {
    await navigator.serviceWorker.register("/sw.js");
  } catch (err) {
    console.warn("[sw] register failed", err?.message);
  }
}

async function loadAppConfig() {
  try {
    const cfg = await fetch("/api/config").then((r) => r.json());
    setAppConfig(cfg);
  } catch {
    /* ignore */
  }
}

function bindGlobalShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeDetail();
      closeAuth();
    }
  });
  document.getElementById("btnThemeToggle")?.addEventListener("click", toggleTheme);
}

function pickInitialLang() {
  const stored = localStorage.getItem("apartLang");
  if (stored && ["ru", "kg", "en", "zh"].includes(stored)) return stored;
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get("lang");
  if (fromUrl && ["ru", "kg", "en", "zh"].includes(fromUrl)) return fromUrl;
  const navLang = (navigator.language || "ru").toLowerCase();
  if (navLang.startsWith("zh")) return "zh";
  if (navLang.startsWith("ky")) return "kg";
  if (navLang.startsWith("en")) return "en";
  return "ru";
}

async function refreshCurrentViewAfterUiChange() {
  const home = await import("./views/home.js");
  const homeSections = await import("./views/homeSections.js");
  home.renderHomeList();
  if (state.view === "home" && homeSections.isHomeStreamMode()) {
    void homeSections.loadHomeSections();
  }
  if (state.view === "favorites") {
    await loadFavorites();
  }
  const modalDetail = document.getElementById("modalDetail");
  if (modalDetail && !modalDetail.hidden && state.detail?.id) {
    void openDetail(state.detail);
  }
}

function bindLangSwitcher() {
  const sel = document.getElementById("langSwitch");
  if (!sel) return;
  sel.value = getCurrentLang();
  sel.addEventListener("change", async () => {
    const lang = sel.value;
    localStorage.setItem("apartLang", lang);
    await loadLanguage(lang);
    const home = await import("./views/home.js");
    if (state.view === "home") {
      await home.loadListings();
    } else {
      home.renderHomeList();
    }
    if (state.view === "favorites") {
      await loadFavorites();
    }
    const modalDetail = document.getElementById("modalDetail");
    if (modalDetail && !modalDetail.hidden && state.detail?.id) {
      void openDetail(state.detail);
    }
  });
}

function bindCurrencySwitcher() {
  const sel = document.getElementById("currencySwitch");
  if (!sel) return;
  sel.value = getCurrentCurrency();
  sel.addEventListener("change", () => {
    setCurrentCurrency(sel.value);
    void refreshCurrentViewAfterUiChange();
  });
}

async function boot() {
  applyTheme(localStorage.getItem(THEME_KEY) || "dark");
  const y = document.getElementById("footerYear");
  if (y) y.textContent = String(new Date().getFullYear());

  await registerServiceWorker();
  await loadAppConfig();
  await loadLanguage(pickInitialLang());
  await ensureRecaptcha();
  await initGoogleSignIn();
  await initFacebookSdk();
  initFacebookAuthUI();

  bindRouterEvents();
  bindHomeFilters();
  bindHomeSectionsActions();
  bindAgenciesView();
  bindCallbackModal();
  bindCallbackButton();
  bindCallbackTabs();
  bindDetailActions();
  bindChatEvents();
  bindAuthForms();
  const bootUrl = new URL(window.location.href);
  const resetTok = bootUrl.searchParams.get("resetToken");
  if (resetTok) openAuthResetFromUrl(resetTok);

  bindListingForm();
  bindMoreView();
  bindTour();
  bindViewing();
  bindNewbuilds();
  bindReservations();
  bindRoommate();
  bindBuilding();
  bindLangSwitcher();
  bindCurrencySwitcher();
  bindGlobalShortcuts();

  await refreshUser();
  await refreshPushStatus();
  updateMoreUI();
  await loadListings();
  setView("home");

  const rentPeriodWrap = document.getElementById("rentPeriodWrap");
  if (rentPeriodWrap) rentPeriodWrap.style.display = "block";

  track("app.boot", { lang: getCurrentLang() });

  if (state.token) {
    connectRealtime();
  }
}

boot();
