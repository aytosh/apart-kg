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
import { pickI18n, t } from "../i18n.js";
import { track } from "../analytics.js";
import { priceInCurrentCurrency } from "../currency.js";

function buildCrumbsHtml(it) {
  const crumbs = [];
  crumbs.push(
    `<button type="button" class="modal__crumb" data-crumb="home">${esc(
      t("nav.home", "Главная")
    )}</button>`
  );
  const dealLabel =
    it.deal === "rent" ? t("filters.deal.rent", "Аренда") : t("filters.deal.sale", "Продажа");
  crumbs.push(
    `<button type="button" class="modal__crumb" data-crumb="deal" data-deal="${esc(
      it.deal
    )}">${esc(dealLabel)}</button>`
  );
  const typeMap = {
    flat: t("filters.type.flat", "Квартира"),
    house: t("filters.type.house", "Дом"),
    office: t("filters.type.office", "Офис"),
    new: t("filters.type.new", "Новостройки"),
    room: "Комната",
    land: "Участок",
    dacha: "Дача",
    parking: "Паркинг",
  };
  if (it.type && typeMap[it.type]) {
    crumbs.push(
      `<button type="button" class="modal__crumb" data-crumb="type" data-type="${esc(
        it.type
      )}">${esc(typeMap[it.type])}</button>`
    );
  }
  if (it.district) {
    crumbs.push(`<span class="modal__crumb modal__crumb--last">${esc(it.district)}</span>`);
  }
  return crumbs.join(`<span class="modal__crumb-sep">›</span>`);
}

function badgesInModalHtml(it) {
  const parts = [];
  const now = new Date();
  if (it.urgent) {
    parts.push(`<span class="badge badge--urgent" title="${esc(t("promo.tip.urgent", "Срочное предложение от владельца"))}">${esc(t("badge.urgent", "Срочно"))}</span>`);
  }
  if (it.premiumUntil && new Date(it.premiumUntil) > now) {
    parts.push(
      `<span class="badge badge--premium" title="${esc(t("promo.tip.premium", "Премиум: максимальный приоритет в ленте"))}">${esc(t("badge.premium", "Премиум"))}</span>`
    );
  }
  if (it.vipUntil && new Date(it.vipUntil) > now) {
    parts.push(`<span class="badge badge--vip" title="${esc(t("promo.tip.vip", "VIP: усиленный показ в карусели и поиске"))}">VIP</span>`);
  }
  if (it.topUntil && new Date(it.topUntil) > now) {
    parts.push(`<span class="badge badge--top" title="${esc(t("promo.tip.top", "TOP: поднято в верх ленты"))}">TOP</span>`);
  }
  if (it.user?.isAgency) {
    parts.push(
      `<span class="badge badge--agency">${esc(t("badge.agency", "Агентство"))}</span>`
    );
  }
  if (it.installment) {
    parts.push(
      `<span class="badge">${esc(t("detail.extra.installment", "Рассрочка"))}</span>`
    );
  }
  if (it.exchange) {
    parts.push(
      `<span class="badge">${esc(t("detail.extra.exchange", "Обмен"))}</span>`
    );
  }
  return parts.join("");
}

function descriptionHtml(it) {
  const raw = pickI18n(it.descriptionI18n, it.description) || "";
  if (!raw.trim()) return "";
  const safe = esc(raw).replace(/\n/g, "<br />");
  return `<div class="modal__description-inner">${safe}</div>`;
}

function agencyBlockHtml(it) {
  const u = it.user;
  if (!u || !u.isAgency) return "";
  const name = u.agencyName || u.name || "Агентство";
  const slug = u.agencySlug || u.id;
  const logo = u.agencyLogo
    ? `<img src="${esc(u.agencyLogo)}" alt="" />`
    : `<div class="agency-card__logo-ph">🏢</div>`;
  return `<div class="modal__agency-card">
    <div class="modal__agency-logo">${logo}</div>
    <div>
      <p class="modal__agency-name">${esc(name)}</p>
      <p class="caption">${esc(t("badge.agency", "Агентство"))}${
        u.ratingCount
          ? ` · ★ ${esc(Number(u.ratingAvg || 0).toFixed(1))} (${esc(String(u.ratingCount))})`
          : ""
      }</p>
    </div>
    <button type="button" class="btn btn--ghost btn--small" data-open-agency="${esc(slug)}">
      ${esc(t("agencies.openProfile", "Открыть профиль"))}
    </button>
  </div>`;
}

function applyDetailTexts(it) {
  const crumbsEl = document.getElementById("modalCrumbs");
  if (crumbsEl) crumbsEl.innerHTML = buildCrumbsHtml(it);
  const priceEl = document.getElementById("modalPrice");
  if (priceEl) {
    const conv = priceInCurrentCurrency(it.price, it.currency);
    if (conv.converted) {
      priceEl.innerHTML = `${esc(conv.formatted)} <small>${esc(conv.symbol)}</small>
        <span class="card__price-alt">${esc(conv.originalFormatted)} <small>${esc(
          conv.originalSymbol
        )}</small></span>`;
    } else {
      priceEl.innerHTML = `${esc(conv.formatted || it.price)} <small>${esc(
        conv.symbol || it.currency
      )}</small>`;
    }
  }
  const titleEl = document.getElementById("modalTitle");
  if (titleEl) titleEl.textContent = pickI18n(it.titleI18n, it.title);
  const metaEl = document.getElementById("modalMeta");
  if (metaEl) {
    metaEl.innerHTML = `
    <span>${esc(it.district)}</span>
    <span>${esc(it.rooms)}</span>
    <span>${esc(it.area)}</span>
    <span>${esc(it.floor)}</span>`;
  }
  const badgesBox = document.getElementById("modalBadges");
  if (badgesBox) badgesBox.innerHTML = badgesInModalHtml(it);
  const descBox = document.getElementById("modalDescription");
  if (descBox) descBox.innerHTML = descriptionHtml(it);
  const agencyBox = document.getElementById("modalAgency");
  if (agencyBox) {
    agencyBox.innerHTML = agencyBlockHtml(it);
    agencyBox.querySelector("[data-open-agency]")?.addEventListener("click", async (e) => {
      const slug = e.currentTarget.getAttribute("data-open-agency");
      if (!slug) return;
      closeDetail();
      const mod = await import("./agencies.js");
      mod.openAgency?.(slug);
    });
  }
  const trustBox = document.getElementById("modalTrust");
  if (trustBox) {
    trustBox.innerHTML = `${trustBadgeHtml(it)}${trustExplainHtml(it.trustFlags)}`;
  }
  const ownerBox = document.getElementById("modalOwner");
  if (ownerBox) {
    if (it.user) {
      const wechat = it.user.wechatId
        ? `<p class="modal__owner-line">WeChat: <strong>${esc(it.user.wechatId)}</strong>
            <a href="/api/qr/wechat/${esc(it.user.id)}" target="_blank" class="btn btn--ghost btn--small">${esc(
              t("detail.qr.short", "QR")
            )}</a>
          </p>`
        : "";
      const qr = `<p class="modal__owner-line">
        <a href="/api/qr/listings/${esc(it.id)}" target="_blank" class="btn btn--ghost btn--small">${esc(
          t("detail.qr.listing", "QR-код объявления")
        )}</a>
      </p>`;
      ownerBox.innerHTML = `
        <p class="modal__owner-line">${esc(t("detail.owner", "Владелец"))}: <strong>${esc(
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
  const callBtn = document.getElementById("modalCall");
  if (callBtn) {
    callBtn.textContent = t("card.call", "Позвонить");
    callBtn.href = `tel:+996555000000`;
  }
  const msgBtn = document.getElementById("modalMsg");
  if (msgBtn) msgBtn.textContent = t("card.write", "Написать");

  bindCrumbsActions(it);
}

function bindCrumbsActions(it) {
  document.querySelectorAll("#modalCrumbs [data-crumb]").forEach((el) => {
    el.addEventListener("click", async () => {
      const crumb = el.getAttribute("data-crumb");
      const home = await import("./home.js");
      closeDetail();
      if (crumb === "home") {
        home.resetHomeFilters();
        setView("home");
        home.loadListings();
      } else if (crumb === "deal") {
        home.resetHomeFilters();
        state.filters.deal = el.getAttribute("data-deal") || "all";
        document.querySelectorAll("#view-home .segment__btn").forEach((b) => {
          b.classList.toggle("is-active", b.getAttribute("data-deal") === state.filters.deal);
        });
        setView("home");
        home.loadListings();
      } else if (crumb === "type") {
        home.resetHomeFilters();
        state.filters.type = el.getAttribute("data-type") || "all";
        document.querySelectorAll("#view-home .chips:not(.chips--rooms) .chip").forEach((c) => {
          c.classList.toggle("is-active", c.getAttribute("data-type") === state.filters.type);
        });
        setView("home");
        home.loadListings();
      }
    });
  });
}

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
  applyDetailTexts(it);
  renderMedia(it);
  renderLiveActions(it);
  renderDealActions(it);
  document.getElementById("modalDetail").hidden = false;
  document.body.style.overflow = "hidden";

  if (it.user?.id) loadOwnerReviews(it.user.id);
  loadSimilar(it.id);
  try {
    const fresh = await api(`/listings/${it.id}`);
    state.detail = fresh;
    applyDetailTexts(fresh);
    renderMedia(fresh);
    renderLiveActions(fresh);
    renderDealActions(fresh);
  } catch {
    /* ignore */
  }
}

async function loadSimilar(id) {
  const section = document.getElementById("modalSimilar");
  const list = document.getElementById("modalSimilarList");
  if (!section || !list) return;
  section.hidden = true;
  list.innerHTML = "";
  try {
    const { items } = await api(`/listings/${id}/similar`);
    if (!items || !items.length) return;
    section.hidden = false;
    list.innerHTML = items
      .map((s) => {
        const conv = priceInCurrentCurrency(s.price, s.currency);
        const priceTxt = conv.formatted || s.price;
        const sym = conv.symbol || s.currency;
        return `<li class="home-rail__item" data-similar-id="${esc(s.id)}" tabindex="0" role="link">
          <div class="home-rail__img-wrap">
            <img class="home-rail__img" src="${esc(pickCardImage(s))}" alt="" loading="lazy" />
          </div>
          <div class="home-rail__body">
            <p class="home-rail__price">${esc(priceTxt)} <small>${esc(sym)}</small></p>
            <p class="home-rail__title">${esc(pickI18n(s.titleI18n, s.title))}</p>
            <p class="home-rail__meta">${esc(s.district || "")}${s.rooms ? ` · ${esc(s.rooms)}` : ""}</p>
          </div>
        </li>`;
      })
      .join("");
    list.querySelectorAll("[data-similar-id]").forEach((el) => {
      const open = () => {
        const sid = el.getAttribute("data-similar-id");
        const it = items.find((x) => x.id === sid);
        if (it) openDetail(it);
      };
      el.addEventListener("click", open);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });
    });
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
    const stage = stageLabel(item.complex.currentStage);
    const pct = item.complex.progressPercent || 0;
    buttons.push(
      `<button type="button" class="btn btn--ghost btn--block" id="btnOpenComplex">🏗️ ${esc(
        t("detail.complex.btn", "ЖК {name} (этап: {stage}, {pct}%)")
          .replace("{name}", item.complex.name)
          .replace("{stage}", stage)
          .replace("{pct}", String(pct))
      )}</button>`
    );
    if (!isOwner) {
      buttons.push(
        `<button type="button" class="btn btn--secondary btn--block" id="btnReserveUnit">📌 ${esc(
          t("detail.reserve", "Забронировать онлайн (эскроу-аванс)")
        )}</button>`
      );
    }
  }
  buttons.push(
    `<button type="button" class="btn btn--ghost btn--block" id="btnOpenBuilding">🏠 ${esc(
      t("detail.building", "Профиль дома (отзывы и чат жильцов)")
    )}</button>`
  );
  if (!isOwner && item.user) {
    buttons.push(
      `<button type="button" class="btn btn--secondary btn--block" id="btnDealStart">🛡 ${esc(
        t("deal.start", "Оформить через Apart.kg")
      )}</button>`
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
      toast(t("detail.toast.dealLogin", "Войдите, чтобы оформить сделку"));
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
      toast(t("detail.toast.reserveLogin", "Войдите, чтобы забронировать"));
      openAuth();
      return;
    }
    const prepayStr = window.prompt(
      t("detail.prompt.prepay", "Аванс через эскроу (KGS), 0 — без аванса (бронь 48 часов)"),
      "10000"
    );
    if (prepayStr === null) return;
    const prepay = Number(prepayStr) || 0;
    const notes = window.prompt(t("detail.prompt.notes", "Комментарий застройщику (опционально)"), "") || "";
    try {
      await api(`/reservations/listings/${item.id}`, {
        method: "POST",
        body: { prepayAmount: prepay, notes },
      });
      toast(t("detail.toast.reserved", "Бронь оформлена"));
    } catch (err) {
      toast(err.message);
    }
  });
}

function stageLabel(stage) {
  const fallbacks = {
    PLANNED: "Планирование",
    FOUNDATION: "Фундамент",
    FRAME: "Каркас",
    FACADE: "Фасад",
    INTERIOR: "Отделка",
    READY: "Сдан",
  };
  return t(`detail.stage.${stage}`, fallbacks[stage] || stage || "—");
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
            `<button type="button" class="btn btn--secondary btn--small" data-pano="${i}">🧭 ${esc(
              p.label
                ? `${t("detail.panorama.prefix", "360°")} ${p.label}`
                : t("detail.panorama.unnamed", "360° · панорама {n}").replace("{n}", String(i + 1))
            )}</button>`
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
  box.innerHTML = `<button type="button" class="btn btn--secondary btn--block" id="btnRequestViewing">📹 ${esc(
    t("detail.live.request", "Заказать онлайн-показ")
  )}</button>`;
  document.getElementById("btnRequestViewing")?.addEventListener("click", () => {
    if (!state.token) {
      toast(t("detail.toast.viewingLogin", "Войдите, чтобы заказать показ"));
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
      box.innerHTML = `<p class="inline-note">${esc(t("detail.reviews.none", "Отзывов о владельце пока нет."))}</p>`;
      return;
    }
    box.innerHTML = `<h3 class="modal__reviews-title">${esc(t("detail.reviews.title", "Отзывы о владельце"))}</h3>${items
      .slice(0, 5)
      .map(
        (r) => `<div class="review-item">
          <p class="review-item__head"><strong>${esc(r.fromUser.name || t("detail.reviews.user", "Пользователь"))}</strong> · <span class="rating-stars">${"★".repeat(r.rating)}${"☆".repeat(5 - r.rating)}</span></p>
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
        toast(t("detail.toast.msgLogin", "Войдите, чтобы написать"));
        openAuth();
        return;
      }
      if (!state.detail) return;
      const owner = state.detail.userId;
      if (owner && state.user && owner === state.user.id) {
        toast(t("detail.toast.ownListing", "Это ваше объявление"));
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
