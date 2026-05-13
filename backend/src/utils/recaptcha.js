/**
 * Проверка reCAPTCHA v2 (checkbox) или v3 (invisible). Без RECAPTCHA_SECRET_KEY проверка пропускается.
 * RECAPTCHA_VERSION=v2 — ожидается токен с виджета checkbox; score не используется.
 */
export async function verifyRecaptcha(token) {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return { ok: true, skipped: true };
  if (!token || typeof token !== "string") return { ok: false };
  const params = new URLSearchParams();
  params.set("secret", secret);
  params.set("response", token);
  const r = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const data = await r.json().catch(() => ({}));
  if (!data.success) return { ok: false };
  const isV2 = (process.env.RECAPTCHA_VERSION || "").toLowerCase() === "v2";
  if (isV2) return { ok: true };
  if (typeof data.score === "number" && data.score < 0.3) return { ok: false };
  return { ok: true };
}
