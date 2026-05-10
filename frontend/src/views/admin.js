import { state } from "../state.js";
import { api } from "../api.js";
import { esc, toast } from "../utils.js";
import { loadListings } from "./home.js";

export async function loadAdmin() {
  const box = document.getElementById("adminList");
  const statsBox = document.getElementById("adminStats");
  const paymentsBox = document.getElementById("adminPayments");
  if (!box) return;
  if (!state.user || state.user.role !== "ADMIN") {
    box.innerHTML = "<p class='form__intro'>Нет прав</p>";
    if (statsBox) statsBox.innerHTML = "";
    if (paymentsBox) paymentsBox.innerHTML = "";
    return;
  }
  try {
    const dash = await api("/admin/dashboard");
    if (statsBox) {
      statsBox.innerHTML = `
        <div class="stat-chip"><p class="stat-chip__label">Пользователи</p><p class="stat-chip__value">${dash.users}</p></div>
        <div class="stat-chip"><p class="stat-chip__label">Объявления</p><p class="stat-chip__value">${dash.listingsAll}</p></div>
        <div class="stat-chip"><p class="stat-chip__label">На модерации</p><p class="stat-chip__value">${dash.listingsPending}</p></div>
        <div class="stat-chip"><p class="stat-chip__label">Выручка (сом)</p><p class="stat-chip__value">${Number(
          dash.paymentsRevenueSom || 0
        ).toLocaleString("ru-RU")}</p></div>`;
    }

    const { items } = await api("/admin/listings/pending");
    if (!items.length) {
      box.innerHTML = "<p class='form__intro'>Очередь пуста</p>";
    } else {
      box.innerHTML = items
        .map(
          (it) => `<div class="admin-card">
      <p class="status-pill status-pill--pending">На модерации</p>
      <p class="admin-card__title">${esc(it.title)}</p>
      <p class="form__intro" style="margin:0">${esc(it.district)} · ${esc(it.user?.email || "")}</p>
      <div class="admin-card__actions">
        <button type="button" class="btn btn--primary btn--small" data-approve="${esc(it.id)}">Одобрить</button>
        <button type="button" class="btn btn--secondary btn--small" data-reject="${esc(it.id)}">Отклонить</button>
      </div>
    </div>`
        )
        .join("");
      box.querySelectorAll("[data-approve]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          await api(`/admin/listings/${btn.getAttribute("data-approve")}/approve`, {
            method: "POST",
          });
          toast("Одобрено");
          loadAdmin();
          loadListings();
        });
      });
      box.querySelectorAll("[data-reject]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          await api(`/admin/listings/${btn.getAttribute("data-reject")}/reject`, {
            method: "POST",
            body: { reason: "" },
          });
          toast("Отклонено");
          loadAdmin();
        });
      });
    }

    const verBox = document.getElementById("adminVerifications");
    if (verBox) {
      try {
        const { items: verifications } = await api("/admin/verifications");
        if (!verifications.length) {
          verBox.innerHTML = "<p class='form__intro'>Заявок на верификацию нет</p>";
        } else {
          verBox.innerHTML = verifications
            .map(
              (v) => `<div class="admin-card">
                <p class="status-pill status-pill--pending">Заявка</p>
                <p class="admin-card__title">${esc(v.user?.name || v.user?.email || "")}</p>
                <p class="inline-note">${esc(v.user?.email || "")} · ${esc(v.user?.phone || "—")}</p>
                <div class="verify-photos">
                  <a href="${esc(v.selfieUrl)}" target="_blank"><img src="${esc(v.selfieUrl)}" alt="selfie" /></a>
                  <a href="${esc(v.idDocUrl)}" target="_blank"><img src="${esc(v.idDocUrl)}" alt="document" /></a>
                </div>
                <div class="admin-card__actions">
                  <button type="button" class="btn btn--primary btn--small" data-verify-approve="${esc(v.id)}">Подтвердить</button>
                  <button type="button" class="btn btn--secondary btn--small" data-verify-reject="${esc(v.id)}">Отклонить</button>
                </div>
              </div>`
            )
            .join("");
          verBox.querySelectorAll("[data-verify-approve]").forEach((btn) => {
            btn.addEventListener("click", async () => {
              await api(`/admin/verifications/${btn.getAttribute("data-verify-approve")}/approve`, {
                method: "POST",
              });
              toast("Верификация одобрена");
              loadAdmin();
            });
          });
          verBox.querySelectorAll("[data-verify-reject]").forEach((btn) => {
            btn.addEventListener("click", async () => {
              const note = window.prompt("Причина отклонения (необязательно)") || "";
              await api(`/admin/verifications/${btn.getAttribute("data-verify-reject")}/reject`, {
                method: "POST",
                body: { note },
              });
              toast("Заявка отклонена");
              loadAdmin();
            });
          });
        }
      } catch {
        verBox.innerHTML = "<p class='form__intro'>Не удалось загрузить заявки</p>";
      }
    }

    const recentPayments = await api("/admin/payments/recent");
    if (paymentsBox) {
      const rows = recentPayments.items || [];
      paymentsBox.innerHTML =
        `<p class='form__intro'>Последние платежи</p>` +
        (rows.length
          ? rows
              .map(
                (p) => `<div class="payment-item">
              <p class="admin-card__title">${esc(p.description)} — ${Number(p.amountSom).toLocaleString("ru-RU")} сом</p>
              <p class="inline-note">${esc(p.user?.email || "—")} · ${esc(p.status)} · ${esc(p.provider)}</p>
            </div>`
              )
              .join("")
          : "<p class='form__intro'>Платежей пока нет</p>");
    }
  } catch {
    box.innerHTML = "<p class='form__intro'>Ошибка загрузки</p>";
  }
}
