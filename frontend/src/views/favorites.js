import { state } from "../state.js";
import { api } from "../api.js";
import { attachCardImageFallback } from "../utils.js";
import { cardHtml, loadListings } from "./home.js";
import { openDetail } from "./detail.js";

export async function loadFavorites() {
  const list = document.getElementById("favoritesList");
  const empty = document.getElementById("favoritesEmpty");
  if (!list || !empty) return;
  if (!state.token) {
    list.innerHTML = "";
    empty.hidden = false;
    empty.querySelector(".empty__text").textContent =
      "Войдите в аккаунт, чтобы сохранять объявления в избранное.";
    return;
  }
  empty.querySelector(".empty__text").textContent =
    "Добавляйте сердечком на карточке — объявления появятся здесь.";
  try {
    const { items } = await api("/favorites");
    if (!items.length) {
      list.innerHTML = "";
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    list.innerHTML = items.map(cardHtml).join("");
    attachCardImageFallback(list);
    list.querySelectorAll(".card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest(".card__fav")) return;
        const id = card.getAttribute("data-id");
        const it = items.find((x) => x.id === id);
        if (it) openDetail(it);
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
    /* ignore */
  }
}
