import { state, appConfig } from "./state.js";
import { api } from "./api.js";

let subscribed = false;

export function isPushSupported() {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined"
  );
}

export function isPushSubscribed() {
  return subscribed;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr;
}

async function getSwReg() {
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg) return reg;
  return navigator.serviceWorker.ready;
}

export async function refreshPushStatus() {
  if (!isPushSupported() || !state.token) {
    subscribed = false;
    return;
  }
  try {
    const reg = await getSwReg();
    const sub = await reg.pushManager.getSubscription();
    subscribed = !!sub;
  } catch {
    subscribed = false;
  }
}

export async function ensurePushSubscription({ force = false } = {}) {
  if (!isPushSupported()) return null;
  if (!state.token) return null;
  if (!appConfig.vapidPublicKey) {
    if (force) throw new Error("Push не настроен на сервере (нет VAPID-ключей)");
    return null;
  }

  const reg = await getSwReg();
  let sub = await reg.pushManager.getSubscription();

  if (!sub) {
    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission !== "granted") {
      subscribed = false;
      if (force) throw new Error("Разрешение на уведомления не получено");
      return null;
    }
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(appConfig.vapidPublicKey),
    });
  }

  const body = {
    endpoint: sub.endpoint,
    keys: {
      p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("p256dh")))),
      auth: btoa(String.fromCharCode(...new Uint8Array(sub.getKey("auth")))),
    },
  };

  await api("/push/subscribe", { method: "POST", body });
  subscribed = true;
  return sub;
}

export async function unsubscribePush() {
  if (!isPushSupported()) return;
  const reg = await getSwReg();
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    try {
      await api("/push/unsubscribe", { method: "POST", body: { endpoint: sub.endpoint } });
    } catch {
      /* ignore */
    }
    await sub.unsubscribe();
  }
  subscribed = false;
}
