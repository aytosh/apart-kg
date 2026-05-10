const cache = {};
let currentLang = "ru";
let dict = {};

const SUPPORTED = ["ru", "kg", "en", "zh"];

export function getCurrentLang() {
  return currentLang;
}

export function getSupportedLanguages() {
  return SUPPORTED.slice();
}

export function t(key, fallback) {
  if (key in dict) return dict[key];
  return fallback != null ? fallback : key;
}

export function pickI18n(field, source) {
  if (!field) return source;
  return field[currentLang] || source;
}

export async function loadLanguage(lang) {
  if (!SUPPORTED.includes(lang)) lang = "ru";
  if (!cache[lang]) {
    try {
      const r = await fetch(`/api/i18n/${lang}`);
      cache[lang] = r.ok ? await r.json() : {};
    } catch {
      cache[lang] = {};
    }
  }
  dict = cache[lang] || {};
  currentLang = lang;
  applyDomTranslations();
  document.documentElement.lang = lang === "kg" ? "ky" : lang === "zh" ? "zh-CN" : lang;
}

export function applyDomTranslations(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const value = t(key, el.textContent);
    el.textContent = value;
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    const value = t(key, el.placeholder);
    el.placeholder = value;
  });
  root.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    const value = t(key, el.title);
    el.title = value;
  });
}
