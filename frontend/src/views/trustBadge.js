import { esc } from "../utils.js";
import { t } from "../i18n.js";

export function trustLevel(score) {
  if (score == null) return { tone: "muted", label: "—" };
  if (score >= 80) return { tone: "ok", label: t("trust.level.high", "Высокий") };
  if (score >= 50) return { tone: "warn", label: t("trust.level.mid", "Средний") };
  return { tone: "bad", label: t("trust.level.low", "Низкий") };
}

export function ratingStars(avg, count) {
  if (!avg || !count) return `<span class="inline-note">${esc(t("trust.rating.none", "Нет отзывов"))}</span>`;
  const full = Math.floor(avg);
  const half = avg - full >= 0.5;
  let stars = "";
  for (let i = 1; i <= 5; i++) {
    if (i <= full) stars += "★";
    else if (i === full + 1 && half) stars += "★";
    else stars += "☆";
  }
  const suffix = t("trust.rating.suffix", "{count} отз.").replace("{count}", String(count));
  return `<span class="rating-stars">${stars}</span> <span class="inline-note">${avg.toFixed(1)} · ${esc(suffix)}</span>`;
}

export function trustBadgeHtml(item) {
  if (!item || !item.user) return "";
  const verified = item.user.verifiedLevel === "ID";
  const score = typeof item.trustScore === "number" ? item.trustScore : null;
  const lvl = trustLevel(score);
  const verifiedHtml = verified
    ? `<span class="trust-pill trust-pill--ok" title="${esc(t("trust.verified.titleOk", "Владелец прошёл верификацию"))}">${esc(
        t("trust.verified.ok", "✓ Проверенный")
      )}</span>`
    : `<span class="trust-pill trust-pill--muted" title="${esc(t("trust.verified.titleNo", "Владелец не прошёл верификацию"))}">${esc(
        t("trust.verified.no", "Не проверен")
      )}</span>`;
  const scoreTitle = t("trust.score.title", "Trust Score: {score}/100").replace("{score}", String(score));
  const scoreHtml =
    score == null
      ? ""
      : `<span class="trust-score trust-score--${lvl.tone}" title="${esc(scoreTitle)}"><span class="trust-score__num">${score}</span><span class="trust-score__bar"><span style="width:${score}%"></span></span></span>`;
  return `<div class="trust-row">${verifiedHtml}${scoreHtml}</div>`;
}

export function trustExplainHtml(flags) {
  if (!flags) return "";
  const parts = [];
  if (flags.duplicatePhotos?.length) {
    parts.push(
      t("trust.flag.dupPhotos", "Похожие фото у других владельцев ({n})").replace(
        "{n}",
        String(flags.duplicatePhotos.length)
      )
    );
  }
  if (flags.missingExif) parts.push(t("trust.flag.missingExif", "Фото без EXIF (вероятно стоковые)"));
  if (flags.missingGps) parts.push(t("trust.flag.missingGps", "Фото без GPS-координат"));
  if (flags.textDuplicate) {
    parts.push(
      t("trust.flag.textDup", "Описание похоже на чужое ({pct}%)").replace(
        "{pct}",
        String(Math.round((flags.textDuplicateRatio || 0) * 100))
      )
    );
  }
  if (flags.suspiciousPhone) {
    parts.push(
      t("trust.flag.suspiciousPhone", "Телефон встречается у {n}+ объявлений других владельцев").replace(
        "{n}",
        String(flags.suspiciousPhoneCount ?? "")
      )
    );
  }
  if (flags.unverifiedOwner) parts.push(t("trust.flag.unverifiedOwner", "Владелец не прошёл ID-верификацию"));
  if (!parts.length) {
    return `<p class="inline-note">${esc(t("trust.flags.ok", "Объявление прошло автоматическую проверку."))}</p>`;
  }
  return `<p class="inline-note">${esc(t("trust.flags.title", "Что снизило Trust Score:"))}</p><ul class="trust-flags">${parts
    .map((p) => `<li>${esc(p)}</li>`)
    .join("")}</ul>`;
}
