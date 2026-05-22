import { translateText, hasProvider } from "./translate.js";
import { parseI18nMap } from "../utils/listingLang.js";
import { listingToPublic } from "./listingPublic.js";

/**
 * Дополняет публичное объявление переводами (заголовок и т.д.).
 * @param {object} listing — сырой Prisma-объект
 * @param {object} pub — результат listingToPublic
 * @param {string} lang
 * @param {{ listOnly?: boolean }} [opts] — listOnly: только заголовок (для ленты, меньше запросов)
 */
export async function enrichListingLiveTranslate(listing, pub, lang, opts = {}) {
  const listOnly = opts.listOnly === true;
  if (lang === "ru") return pub;

  const ti = parseI18nMap(listing.titleI18n);
  const di = parseI18nMap(listing.descriptionI18n);
  const out = { ...pub };
  const jobs = [];

  if (!ti?.[lang]) {
    jobs.push(
      translateText(listing.title, lang).then((x) => {
        out.title = x;
      })
    );
  }

  if (!listOnly && listing.description && !di?.[lang]) {
    jobs.push(
      translateText(listing.description, lang).then((x) => {
        out.description = x;
      })
    );
  }

  if (!listOnly && hasProvider()) {
    for (const [key, val] of [
      ["district", listing.district],
      ["rooms", listing.rooms],
      ["area", listing.area],
      ["floor", listing.floor],
      ["currency", listing.currency],
    ]) {
      if (!val) continue;
      jobs.push(
        translateText(String(val), lang).then((x) => {
          out[key] = x;
        })
      );
    }
  }

  await Promise.all(jobs);
  return out;
}

const BATCH = 8;

export async function mapListingsEnriched(listings, baseUrl, lang, mapExtra) {
  const out = [];
  for (let i = 0; i < listings.length; i += BATCH) {
    const chunk = listings.slice(i, i + BATCH);
    const part = await Promise.all(
      chunk.map(async (l) => {
        let pub = listingToPublic(l, baseUrl, { lang });
        pub = await enrichListingLiveTranslate(l, pub, lang, { listOnly: true });
        const extra = mapExtra ? mapExtra(l, pub) : {};
        return { ...pub, ...extra };
      })
    );
    out.push(...part);
  }
  return out;
}
