import { esc } from "../utils.js";

export function trustLevel(score) {
  if (score == null) return { tone: "muted", label: "—" };
  if (score >= 80) return { tone: "ok", label: "Высокий" };
  if (score >= 50) return { tone: "warn", label: "Средний" };
  return { tone: "bad", label: "Низкий" };
}

export function ratingStars(avg, count) {
  if (!avg || !count) return "<span class='inline-note'>Нет отзывов</span>";
  const full = Math.floor(avg);
  const half = avg - full >= 0.5;
  let stars = "";
  for (let i = 1; i <= 5; i++) {
    if (i <= full) stars += "★";
    else if (i === full + 1 && half) stars += "★";
    else stars += "☆";
  }
  return `<span class="rating-stars">${stars}</span> <span class="inline-note">${avg.toFixed(1)} · ${count} отз.</span>`;
}

export function trustBadgeHtml(item) {
  if (!item || !item.user) return "";
  const verified = item.user.verifiedLevel === "ID";
  const score = typeof item.trustScore === "number" ? item.trustScore : null;
  const lvl = trustLevel(score);
  const verifiedHtml = verified
    ? `<span class="trust-pill trust-pill--ok" title="Владелец прошёл верификацию">✓ Проверенный</span>`
    : `<span class="trust-pill trust-pill--muted" title="Владелец не прошёл верификацию">Не проверен</span>`;
  const scoreHtml =
    score == null
      ? ""
      : `<span class="trust-score trust-score--${lvl.tone}" title="Trust Score: ${score}/100"><span class="trust-score__num">${score}</span><span class="trust-score__bar"><span style="width:${score}%"></span></span></span>`;
  return `<div class="trust-row">${verifiedHtml}${scoreHtml}</div>`;
}

export function trustExplainHtml(flags) {
  if (!flags) return "";
  const parts = [];
  if (flags.duplicatePhotos?.length)
    parts.push(`Похожие фото у других владельцев (${flags.duplicatePhotos.length})`);
  if (flags.missingExif) parts.push("Фото без EXIF (вероятно стоковые)");
  if (flags.missingGps) parts.push("Фото без GPS-координат");
  if (flags.textDuplicate)
    parts.push(`Описание похоже на чужое (${Math.round((flags.textDuplicateRatio || 0) * 100)}%)`);
  if (flags.suspiciousPhone)
    parts.push(`Телефон встречается у ${flags.suspiciousPhoneCount}+ объявлений других владельцев`);
  if (flags.unverifiedOwner) parts.push("Владелец не прошёл ID-верификацию");
  if (!parts.length) return "<p class='inline-note'>Объявление прошло автоматическую проверку.</p>";
  return `<p class="inline-note">Что снизило Trust Score:</p><ul class="trust-flags">${parts
    .map((p) => `<li>${esc(p)}</li>`)
    .join("")}</ul>`;
}
