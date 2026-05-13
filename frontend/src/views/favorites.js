import { state } from "../state.js";
import { api } from "../api.js";
import { attachCardImageFallback, esc } from "../utils.js";
import { cardHtml, loadListings } from "./home.js";
import { openDetail } from "./detail.js";
import { openAuth } from "./auth.js";
import { t } from "../i18n.js";
import { setView } from "../router.js";

function skeletonHtml(n = 4) {
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

function renderFavState({ title, text, button }) {
  const list = document.getElementById("favoritesList");
  const empty = document.getElementById("favoritesEmpty");
  if (list) list.innerHTML = "";
  if (!empty) return;
  empty.hidden = false;
  empty.classList.add("state-block");
  empty.innerHTML = `
    <div class="state-block__icon" aria-hidden="true">❤</div>
    <h3 class="state-block__title">${esc(title)}</h3>
    <p class="state-block__text">${esc(text)}</p>
    ${button ? `<div class="state-block__actions">${button}</div>` : ""}
  `;
}

export async function loadFavorites() {
  const list = document.getElementById("favoritesList");
  const empty = document.getElementById("favoritesEmpty");
  if (!list || !empty) return;

  if (!state.token) {
    renderFavState({
      title: t("fav.guest.title", "Войдите в аккаунт"),
      text: t("fav.guest.text", "Сохраняйте объявления и быстро возвращайтесь к ним."),
      button: `<button type="button" class="btn btn--primary" data-fav-login>${esc(
        t("auth.loginPrompt", "Войти / Регистрация")
      )}</button>`,
    });
    empty.querySelector("[data-fav-login]")?.addEventListener("click", () => openAuth("login"));
    return;
  }

  empty.hidden = true;
  list.innerHTML = skeletonHtml(4);

  try {
    const { items } = await api("/favorites");
    if (!items.length) {
      renderFavState({
        title: t("fav.empty.title", "Пока пусто"),
        text: t(
          "fav.empty.text",
          "Нажмите сердечко на любой карточке — объявление появится здесь."
        ),
        button: `<button type="button" class="btn btn--primary" data-fav-go-home>${esc(
          t("fav.empty.cta", "К объявлениям")
        )}</button>`,
      });
      empty.querySelector("[data-fav-go-home]")?.addEventListener("click", () => setView("home"));
      return;
    }
    empty.hidden = true;
    list.innerHTML = items.map(cardHtml).join("");
    attachCardImageFallback(list);
    list.querySelectorAll(".card").forEach((card) => {
      const open = (e) => {
        if (e.target.closest(".card__fav")) return;
        const id = card.getAttribute("data-id");
        const it = items.find((x) => x.id === id);
        if (it) openDetail(it);
      };
      card.addEventListener("click", open);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open(e);
        }
      });
    });
    list.querySelectorAll(".card__fav").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-fav");
        await api(`/favorites/${id}`, { method: "DELETE" });
        loadFavorites();
        loadListings();
      });
    });
  } catch {
    renderFavState({
      title: t("fav.error.title", "Не удалось загрузить"),
      text: t("fav.error.text", "Попробуйте обновить страницу или вернуться позже."),
      button: `<button type="button" class="btn btn--primary" data-fav-retry>${esc(
        t("home.error.retry", "Повторить")
      )}</button>`,
    });
    empty.querySelector("[data-fav-retry]")?.addEventListener("click", loadFavorites);
  }
}
