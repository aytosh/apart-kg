import { state } from "../state.js";
import { api } from "../api.js";
import { esc, toast } from "../utils.js";
import { openAuth } from "./auth.js";

export async function loadPlansAndPayments() {
  const plansBox = document.getElementById("plansBox");
  const historyBox = document.getElementById("paymentsHistory");
  if (!plansBox || !historyBox) return;
  try {
    const plans = await api("/payments/plans");
    plansBox.innerHTML = plans.plans
      .map(
        (p) => `<div class="plan-item">
      <p class="admin-card__title">${esc(p.title)}</p>
      <p class="inline-note">${Number(p.amountSom).toLocaleString("ru-RU")} сом</p>
      <button type="button" class="btn btn--secondary btn--small" data-buy-plan="${esc(p.code)}">Оплатить</button>
    </div>`
      )
      .join("");
    plansBox.querySelectorAll("[data-buy-plan]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!state.token) {
          toast("Войдите, чтобы оплатить");
          openAuth();
          return;
        }
        const plan = btn.getAttribute("data-buy-plan");
        const created = await api("/payments/create", {
          method: "POST",
          body: { plan, provider: "DEMO" },
        });
        await api(`/payments/demo-pay/${created.id}`, { method: "POST" });
        toast("Демо-оплата прошла успешно");
        loadPlansAndPayments();
      });
    });

    if (!state.token) {
      historyBox.innerHTML = "<p class='form__intro'>История платежей доступна после входа</p>";
      return;
    }
    const mine = await api("/payments/mine");
    const rows = mine.items || [];
    historyBox.innerHTML =
      "<p class='form__intro'>Мои платежи</p>" +
      (rows.length
        ? rows
            .map(
              (p) => `<div class="payment-item">
            <p class="admin-card__title">${esc(p.description)}</p>
            <p class="inline-note">${Number(p.amountSom).toLocaleString("ru-RU")} сом · ${esc(p.status)} · ${new Date(p.createdAt).toLocaleString("ru-RU")}</p>
          </div>`
            )
            .join("")
        : "<p class='form__intro'>Пока нет платежей</p>");
  } catch (err) {
    plansBox.innerHTML = "<p class='form__intro'>Не удалось загрузить тарифы</p>";
    historyBox.innerHTML = "";
    toast(err.message || "Ошибка платежей");
  }
}
