import { state } from "../state.js";
import { api } from "../api.js";
import { esc, plural, pickCardImage, toast, attachCardImageFallback } from "../utils.js";
import { openDetail } from "./detail.js";
import { openAuth } from "./auth.js";
import { refreshMapMarkers } from "./map.js";
import { setView } from "../router.js";
import { trustBadgeHtml } from "./trustBadge.js";
import { pickI18n, t, getCurrentLang } from "../i18n.js";
import { priceInCurrentCurrency } from "../currency.js";
import { loadHomeSections, setHomeSectionsVisibility, isHomeStreamMode } from "./homeSections.js";

export function formatListingCount(n) {
  const lang = getCurrentLang();
  if (lang === "ru") {
    return `${n} ${plural(n, "объявление", "объявления", "объявлений")}`;
  }
  if (lang === "en" || lang === "zh") {
    if (n === 0) return t("home.count.0", "No listings");
    if (n === 1) return t("home.count.1", "1 listing");
    return t("home.count.n", "{n} listings").replace("{n}", String(n));
  }
  if (lang === "kg") {
    if (n === 0) return t("home.count.0", "Жарыя жок");
    if (n === 1) return t("home.count.1", "1 жарыя");
    return t("home.count.n", "{n} жарыя").replace("{n}", String(n));
  }
  return `${n} ${plural(n, "объявление", "объявления", "объявлений")}`;
}

export function buildQuery() {
  const p = new URLSearchParams();
  if (state.filters.deal !== "all") p.set("deal", state.filters.deal);
  if (state.filters.type !== "all") p.set("type", state.filters.type);
  if (state.filters.rooms && state.filters.rooms !== "all") {
    p.set("rooms", state.filters.rooms);
  }
  if (state.filters.search.trim()) p.set("search", state.filters.search.trim());
  if (state.filters.verifiedOnly) p.set("verifiedOnly", "true");
  if (state.filters.has360) p.set("has360", "true");
  if (state.filters.hasVideo) p.set("hasVideo", "true");
  if (state.filters.liveAvailable) p.set("liveAvailable", "true");
  const q = p.toString();
  return q ? `?${q}` : "";
}

function skeletonListHtml(n = 6) {
  const card = `<li><article class="card skeleton-card">
    <div class="skeleton skeleton-card__img"></div>
    <div class="skeleton-card__body">
      <div class="skeleton skeleton-card__line skeleton-card__line--lg"></div>
      <div class="skeleton skeleton-card__line skeleton-card__line--md"></div>
      <div class="skeleton skeleton-card__line skeleton-card__line--sm"></div>
    </div>
  </article></li>`;
  return new Array(n).fill(card).join("");
}

function setListSkeleton() {
  const list = document.getElementById("list");
  if (list) list.innerHTML = skeletonListHtml(6);
  const counter = document.getElementById("resultsCount");
  if (counter) counter.textContent = "…";
}

export function hasActiveFilters() {
  const f = state.filters;
  return (
    f.deal !== "all" ||
    f.type !== "all" ||
    (f.rooms && f.rooms !== "all") ||
    f.search.trim() !== "" ||
    f.verifiedOnly ||
    f.has360 ||
    f.hasVideo ||
    f.liveAvailable
  );
}

export function resetHomeFilters() {
  state.filters.deal = "all";
  state.filters.type = "all";
  state.filters.rooms = "all";
  state.filters.search = "";
  state.filters.verifiedOnly = false;
  state.filters.has360 = false;
  state.filters.hasVideo = false;
  state.filters.liveAvailable = false;

  document.querySelectorAll("#view-home .segment__btn").forEach((b) => {
    b.classList.toggle("is-active", b.getAttribute("data-deal") === "all");
  });
  document.querySelectorAll("#view-home .chips:not(.chips--rooms) .chip").forEach((c) => {
    c.classList.toggle("is-active", c.getAttribute("data-type") === "all");
  });
  document.querySelectorAll("#roomsChips .chip").forEach((c) => {
    c.classList.toggle("is-active", c.getAttribute("data-rooms") === "all");
  });
  const searchInput = document.getElementById("searchInput");
  if (searchInput) searchInput.value = "";
  ["filterVerifiedOnly", "filter360", "filterVideo", "filterLive"].forEach((id) => {
    const el = document.getElementById(id);
    if (el && "checked" in el) el.checked = false;
  });
}

let lastLoadFailed = false;

export async function loadListings() {
  setListSkeleton();
  if (isHomeStreamMode()) {
    void loadHomeSections();
  } else {
    setHomeSectionsVisibility(false);
  }
  try {
    const { items } = await api(`/listings${buildQuery()}`);
    state.items = items;
    lastLoadFailed = false;
    renderHomeList();
    if (state.map && state.markersLayer) refreshMapMarkers();
  } catch (err) {
    lastLoadFailed = true;
    state.items = [];
    renderHomeError(err?.message || "");
  }
}

function renderHomeError(message) {
  const list = document.getElementById("list");
  if (!list) return;
  const title = t("home.error.title", "Не удалось загрузить объявления");
  const text =
    message && message.length < 160
      ? message
      : t("home.error.text", "Проверьте подключение к интернету и попробуйте ещё раз.");
  list.innerHTML = `<li class="state-block-li"><div class="state-block">
    <div class="state-block__icon" aria-hidden="true">!</div>
    <h3 class="state-block__title">${esc(title)}</h3>
    <p class="state-block__text">${esc(text)}</p>
    <div class="state-block__actions">
      <button type="button" class="btn btn--primary" data-retry-listings>${esc(
        t("home.error.retry", "Повторить")
      )}</button>
    </div>
  </div></li>`;
  list.querySelector("[data-retry-listings]")?.addEventListener("click", () => {
    loadListings();
  });
  const counter = document.getElementById("resultsCount");
  if (counter) counter.textContent = "";
}

function priceBlockHtml(it) {
  const conv = priceInCurrentCurrency(it.price, it.currency);
  if (conv.converted && conv.originalFormatted) {
    return `<p class="card__price">
      ${esc(conv.formatted)} <small>${esc(conv.symbol)}</small>
      <span class="card__price-alt">${esc(conv.originalFormatted)} <small>${esc(
        conv.originalSymbol
      )}</small></span>
    </p>`;
  }
  return `<p class="card__price">${esc(conv.formatted || it.price)} <small>${esc(
    conv.symbol || it.currency
  )}</small></p>`;
}

function listingBadgesHtml(it) {
  const parts = [];
  if (it.urgent) {
    parts.push(
      `<span class="badge badge--urgent">${esc(t("badge.urgent", "Срочно"))}</span>`
    );
  }
  if (it.vipUntil && new Date(it.vipUntil) > new Date()) {
    parts.push(`<span class="badge badge--vip">VIP</span>`);
  }
  if (it.topUntil && new Date(it.topUntil) > new Date()) {
    parts.push(`<span class="badge badge--top">TOP</span>`);
  }
  if (it.premiumUntil && new Date(it.premiumUntil) > new Date()) {
    parts.push(
      `<span class="badge badge--premium">${esc(t("badge.premium", "Премиум"))}</span>`
    );
  }
  if (it.user?.isAgency || it.agency) {
    parts.push(
      `<span class="badge badge--agency">${esc(t("badge.agency", "Агентство"))}</span>`
    );
  }
  if (!parts.length) return "";
  return `<div class="card__badges">${parts.join("")}</div>`;
}

export function cardHtml(it) {
  const img = pickCardImage(it);
  const tag =
    it.deal === "rent"
      ? t("filters.deal.rent", "Аренда")
      : t("filters.deal.sale", "Продажа");
  const liked = it.isFavorite ? "is-liked" : "";
  const heart = it.isFavorite ? "❤️" : "🤍";
  const tour360 = t("card.tour.360", "360°");
  const tourVideo = t("card.tour.video", "видео");
  const title = pickI18n(it.titleI18n, it.title);
  return `<li>
    <article class="card" data-id="${esc(it.id)}" tabindex="0" role="link" aria-label="${esc(title)}">
      <div class="card__img-wrap">
        <img class="card__img" src="${esc(img)}" alt="" loading="lazy" />
        <span class="card__badge ${it.deal === "rent" ? "card__badge--rent" : "card__badge--sale"}">${esc(tag)}</span>
        ${it.has360 ? `<span class="tour-icon">🧭 ${esc(tour360)}</span>` : it.hasVideo ? `<span class="tour-icon">🎬 ${esc(tourVideo)}</span>` : ""}
        <button type="button" class="card__fav ${liked}" data-fav="${esc(it.id)}" aria-label="${esc(
          t("card.favorite", "В избранное")
        )}">${heart}</button>
      </div>
      <div class="card__body">
        ${priceBlockHtml(it)}
        <h2 class="card__title">${esc(title)}</h2>
        <p class="card__meta">
          <span>${esc(it.district)}</span>
          <span>${esc(it.rooms)}</span>
          <span>${esc(it.area)}</span>
          <span>${esc(it.floor)}</span>
        </p>
        ${listingBadgesHtml(it)}
        ${trustBadgeHtml(it)}
      </div>
    </article>
  </li>`;
}

export function bindCards() {
  const list = document.getElementById("list");
  if (!list) return;
  list.querySelectorAll(".card").forEach((card) => {
    const openFromCard = (e) => {
      if (e.target.closest(".card__fav")) return;
      const id = card.getAttribute("data-id");
      const it = state.items.find((x) => x.id === id);
      if (it) openDetail(it);
    };
    card.addEventListener("click", openFromCard);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openFromCard(e);
      }
    });
  });
  list.querySelectorAll(".card__fav").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!state.token) {
        toast(t("auth.needLoginFavorite", "Войдите, чтобы добавлять в избранное"));
        openAuth();
        return;
      }
      const id = btn.getAttribute("data-fav");
      try {
        const it = state.items.find((x) => x.id === id);
        if (it.isFavorite) {
          await api(`/favorites/${id}`, { method: "DELETE" });
          it.isFavorite = false;
        } else {
          await api(`/favorites/${id}`, { method: "POST" });
          it.isFavorite = true;
        }
        renderHomeList();
      } catch (err) {
        toast(err.message);
      }
    });
  });
}

export function renderHomeList() {
  if (lastLoadFailed) return;
  const list = document.getElementById("list");
  if (!list) return;
  const n = state.items.length;
  const counter = document.getElementById("resultsCount");
  if (counter) {
    counter.textContent = formatListingCount(n);
  }
  if (n === 0) {
    const active = hasActiveFilters();
    const title = active
      ? t("home.empty.filters.title", "Ничего не найдено")
      : t("home.empty.title", "Пока нет объявлений");
    const text = active
      ? t(
          "home.empty.filters.text",
          "Под выбранные фильтры объявлений нет. Сбросьте часть условий или измените запрос."
        )
      : t("home.empty.text", "Скоро здесь появятся новые объявления — загляните позже.");
    const action = active
      ? `<button type="button" class="btn btn--primary" data-reset-filters>${esc(
          t("home.empty.reset", "Сбросить фильтры")
        )}</button>`
      : "";
    list.innerHTML = `<li class="state-block-li"><div class="state-block">
      <div class="state-block__icon" aria-hidden="true">🏠</div>
      <h3 class="state-block__title">${esc(title)}</h3>
      <p class="state-block__text">${esc(text)}</p>
      <div class="state-block__actions">${action}</div>
    </div></li>`;
    list.querySelector("[data-reset-filters]")?.addEventListener("click", () => {
      resetHomeFilters();
      loadListings();
    });
    return;
  }
  list.innerHTML = state.items.map(cardHtml).join("");
  bindCards();
  attachCardImageFallback(list);
}

export function bindHomeFilters() {
  const seg = document.querySelector("#view-home .segment");
  if (seg) {
    seg.addEventListener("click", (e) => {
      const b = e.target.closest(".segment__btn[data-deal]");
      if (!b) return;
      document
        .querySelectorAll("#view-home .segment__btn")
        .forEach((x) => x.classList.remove("is-active"));
      b.classList.add("is-active");
      state.filters.deal = b.getAttribute("data-deal");
      loadListings();
    });
  }
  const chips = document.querySelector("#view-home .chips:not(.chips--rooms)");
  if (chips) {
    chips.addEventListener("click", (e) => {
      const c = e.target.closest(".chip[data-type]");
      if (!c) return;
      chips
        .querySelectorAll(".chip")
        .forEach((x) => x.classList.remove("is-active"));
      c.classList.add("is-active");
      state.filters.type = c.getAttribute("data-type");
      loadListings();
    });
  }
  const roomsChips = document.getElementById("roomsChips");
  if (roomsChips) {
    roomsChips.addEventListener("click", (e) => {
      const c = e.target.closest(".chip[data-rooms]");
      if (!c) return;
      roomsChips
        .querySelectorAll(".chip")
        .forEach((x) => x.classList.remove("is-active"));
      c.classList.add("is-active");
      state.filters.rooms = c.getAttribute("data-rooms");
      loadListings();
    });
  }
  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      state.filters.search = e.target.value;
      loadListings();
    });
  }
  const verifiedCb = document.getElementById("filterVerifiedOnly");
  if (verifiedCb) {
    verifiedCb.addEventListener("change", () => {
      state.filters.verifiedOnly = verifiedCb.checked;
      loadListings();
    });
  }
  const cb360 = document.getElementById("filter360");
  if (cb360)
    cb360.addEventListener("change", () => {
      state.filters.has360 = cb360.checked;
      loadListings();
    });
  const cbVideo = document.getElementById("filterVideo");
  if (cbVideo)
    cbVideo.addEventListener("change", () => {
      state.filters.hasVideo = cbVideo.checked;
      loadListings();
    });
  const cbLive = document.getElementById("filterLive");
  if (cbLive)
    cbLive.addEventListener("change", () => {
      state.filters.liveAvailable = cbLive.checked;
      loadListings();
    });
  document.getElementById("btnShowOnMap")?.addEventListener("click", () => {
    if (!state.items?.length) {
      toast(t("home.error.title", "Не удалось загрузить объявления"));
    }
    setView("map");
  });
}
