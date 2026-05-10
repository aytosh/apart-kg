/**
 * Apartmant — локальное веб-приложение (без бэкенда).
 * Данные: localStorage + встроенный каталог.
 */

const STORAGE_EXTRA = "apartmant_extra_items";
const STORAGE_FAV = "apartmant_favorites";
const STORAGE_USER = "apartmant_user_name";

const BISHKEK = [42.8746, 74.5698];

const DEFAULT_ITEMS = [
  {
    id: "1",
    deal: "rent",
    type: "flat",
    title: "2-комн., центр, мебель",
    district: "Бишкек, Первомайский р-н",
    price: "45 000",
    currency: "сом / мес",
    rooms: "2 комн.",
    area: "54 м²",
    floor: "5 из 9",
    image: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80",
    tag: "Аренда",
    lat: 42.882,
    lng: 74.603,
    phone: "+996555000001",
  },
  {
    id: "2",
    deal: "sale",
    type: "flat",
    title: "3-комн., евроремонт, вид на горы",
    district: "Бишкек, Октябрьский р-н",
    price: "125 000",
    currency: "$",
    rooms: "3 комн.",
    area: "78 м²",
    floor: "12 из 16",
    image: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80",
    tag: "Продажа",
    lat: 42.868,
    lng: 74.582,
    phone: "+996555000002",
  },
  {
    id: "3",
    deal: "rent",
    type: "office",
    title: "Офис 85 м², бизнес-центр",
    district: "Бишкек, ул. Ибраимова",
    price: "120 000",
    currency: "сом / мес",
    rooms: "Офис",
    area: "85 м²",
    floor: "3 из 7",
    image: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80",
    tag: "Аренда",
    lat: 42.871,
    lng: 74.594,
    phone: "+996555000003",
  },
  {
    id: "4",
    deal: "sale",
    type: "new",
    title: "ЖК «Асман Сити», 2-комн. с котлована",
    district: "Чуйская обл., новостройка",
    price: "от 890 000",
    currency: "сом / м²",
    rooms: "2 комн.",
    area: "62 м²",
    floor: "Сдача 2026",
    image: "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=80",
    tag: "Новостройка",
    lat: 42.856,
    lng: 74.612,
    phone: "+996555000004",
  },
  {
    id: "5",
    deal: "rent",
    type: "house",
    title: "Дом с участком, посуточно",
    district: "Иссык-Куль, Чолпон-Ата",
    price: "8 000",
    currency: "сом / сутки",
    rooms: "Дом",
    area: "120 м²",
    floor: "Участок 6 сот.",
    image: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&q=80",
    tag: "Аренда",
    lat: 42.649,
    lng: 77.085,
    phone: "+996555000005",
  },
  {
    id: "6",
    deal: "sale",
    type: "flat",
    title: "1-комн., рассрочка от застройщика",
    district: "Бишкек, мкр. Ак-Кеме",
    price: "42 500",
    currency: "$",
    rooms: "1 комн.",
    area: "42 м²",
    floor: "8 из 12",
    image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&q=80",
    tag: "Продажа",
    lat: 42.889,
    lng: 74.556,
    phone: "+996555000006",
  },
];

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&q=80";

let activeDeal = "all";
let activeType = "all";
let searchQuery = "";
let currentView = "home";
let mapInstance = null;
let markersLayer = null;

function loadExtraItems() {
  try {
    const raw = localStorage.getItem(STORAGE_EXTRA);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveExtraItems(items) {
  localStorage.setItem(STORAGE_EXTRA, JSON.stringify(items));
}

function loadFavorites() {
  try {
    const raw = localStorage.getItem(STORAGE_FAV);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveFavorites(set) {
  localStorage.setItem(STORAGE_FAV, JSON.stringify([...set]));
}

function getAllItems() {
  return [...DEFAULT_ITEMS, ...loadExtraItems()];
}

function itemTag(item) {
  if (item.tag) return item.tag;
  return item.deal === "rent" ? "Аренда" : "Продажа";
}

function filterItems(items) {
  const q = searchQuery.trim().toLowerCase();
  return items.filter((item) => {
    if (activeDeal !== "all" && item.deal !== activeDeal) return false;
    if (activeType === "all") {
      /* ok */
    } else if (activeType === "new") {
      if (item.type !== "new") return false;
    } else if (item.type !== activeType) return false;
    if (q) {
      const hay = `${item.title} ${item.district}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function pluralize(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function showToast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    el.hidden = true;
  }, 2800);
}

function renderCardHtml(item) {
  const fav = loadFavorites();
  const liked = fav.has(item.id);
  return `
    <li>
      <article class="card" data-id="${escapeHtml(item.id)}" role="button" tabindex="0">
        <div class="card__img-wrap">
          <img class="card__img" src="${escapeHtml(item.image || FALLBACK_IMAGE)}" alt="" loading="lazy" width="400" height="250" />
          <span class="card__badge ${item.deal === "rent" ? "card__badge--rent" : "card__badge--sale"}">${escapeHtml(itemTag(item))}</span>
          <button type="button" class="card__fav ${liked ? "is-liked" : ""}" data-fav="${escapeHtml(item.id)}" aria-label="В избранное">${liked ? "❤️" : "🤍"}</button>
        </div>
        <div class="card__body">
          <p class="card__price">${escapeHtml(item.price)} <small>${escapeHtml(item.currency)}</small></p>
          <h2 class="card__title">${escapeHtml(item.title)}</h2>
          <p class="card__meta">
            <span>${escapeHtml(item.district)}</span>
            <span>${escapeHtml(item.rooms)}</span>
            <span>${escapeHtml(item.area)}</span>
            <span>${escapeHtml(item.floor)}</span>
          </p>
        </div>
      </article>
    </li>`;
}

function bindCardEvents(container) {
  container.querySelectorAll(".card__fav").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.getAttribute("data-fav");
      const fav = loadFavorites();
      if (fav.has(id)) fav.delete(id);
      else fav.add(id);
      saveFavorites(fav);
      renderHomeList();
      renderFavorites();
      if (mapInstance && markersLayer) refreshMapMarkers();
    });
  });
  container.querySelectorAll(".card").forEach((card) => {
    const open = () => {
      const id = card.getAttribute("data-id");
      const item = getAllItems().find((x) => x.id === id);
      if (item) openModal(item);
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

function renderHomeList() {
  const list = document.getElementById("list");
  const countEl = document.getElementById("resultsCount");
  const items = filterItems(getAllItems());

  countEl.textContent = `${items.length} ${pluralize(items.length, "объявление", "объявления", "объявлений")}`;

  list.innerHTML = items.map((item) => renderCardHtml(item)).join("");
  bindCardEvents(list);
}

function renderFavorites() {
  const list = document.getElementById("favoritesList");
  const empty = document.getElementById("favoritesEmpty");
  const fav = loadFavorites();
  const items = getAllItems().filter((x) => fav.has(x.id));

  if (items.length === 0) {
    list.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  list.innerHTML = items.map((item) => renderCardHtml(item)).join("");
  bindCardEvents(list);
}

function setView(name) {
  currentView = name;

  document.querySelectorAll(".view").forEach((v) => {
    const isActive = v.id === `view-${name}`;
    v.classList.toggle("view--active", isActive);
    v.hidden = !isActive;
    v.setAttribute("aria-hidden", isActive ? "false" : "true");
  });

  document.querySelectorAll(".tabbar__item").forEach((btn) => {
    const active = btn.getAttribute("data-tab") === name;
    btn.classList.toggle("is-active", active);
    if (active) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });

  const titleEl = document.getElementById("headerTitle");
  const searchWrap = document.getElementById("headerSearchWrap");
  const titles = {
    home: "Apartmant",
    map: "Карта",
    add: "Разместить",
    favorites: "Избранное",
    more: "Ещё",
  };
  titleEl.textContent = titles[name] || "Apartmant";
  searchWrap.hidden = name !== "home";

  if (name === "map") {
    requestAnimationFrame(() => initMap());
  }

  if (name === "favorites") {
    renderFavorites();
  }

  if (name === "more") {
    const un = localStorage.getItem(STORAGE_USER) || "";
    document.getElementById("userName").value = un;
  }
}

function initMap() {
  const el = document.getElementById("mapContainer");
  if (!el || typeof L === "undefined") {
    showToast("Карта недоступна (проверьте интернет для загрузки Leaflet).");
    return;
  }

  if (!mapInstance) {
    mapInstance = L.map(el, { scrollWheelZoom: true }).setView(BISHKEK, 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19,
    }).addTo(mapInstance);
    markersLayer = L.layerGroup().addTo(mapInstance);
    setTimeout(() => mapInstance.invalidateSize(), 300);
  } else {
    mapInstance.invalidateSize();
  }

  refreshMapMarkers();
}

function refreshMapMarkers() {
  if (!mapInstance || !markersLayer) return;
  markersLayer.clearLayers();
  const items = filterItems(getAllItems());
  const fav = loadFavorites();

  items.forEach((item) => {
    const lat = item.lat ?? BISHKEK[0];
    const lng = item.lng ?? BISHKEK[1];
    const marker = L.marker([lat, lng]);
    marker.bindPopup(
      `<strong>${escapeHtml(item.title)}</strong><br>${escapeHtml(item.price)} ${escapeHtml(item.currency)}`
    );
    marker.on("click", () => openModal(item));
    markersLayer.addLayer(marker);
  });

  if (items.length > 0) {
    const bounds = L.latLngBounds(items.map((i) => [i.lat ?? BISHKEK[0], i.lng ?? BISHKEK[1]]));
    mapInstance.fitBounds(bounds.pad(0.15));
  } else {
    mapInstance.setView(BISHKEK, 12);
  }
}

function openModal(item) {
  const modal = document.getElementById("modalDetail");
  document.getElementById("modalImgWrap").innerHTML = `<img class="modal__img" src="${escapeHtml(item.image || FALLBACK_IMAGE)}" alt="" />`;
  document.getElementById("modalPrice").innerHTML = `${escapeHtml(item.price)} <small>${escapeHtml(item.currency)}</small>`;
  document.getElementById("modalTitle").textContent = item.title;
  document.getElementById("modalMeta").innerHTML = `
    <span>${escapeHtml(item.district)}</span>
    <span>${escapeHtml(item.rooms)}</span>
    <span>${escapeHtml(item.area)}</span>
    <span>${escapeHtml(item.floor)}</span>`;
  const phone = item.phone || "+996555000000";
  const call = document.getElementById("modalCall");
  call.href = `tel:${phone.replace(/\s/g, "")}`;

  const chatBtn = document.getElementById("modalChat");
  chatBtn.onclick = () => {
    showToast("Демо: чат откроется в полной версии приложения.");
    modal.hidden = true;
    document.body.style.overflow = "";
  };

  modal.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeModal() {
  const modal = document.getElementById("modalDetail");
  modal.hidden = true;
  document.body.style.overflow = "";
}

document.getElementById("modalDetail").addEventListener("click", (e) => {
  if (e.target.matches("[data-close-modal]")) closeModal();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !document.getElementById("modalDetail").hidden) closeModal();
});

document.getElementById("tabbar").addEventListener("click", (e) => {
  const btn = e.target.closest(".tabbar__item[data-tab]");
  if (!btn) return;
  setView(btn.getAttribute("data-tab"));
});

document.getElementById("btnProfileShortcut").addEventListener("click", () => {
  setView("more");
});

document.getElementById("btnNotifications").addEventListener("click", () => {
  showToast("Новых уведомлений нет (демо).");
});

document.getElementById("searchInput").addEventListener("input", (e) => {
  searchQuery = e.target.value;
  renderHomeList();
  if (currentView === "map" && mapInstance) refreshMapMarkers();
});

document.querySelector("#view-home .segment").addEventListener("click", (e) => {
  const btn = e.target.closest(".segment__btn[data-deal]");
  if (!btn) return;
  document.querySelectorAll("#view-home .segment__btn").forEach((b) => {
    b.classList.remove("is-active");
    b.setAttribute("aria-selected", "false");
  });
  btn.classList.add("is-active");
  btn.setAttribute("aria-selected", "true");
  activeDeal = btn.getAttribute("data-deal");
  renderHomeList();
  if (currentView === "map" && mapInstance) refreshMapMarkers();
});

document.querySelector("#view-home .chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip[data-type]");
  if (!chip) return;
  document.querySelectorAll("#view-home .chip").forEach((c) => c.classList.remove("is-active"));
  chip.classList.add("is-active");
  activeType = chip.getAttribute("data-type");
  renderHomeList();
  if (currentView === "map" && mapInstance) refreshMapMarkers();
});

document.getElementById("formListing").addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const deal = fd.get("deal");
  const type = fd.get("type");
  const title = String(fd.get("title") || "").trim();
  const district = String(fd.get("district") || "").trim();
  const price = String(fd.get("price") || "").trim();
  const currency = String(fd.get("currency") || "").trim();
  const rooms = String(fd.get("rooms") || "").trim();
  const area = String(fd.get("area") || "").trim();
  const floor = String(fd.get("floor") || "").trim();
  let image = String(fd.get("image") || "").trim();
  if (!image) image = FALLBACK_IMAGE;

  const id = `u-${Date.now()}`;
  const jitter = () => (Math.random() - 0.5) * 0.06;
  const newItem = {
    id,
    deal,
    type,
    title,
    district,
    price,
    currency,
    rooms,
    area,
    floor,
    image,
    tag: deal === "rent" ? "Аренда" : "Продажа",
    lat: BISHKEK[0] + jitter(),
    lng: BISHKEK[1] + jitter(),
    phone: "+996555" + String(Math.floor(100000 + Math.random() * 900000)),
  };

  const extra = loadExtraItems();
  extra.push(newItem);
  saveExtraItems(extra);

  e.target.reset();
  showToast("Объявление добавлено и сохранено локально.");
  setView("home");
  renderHomeList();
  if (mapInstance) refreshMapMarkers();
});

document.getElementById("saveName").addEventListener("click", () => {
  const v = document.getElementById("userName").value.trim();
  localStorage.setItem(STORAGE_USER, v);
  showToast(v ? `Сохранено: ${v}` : "Имя очищено.");
});

document.getElementById("btnClearData").addEventListener("click", () => {
  if (!confirm("Удалить все добавленные объявления и избранное в этом браузере?")) return;
  localStorage.removeItem(STORAGE_EXTRA);
  localStorage.removeItem(STORAGE_FAV);
  showToast("Данные сброшены.");
  renderHomeList();
  renderFavorites();
  if (mapInstance && markersLayer) refreshMapMarkers();
});

setView("home");
renderHomeList();
