import { api } from "../api.js";
import { state } from "../state.js";
import { esc, toast } from "../utils.js";
import { t } from "../i18n.js";
import { openAuth } from "./auth.js";

let callbacksRole = "incoming"; // 'incoming' (owner) | 'mine' (requester)

export function openCallbackForm(listing) {
  if (!listing) return;
  const modal = document.getElementById("modalCallbackForm");
  const form = document.getElementById("formCallback");
  if (!modal || !form) return;
  form.elements.listingId.value = listing.id;
  if (state.user) {
    form.elements.name.value = state.user.name || form.elements.name.value || "";
  }
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => form.elements.name.focus(), 50);
}

export function closeCallbackForm() {
  const modal = document.getElementById("modalCallbackForm");
  if (modal) modal.hidden = true;
  document.body.style.overflow = "";
}

export function bindCallbackModal() {
  document.querySelectorAll("[data-close-callback]").forEach((el) =>
    el.addEventListener("click", closeCallbackForm)
  );
  const form = document.getElementById("formCallback");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const body = {
        listingId: String(fd.get("listingId") || ""),
        name: String(fd.get("name") || "").trim(),
        phone: String(fd.get("phone") || "").trim(),
        preferredAt: String(fd.get("preferredAt") || "").trim() || null,
        comment: String(fd.get("comment") || "").trim() || null,
      };
      if (!body.listingId || !body.name || !body.phone) {
        toast(t("callback.required", "Заполните имя и телефон"));
        return;
      }
      try {
        await api("/callbacks", { method: "POST", body });
        toast(t("callback.sent", "Заявка отправлена. Владелец перезвонит."));
        closeCallbackForm();
        form.reset();
      } catch (err) {
        toast(err.message);
      }
    });
  }
}

function statusBadge(status) {
  const map = {
    NEW: { c: "badge--urgent", l: t("callback.status.new", "Новая") },
    CONTACTED: { c: "badge", l: t("callback.status.contacted", "Связались") },
    DONE: { c: "badge badge--vip", l: t("callback.status.done", "Готово") },
    CANCELLED: { c: "badge", l: t("callback.status.cancelled", "Отменена") },
  };
  const m = map[status] || map.NEW;
  return `<span class="badge ${m.c}">${esc(m.l)}</span>`;
}

function formatDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleString();
}

function rowHtml(c, role) {
  const actions =
    role === "incoming"
      ? `<div class="callback-row__actions">
          <button type="button" class="link-btn" data-cb-status="CONTACTED" data-cb-id="${esc(c.id)}">${esc(
            t("callback.action.contacted", "Связался")
          )}</button>
          <button type="button" class="link-btn" data-cb-status="DONE" data-cb-id="${esc(c.id)}">${esc(
            t("callback.action.done", "Готово")
          )}</button>
          <button type="button" class="link-btn" data-cb-status="CANCELLED" data-cb-id="${esc(c.id)}">${esc(
            t("callback.action.cancel", "Отменить")
          )}</button>
        </div>`
      : "";
  return `<div class="callback-row">
    <div class="callback-row__head">
      <strong>${esc(c.name)}</strong>
      <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>
      ${statusBadge(c.status)}
    </div>
    <div class="callback-row__meta">
      ${c.listing ? `<span>${esc(c.listing.title)}${c.listing.district ? ` · ${esc(c.listing.district)}` : ""}</span>` : ""}
      <span>${esc(formatDate(c.createdAt))}</span>
    </div>
    ${c.preferredAt ? `<div class="callback-row__meta">⏰ ${esc(c.preferredAt)}</div>` : ""}
    ${c.comment ? `<div class="callback-row__comment">${esc(c.comment)}</div>` : ""}
    ${actions}
  </div>`;
}

export function showCallbacksCard(visible) {
  const card = document.getElementById("callbacksCard");
  if (card) card.hidden = !visible;
}

export async function loadCallbacks() {
  const list = document.getElementById("callbacksList");
  if (!list) return;
  if (!state.token) {
    list.innerHTML = `<p class="form__intro">${esc(
      t("callback.guest", "Войдите, чтобы видеть заявки на звонок.")
    )}</p>`;
    return;
  }
  list.innerHTML = `<div class="skeleton" style="height:60px;border-radius:var(--radius-xs);margin-bottom:8px"></div>`.repeat(2);
  try {
    const role = callbacksRole === "mine" ? "mine" : "owner";
    const { items } = await api(`/callbacks?role=${role}`);
    if (!items.length) {
      list.innerHTML = `<p class="form__intro">${esc(
        callbacksRole === "incoming"
          ? t("callback.list.empty.incoming", "Пока нет входящих заявок.")
          : t("callback.list.empty.mine", "Вы пока не оставляли заявок.")
      )}</p>`;
      return;
    }
    list.innerHTML = items.map((c) => rowHtml(c, callbacksRole)).join("");
    list.querySelectorAll("[data-cb-status]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-cb-id");
        const status = btn.getAttribute("data-cb-status");
        try {
          await api(`/callbacks/${id}`, { method: "PATCH", body: { status } });
          await loadCallbacks();
        } catch (err) {
          toast(err.message);
        }
      });
    });
  } catch (err) {
    list.innerHTML = `<p class="form__intro">${esc(err.message)}</p>`;
  }
}

export function bindCallbackTabs() {
  document.querySelectorAll("[data-callback-tab]").forEach((b) => {
    b.addEventListener("click", () => {
      document.querySelectorAll("[data-callback-tab]").forEach((x) => x.classList.remove("is-active"));
      b.classList.add("is-active");
      callbacksRole = b.getAttribute("data-callback-tab") === "mine" ? "mine" : "incoming";
      loadCallbacks();
    });
  });
}

export function bindCallbackButton() {
  document.getElementById("modalCallback")?.addEventListener("click", () => {
    if (!state.detail) return;
    if (!state.token) {
      toast(t("callback.needLogin", "Войдите, чтобы оставить заявку"));
      openAuth("login");
      return;
    }
    if (state.user && state.detail.userId === state.user.id) {
      toast(t("detail.toast.ownListing", "Это ваше объявление"));
      return;
    }
    openCallbackForm(state.detail);
  });
}
