import { state } from "./state.js";
import { loadListings } from "./views/home.js";
import { initMap } from "./views/map.js";
import { loadFavorites } from "./views/favorites.js";
import { loadChatThreads } from "./views/chat.js";
import { loadAdmin } from "./views/admin.js";
import { updateAddFormState } from "./views/listingForm.js";
import { loadMoreView } from "./views/more.js";
import { loadNewbuilds } from "./views/newbuilds.js";
import { loadRoommate } from "./views/roommate.js";
import { loadAgenciesList } from "./views/agencies.js";
import { toast } from "./utils.js";
import { track } from "./analytics.js";

const titles = {
  home: "",
  map: "Карта",
  add: "Разместить",
  favorites: "Избранное",
  chat: "Сообщения",
  admin: "Модерация / админ",
  more: "Ещё",
  newbuilds: "Новостройки",
  complex: "Жилой комплекс",
  roommate: "Сосед",
  building: "Профиль дома",
  agencies: "Агентства",
  agency: "Агентство",
};

export function setView(name) {
  if (state.view !== name) track("nav.view", { view: name });
  state.view = name;
  document.querySelectorAll(".view").forEach((v) => {
    const on = v.id === `view-${name}`;
    v.classList.toggle("view--active", on);
    v.hidden = !on;
  });
  document.querySelectorAll(".tabbar__item, .nav-main__item").forEach((b) => {
    b.classList.toggle("is-active", b.getAttribute("data-tab") === name);
  });
  const sectionTitle = titles[name] || "";
  const pageEl = document.getElementById("headerPageTitle");
  if (name === "home") {
    document.title = "Apart.kg — недвижимость Кыргызстана";
    if (pageEl) {
      pageEl.hidden = true;
      pageEl.textContent = "";
    }
  } else {
    document.title = sectionTitle ? `Apart.kg — ${sectionTitle}` : "Apart.kg";
    if (pageEl) {
      pageEl.hidden = false;
      pageEl.textContent = sectionTitle;
    }
  }
  const searchWrap = document.getElementById("headerSearchWrap");
  if (searchWrap) searchWrap.hidden = name !== "home";

  if (name === "home") loadListings();
  if (name === "map") requestAnimationFrame(() => initMap());
  if (name === "favorites") loadFavorites();
  if (name === "chat") {
    if (!state.token) toast("Войдите, чтобы пользоваться сообщениями");
    const listPanel = document.getElementById("chatListPanel");
    const threadPanel = document.getElementById("chatThreadPanel");
    if (listPanel) listPanel.hidden = false;
    if (threadPanel) threadPanel.hidden = true;
    loadChatThreads();
  }
  if (name === "admin") loadAdmin();
  if (name === "add") updateAddFormState();
  if (name === "more") loadMoreView();
  if (name === "newbuilds") loadNewbuilds();
  if (name === "roommate") loadRoommate();
  if (name === "agencies") loadAgenciesList();
}

export function bindRouterEvents() {
  document.querySelector(".app")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".tabbar__item[data-tab], .nav-main__item[data-tab]");
    if (!btn) return;
    setView(btn.getAttribute("data-tab"));
  });
  document.getElementById("brandHome")?.addEventListener("click", (e) => {
    e.preventDefault();
    setView("home");
  });
}
