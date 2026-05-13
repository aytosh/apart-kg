import { api } from "../api.js";
import { esc, attachCardImageFallback } from "../utils.js";
import { t } from "../i18n.js";
import { setView } from "../router.js";
import { state } from "../state.js";
import { cardHtml } from "./home.js";
import { openDetail } from "./detail.js";

let agenciesCache = [];
let searchTimer = null;

function ratingHtml(a) {
  if (!a.ratingCount) return `<span class="agency-card__rating">${esc(t("agencies.noReviews", "нет отзывов"))}</span>`;
  const avg = a.ratingAvg ? Number(a.ratingAvg).toFixed(1) : "—";
  return `<span class="agency-card__rating">★ ${esc(avg)} <small>(${a.ratingCount})</small></span>`;
}

function agencyCard(a) {
  return `<li class="agency-card" data-slug="${esc(a.slug)}" tabindex="0" role="link">
    <div class="agency-card__logo">
      ${a.logo ? `<img src="${esc(a.logo)}" alt="" loading="lazy" />` : `<div class="agency-card__logo-ph">🏢</div>`}
    </div>
    <div class="agency-card__body">
      <p class="agency-card__name">${esc(a.name)}${a.verified ? ` <span class="badge badge--vip">✓</span>` : ""}</p>
      <p class="agency-card__meta">${esc(a.city || "")} · ${a.listingsCount || 0} ${esc(
        t("home.agency.listings", "объявлений")
      )}</p>
      ${ratingHtml(a)}
    </div>
  </li>`;
}

function bindAgencyCards(root) {
  root.querySelectorAll(".agency-card").forEach((el) => {
    const open = () => {
      const slug = el.getAttribute("data-slug");
      if (slug) openAgency(slug);
    };
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });
}

function emptyState(title, text) {
  return `<li class="state-block-li"><div class="state-block">
    <div class="state-block__icon" aria-hidden="true">🏢</div>
    <h3 class="state-block__title">${esc(title)}</h3>
    <p class="state-block__text">${esc(text)}</p>
  </div></li>`;
}

export async function loadAgenciesList(search = "") {
  const list = document.getElementById("agenciesList");
  const inp = document.getElementById("agenciesSearch");
  if (!list) return;
  const q = (search ?? inp?.value ?? "").trim();
  list.innerHTML = `<li class="agency-card agency-card--skeleton"><div class="skeleton agency-card__logo"></div>
    <div class="agency-card__body"><div class="skeleton skeleton-card__line skeleton-card__line--lg"></div>
    <div class="skeleton skeleton-card__line skeleton-card__line--md"></div></div></li>`.repeat(4);
  try {
    const params = new URLSearchParams();
    if (q) params.set("search", q);
    const { items } = await api(`/agencies${params.toString() ? `?${params}` : ""}`);
    agenciesCache = items || [];
    if (!agenciesCache.length) {
      list.innerHTML = emptyState(
        t("agencies.empty.title", "Пока нет агентств"),
        t("agencies.empty.text", "Если вы агентство — добавьте профиль через «Ещё → Стать агентством».")
      );
      return;
    }
    list.innerHTML = agenciesCache.map(agencyCard).join("");
    bindAgencyCards(list);
  } catch (err) {
    list.innerHTML = emptyState(
      t("home.error.title", "Не удалось загрузить"),
      err?.message || t("home.error.text", "Проверьте подключение и попробуйте ещё раз.")
    );
  }
}

export function bindAgenciesView() {
  const inp = document.getElementById("agenciesSearch");
  if (inp) {
    inp.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => loadAgenciesList(inp.value), 250);
    });
  }
}

export async function openAgency(slug) {
  setView("agency");
  const root = document.getElementById("agencyPage");
  if (!root) return;
  root.innerHTML = `<div class="agency-page__loading"><div class="skeleton" style="height:120px;border-radius:var(--radius)"></div></div>`;
  try {
    const data = await api(`/agencies/${encodeURIComponent(slug)}`);
    const a = data.agency;
    const list = data.listings || [];
    root.innerHTML = `
      <header class="agency-head">
        <div class="agency-head__logo">
          ${a.logo ? `<img src="${esc(a.logo)}" alt="" />` : `<div class="agency-card__logo-ph">🏢</div>`}
        </div>
        <div class="agency-head__body">
          <h1 class="h2">${esc(a.name)} ${a.verified ? `<span class="badge badge--vip">✓</span>` : ""}</h1>
          <p class="caption">${esc(a.city || "")}${a.ratingCount ? ` · ★ ${Number(a.ratingAvg || 0).toFixed(1)} (${a.ratingCount})` : ""}</p>
          ${a.description ? `<p class="agency-head__desc">${esc(a.description)}</p>` : ""}
          <p class="agency-head__count">${list.length} ${esc(t("home.agency.listings", "объявлений"))}</p>
        </div>
      </header>
      <div class="agency-body">
        ${
          list.length
            ? `<ul class="list" id="agencyListings">${list.map(cardHtml).join("")}</ul>`
            : `<div class="state-block">
                <div class="state-block__icon" aria-hidden="true">🏠</div>
                <h3 class="state-block__title">${esc(t("home.empty.title", "Пока нет объявлений"))}</h3>
                <p class="state-block__text">${esc(
                  t("agencies.detail.empty", "У этого агентства пока нет активных объявлений.")
                )}</p>
              </div>`
        }
      </div>
    `;
    const ul = document.getElementById("agencyListings");
    if (ul) {
      attachCardImageFallback(ul);
      ul.querySelectorAll(".card").forEach((card) => {
        const open = () => {
          const id = card.getAttribute("data-id");
          const it = list.find((x) => x.id === id);
          if (it) openDetail(it);
        };
        card.addEventListener("click", open);
        card.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open();
          }
        });
      });
    }
  } catch (err) {
    root.innerHTML = `<div class="state-block">
      <div class="state-block__icon" aria-hidden="true">!</div>
      <h3 class="state-block__title">${esc(t("home.error.title", "Не удалось загрузить"))}</h3>
      <p class="state-block__text">${esc(err?.message || "")}</p>
      <div class="state-block__actions">
        <button type="button" class="btn btn--primary" id="agencyBack">${esc(
          t("agencies.back", "К каталогу агентств")
        )}</button>
      </div>
    </div>`;
    document.getElementById("agencyBack")?.addEventListener("click", () => setView("agencies"));
  }
}

export function getAgenciesCache() {
  return agenciesCache;
}
