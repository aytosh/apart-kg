import { state, appConfig } from "./state.js";

const queue = [];
let flushing = false;

async function flush() {
  if (flushing || !queue.length) return;
  flushing = true;
  const batch = queue.splice(0, queue.length);
  try {
    for (const e of batch) {
      const headers = { "Content-Type": "application/json" };
      if (state.token) headers.Authorization = `Bearer ${state.token}`;
      const data = JSON.stringify(e);
      if (navigator.sendBeacon && !state.token) {
        navigator.sendBeacon(
          "/api/events",
          new Blob([data], { type: "application/json" })
        );
      } else {
        await fetch("/api/events", { method: "POST", headers, body: data, keepalive: true });
      }
    }
  } catch {
    /* ignore */
  } finally {
    flushing = false;
  }
}

export function track(type, payload) {
  queue.push({ type, payload, url: location.pathname + location.search });
  if (queue.length >= 5) flush();
}

window.addEventListener("pagehide", () => flush());
setInterval(flush, 10000);

export function isFeatureEnabled(name) {
  const flags = appConfig.featureFlags || {};
  if (!(name in flags)) return true;
  return Boolean(flags[name]);
}
