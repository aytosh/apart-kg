export const LISTING_LANGS = ["ru", "kg", "en", "zh"];

export function resolveListingLang(raw) {
  const l = String(raw || "ru").toLowerCase();
  return LISTING_LANGS.includes(l) ? l : "ru";
}

export function parseI18nMap(json) {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

export function pickI18nString(map, lang, fallback) {
  if (!map || typeof map !== "object") return fallback ?? "";
  const v = map[lang];
  if (v != null && String(v).trim() !== "") return String(v);
  return fallback ?? "";
}
