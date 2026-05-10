import { state } from "../state.js";
import { api } from "../api.js";
import { esc, toast } from "../utils.js";
import { ensurePushSubscription, isPushSupported } from "../push.js";

function currentFilters() {
  const f = { ...state.filters };
  for (const k of Object.keys(f)) {
    if (f[k] === "all" || f[k] === "" || f[k] == null) delete f[k];
  }
  return f;
}

function summary(filters) {
  const parts = [];
  if (filters.deal === "rent") parts.push("Аренда");
  else if (filters.deal === "sale") parts.push("Продажа");
  if (filters.type && filters.type !== "all") parts.push(filters.type);
  if (filters.search) parts.push(`«${filters.search}»`);
  return parts.length ? parts.join(" · ") : "Все";
}

async function refresh() {
  if (!state.token) {
    state.savedSearches = [];
    render();
    return;
  }
  try {
    const { items } = await api("/saved-searches");
    state.savedSearches = items;
    render();
  } catch {
    /* ignore */
  }
}

function render() {
  const box = document.getElementById("savedSearchesList");
  if (!box) return;
  if (!state.token) {
    box.innerHTML = "<p class='form__intro'>Войдите, чтобы сохранять поиски.</p>";
    return;
  }
  if (!state.savedSearches.length) {
    box.innerHTML =
      "<p class='form__intro'>Пока нет сохранённых поисков. Откройте «Главная», задайте фильтры и нажмите «Сохранить поиск».</p>";
    return;
  }
  box.innerHTML = state.savedSearches
    .map(
      (s) => `<div class="saved-search-item" data-id="${esc(s.id)}">
      <div>
        <p class="admin-card__title">${esc(s.name)}</p>
        <p class="inline-note">${esc(summary(s.filters))}</p>
      </div>
      <div class="saved-search-item__actions">
        <label class="saved-search-toggle">
          <input type="checkbox" data-toggle-notify="${esc(s.id)}" ${s.notify ? "checked" : ""}/>
          <span>Push</span>
        </label>
        <button type="button" class="btn btn--secondary btn--small" data-apply="${esc(s.id)}">Применить</button>
        <button type="button" class="btn btn--small" data-del="${esc(s.id)}">Удалить</button>
      </div>
    </div>`
    )
    .join("");

  box.querySelectorAll("[data-toggle-notify]").forEach((cb) => {
    cb.addEventListener("change", async () => {
      const id = cb.getAttribute("data-toggle-notify");
      const notify = cb.checked;
      try {
        if (notify) await ensurePushSubscription();
        await api(`/saved-searches/${id}`, { method: "PATCH", body: { notify } });
        const found = state.savedSearches.find((x) => x.id === id);
        if (found) found.notify = notify;
        toast(notify ? "Уведомления включены" : "Уведомления выключены");
      } catch (err) {
        toast(err.message);
      }
    });
  });
  box.querySelectorAll("[data-apply]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const s = state.savedSearches.find((x) => x.id === btn.getAttribute("data-apply"));
      if (!s) return;
      applyFiltersFromSearch(s.filters);
    });
  });
  box.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Удалить сохранённый поиск?")) return;
      try {
        await api(`/saved-searches/${btn.getAttribute("data-del")}`, {
          method: "DELETE",
        });
        await refresh();
        toast("Удалено");
      } catch (err) {
        toast(err.message);
      }
    });
  });
}

function applyFiltersFromSearch(filters) {
  state.filters.deal = filters.deal || "all";
  state.filters.type = filters.type || "all";
  state.filters.search = filters.search || "";

  document.querySelectorAll("#view-home .segment__btn").forEach((b) => {
    b.classList.toggle("is-active", b.getAttribute("data-deal") === state.filters.deal);
  });
  document.querySelectorAll("#view-home .chip").forEach((b) => {
    b.classList.toggle("is-active", b.getAttribute("data-type") === state.filters.type);
  });
  const searchInput = document.getElementById("searchInput");
  if (searchInput) searchInput.value = state.filters.search;

  import("./home.js").then(({ loadListings }) => loadListings());
  import("../router.js").then(({ setView }) => setView("home"));
}

async function saveCurrentSearch() {
  if (!state.token) {
    toast("Войдите, чтобы сохранять поиски");
    return;
  }
  const filters = currentFilters();
  if (!Object.keys(filters).length) {
    toast("Выберите хотя бы один фильтр или введите запрос");
    return;
  }
  const defaultName = summary(filters);
  const name = (window.prompt("Название поиска", defaultName) || "").trim();
  if (!name) return;
  if (isPushSupported()) {
    await ensurePushSubscription();
  }
  try {
    await api("/saved-searches", {
      method: "POST",
      body: { name, filters, notify: true },
    });
    toast("Поиск сохранён");
    await refresh();
  } catch (err) {
    toast(err.message);
  }
}

export function bindSavedSearches() {
  const saveBtn = document.getElementById("btnSaveSearch");
  if (saveBtn) saveBtn.addEventListener("click", saveCurrentSearch);
  const refreshBtn = document.getElementById("btnRefreshSavedSearches");
  if (refreshBtn) refreshBtn.addEventListener("click", refresh);
}

export async function loadSavedSearches() {
  await refresh();
}
