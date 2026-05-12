import { state } from "../state.js";
import { api } from "../api.js";
import { esc, plural, pickCardImage, toast, attachCardImageFallback } from "../utils.js";
import { openDetail } from "./detail.js";
import { openAuth } from "./auth.js";
import { refreshMapMarkers } from "./map.js";
import { trustBadgeHtml } from "./trustBadge.js";
import { pickI18n, t, getCurrentLang } from "../i18n.js";

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
  if (state.filters.search.trim()) p.set("search", state.filters.search.trim());
  if (state.filters.verifiedOnly) p.set("verifiedOnly", "true");
  if (state.filters.has360) p.set("has360", "true");
  if (state.filters.hasVideo) p.set("hasVideo", "true");
  if (state.filters.liveAvailable) p.set("liveAvailable", "true");
  const q = p.toString();
  return q ? `?${q}` : "";
}

export async function loadListings() {
  const { items } = await api(`/listings${buildQuery()}`);
  state.items = items;
  renderHomeList();
  if (state.map && state.markersLayer) refreshMapMarkers();
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
  return `<li>
    <article class="card" data-id="${esc(it.id)}">
      <div class="card__img-wrap">
        <img class="card__img" src="${esc(img)}" alt="" loading="lazy" />
        <span class="card__badge ${it.deal === "rent" ? "card__badge--rent" : "card__badge--sale"}">${esc(tag)}</span>
        ${it.has360 ? `<span class="tour-icon">🧭 ${esc(tour360)}</span>` : it.hasVideo ? `<span class="tour-icon">🎬 ${esc(tourVideo)}</span>` : ""}
        <button type="button" class="card__fav ${liked}" data-fav="${esc(it.id)}">${heart}</button>
      </div>
      <div class="card__body">
        <p class="card__price">${esc(it.price)} <small>${esc(it.currency)}</small></p>
        <h2 class="card__title">${esc(pickI18n(it.titleI18n, it.title))}</h2>
        <p class="card__meta">
          <span>${esc(it.district)}</span>
          <span>${esc(it.rooms)}</span>
          <span>${esc(it.area)}</span>
          <span>${esc(it.floor)}</span>
        </p>
        ${trustBadgeHtml(it)}
      </div>
    </article>
  </li>`;
}

export function bindCards() {
  const list = document.getElementById("list");
  if (!list) return;
  list.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".card__fav")) return;
      const id = card.getAttribute("data-id");
      const it = state.items.find((x) => x.id === id);
      if (it) openDetail(it);
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
  const list = document.getElementById("list");
  if (!list) return;
  const n = state.items.length;
  const counter = document.getElementById("resultsCount");
  if (counter) {
    counter.textContent = formatListingCount(n);
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
  const chips = document.querySelector("#view-home .chips");
  if (chips) {
    chips.addEventListener("click", (e) => {
      const c = e.target.closest(".chip[data-type]");
      if (!c) return;
      document.querySelectorAll("#view-home .chip").forEach((x) => x.classList.remove("is-active"));
      c.classList.add("is-active");
      state.filters.type = c.getAttribute("data-type");
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
}
