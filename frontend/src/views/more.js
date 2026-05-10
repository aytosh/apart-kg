import { state } from "../state.js";
import { toast } from "../utils.js";
import { openAuth, logout } from "./auth.js";
import { setView } from "../router.js";
import { loadPlansAndPayments } from "./payments.js";
import { loadSavedSearches, bindSavedSearches } from "./savedSearches.js";
import { loadVerification, bindVerification } from "./verification.js";
import { bindViewing, refresh as refreshViewings } from "./viewing.js";
import { bindDeals, loadDeals } from "./deals.js";
import { loadReservations } from "./reservations.js";
import { isPushSupported, ensurePushSubscription, isPushSubscribed } from "../push.js";
import { api, refreshUser } from "../api.js";
import { loadLanguage } from "../i18n.js";

let deferredInstallPrompt = null;

export function updateMoreUI() {
  const st = document.getElementById("moreUserStatus");
  const btnLogout = document.getElementById("btnLogout");
  const adminCard = document.getElementById("moreAdminCard");
  const profileForm = document.getElementById("formProfile");
  if (state.user) {
    if (st) st.textContent = `${state.user.email} (${state.user.role})`;
    if (btnLogout) btnLogout.hidden = false;
    if (adminCard) adminCard.hidden = state.user.role !== "ADMIN";
    if (profileForm) {
      profileForm.hidden = false;
      profileForm.elements.wechatId.value = state.user.wechatId || "";
      profileForm.elements.preferredLang.value = state.user.preferredLang || "";
    }
  } else {
    if (st) st.textContent = "Не авторизован";
    if (btnLogout) btnLogout.hidden = true;
    if (adminCard) adminCard.hidden = true;
    if (profileForm) profileForm.hidden = true;
  }
  updatePushButton();
}

export function updatePushButton() {
  const btn = document.getElementById("btnPushToggle");
  if (!btn) return;
  if (!isPushSupported()) {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  btn.textContent = isPushSubscribed()
    ? "Отключить push-уведомления"
    : "Включить push-уведомления";
}

function bindPwa() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const card = document.getElementById("pwaInstallCard");
    if (card) card.hidden = false;
  });
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    const card = document.getElementById("pwaInstallCard");
    if (card) card.hidden = true;
    toast("Apart.kg добавлен на экран");
  });
  document.getElementById("btnPwaInstall")?.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      toast("Откройте в Chrome или Edge: меню «Установить приложение» или «Добавить на главный экран»");
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    const card = document.getElementById("pwaInstallCard");
    if (card) card.hidden = true;
  });
}

export function bindMoreView() {
  document.getElementById("btnAuthHeader")?.addEventListener("click", () => {
    if (!state.token) {
      openAuth();
      return;
    }
    setView("more");
  });
  document.getElementById("btnChatHeader")?.addEventListener("click", () => setView("chat"));
  document.getElementById("btnNotifications")?.addEventListener("click", () =>
    setView("more")
  );
  document.getElementById("btnOpenAuth")?.addEventListener("click", openAuth);
  document.getElementById("btnLogout")?.addEventListener("click", logout);
  document.getElementById("btnOpenAdmin")?.addEventListener("click", () => setView("admin"));
  document.getElementById("btnLoadPlans")?.addEventListener("click", loadPlansAndPayments);

  const pushBtn = document.getElementById("btnPushToggle");
  if (pushBtn) {
    pushBtn.addEventListener("click", async () => {
      if (!state.token) {
        toast("Войдите, чтобы включить уведомления");
        openAuth();
        return;
      }
      try {
        if (!isPushSubscribed()) {
          await ensurePushSubscription({ force: true });
          toast("Push-уведомления включены");
        } else {
          const { unsubscribePush } = await import("../push.js");
          await unsubscribePush();
          toast("Push-уведомления выключены");
        }
        updatePushButton();
      } catch (err) {
        toast(err.message || "Не удалось переключить push");
      }
    });
  }

  bindPwa();
  bindSavedSearches();
  bindVerification();
  bindViewing();
  bindDeals();

  document.getElementById("formProfile")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.token) return;
    const fd = new FormData(e.target);
    const body = {
      wechatId: String(fd.get("wechatId") || "").trim(),
      preferredLang: String(fd.get("preferredLang") || ""),
    };
    try {
      const updated = await api("/auth/me", { method: "PATCH", body });
      state.user = { ...state.user, ...updated };
      if (body.preferredLang) {
        localStorage.setItem("apartLang", body.preferredLang);
        await loadLanguage(body.preferredLang);
        const sel = document.getElementById("langSwitch");
        if (sel) sel.value = body.preferredLang;
      }
      toast("Профиль сохранён");
      updateMoreUI();
    } catch (err) {
      toast(err.message);
    }
  });
}

export async function loadMoreView() {
  await loadPlansAndPayments();
  await loadSavedSearches();
  await loadVerification();
  await refreshViewings();
  await loadDeals();
  await loadReservations();
  updatePushButton();
}
