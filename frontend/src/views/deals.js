import { state } from "../state.js";
import { api } from "../api.js";
import { esc, toast } from "../utils.js";
import { onRealtimeMessage } from "../realtime.js";

const STATUS_LABELS = {
  DRAFT: "Черновик",
  PENDING_LANDLORD: "Ждёт владельца",
  PENDING_TENANT: "Ждёт арендатора",
  SIGNED: "Подписан",
  ACTIVE: "Активен",
  COMPLETED: "Завершён",
  DISPUTED: "Спор",
  CANCELLED: "Отменён",
};

let unsub = null;

function fmtMoney(amount, currency) {
  if (amount == null) return "—";
  return `${Number(amount).toLocaleString("ru-RU")} ${currency || ""}`.trim();
}

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString("ru-RU") : "—";
}

async function load() {
  if (!state.token) return [];
  try {
    const { items } = await api("/deals/mine");
    return items;
  } catch {
    return [];
  }
}

function paymentsHtml(deal) {
  if (!deal.rentPayments?.length) return "";
  const isTenant = deal.tenantId === state.user?.id;
  const items = deal.rentPayments
    .map((p) => {
      const overdue = p.status === "OVERDUE";
      const paid = p.status === "PAID";
      const cls = paid ? "ok" : overdue ? "bad" : "muted";
      return `<li class="rent-row rent-row--${cls}">
        <span>${fmtDate(p.dueDate)}</span>
        <span>${fmtMoney(p.amount, p.currency)}</span>
        <span>${esc(p.status)}</span>
        ${
          isTenant && p.status !== "PAID"
            ? `<button type="button" class="btn btn--small" data-pay="${esc(p.id)}">Оплатить</button>`
            : ""
        }
      </li>`;
    })
    .join("");
  return `<ul class="rent-list">${items}</ul>`;
}

function escrowHtml(deal) {
  if (!deal.depositAmount) return "";
  if (deal.escrow) {
    const isTenant = deal.tenantId === state.user?.id;
    return `<p class="inline-note">Эскроу: ${fmtMoney(deal.escrow.amount, deal.escrow.currency)} · ${esc(
      deal.escrow.status
    )}${
      isTenant && deal.escrow.status === "HELD"
        ? ` <button type="button" class="btn btn--small" data-release-escrow>Подтвердить заселение и разблокировать</button>`
        : ""
    }</p>`;
  }
  if (deal.tenantId === state.user?.id && deal.status === "SIGNED") {
    return `<p class="inline-note">Депозит ${fmtMoney(
      deal.depositAmount,
      deal.currency
    )} <button type="button" class="btn btn--small" data-hold-escrow>Внести в эскроу (демо)</button></p>`;
  }
  return `<p class="inline-note">Депозит ${fmtMoney(deal.depositAmount, deal.currency)}: будет внесён арендатором.</p>`;
}

function dealHtml(deal) {
  const isLandlord = deal.landlordId === state.user?.id;
  const isTenant = deal.tenantId === state.user?.id;
  const peer = isLandlord
    ? deal.tenant?.name || deal.tenant?.email
    : deal.landlord?.name || deal.landlord?.email;
  const myRole = isLandlord ? "Я владелец" : "Я арендатор/покупатель";
  const mySigned = isLandlord ? deal.signedLandlordAt : deal.signedTenantAt;
  const peerSigned = isLandlord ? deal.signedTenantAt : deal.signedLandlordAt;
  const canSign = !mySigned && deal.status !== "CANCELLED";
  const canCancel = !["SIGNED", "ACTIVE", "COMPLETED", "CANCELLED"].includes(deal.status);
  return `<div class="deal-card" data-id="${esc(deal.id)}">
    <div class="deal-card__head">
      <div>
        <p class="admin-card__title">${esc(deal.listingTitle || "Сделка")} · ${esc(STATUS_LABELS[deal.status] || deal.status)}</p>
        <p class="inline-note">${esc(myRole)} · второй сторонник: ${esc(peer || "")}</p>
      </div>
      ${deal.pdfUrl ? `<a href="${esc(deal.pdfUrl)}" target="_blank" class="btn btn--secondary btn--small">PDF договора</a>` : ""}
    </div>
    <p class="inline-note">${
      deal.type === "RENT"
        ? `Аренда ${fmtMoney(deal.monthlyAmount, deal.currency)}/мес, депозит ${fmtMoney(deal.depositAmount, deal.currency)}, ${fmtDate(deal.startDate)} — ${fmtDate(deal.endDate)}`
        : `Продажа ${fmtMoney(deal.saleAmount, deal.currency)}, депозит ${fmtMoney(deal.depositAmount, deal.currency)}`
    }</p>
    <p class="inline-note">Подписи: ${
      deal.signedLandlordAt ? "владелец ✓" : "владелец —"
    } · ${deal.signedTenantAt ? "арендатор ✓" : "арендатор —"}</p>
    ${escrowHtml(deal)}
    ${paymentsHtml(deal)}
    <div class="deal-card__actions">
      ${
        canSign
          ? `<button type="button" class="btn btn--primary btn--small" data-act="sign">Подписать кодом</button>`
          : ""
      }
      ${
        canCancel
          ? `<button type="button" class="btn btn--small" data-act="cancel">Отменить</button>`
          : ""
      }
      <button type="button" class="btn btn--small" data-act="dispute">Открыть спор</button>
    </div>
  </div>`;
}

async function render() {
  const box = document.getElementById("dealsList");
  if (!box) return;
  if (!state.token) {
    box.innerHTML = "<p class='form__intro'>Войдите, чтобы видеть сделки.</p>";
    return;
  }
  const items = await load();
  if (!items.length) {
    box.innerHTML =
      "<p class='form__intro'>Пока нет сделок. На карточке нажмите «🛡 Оформить через Apart.kg», чтобы запустить безопасную сделку с эскроу.</p>";
    return;
  }
  box.innerHTML = items.map(dealHtml).join("");
  box.querySelectorAll(".deal-card").forEach((card) => {
    const id = card.getAttribute("data-id");
    const deal = items.find((x) => x.id === id);
    card.querySelectorAll("[data-pay]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await api(`/deals/${id}/payments/${btn.getAttribute("data-pay")}/pay`, {
          method: "POST",
        });
        toast("Платёж проведён (демо)");
        render();
      });
    });
    card.querySelector("[data-hold-escrow]")?.addEventListener("click", async () => {
      try {
        await api(`/deals/${id}/escrow/hold`, { method: "POST" });
        toast("Депозит на эскроу (демо)");
        render();
      } catch (err) {
        toast(err.message);
      }
    });
    card.querySelector("[data-release-escrow]")?.addEventListener("click", async () => {
      try {
        await api(`/deals/${id}/escrow/release`, { method: "POST" });
        toast("Эскроу разблокирован");
        render();
      } catch (err) {
        toast(err.message);
      }
    });
    card.querySelectorAll("[data-act]").forEach((btn) => {
      btn.addEventListener("click", () => handleAction(deal, btn.getAttribute("data-act")));
    });
  });
}

async function signDeal(deal) {
  try {
    const r = await api(`/deals/${deal.id}/sign/request`, { method: "POST" });
    const code = window.prompt(
      `Код подписания отправлен на ${r.target} (${r.channel}).\nВ dev-режиме код виден в логах сервера.\nВведите 6-значный код:`
    );
    if (!code) return;
    await api(`/deals/${deal.id}/sign`, { method: "POST", body: { code: code.trim() } });
    toast("Подписано");
    render();
  } catch (err) {
    toast(err.message);
  }
}

async function handleAction(deal, act) {
  if (act === "sign") return signDeal(deal);
  if (act === "cancel") {
    if (!confirm("Отменить сделку?")) return;
    try {
      await api(`/deals/${deal.id}/cancel`, { method: "POST" });
      toast("Отменено");
      render();
    } catch (err) {
      toast(err.message);
    }
  } else if (act === "dispute") {
    if (!confirm("Открыть спор по сделке? Эскроу будет заморожен до разбора админом.")) return;
    try {
      await api(`/deals/${deal.id}/dispute`, { method: "POST" });
      toast("Спор открыт");
      render();
    } catch (err) {
      toast(err.message);
    }
  }
}

export async function createDealWizard(listing) {
  if (!state.token) {
    toast("Войдите, чтобы оформить сделку");
    return;
  }
  if (listing.userId === state.user?.id) {
    toast("Нельзя оформить сделку с собой");
    return;
  }
  const isRent = listing.deal === "rent";
  const type = isRent ? "RENT" : "SALE";
  const monthlyStr = isRent
    ? window.prompt("Ежемесячная аренда (число, в KGS)", "30000")
    : null;
  const saleStr = !isRent ? window.prompt("Сумма сделки (число, в KGS)", "5000000") : null;
  const depositStr = window.prompt("Депозит (эскроу) — число в KGS, можно 0", "30000");
  let startDate = null;
  let endDate = null;
  if (isRent) {
    const today = new Date();
    const inYear = new Date();
    inYear.setFullYear(today.getFullYear() + 1);
    startDate = today.toISOString();
    endDate = inYear.toISOString();
  }
  const body = {
    listingId: listing.id,
    type,
    monthlyAmount: monthlyStr ? Number(monthlyStr) : undefined,
    saleAmount: saleStr ? Number(saleStr) : undefined,
    depositAmount: depositStr ? Number(depositStr) : 0,
    currency: "KGS",
    startDate,
    endDate,
  };
  try {
    const created = await api("/deals", { method: "POST", body });
    toast("Сделка создана. Подпишите кодом, владелец получит уведомление.");
    return created;
  } catch (err) {
    toast(err.message);
  }
}

export function bindDeals() {
  document.getElementById("btnRefreshDeals")?.addEventListener("click", render);
  if (!unsub) {
    unsub = onRealtimeMessage((msg) => {
      if (msg.type === "notify" && msg.kind && msg.kind.startsWith("deal")) render();
      if (msg.type === "notify" && msg.kind && msg.kind.startsWith("rent")) render();
      if (msg.type === "notify" && msg.kind && msg.kind.startsWith("escrow")) render();
    });
  }
}

export async function loadDeals() {
  await render();
}
