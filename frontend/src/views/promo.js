import { api } from "../api.js";
import { state } from "../state.js";
import { esc, toast } from "../utils.js";
import { t } from "../i18n.js";

let myListings = [];
let tiersCache = [];

function tierCardHtml(tier) {
  const perks = (tier.perks || [])
    .map((p) => `<li>${esc(p)}</li>`)
    .join("");
  return `<article class="promo-tier" data-tier="${esc(tier.code)}">
    <header class="promo-tier__head">
      <span class="badge ${tier.code === "VIP" ? "badge--vip" : tier.code === "TOP" ? "badge--top" : "badge--premium"}">${esc(tier.title)}</span>
      <span class="promo-tier__days">${tier.days} ${esc(t("promo.days", "дн."))}</span>
    </header>
    <p class="promo-tier__price">${esc(tier.amountSom.toLocaleString("ru-RU"))} <small>сом</small></p>
    <ul class="promo-tier__perks">${perks}</ul>
    <div class="promo-tier__action">
      <select class="field__input promo-tier__select" data-tier-listing="${esc(tier.code)}">
        <option value="">${esc(t("promo.pickListing", "Выберите объявление…"))}</option>
        ${myListings
          .map(
            (l) => `<option value="${esc(l.id)}">${esc(l.title)} · ${esc(l.district || "")}</option>`
          )
          .join("")}
      </select>
      <button type="button" class="btn btn--primary" data-activate-tier="${esc(tier.code)}">
        ${esc(t("promo.activate", "Активировать"))}
      </button>
    </div>
  </article>`;
}

async function loadMyListings() {
  if (!state.user) return [];
  try {
    /* у нас нет /listings/mine, поэтому используем /admin/listings? Нет — фильтруем из публичной выдачи по userId. */
    const { items } = await api(`/listings`);
    myListings = (items || []).filter((l) => l.user?.id === state.user.id || l.userId === state.user.id);
    return myListings;
  } catch {
    myListings = [];
    return [];
  }
}

async function refreshTiers() {
  const list = document.getElementById("promoTiersList");
  const note = document.getElementById("promoNote");
  if (!list) return;
  list.innerHTML = `<div class="skeleton" style="height:160px;border-radius:var(--radius)"></div>`;
  try {
    const { items, note: serverNote } = await api(`/promo/tiers`);
    tiersCache = items || [];
    list.innerHTML = tiersCache.map(tierCardHtml).join("");
    if (note) note.textContent = serverNote || "";
    list.querySelectorAll("[data-activate-tier]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const code = btn.getAttribute("data-activate-tier");
        const sel = list.querySelector(`[data-tier-listing="${code}"]`);
        const lid = sel?.value;
        if (!lid) {
          toast(t("promo.pickListing", "Выберите объявление…"));
          return;
        }
        try {
          await api(`/promo/activate`, {
            method: "POST",
            body: { listingId: lid, tier: code },
          });
          toast(t("promo.activated", "Тариф активирован (demo). Объявление получит приоритет."));
        } catch (err) {
          toast(err.message);
        }
      });
    });
  } catch (err) {
    list.innerHTML = `<p class="form__intro">${esc(err.message)}</p>`;
  }
}

export function showPromoCard(visible) {
  const card = document.getElementById("promoCard");
  if (card) card.hidden = !visible;
}

export async function loadPromoView() {
  await loadMyListings();
  await refreshTiers();
}
