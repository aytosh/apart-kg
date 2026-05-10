import { state } from "../state.js";
import { api } from "../api.js";
import { esc, toast } from "../utils.js";

export async function loadChatThreads() {
  const ul = document.getElementById("chatThreads");
  const empty = document.getElementById("chatEmpty");
  if (!ul || !empty) return;
  if (!state.token) {
    ul.innerHTML = "";
    empty.hidden = false;
    empty.querySelector(".empty__text").textContent =
      "Войдите в аккаунт, чтобы видеть переписки по объявлениям.";
    return;
  }
  empty.querySelector(".empty__text").textContent =
    "Откройте объявление и нажмите «Написать».";
  try {
    const { threads } = await api("/messages/threads");
    if (!threads.length) {
      ul.innerHTML = "";
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    ul.innerHTML = threads
      .map(
        (t) => `<li class="chat-thread-item" data-lid="${esc(t.listingId)}">
        <p class="chat-thread-item__title">${esc(t.title)}</p>
        <p class="chat-thread-item__preview">${esc(t.lastMessage)}</p>
        <p class="chat-thread-item__meta">${
          t.unread ? `<span class="badge-unread">${t.unread}</span>` : ""
        }</p>
      </li>`
      )
      .join("");
    ul.querySelectorAll(".chat-thread-item").forEach((li) => {
      li.addEventListener("click", () => {
        openChatThread(li.getAttribute("data-lid"));
      });
    });
  } catch {
    empty.hidden = false;
  }
}

export async function openChatThread(listingId) {
  state.chatListingId = listingId;
  document.getElementById("chatListPanel").hidden = true;
  document.getElementById("chatThreadPanel").hidden = false;
  const data = await api(`/messages/listing/${listingId}`);
  document.getElementById("chatThreadTitle").textContent = "Диалог";
  const box = document.getElementById("msgList");
  box.innerHTML = data.messages
    .map(
      (m) => `<div class="msg ${m.mine ? "msg--mine" : "msg--them"}">
    ${!m.mine ? `<div class="msg__who">${esc(m.senderName)}</div>` : ""}
    ${esc(m.body)}</div>`
    )
    .join("");
  box.scrollTop = box.scrollHeight;
}

async function sendMsg() {
  const inp = document.getElementById("msgInput");
  const body = inp.value.trim();
  if (!body || !state.chatListingId) return;
  try {
    await api("/messages", {
      method: "POST",
      body: { listingId: state.chatListingId, body },
    });
    inp.value = "";
    await openChatThread(state.chatListingId);
  } catch (e) {
    toast(e.message);
  }
}

export function bindChatEvents() {
  const back = document.getElementById("chatBack");
  if (back) {
    back.addEventListener("click", () => {
      document.getElementById("chatThreadPanel").hidden = true;
      document.getElementById("chatListPanel").hidden = false;
      state.chatListingId = null;
      loadChatThreads();
    });
  }
  document.getElementById("msgSend")?.addEventListener("click", sendMsg);
  document.getElementById("msgInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMsg();
  });
}
