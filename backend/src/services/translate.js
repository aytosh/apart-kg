/**
 * DeepL / Google Translate + бесплатный fallback (MyMemory) с кэшем.
 * Без платных ключей заголовки объявлений всё равно переводятся через MyMemory (лимит ~5k слов/день с IP).
 */
const DEEPL = process.env.DEEPL_API_KEY;
const GOOGLE = process.env.GOOGLE_TRANSLATE_KEY;
const TARGETS = ["ru", "kg", "en", "zh"];

const translateCache = new Map();
const CACHE_MAX = 2500;

function cacheGet(key) {
  return translateCache.get(key);
}

function cacheSet(key, val) {
  if (translateCache.size > CACHE_MAX) {
    const first = translateCache.keys().next().value;
    translateCache.delete(first);
  }
  translateCache.set(key, val);
}

async function deepl(text, target) {
  const r = await fetch("https://api-free.deepl.com/v2/translate", {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${DEEPL}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ text, target_lang: target.toUpperCase() }),
  });
  if (!r.ok) throw new Error(`DeepL HTTP ${r.status}`);
  const data = await r.json();
  return data.translations?.[0]?.text || text;
}

async function google(text, target) {
  const r = await fetch(
    `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: text, target, format: "text" }),
    }
  );
  if (!r.ok) throw new Error(`Google HTTP ${r.status}`);
  const data = await r.json();
  return data.data?.translations?.[0]?.translatedText || text;
}

/** Публичный MyMemory API (без ключа, лимиты по IP). */
async function myMemoryTranslate(text, target) {
  const pairMap = {
    en: "ru|en",
    zh: "ru|zh",
    kg: "ru|ky",
  };
  const pair = pairMap[target];
  if (!pair) return text;
  const q = String(text).slice(0, 450);
  if (!q.trim()) return text;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 8000);
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${pair}`;
  let r;
  try {
    r = await fetch(url, { signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
  if (!r.ok) return text;
  const data = await r.json().catch(() => ({}));
  if (data.responseStatus !== 200 || !data.responseData?.translatedText) return text;
  return String(data.responseData.translatedText);
}

export async function translateText(text, target) {
  if (!text || !target || target === "ru") return text;
  const cacheKey = `${target}::${text}`;
  const hit = cacheGet(cacheKey);
  if (hit != null) return hit;

  let out = text;
  try {
    if (DEEPL) {
      out = await deepl(text, target);
    } else if (GOOGLE) {
      out = await google(text, target);
    } else {
      out = await myMemoryTranslate(text, target);
    }
  } catch (err) {
    console.warn(`[translate] ${target}: ${err?.message}`);
    out = text;
  }
  cacheSet(cacheKey, out);
  return out;
}

export async function translateAll(text) {
  const out = {};
  for (const lang of TARGETS) {
    out[lang] = await translateText(text, lang);
  }
  return out;
}

export function hasProvider() {
  return Boolean(DEEPL || GOOGLE);
}
