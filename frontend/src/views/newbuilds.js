import { state } from "../state.js";
import { api } from "../api.js";
import { esc, toast } from "../utils.js";
import { onRealtimeMessage } from "../realtime.js";

const STAGE_LABELS = {
  PLANNED: "Планирование",
  FOUNDATION: "Фундамент",
  FRAME: "Каркас",
  FACADE: "Фасад",
  INTERIOR: "Отделка",
  READY: "Сдан",
};

const STAGE_PROGRESS = {
  PLANNED: 5,
  FOUNDATION: 15,
  FRAME: 35,
  FACADE: 55,
  INTERIOR: 80,
  READY: 100,
};

let realtimeUnsub = null;
let activeTab = "feed";

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString("ru-RU") : "—";
}

function fmtRelative(d) {
  if (!d) return "";
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return "минуту назад";
  if (diff < 3600) return `${Math.round(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.round(diff / 3600)} ч назад`;
  if (diff < 86400 * 30) return `${Math.round(diff / 86400)} д назад`;
  return new Date(d).toLocaleDateString("ru-RU");
}

function progressBar(percent, stage) {
  const p = Math.max(0, Math.min(100, percent || STAGE_PROGRESS[stage] || 0));
  return `<div class="progress-bar" title="${esc(STAGE_LABELS[stage] || "")}, ${p}%"><span style="width:${p}%"></span></div>`;
}

function complexCard(c) {
  const cover = c.photoCover || "";
  const dev = c.developer
    ? `${esc(c.developer.name)}${c.developer.verified ? " ✓" : ""}`
    : "";
  return `<li class="complex-card" data-slug="${esc(c.slug)}">
    ${cover ? `<div class="complex-card__cover" style="background-image:url('${esc(cover)}')"></div>` : ""}
    <div class="complex-card__body">
      <p class="complex-card__title">${esc(c.name)}</p>
      <p class="complex-card__meta">${esc(c.district)}${c.deadline ? ` · сдача ${fmtDate(c.deadline)}` : ""}</p>
      <p class="complex-card__dev">${dev}</p>
      <p class="complex-card__stage">${esc(STAGE_LABELS[c.currentStage] || "")} · ${c.progressPercent || 0}%</p>
      ${progressBar(c.progressPercent, c.currentStage)}
      <p class="complex-card__counts">${c.totalUnits || "—"} юнитов · ${c.subscriberCount || 0} подписчиков</p>
    </div>
  </li>`;
}

async function renderList() {
  const box = document.getElementById("complexList");
  const empty = document.getElementById("complexEmpty");
  if (!box) return;
  const params = new URLSearchParams();
  if (state.complexFilters.stage) params.set("stage", state.complexFilters.stage);
  if (state.complexFilters.deadlineYear) {
    params.set("deadlineYear", state.complexFilters.deadlineYear);
  }
  try {
    const { items } = await api(`/complexes${params.toString() ? `?${params}` : ""}`);
    state.complexes = items;
    if (!items.length) {
      box.innerHTML = "";
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    box.innerHTML = items.map(complexCard).join("");
  } catch (err) {
    box.innerHTML = `<li class="form__intro">${esc(err.message)}</li>`;
  }
}

function bindList() {
  const box = document.getElementById("complexList");
  if (!box) return;
  box.addEventListener("click", (e) => {
    const card = e.target.closest(".complex-card");
    if (!card) return;
    const slug = card.getAttribute("data-slug");
    openComplex(slug);
  });
  document.getElementById("newbuildStage")?.addEventListener("change", (e) => {
    state.complexFilters.stage = e.target.value;
    renderList();
  });
  document.getElementById("newbuildYear")?.addEventListener("change", (e) => {
    state.complexFilters.deadlineYear = e.target.value;
    renderList();
  });
}

function feedItemHtml(it) {
  const stage = it.stage ? `<span class="feed-item__stage">${esc(STAGE_LABELS[it.stage] || it.stage)}</span>` : "";
  const milestone = it.milestone
    ? `<span class="feed-item__milestone">🚩 веха</span>`
    : "";
  const photos = (it.photos || [])
    .map((p) => `<img src="${esc(p)}" alt="фото стройки" loading="lazy" />`)
    .join("");
  return `<article class="feed-item">
    <header class="feed-item__head">
      <span class="feed-item__time">${esc(fmtRelative(it.createdAt))}</span>
      ${stage}
      ${milestone}
      ${typeof it.progressPercent === "number" ? `<span class="feed-item__pp">${it.progressPercent}%</span>` : ""}
    </header>
    <p class="feed-item__text">${esc(it.text)}</p>
    ${photos ? `<div class="feed-item__photos">${photos}</div>` : ""}
  </article>`;
}

function unitCardHtml(u) {
  const img = (() => {
    try {
      const arr = JSON.parse(u.images);
      return Array.isArray(arr) && arr[0] ? arr[0] : "";
    } catch {
      return "";
    }
  })();
  const stage = u.constructionStage ? STAGE_LABELS[u.constructionStage] : "";
  return `<li class="unit-card" data-id="${esc(u.id)}">
    ${img ? `<div class="unit-card__img" style="background-image:url('${esc(img)}')"></div>` : ""}
    <div class="unit-card__body">
      <p class="unit-card__title">${esc(u.title)}${u.unitNumber ? ` · ${esc(u.unitNumber)}` : ""}</p>
      <p class="unit-card__meta">${esc(u.rooms || "")} · ${esc(u.area || "")} · ${esc(u.floor || "")}</p>
      <p class="unit-card__price">${esc(u.price || "")} ${esc(u.currency || "")}</p>
      ${stage ? `<p class="unit-card__stage">Этап: ${esc(stage)}</p>` : ""}
      <button type="button" class="btn btn--primary btn--small" data-reserve="${esc(u.id)}">Забронировать онлайн</button>
    </div>
  </li>`;
}

function setActiveTab(tab) {
  activeTab = tab;
  document.querySelectorAll("#view-complex .complex__tab").forEach((b) => {
    b.classList.toggle("is-active", b.getAttribute("data-complex-tab") === tab);
  });
  ["feed", "units", "about"].forEach((name) => {
    const el = document.getElementById(`complex${name[0].toUpperCase() + name.slice(1)}`);
    if (el) el.hidden = name !== tab;
  });
}

async function renderComplexDetail(slug) {
  const heroBox = document.getElementById("complexHero");
  const progressBox = document.getElementById("complexProgress");
  const feedBox = document.getElementById("complexFeed");
  const unitsBox = document.getElementById("complexUnits");
  const aboutBox = document.getElementById("complexAbout");
  if (!heroBox || !feedBox) return;

  let detail;
  try {
    detail = await api(`/complexes/${encodeURIComponent(slug)}`);
  } catch (err) {
    heroBox.innerHTML = `<p class="form__intro">${esc(err.message)}</p>`;
    return;
  }
  state.complexDetail = detail;

  const dev = detail.developer
    ? `<p class="complex__developer">${esc(detail.developer.name)}${detail.developer.verified ? " ✓ верифицирован" : ""}</p>`
    : "";

  heroBox.innerHTML = `
    ${detail.photoCover ? `<div class="complex__cover" style="background-image:url('${esc(detail.photoCover)}')"></div>` : ""}
    <div class="complex__head">
      <h2 class="complex__title">${esc(detail.name)}</h2>
      <p class="complex__meta">${esc(detail.district)}${detail.deadline ? ` · сдача ${fmtDate(detail.deadline)}` : ""}</p>
      ${dev}
      <button type="button" class="btn btn--secondary btn--small" id="btnComplexSubscribe">${
        detail.isSubscribed ? "Отписаться от обновлений" : "Подписаться на обновления (push)"
      }</button>
    </div>`;

  progressBox.innerHTML = `
    <div class="complex__progress-row">
      <span>${esc(STAGE_LABELS[detail.currentStage] || "")} · ${detail.progressPercent || 0}%</span>
      <span>${detail.totalUnits || "—"} юнитов · ${detail.subscriberCount || 0} подписчиков</span>
    </div>
    ${progressBar(detail.progressPercent, detail.currentStage)}`;

  aboutBox.innerHTML = `
    <p>${esc(detail.about || "Описание скоро появится.")}</p>
    ${detail.address ? `<p class="form__intro">Адрес: ${esc(detail.address)}</p>` : ""}
    ${
      detail.developer
        ? `<p class="form__intro">Застройщик: ${esc(detail.developer.name)}${detail.developer.verified ? " ✓" : ""}</p>`
        : ""
    }`;

  document.getElementById("btnComplexSubscribe")?.addEventListener("click", async () => {
    if (!state.token) {
      toast("Войдите, чтобы подписаться");
      return;
    }
    try {
      if (detail.isSubscribed) {
        await api(`/complexes/${detail.id}/unsubscribe`, { method: "POST" });
        toast("Отписались");
      } else {
        await api(`/complexes/${detail.id}/subscribe`, { method: "POST" });
        toast("Подписка оформлена");
      }
      renderComplexDetail(detail.slug);
    } catch (err) {
      toast(err.message);
    }
  });

  try {
    const { items } = await api(`/complexes/${detail.id}/feed`);
    feedBox.innerHTML = items.length
      ? items.map(feedItemHtml).join("")
      : "<p class='form__intro'>Пока без обновлений. Подпишитесь — пришлём push при первом этапе.</p>";
  } catch (err) {
    feedBox.innerHTML = `<p class="form__intro">${esc(err.message)}</p>`;
  }

  try {
    const { items } = await api(`/complexes/${detail.id}/units`);
    unitsBox.innerHTML = items.length
      ? `<ul class="unit-list">${items.map(unitCardHtml).join("")}</ul>`
      : "<p class='form__intro'>Юнитов пока нет — застройщик скоро добавит.</p>";
    unitsBox.querySelectorAll("[data-reserve]").forEach((btn) => {
      btn.addEventListener("click", () => reserveUnit(btn.getAttribute("data-reserve")));
    });
  } catch (err) {
    unitsBox.innerHTML = `<p class="form__intro">${esc(err.message)}</p>`;
  }

  setActiveTab("feed");
}

async function reserveUnit(listingId) {
  if (!state.token) {
    toast("Войдите, чтобы забронировать");
    return;
  }
  const prepayStr = window.prompt(
    "Аванс (KGS, через эскроу). Можно оставить 0, чтобы зарезервировать без оплаты на 48 часов.",
    "10000"
  );
  if (prepayStr === null) return;
  const prepay = Number(prepayStr) || 0;
  const notes = window.prompt("Комментарий для застройщика (опционально)", "") || "";
  try {
    const r = await api(`/reservations/listings/${listingId}`, {
      method: "POST",
      body: { prepayAmount: prepay, notes },
    });
    toast(
      prepay > 0
        ? `Бронь оформлена, аванс ${prepay} ${r.prepayCurrency || "KGS"} на эскроу`
        : "Бронь без аванса оформлена на 48 часов"
    );
  } catch (err) {
    toast(err.message);
  }
}

export function bindNewbuilds() {
  bindList();
  document.getElementById("complexBack")?.addEventListener("click", () => {
    import("../router.js").then((mod) => mod.setView("newbuilds"));
  });
  document.querySelectorAll("#view-complex .complex__tab").forEach((b) => {
    b.addEventListener("click", () => setActiveTab(b.getAttribute("data-complex-tab")));
  });
  if (!realtimeUnsub) {
    realtimeUnsub = onRealtimeMessage((msg) => {
      if (msg.type !== "notify") return;
      if (msg.kind === "complex-update" || msg.kind === "complex-milestone") {
        if (state.view === "newbuilds") renderList();
        if (state.view === "complex" && state.complexDetail) {
          renderComplexDetail(state.complexDetail.slug);
        }
      }
    });
  }
}

export async function loadNewbuilds() {
  await renderList();
}

export async function openComplex(slug) {
  const { setView } = await import("../router.js");
  setView("complex");
  await renderComplexDetail(slug);
}
