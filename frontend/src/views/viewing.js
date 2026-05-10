import { state } from "../state.js";
import { api } from "../api.js";
import { esc, toast } from "../utils.js";
import { onRealtimeMessage, sendRealtime, connectRealtime } from "../realtime.js";

const STATUS_LABELS = {
  PENDING: "Ожидает",
  CONFIRMED: "Подтверждён",
  DECLINED: "Отклонён",
  STARTED: "Идёт",
  ENDED: "Завершён",
  CANCELLED: "Отменён",
};

const ICE = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
};

let pc = null;
let localStream = null;
let activeRoomId = null;
let activeViewingId = null;
let isInitiator = false;
let unsubscribeRealtime = null;

function $(id) {
  return document.getElementById(id);
}

async function load() {
  if (!state.token) return [];
  try {
    const { items } = await api("/viewings/mine");
    return items;
  } catch {
    return [];
  }
}

function renderList(items) {
  const box = $("viewingsList");
  if (!box) return;
  if (!state.token) {
    box.innerHTML = "<p class='form__intro'>Войдите, чтобы видеть запросы на онлайн-показ.</p>";
    return;
  }
  if (!items.length) {
    box.innerHTML =
      "<p class='form__intro'>Запросов на онлайн-показ пока нет. На карточке нажмите «📹 Онлайн-показ».</p>";
    return;
  }
  box.innerHTML = items
    .map((v) => {
      const role = v.ownerId === state.user?.id ? "Владелец" : "Арендатор";
      const peer =
        v.ownerId === state.user?.id
          ? v.requester?.name || v.requester?.email
          : v.owner?.name || v.owner?.email;
      const slot = v.slot ? new Date(v.slot).toLocaleString("ru-RU") : "Без точного времени";
      const isOwner = v.ownerId === state.user?.id;
      const canJoin = ["CONFIRMED", "STARTED"].includes(v.status);
      const canAccept = isOwner && v.status === "PENDING";
      const canDecline = isOwner && ["PENDING", "CONFIRMED"].includes(v.status);
      const canCancel = !isOwner && ["PENDING", "CONFIRMED"].includes(v.status);
      return `<div class="viewing-item" data-id="${esc(v.id)}">
        <div>
          <p class="admin-card__title">${esc(v.listingTitle || "")}</p>
          <p class="inline-note">${esc(role)} · ${esc(peer || "")} · ${esc(slot)}</p>
          <p class="inline-note">Статус: ${esc(STATUS_LABELS[v.status] || v.status)}</p>
          ${v.message ? `<p class="inline-note">«${esc(v.message)}»</p>` : ""}
          ${v.ownerNote ? `<p class="inline-note">Ответ: ${esc(v.ownerNote)}</p>` : ""}
        </div>
        <div class="viewing-actions">
          ${canAccept ? `<button type="button" class="btn btn--primary btn--small" data-act="accept">Принять</button>` : ""}
          ${canDecline ? `<button type="button" class="btn btn--small" data-act="decline">Отклонить</button>` : ""}
          ${canJoin ? `<button type="button" class="btn btn--primary btn--small" data-act="join">Подключиться</button>` : ""}
          ${canCancel ? `<button type="button" class="btn btn--small" data-act="cancel">Отменить</button>` : ""}
        </div>
      </div>`;
    })
    .join("");
  box.querySelectorAll(".viewing-item").forEach((el) => {
    const id = el.getAttribute("data-id");
    const item = items.find((x) => x.id === id);
    el.querySelectorAll("[data-act]").forEach((btn) => {
      btn.addEventListener("click", () => handleAction(item, btn.getAttribute("data-act")));
    });
  });
}

async function handleAction(v, act) {
  try {
    if (act === "accept") {
      await api(`/viewings/${v.id}/accept`, { method: "POST" });
      toast("Запрос принят");
      await refresh();
    } else if (act === "decline") {
      const note = window.prompt("Причина (необязательно)") || "";
      await api(`/viewings/${v.id}/decline`, { method: "POST", body: { note } });
      toast("Отклонено");
      await refresh();
    } else if (act === "cancel") {
      await api(`/viewings/${v.id}/cancel`, { method: "POST" });
      toast("Отменено");
      await refresh();
    } else if (act === "join") {
      if (v.status === "CONFIRMED") {
        try {
          await api(`/viewings/${v.id}/start`, { method: "POST" });
        } catch {
          /* ignore if already started */
        }
      }
      await joinRoom(v.id, v.roomId, v.ownerId === state.user?.id);
    }
  } catch (err) {
    toast(err.message);
  }
}

export async function refresh() {
  const items = await load();
  renderList(items);
}

export async function requestViewing(listingId) {
  if (!state.token) {
    toast("Войдите, чтобы заказать онлайн-показ");
    return;
  }
  const slot = window.prompt(
    "Когда удобно? Формат: ДД.ММ ЧЧ:ММ (можно оставить пустым для согласования)",
    ""
  );
  let slotIso = null;
  if (slot && slot.trim()) {
    const m = slot.match(/^(\d{1,2})\.(\d{1,2})\s+(\d{1,2}):(\d{2})$/);
    if (m) {
      const now = new Date();
      const yr = now.getFullYear();
      const dt = new Date(yr, Number(m[2]) - 1, Number(m[1]), Number(m[3]), Number(m[4]));
      if (dt < now) dt.setFullYear(yr + 1);
      slotIso = dt.toISOString();
    } else {
      toast("Не понял время — продолжаю без слота");
    }
  }
  const message = window.prompt("Сообщение для владельца (необязательно)") || "";
  try {
    await api(`/viewings/listing/${listingId}`, {
      method: "POST",
      body: { slot: slotIso || undefined, message: message || undefined },
    });
    toast("Запрос отправлен. Владелец получит push-уведомление.");
  } catch (err) {
    toast(err.message);
  }
}

async function joinRoom(viewingId, roomId, asOwner) {
  activeViewingId = viewingId;
  activeRoomId = roomId;
  isInitiator = !asOwner;
  const modal = $("modalRtc");
  if (!modal) return;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  $("rtcStatus").textContent = "Запрашиваем камеру и микрофон…";
  $("rtcLocal").srcObject = null;
  $("rtcRemote").srcObject = null;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    $("rtcLocal").srcObject = localStream;
  } catch (err) {
    toast("Не удалось получить камеру: " + err.message);
    leaveRoom();
    return;
  }
  connectRealtime();
  $("rtcStatus").textContent = "Подключаемся…";
  setupPeerConnection();
  sendRealtime({ type: "rtc-join", roomId });
}

function setupPeerConnection() {
  if (pc) {
    try {
      pc.close();
    } catch {
      /* ignore */
    }
  }
  pc = new RTCPeerConnection(ICE);
  for (const track of localStream.getTracks()) pc.addTrack(track, localStream);
  pc.onicecandidate = (ev) => {
    if (ev.candidate && activeRoomId) {
      sendRealtime({ type: "rtc-ice", roomId: activeRoomId, candidate: ev.candidate });
    }
  };
  pc.ontrack = (ev) => {
    const remote = $("rtcRemote");
    if (!remote.srcObject) remote.srcObject = ev.streams[0];
    $("rtcStatus").textContent = "На связи";
  };
  pc.onconnectionstatechange = () => {
    if (!pc) return;
    const s = pc.connectionState;
    if (s === "failed" || s === "disconnected") {
      $("rtcStatus").textContent = "Соединение потеряно";
    } else if (s === "connected") {
      $("rtcStatus").textContent = "На связи";
    }
  };
}

async function makeOffer() {
  if (!pc) return;
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  sendRealtime({ type: "rtc-offer", roomId: activeRoomId, sdp: pc.localDescription });
}

async function handleSignal(msg) {
  if (!msg.roomId || msg.roomId !== activeRoomId) return;
  if (msg.type === "rtc-joined") {
    if (!msg.ok) {
      toast(msg.error || "Не удалось войти в комнату");
      leaveRoom();
      return;
    }
    if (isInitiator) makeOffer();
    return;
  }
  if (msg.type === "rtc-peer-joined") {
    if (isInitiator && pc) makeOffer();
    return;
  }
  if (msg.type === "rtc-peer-left") {
    $("rtcStatus").textContent = "Собеседник вышел";
    return;
  }
  if (!pc) return;
  if (msg.type === "rtc-offer" && msg.sdp) {
    await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendRealtime({ type: "rtc-answer", roomId: activeRoomId, sdp: pc.localDescription });
  } else if (msg.type === "rtc-answer" && msg.sdp) {
    await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
  } else if (msg.type === "rtc-ice" && msg.candidate) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
    } catch (err) {
      console.warn("[rtc] addIceCandidate failed", err?.message);
    }
  }
}

export function leaveRoom() {
  if (activeRoomId) sendRealtime({ type: "rtc-leave", roomId: activeRoomId });
  if (pc) {
    try {
      pc.close();
    } catch {
      /* ignore */
    }
    pc = null;
  }
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  if (activeViewingId) {
    api(`/viewings/${activeViewingId}/end`, { method: "POST" }).catch(() => {});
  }
  const modal = $("modalRtc");
  if (modal) modal.hidden = true;
  document.body.style.overflow = "";
  activeRoomId = null;
  activeViewingId = null;
}

export function bindViewing() {
  $("rtcLeaveBtn")?.addEventListener("click", leaveRoom);
  document.querySelectorAll("[data-close-rtc]").forEach((el) =>
    el.addEventListener("click", leaveRoom)
  );
  $("btnRefreshViewings")?.addEventListener("click", refresh);
  if (!unsubscribeRealtime) {
    unsubscribeRealtime = onRealtimeMessage(async (msg) => {
      if (
        msg.type === "rtc-joined" ||
        msg.type === "rtc-peer-joined" ||
        msg.type === "rtc-peer-left" ||
        msg.type === "rtc-offer" ||
        msg.type === "rtc-answer" ||
        msg.type === "rtc-ice"
      ) {
        await handleSignal(msg);
      } else if (msg.type === "notify" && msg.kind && msg.kind.startsWith("viewing")) {
        refresh();
      }
    });
  }
}
