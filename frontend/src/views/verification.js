import { state } from "../state.js";
import { api } from "../api.js";
import { toast } from "../utils.js";

const STATUS_TEXT = {
  PENDING: "Заявка на проверке у модератора",
  APPROVED: "Аккаунт верифицирован — у объявлений появится бейдж «Проверенный владелец»",
  REJECTED: "Заявка отклонена — можно отправить новую",
};

function renderStatus(data) {
  const box = document.getElementById("verificationStatus");
  const form = document.getElementById("formVerification");
  if (!box || !form) return;
  if (!state.token) {
    box.textContent = "Войдите, чтобы пройти верификацию.";
    form.hidden = true;
    return;
  }
  const lvl = data?.user?.verifiedLevel;
  const req = data?.request;
  if (lvl === "ID") {
    box.innerHTML = `<span class="trust-pill trust-pill--ok">✓ Проверенный владелец</span> <span class="inline-note">с ${
      data.user.verifiedAt ? new Date(data.user.verifiedAt).toLocaleDateString("ru-RU") : "—"
    }</span>`;
    form.hidden = true;
    return;
  }
  if (req?.status === "PENDING") {
    box.textContent = STATUS_TEXT.PENDING;
    form.hidden = true;
    return;
  }
  let prefix = "";
  if (req?.status === "REJECTED") {
    prefix = `${STATUS_TEXT.REJECTED}${req.note ? ` (причина: ${req.note})` : ""}. `;
  } else {
    prefix =
      "Загрузите селфи и фото документа, чтобы получить бейдж «Проверенный владелец». Все объявления верифицированных владельцев получают +8 к Trust Score и видны в фильтре «Только проверенные». ";
  }
  box.textContent = prefix;
  form.hidden = false;
}

export async function loadVerification() {
  if (!state.token) {
    renderStatus(null);
    return;
  }
  try {
    const data = await api("/verification/me");
    renderStatus(data);
  } catch {
    /* ignore */
  }
}

export function bindVerification() {
  const form = document.getElementById("formVerification");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.token) return;
    const fd = new FormData(form);
    if (!fd.get("selfie") || !fd.get("idDoc")) {
      toast("Нужно селфи и документ");
      return;
    }
    try {
      const r = await fetch("/api/verification/start", {
        method: "POST",
        headers: { Authorization: `Bearer ${state.token}` },
        body: fd,
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || r.statusText);
      toast("Заявка отправлена");
      form.reset();
      loadVerification();
    } catch (err) {
      toast(err.message);
    }
  });
}
