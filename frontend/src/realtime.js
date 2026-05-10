import { state } from "./state.js";
import { toast } from "./utils.js";

let ws = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
const listeners = new Set();

function scheduleReconnect() {
  if (!state.token) return;
  clearTimeout(reconnectTimer);
  const delay = Math.min(30000, 1000 * Math.pow(1.6, reconnectAttempts));
  reconnectTimer = setTimeout(() => connectRealtime(), delay);
  reconnectAttempts++;
}

export function connectRealtime() {
  if (!state.token) return;
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  const url = `${proto}//${location.host}/ws?token=${encodeURIComponent(state.token)}`;
  try {
    ws = new WebSocket(url);
  } catch {
    scheduleReconnect();
    return;
  }
  ws.addEventListener("open", () => {
    reconnectAttempts = 0;
    console.info("[ws] connected");
  });
  ws.addEventListener("message", (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (msg.type === "notify") {
      handleNotify(msg);
    }
    listeners.forEach((fn) => {
      try {
        fn(msg);
      } catch (err) {
        console.error("[ws listener]", err);
      }
    });
  });
  ws.addEventListener("close", () => {
    ws = null;
    scheduleReconnect();
  });
  ws.addEventListener("error", () => {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  });
}

export function disconnectRealtime() {
  clearTimeout(reconnectTimer);
  reconnectAttempts = 0;
  if (ws) {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
  }
  ws = null;
}

export function onRealtimeMessage(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function sendRealtime(payload) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(payload));
    return true;
  }
  return false;
}

function handleNotify(msg) {
  if (msg.kind === "saved-search") {
    const text = `${msg.title}: ${msg.body}`;
    toast(text);
  } else if (msg.title) {
    toast(msg.title);
  }
}
