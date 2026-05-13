import { api } from "../api.js";
import { esc, pickCardImage, attachCardImageFallback } from "../utils.js";
import { pickI18n, t } from "../i18n.js";
import { priceInCurrentCurrency } from "../currency.js";
import { openDetail } from "./detail.js";
import { setView } from "../router.js";
import { state } from "../state.js";
import { openAgency } from "./agencies.js";

const RAIL_LIMIT = 8;

function railSkeleton(n = 4) {
  const item = `<li class="home-rail__item home-rail__item--skeleton">
    <div class="skeleton home-rail__img"></div>
    <div class="home-rail__body">
      <div class="skeleton skeleton-card__line skeleton-card__line--lg"></div>
      <div class="skeleton skeleton-card__line skeleton-card__line--md"></div>
      <div class="skeleton skeleton-card__line skeleton-card__line--sm"></div>
    </div>
  </li>`;
  return new Array(n).fill(item).join("");
}

function railCard(it) {
  const img = pickCardImage(it);
  const title = pickI18n(it.titleI18n, it.title);
  const conv = priceInCurrentCurrency(it.price, it.currency);
  const priceHtml = conv.converted
    ? `<p class="home-rail__price">${esc(conv.formatted)} <small>${esc(conv.symbol)}</small>
        <span class="card__price-alt">${esc(conv.originalFormatted)} <small>${esc(
          conv.originalSymbol
        )}</small></span></p>`
    : `<p class="home-rail__price">${esc(conv.formatted || it.price)} <small>${esc(
        conv.symbol || it.currency
      )}</small></p>`;
  const badges = [];
  if (it.urgent) badges.push(`<span class="badge badge--urgent">${esc(t("badge.urgent", "Срочно"))}</span>`);
  if (it.vipUntil && new Date(it.vipUntil) > new Date()) badges.push(`<span class="badge badge--vip">VIP</span>`);
  if (it.topUntil && new Date(it.topUntil) > new Date()) badges.push(`<span class="badge badge--top">TOP</span>`);
  return `<li class="home-rail__item" data-id="${esc(it.id)}" tabindex="0" role="link" aria-label="${esc(title)}">
    <div class="home-rail__img-wrap">
      <img class="home-rail__img" src="${esc(img)}" alt="" loading="lazy" />
      ${badges.length ? `<div class="home-rail__badges">${badges.join("")}</div>` : ""}
    </div>
    <div class="home-rail__body">
      ${priceHtml}
      <p class="home-rail__title">${esc(title)}</p>
      <p class="home-rail__meta">${esc(it.district || "")}${it.rooms ? ` · ${esc(it.rooms)}` : ""}${
        it.area ? ` · ${esc(it.area)}` : ""
      }</p>
    </div>
  </li>`;
}

function complexCard(c) {
  const cover = c.photoCover || "";
  const stage = c.currentStage || "";
  return `<li class="home-rail__item" data-slug="${esc(c.slug)}" tabindex="0" role="link" aria-label="${esc(
    c.name
  )}">
    <div class="home-rail__img-wrap home-rail__img-wrap--complex">
      ${cover ? `<div class="home-rail__img" style="background-image:url('${esc(cover)}')"></div>` : `<div class="home-rail__img home-rail__img--ph"></div>`}
    </div>
    <div class="home-rail__body">
      <p class="home-rail__title">${esc(c.name)}</p>
      <p class="home-rail__meta">${esc(c.district || "")}${
        c.deadline ? ` · ${new Date(c.deadline).getFullYear()}` : ""
      }</p>
      <p class="home-rail__price">${esc(t("home.complex.stage", "Этап"))}: ${esc(
        stage || "—"
      )} · ${c.progressPercent || 0}%</p>
    </div>
  </li>`;
}

async function fillRail({ listId, sectionId, deal }) {
  const list = document.getElementById(listId);
  const section = document.getElementById(sectionId);
  if (!list || !section) return;
  section.hidden = false;
  list.innerHTML = railSkeleton(4);
  try {
    const { items } = await api(`/listings?deal=${deal}`);
    const shown = (items || []).slice(0, RAIL_LIMIT);
    if (!shown.length) {
      section.hidden = true;
      return;
    }
    list.innerHTML = shown.map(railCard).join("");
    attachCardImageFallback(list);
    list.querySelectorAll(".home-rail__item").forEach((el) => {
      const open = () => {
        const id = el.getAttribute("data-id");
        const found = shown.find((x) => x.id === id);
        if (found) openDetail(found);
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
    section.hidden = true;
  }
}

async function fillNewbuilds() {
  const list = document.getElementById("homeNewbuildsList");
  const section = document.getElementById("homeNewbuildsSection");
  if (!list || !section) return;
  section.hidden = false;
  list.innerHTML = railSkeleton(4);
  try {
    const { items } = await api(`/complexes`);
    const shown = (items || []).slice(0, RAIL_LIMIT);
    if (!shown.length) {
      section.hidden = true;
      return;
    }
    list.innerHTML = shown.map(complexCard).join("");
    list.querySelectorAll(".home-rail__item").forEach((el) => {
      const open = async () => {
        const slug = el.getAttribute("data-slug");
        if (!slug) return;
        setView("newbuilds");
        const mod = await import("./newbuilds.js");
        mod.openComplex?.(slug);
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
    section.hidden = true;
  }
}

async function fillAgencies() {
  const list = document.getElementById("homeAgenciesList");
  const section = document.getElementById("homeAgenciesSection");
  if (!list || !section) return;
  section.hidden = false;
  list.innerHTML = railSkeleton(4);
  try {
    const { items } = await api(`/agencies?limit=8`);
    if (!items || !items.length) {
      section.hidden = true;
      return;
    }
    list.innerHTML = items
      .map(
        (a) => `<li class="home-rail__item home-rail__item--agency" data-slug="${esc(a.slug)}" tabindex="0" role="link">
        <div class="home-rail__img-wrap home-rail__img-wrap--agency">
          ${a.logo ? `<img class="home-rail__img" src="${esc(a.logo)}" alt="" />` : `<div class="home-rail__img home-rail__img--ph">🏢</div>`}
        </div>
        <div class="home-rail__body">
          <p class="home-rail__title">${esc(a.name)}</p>
          <p class="home-rail__meta">${esc(a.city || "")}${a.city ? " · " : ""}${esc(a.listingsCount || 0)} ${esc(
            t("home.agency.listings", "объявлений")
          )}</p>
          ${
            a.ratingCount
              ? `<p class="home-rail__price">★ ${esc(Number(a.ratingAvg || 0).toFixed(1))} <small>(${esc(
                  String(a.ratingCount)
                )})</small></p>`
              : ""
          }
        </div>
      </li>`
      )
      .join("");
    list.querySelectorAll(".home-rail__item").forEach((el) => {
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
  } catch {
    section.hidden = true;
  }
}

export function isHomeStreamMode() {
  const f = state.filters;
  return (
    f.deal === "all" &&
    f.type === "all" &&
    (!f.rooms || f.rooms === "all") &&
    !f.search.trim() &&
    !f.verifiedOnly &&
    !f.has360 &&
    !f.hasVideo &&
    !f.liveAvailable
  );
}

export function setHomeSectionsVisibility(visible) {
  ["homeSaleSection", "homeRentSection", "homeNewbuildsSection", "homeAgenciesSection"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (!visible) el.hidden = true;
  });
  const main = document.querySelector("#view-home .results-row");
  if (main) main.classList.toggle("results-row--no-streams", !visible);
}

export async function loadHomeSections() {
  if (!isHomeStreamMode()) {
    setHomeSectionsVisibility(false);
    return;
  }
  setHomeSectionsVisibility(true);
  await Promise.all([
    fillRail({ listId: "homeSaleList", sectionId: "homeSaleSection", deal: "sale" }),
    fillRail({ listId: "homeRentList", sectionId: "homeRentSection", deal: "rent" }),
    fillNewbuilds(),
    fillAgencies(),
  ]);
}

export function bindHomeSectionsActions() {
  document.getElementById("homeSaleMore")?.addEventListener("click", () => {
    state.filters.deal = "sale";
    document.querySelectorAll("#view-home .segment__btn").forEach((b) => {
      b.classList.toggle("is-active", b.getAttribute("data-deal") === "sale");
    });
    import("./home.js").then((m) => m.loadListings());
  });
  document.getElementById("homeRentMore")?.addEventListener("click", () => {
    state.filters.deal = "rent";
    document.querySelectorAll("#view-home .segment__btn").forEach((b) => {
      b.classList.toggle("is-active", b.getAttribute("data-deal") === "rent");
    });
    import("./home.js").then((m) => m.loadListings());
  });
  document.getElementById("homeNewbuildsMore")?.addEventListener("click", () => setView("newbuilds"));
  document.getElementById("homeAgenciesMore")?.addEventListener("click", () => setView("agencies"));
}
