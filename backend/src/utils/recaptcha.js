/**
 * Проверка reCAPTCHA v2/v3 (siteverify). Без RECAPTCHA_SECRET_KEY проверка пропускается.
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
  if (typeof data.score === "number" && data.score < 0.3) return { ok: false };
  return { ok: true };
}
