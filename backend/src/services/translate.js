/**
 * Лёгкая обёртка над DeepL/Google Translate API.
 * Если ключи не заданы — возвращает исходный текст со специальным флагом.
 * Чтобы включить реальный перевод, добавьте в .env DEEPL_API_KEY или GOOGLE_TRANSLATE_KEY.
 */
const DEEPL = process.env.DEEPL_API_KEY;
const GOOGLE = process.env.GOOGLE_TRANSLATE_KEY;
const TARGETS = ["ru", "kg", "en", "zh"];

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

export async function translateText(text, target) {
  if (!text || !target || target === "ru") return text;
  try {
    if (DEEPL) return await deepl(text, target);
    if (GOOGLE) return await google(text, target);
  } catch (err) {
    console.warn(`[translate] ${target} failed: ${err?.message}`);
  }
  return text;
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
