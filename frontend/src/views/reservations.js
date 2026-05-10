import { state } from "../state.js";
import { api } from "../api.js";
import { esc, toast } from "../utils.js";
import { onRealtimeMessage } from "../realtime.js";

const STATUS_LABELS = {
  RESERVED: "Забронировано",
  CONTRACTED: "В договоре",
  PAID: "Аванс внесён",
  CANCELLED: "Отменено",
  EXPIRED: "Истекло",
};

let unsub = null;

function fmtDate(d) {
  return d ? new Date(d).toLocaleString("ru-RU") : "—";
}

function reservationHtml(r) {
  const expiresClass =
    r.reservedUntil && new Date(r.reservedUntil) < new Date() ? "rent-row--bad" : "";
  return `<div class="deal-card">
    <div class="deal-card__head">
      <div>
        <p class="admin-card__title">${esc(r.listingTitle || "Юнит")}</p>
        <p class="inline-note">Статус: ${esc(STATUS_LABELS[r.status] || r.status)}</p>
      </div>
      <span class="trust-pill">${esc(r.status)}</span>
    </div>
    <p class="inline-note ${expiresClass}">Бронь до ${fmtDate(r.reservedUntil)}</p>
    ${
      r.prepayAmount
        ? `<p class="inline-note">Аванс: ${r.prepayAmount} ${esc(r.prepayCurrency || "KGS")} (эскроу)</p>`
        : `<p class="inline-note">Без аванса</p>`
    }
    ${r.notes ? `<p class="inline-note">Комментарий: ${esc(r.notes)}</p>` : ""}
    <div class="deal-card__actions">
      ${
        r.status === "RESERVED" || r.status === "PAID"
          ? `<button type="button" class="btn btn--small" data-cancel="${esc(r.id)}">Отменить</button>`
          : ""
      }
    </div>
  </div>`;
}

async function render() {
  const box = document.getElementById("reservationsList");
  if (!box) return;
  if (!state.token) {
    box.innerHTML = "<p class='form__intro'>Войдите, чтобы видеть свои брони.</p>";
    return;
  }
  try {
    const { items } = await api("/reservations/mine");
    if (!items.length) {
      box.innerHTML = "<p class='form__intro'>Брони появятся здесь после нажатия «Забронировать онлайн» в карточке новостройки.</p>";
      return;
    }
    box.innerHTML = items.map(reservationHtml).join("");
    box.querySelectorAll("[data-cancel]").forEach((b) => {
      b.addEventListener("click", async () => {
        if (!confirm("Отменить бронь?")) return;
        try {
          await api(`/reservations/${b.getAttribute("data-cancel")}/cancel`, {
            method: "POST",
          });
          toast("Бронь отменена");
          render();
        } catch (err) {
          toast(err.message);
        }
      });
    });
  } catch (err) {
    box.innerHTML = `<p class="form__intro">${esc(err.message)}</p>`;
  }
}

async function renderSubscriptions() {
  const box = document.getElementById("complexSubsList");
  if (!box) return;
  if (!state.token) {
    box.innerHTML = "<p class='form__intro'>Войдите, чтобы управлять подписками.</p>";
    return;
  }
  try {
    const { items } = await api("/complexes/mine/subscriptions");
    if (!items.length) {
      box.innerHTML = "<p class='form__intro'>Подпишитесь на ЖК во вкладке «Новостройки», чтобы получать push о каждом этапе стройки.</p>";
      return;
    }
    box.innerHTML = items
      .map(
        (c) => `<div class="saved-search-item">
          <div>
            <p class="admin-card__title">${esc(c.name)}</p>
            <p class="inline-note">${esc(c.district || "")} · ${c.progressPercent || 0}% · подписчиков ${c.subscriberCount || 0}</p>
          </div>
          <button type="button" class="btn btn--ghost btn--small" data-open="${esc(c.slug)}">Открыть</button>
          <button type="button" class="btn btn--ghost btn--small" data-unsub="${esc(c.id)}">Отписаться</button>
        </div>`
      )
      .join("");
    box.querySelectorAll("[data-open]").forEach((b) => {
      b.addEventListener("click", async () => {
        const { openComplex } = await import("./newbuilds.js");
        openComplex(b.getAttribute("data-open"));
      });
    });
    box.querySelectorAll("[data-unsub]").forEach((b) => {
      b.addEventListener("click", async () => {
        try {
          await api(`/complexes/${b.getAttribute("data-unsub")}/unsubscribe`, {
            method: "POST",
          });
          toast("Отписались");
          renderSubscriptions();
        } catch (err) {
          toast(err.message);
        }
      });
    });
  } catch (err) {
    box.innerHTML = `<p class="form__intro">${esc(err.message)}</p>`;
  }
}

export function bindReservations() {
  document.getElementById("btnRefreshReservations")?.addEventListener("click", render);
  document.getElementById("btnRefreshComplexSubs")?.addEventListener("click", renderSubscriptions);
  if (!unsub) {
    unsub = onRealtimeMessage((msg) => {
      if (msg.type !== "notify") return;
      if (msg.kind?.startsWith("reservation")) render();
      if (msg.kind?.startsWith("complex")) renderSubscriptions();
    });
  }
}

export async function loadReservations() {
  await render();
  await renderSubscriptions();
}
