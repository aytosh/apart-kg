import { state } from "../state.js";
import { api } from "../api.js";
import { esc, pickCardImage, toast } from "../utils.js";
import { FALLBACK_IMG } from "../constants.js";
import { openAuth } from "./auth.js";
import { openChatThread } from "./chat.js";
import { setView } from "../router.js";
import { trustBadgeHtml, trustExplainHtml, ratingStars } from "./trustBadge.js";
import { open360Viewer } from "./tour.js";
import { requestViewing } from "./viewing.js";
import { createDealWizard } from "./deals.js";
import { pickI18n } from "../i18n.js";
import { track } from "../analytics.js";

export async function openDetail(it) {
  state.detail = it;
  track("listing.view", { id: it.id, deal: it.deal, type: it.propertyType, complexId: it.complexId });
  const img = pickCardImage(it);
  const wrap = document.getElementById("modalImgWrap");
  if (wrap) {
    wrap.innerHTML = `<img class="modal__img" src="${esc(img)}" alt="" />`;
    const modalImg = wrap.querySelector(".modal__img");
    if (modalImg) {
      modalImg.addEventListener(
        "error",
        () => {
          modalImg.src = FALLBACK_IMG;
        },
        { once: true }
      );
    }
  }
  document.getElementById("modalPrice").innerHTML =
    `${esc(it.price)} <small>${esc(it.currency)}</small>`;
  document.getElementById("modalTitle").textContent = pickI18n(it.titleI18n, it.title);
  let extras = "";
  if (it.installment) extras += "Рассрочка · ";
  if (it.exchange) extras += "Обмен · ";
  if (it.urgent) extras += "Срочно · ";
  document.getElementById("modalMeta").innerHTML = `
    ${extras ? `<span>${esc(extras.replace(/ · $/, ""))}</span>` : ""}
    <span>${esc(it.district)}</span>
    <span>${esc(it.rooms)}</span>
    <span>${esc(it.area)}</span>
    <span>${esc(it.floor)}</span>`;
  const trustBox = document.getElementById("modalTrust");
  if (trustBox) {
    trustBox.innerHTML = `${trustBadgeHtml(it)}${trustExplainHtml(it.trustFlags)}`;
  }
  const ownerBox = document.getElementById("modalOwner");
  if (ownerBox) {
    if (it.user) {
      const wechat = it.user.wechatId
        ? `<p class="modal__owner-line">WeChat: <strong>${esc(it.user.wechatId)}</strong>
            <a href="/api/qr/wechat/${esc(it.user.id)}" target="_blank" class="btn btn--ghost btn--small">QR</a>
          </p>`
        : "";
      const qr = `<p class="modal__owner-line">
        <a href="/api/qr/listings/${esc(it.id)}" target="_blank" class="btn btn--ghost btn--small">QR-код объявления</a>
      </p>`;
      ownerBox.innerHTML = `
        <p class="modal__owner-line">Владелец: <strong>${esc(
          it.user.name || it.user.email || "—"
        )}</strong></p>
        <p class="modal__owner-line">${ratingStars(it.user.ratingAvg, it.user.ratingCount)}</p>
        ${wechat}
        ${qr}
      `;
    } else {
      ownerBox.innerHTML = "";
    }
  }
  document.getElementById("modalCall").href = `tel:+996555000000`;
  renderMedia(it);
  renderLiveActions(it);
  renderDealActions(it);
  document.getElementById("modalDetail").hidden = false;
  document.body.style.overflow = "hidden";

  if (it.user?.id) loadOwnerReviews(it.user.id);
  try {
    const fresh = await api(`/listings/${it.id}`);
    state.detail = fresh;
    if (trustBox) {
      trustBox.innerHTML = `${trustBadgeHtml(fresh)}${trustExplainHtml(fresh.trustFlags)}`;
    }
    renderMedia(fresh);
    renderLiveActions(fresh);
    renderDealActions(fresh);
  } catch {
    /* ignore */
  }
}

function renderDealActions(item) {
  const box = document.getElementById("modalDealActions");
  if (!box) return;
  const isOwner = item.user && state.user && item.user.id === state.user.id;
  const buttons = [];
  if (item.complex) {
    buttons.push(
      `<button type="button" class="btn btn--ghost btn--block" id="btnOpenComplex">🏗️ ЖК ${esc(item.complex.name)} (этап: ${esc(stageLabel(item.complex.currentStage))}, ${item.complex.progressPercent || 0}%)</button>`
    );
    if (!isOwner) {
      buttons.push(
        `<button type="button" class="btn btn--secondary btn--block" id="btnReserveUnit">📌 Забронировать онлайн (эскроу-аванс)</button>`
      );
    }
  }
  buttons.push(
    `<button type="button" class="btn btn--ghost btn--block" id="btnOpenBuilding">🏠 Профиль дома (отзывы и чат жильцов)</button>`
  );
  if (!isOwner && item.user) {
    buttons.push(
      `<button type="button" class="btn btn--secondary btn--block" id="btnDealStart">🛡 Оформить через Apart.kg</button>`
    );
  }
  box.innerHTML = buttons.join("");
  document.getElementById("btnOpenBuilding")?.addEventListener("click", async () => {
    const { lookupBuilding } = await import("./building.js");
    closeDetail();
    lookupBuilding({
      address: item.district,
      district: item.district,
      lat: item.lat,
      lng: item.lng,
    });
  });
  document.getElementById("btnDealStart")?.addEventListener("click", () => {
    if (!state.token) {
      toast("Войдите, чтобы оформить сделку");
      openAuth();
      return;
    }
    createDealWizard(item);
  });
  document.getElementById("btnOpenComplex")?.addEventListener("click", async () => {
    const { openComplex } = await import("./newbuilds.js");
    closeDetail();
    openComplex(item.complex.slug);
  });
  document.getElementById("btnReserveUnit")?.addEventListener("click", async () => {
    if (!state.token) {
      toast("Войдите, чтобы забронировать");
      openAuth();
      return;
    }
    const prepayStr = window.prompt(
      "Аванс через эскроу (KGS), 0 — без аванса (бронь 48 часов)",
      "10000"
    );
    if (prepayStr === null) return;
    const prepay = Number(prepayStr) || 0;
    const notes = window.prompt("Комментарий застройщику (опционально)", "") || "";
    try {
      await api(`/reservations/listings/${item.id}`, {
        method: "POST",
        body: { prepayAmount: prepay, notes },
      });
      toast("Бронь оформлена");
    } catch (err) {
      toast(err.message);
    }
  });
}

function stageLabel(stage) {
  return (
    {
      PLANNED: "Планирование",
      FOUNDATION: "Фундамент",
      FRAME: "Каркас",
      FACADE: "Фасад",
      INTERIOR: "Отделка",
      READY: "Сдан",
    }[stage] || stage || "—"
  );
}

function renderMedia(item) {
  const box = document.getElementById("modalMedia");
  if (!box) return;
  const panoramas = (item.tourPhotos || []).filter((t) => t.type === "panorama360");
  const html = [];
  if (item.videoUrl) {
    html.push(
      `<video controls preload="metadata" src="${esc(item.videoUrl)}"></video>`
    );
  }
  if (panoramas.length) {
    html.push(
      `<div class="modal__media-actions">${panoramas
        .map(
          (p, i) =>
            `<button type="button" class="btn btn--secondary btn--small" data-pano="${i}">🧭 360° ${
              p.label ? esc(p.label) : `панорама ${i + 1}`
            }</button>`
        )
        .join("")}</div>`
    );
  }
  box.innerHTML = html.join("");
  box.querySelectorAll("[data-pano]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.getAttribute("data-pano"));
      const p = panoramas[i];
      if (p) open360Viewer(p.url, p.label);
    });
  });
}

function renderLiveActions(item) {
  const box = document.getElementById("modalLiveActions");
  if (!box) return;
  const isOwner = item.user && state.user && item.user.id === state.user.id;
  if (!item.liveAvailable || isOwner) {
    box.innerHTML = "";
    return;
  }
  box.innerHTML = `<button type="button" class="btn btn--secondary btn--block" id="btnRequestViewing">📹 Заказать онлайн-показ</button>`;
  document.getElementById("btnRequestViewing")?.addEventListener("click", () => {
    if (!state.token) {
      toast("Войдите, чтобы заказать показ");
      openAuth();
      return;
    }
    requestViewing(item.id);
  });
}

async function loadOwnerReviews(userId) {
  const box = document.getElementById("modalReviews");
  if (!box) return;
  try {
    const { items } = await api(`/reviews/user/${userId}`);
    if (!items.length) {
      box.innerHTML = "<p class='inline-note'>Отзывов о владельце пока нет.</p>";
      return;
    }
    box.innerHTML = `<h3 class="modal__reviews-title">Отзывы о владельце</h3>${items
      .slice(0, 5)
      .map(
        (r) => `<div class="review-item">
          <p class="review-item__head"><strong>${esc(r.fromUser.name || "Пользователь")}</strong> · <span class="rating-stars">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span></p>
          ${r.text ? `<p class="review-item__text">${esc(r.text)}</p>` : ""}
        </div>`
      )
      .join("")}`;
  } catch {
    /* ignore */
  }
}

export function closeDetail() {
  const m = document.getElementById("modalDetail");
  if (m) m.hidden = true;
  document.body.style.overflow = "";
}

export function bindDetailActions() {
  const msgBtn = document.getElementById("modalMsg");
  if (msgBtn) {
    msgBtn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!state.token) {
        toast("Войдите, чтобы написать");
        openAuth();
        return;
      }
      if (!state.detail) return;
      const owner = state.detail.userId;
      if (owner && state.user && owner === state.user.id) {
        toast("Это ваше объявление");
        return;
      }
      closeDetail();
      state.chatListingId = state.detail.id;
      setView("chat");
      openChatThread(state.chatListingId);
    });
  }
  document.querySelectorAll("[data-close-modal]").forEach((el) =>
    el.addEventListener("click", closeDetail)
  );
}
