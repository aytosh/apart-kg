import { state } from "../state.js";
import { api } from "../api.js";
import { esc, toast } from "../utils.js";
import { onRealtimeMessage } from "../realtime.js";

let myPostId = null;
let queue = [];
let unsub = null;

function tagListInput(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length < 30)
    .slice(0, 24);
}

function postCardHtml(p) {
  const tags = (p.lifestyleTags || []).map((t) => `<span class="tag-chip">${esc(t)}</span>`).join("");
  return `<article class="roommate-card" data-id="${esc(p.id)}">
    <div class="roommate-card__head">
      <p class="roommate-card__name">${esc(p.user?.name || "Без имени")}${
        p.user?.verifiedLevel === "ID" ? " ✓" : ""
      }</p>
      <p class="roommate-card__meta">${esc(p.district)} · бюджет ${p.budgetMin}–${p.budgetMax} KGS · ${
        p.lookingFor === "SHARE_FLAT" ? "хочет жить вместе" : "ищет комнату"
      }</p>
      ${
        typeof p.matchScore === "number"
          ? `<p class="roommate-card__score">Совпадение ${p.matchScore}% (теги ${p.tagOverlap}%, бюджет ${p.budgetOverlap}%)</p>`
          : ""
      }
    </div>
    <p class="roommate-card__bio">${esc(p.bio)}</p>
    ${tags ? `<div class="roommate-card__tags">${tags}</div>` : ""}
    <div class="roommate-card__actions">
      <button type="button" class="btn btn--secondary btn--small" data-act="skip">✕ Не подходит</button>
      <button type="button" class="btn btn--primary btn--small" data-act="like">❤ Подходим</button>
    </div>
  </article>`;
}

function matchCardHtml(p) {
  return `<div class="saved-search-item">
    <div>
      <p class="admin-card__title">${esc(p.user?.name || "Совпадение")}${
        p.user?.verifiedLevel === "ID" ? " ✓" : ""
      }</p>
      <p class="inline-note">${esc(p.district)} · ${p.budgetMin}–${p.budgetMax} KGS</p>
      <p class="inline-note">${esc(p.bio.slice(0, 200))}</p>
    </div>
  </div>`;
}

async function loadMine() {
  if (!state.token) return null;
  const { items } = await api("/roommates/mine");
  const active = items.find((i) => i.active) || items[0];
  myPostId = active?.id || null;
  return active || null;
}

function showSwipe() {
  const swipe = document.getElementById("roommateSwipeBox");
  const formBox = document.getElementById("roommateMyForm");
  if (swipe) swipe.hidden = false;
  if (formBox) formBox.hidden = true;
}

function showForm() {
  const swipe = document.getElementById("roommateSwipeBox");
  const formBox = document.getElementById("roommateMyForm");
  if (swipe) swipe.hidden = true;
  if (formBox) formBox.hidden = false;
}

async function renderQueue() {
  const box = document.getElementById("roommateSwipeBox");
  if (!box) return;
  if (!queue.length) {
    box.innerHTML =
      "<p class='form__intro'>Все анкеты в вашем районе пересмотрены. Попробуйте позже или измените фильтры.</p>";
    return;
  }
  box.innerHTML = queue.map(postCardHtml).join("");
  box.querySelectorAll(".roommate-card").forEach((card) => {
    const id = card.getAttribute("data-id");
    card.querySelector('[data-act="like"]')?.addEventListener("click", () => decide(id, true));
    card.querySelector('[data-act="skip"]')?.addEventListener("click", () => decide(id, false));
  });
}

async function decide(postId, liked) {
  try {
    const r = await api(`/roommates/${postId}/like`, { method: "POST", body: { liked } });
    if (r.match) {
      toast("🎉 Совпадение! Откройте раздел «Совпадения», чтобы написать.");
      renderMatches();
    }
  } catch (err) {
    toast(err.message);
    return;
  }
  queue = queue.filter((q) => q.id !== postId);
  renderQueue();
}

async function renderFeed() {
  if (!myPostId) return;
  try {
    const { items } = await api("/roommates/feed");
    queue = items;
    renderQueue();
  } catch (err) {
    const box = document.getElementById("roommateSwipeBox");
    if (box) box.innerHTML = `<p class="form__intro">${esc(err.message)}</p>`;
  }
}

async function renderMatches() {
  const box = document.getElementById("roommateMatches");
  if (!box) return;
  if (!state.token) {
    box.innerHTML = "<p class='form__intro'>Войдите, чтобы видеть совпадения.</p>";
    return;
  }
  try {
    const { items } = await api("/roommates/matches");
    box.innerHTML = items.length
      ? items.map(matchCardHtml).join("")
      : "<p class='form__intro'>Совпадений пока нет — пробуйте лайкать анкеты.</p>";
  } catch (err) {
    box.innerHTML = `<p class="form__intro">${esc(err.message)}</p>`;
  }
}

async function bindForm() {
  const form = document.getElementById("formRoommate");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.token) {
      toast("Войдите, чтобы создать анкету");
      return;
    }
    const fd = new FormData(form);
    const body = {
      district: String(fd.get("district") || ""),
      budgetMin: Number(fd.get("budgetMin") || 0),
      budgetMax: Number(fd.get("budgetMax") || 0),
      bio: String(fd.get("bio") || ""),
      lifestyleTags: tagListInput(fd.get("lifestyleTags") || ""),
      lookingFor: String(fd.get("lookingFor") || "SHARE_FLAT"),
    };
    try {
      const created = await api("/roommates", { method: "POST", body });
      myPostId = created.id;
      toast("Анкета сохранена");
      showSwipe();
      renderFeed();
    } catch (err) {
      toast(err.message);
    }
  });
}

export function bindRoommate() {
  bindForm();
  document.getElementById("btnRoommateRefresh")?.addEventListener("click", () => {
    renderMatches();
    renderFeed();
  });
  if (!unsub) {
    unsub = onRealtimeMessage((msg) => {
      if (msg.type === "notify" && msg.kind === "roommate-match") {
        renderMatches();
      }
    });
  }
}

export async function loadRoommate() {
  if (!state.token) {
    showForm();
    const hint = document.getElementById("roommateMyFormHint");
    if (hint) hint.textContent = "Войдите, чтобы создать анкету и видеть совпадения.";
    document.getElementById("roommateMatches").innerHTML =
      "<p class='form__intro'>Войдите, чтобы видеть совпадения.</p>";
    return;
  }
  const my = await loadMine();
  if (!my) {
    showForm();
    return;
  }
  const form = document.getElementById("formRoommate");
  if (form) {
    form.elements.district.value = my.district;
    form.elements.budgetMin.value = my.budgetMin;
    form.elements.budgetMax.value = my.budgetMax;
    form.elements.bio.value = my.bio;
    form.elements.lifestyleTags.value = (my.lifestyleTags || []).join(", ");
    form.elements.lookingFor.value = my.lookingFor;
  }
  showSwipe();
  await renderFeed();
  await renderMatches();
}
