import { state } from "../state.js";
import { api } from "../api.js";
import { esc, toast } from "../utils.js";
import { onRealtimeMessage } from "../realtime.js";
import { setView } from "../router.js";

let activeBuildingId = null;
let activeTab = "reviews";
let chatPollTimer = null;
let unsub = null;

function ratingStars(avg) {
  if (!avg) return "<span class='rating-stars'>☆☆☆☆☆</span>";
  const full = Math.floor(avg);
  return `<span class="rating-stars">${"★".repeat(full)}${"☆".repeat(5 - full)} ${avg}</span>`;
}

function setActiveTab(tab) {
  activeTab = tab;
  document.querySelectorAll("#view-building .complex__tab").forEach((b) => {
    b.classList.toggle("is-active", b.getAttribute("data-building-tab") === tab);
  });
  document.getElementById("buildingReviews").hidden = tab !== "reviews";
  document.getElementById("buildingChat").hidden = tab !== "chat";
  if (tab === "chat") loadChat();
}

async function renderHero(profile) {
  const box = document.getElementById("buildingHero");
  if (!box) return;
  const memberBtn = !profile.isMember
    ? `<button type="button" class="btn btn--secondary btn--small" id="btnBuildingMember">Запросить доступ к чату жильцов</button>`
    : `<span class="trust-pill trust-pill--ok">Жилец подтверждён</span>`;
  box.innerHTML = `
    <div class="complex__head">
      <h2 class="complex__title">${esc(profile.address)}</h2>
      <p class="complex__meta">${esc(profile.district || "")} · ${profile.reviewCount || 0} отзывов · ${profile.memberCount || 0} жильцов</p>
      <p class="complex__developer">${ratingStars(profile.ratingAvg)}</p>
      ${memberBtn}
    </div>`;
  document.getElementById("btnBuildingMember")?.addEventListener("click", async () => {
    if (!state.token) {
      toast("Войдите, чтобы запросить доступ");
      return;
    }
    try {
      const r = await api(`/buildings/${profile.id}/membership/request`, { method: "POST" });
      if (r.status === "APPROVED") {
        toast("Доступ к чату жильцов открыт автоматически");
      } else {
        toast("Заявка отправлена администратору");
      }
      openBuilding(profile.id);
    } catch (err) {
      toast(err.message);
    }
  });
}

async function renderReviews() {
  const box = document.getElementById("buildingReviews");
  if (!box || !activeBuildingId) return;
  let html = "";
  if (state.token) {
    html += `<form class="form" id="formBuildingReview" style="padding:0 0 16px;">
      <p class="form__intro" style="padding:0">Оставьте отзыв о доме (виден всем).</p>
      <div class="field-row">
        <label class="field field--half"><span class="field__label">Оценка (1–5)</span>
          <input class="field__input" type="number" min="1" max="5" name="rating" required value="5" />
        </label>
        <label class="field field--half"><span class="field__label">Жил с (год)</span>
          <input class="field__input" type="number" name="livedYear" min="2000" max="2100" />
        </label>
      </div>
      <label class="field"><span class="field__label">Плюсы</span>
        <textarea class="field__input" name="pros" rows="2" maxlength="600"></textarea>
      </label>
      <label class="field"><span class="field__label">Минусы</span>
        <textarea class="field__input" name="cons" rows="2" maxlength="600"></textarea>
      </label>
      <button type="submit" class="btn btn--primary">Отправить отзыв</button>
    </form>`;
  }
  try {
    const { items } = await api(`/buildings/${activeBuildingId}/reviews`);
    if (items.length) {
      html += items
        .map(
          (r) => `<div class="admin-card">
            <p class="admin-card__title">${esc(r.user?.name || "Пользователь")}${
              r.user?.verifiedLevel === "ID" ? " ✓" : ""
            } · <span class="rating-stars">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span></p>
            ${r.pros ? `<p class="inline-note">Плюсы: ${esc(r.pros)}</p>` : ""}
            ${r.cons ? `<p class="inline-note">Минусы: ${esc(r.cons)}</p>` : ""}
            ${r.livedFrom ? `<p class="inline-note">Жил с ${new Date(r.livedFrom).getFullYear()}</p>` : ""}
          </div>`
        )
        .join("");
    } else {
      html += "<p class='form__intro'>Отзывов пока нет — будьте первым.</p>";
    }
  } catch (err) {
    html += `<p class="form__intro">${esc(err.message)}</p>`;
  }
  box.innerHTML = html;
  const form = document.getElementById("formBuildingReview");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const year = Number(fd.get("livedYear"));
      const body = {
        rating: Number(fd.get("rating")) || 5,
        pros: String(fd.get("pros") || "") || null,
        cons: String(fd.get("cons") || "") || null,
      };
      if (Number.isInteger(year) && year > 1990) {
        body.livedFrom = new Date(`${year}-01-01T00:00:00.000Z`).toISOString();
      }
      try {
        await api(`/buildings/${activeBuildingId}/reviews`, { method: "POST", body });
        toast("Отзыв опубликован");
        renderReviews();
        openBuilding(activeBuildingId, { skipTabReset: true });
      } catch (err) {
        toast(err.message);
      }
    });
  }
}

async function loadChat() {
  const box = document.getElementById("buildingChat");
  if (!box || !activeBuildingId) return;
  try {
    const { items } = await api(`/buildings/${activeBuildingId}/chat`);
    box.innerHTML = `
      <div class="msg-list" id="buildingMsgList" style="max-height:400px; overflow:auto; padding:8px;">
        ${items
          .map(
            (m) => `<div class="msg msg--them">
              <div class="msg__who">${esc(m.user?.name || "Жилец")}${m.user?.verifiedLevel === "ID" ? " ✓" : ""} · ${new Date(m.createdAt).toLocaleString("ru-RU")}</div>
              <div>${esc(m.body)}</div>
            </div>`
          )
          .join("")}
      </div>
      <div class="chat-compose">
        <input type="text" id="buildingMsgInput" placeholder="Написать жильцам…" maxlength="1000" />
        <button type="button" class="btn btn--primary" id="buildingMsgSend" style="width:auto;margin:0">Отпр.</button>
      </div>`;
    document.getElementById("buildingMsgList")?.scrollTo(0, 99999);
    document.getElementById("buildingMsgSend")?.addEventListener("click", sendMessage);
    document.getElementById("buildingMsgInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendMessage();
    });
  } catch (err) {
    box.innerHTML = `<p class="form__intro" style="padding:16px;">${esc(err.message)}</p>
      <p class="form__intro" style="padding:0 16px;">Чат доступен только подтверждённым жильцам. Запросите доступ во вкладке «Отзывы».</p>`;
  }
}

async function sendMessage() {
  const input = document.getElementById("buildingMsgInput");
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  try {
    await api(`/buildings/${activeBuildingId}/chat`, {
      method: "POST",
      body: { body: text },
    });
    input.value = "";
    loadChat();
  } catch (err) {
    toast(err.message);
  }
}

export async function openBuilding(id, opts = {}) {
  activeBuildingId = id;
  setView("building");
  try {
    const profile = await api(`/buildings/${id}`);
    renderHero(profile);
    if (!opts.skipTabReset) setActiveTab("reviews");
    renderReviews();
  } catch (err) {
    toast(err.message);
  }
}

export async function lookupBuilding({ address, district, lat, lng }) {
  try {
    const profile = await api("/buildings/lookup", {
      method: "POST",
      body: { address, district, lat, lng },
    });
    openBuilding(profile.id);
  } catch (err) {
    toast(err.message);
  }
}

export function bindBuilding() {
  document.getElementById("buildingBack")?.addEventListener("click", () => setView("map"));
  document.querySelectorAll("#view-building .complex__tab").forEach((b) => {
    b.addEventListener("click", () => setActiveTab(b.getAttribute("data-building-tab")));
  });
  if (!unsub) {
    unsub = onRealtimeMessage((msg) => {
      if (msg.type === "notify" && msg.kind === "building-message" && state.view === "building") {
        loadChat();
      }
    });
  }
}
