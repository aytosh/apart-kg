import { parseImages, imgUrl } from "../utils/images.js";
import { parseTrustFlags } from "./trust.js";
import { parseI18nMap, pickI18nString, resolveListingLang } from "../utils/listingLang.js";

function parseTourPhotos(json) {
  try {
    const arr = JSON.parse(json || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * Публичное представление объявления.
 * @param {object} listing — запись Listing (+ user, complex при include)
 * @param {string} baseUrl
 * @param {{ includeFlags?: boolean; lang?: string }} [opts]
 */
export function listingToPublic(listing, baseUrl, opts = {}) {
  const lang = resolveListingLang(opts.lang);
  const imgs = parseImages(listing.images).map((p) => imgUrl(p, baseUrl));
  const flags = parseTrustFlags(listing.trustFlags);
  const tour = parseTourPhotos(listing.tourPhotos).map((t) => ({
    ...t,
    url: imgUrl(t.path, baseUrl),
  }));
  const videoUrl = listing.videoUrl ? imgUrl(listing.videoUrl, baseUrl) : null;
  const titleI18n = parseI18nMap(listing.titleI18n);
  const descriptionI18n = parseI18nMap(listing.descriptionI18n);

  return {
    id: listing.id,
    userId: listing.userId,
    deal: listing.deal === "RENT" ? "rent" : "sale",
    type: listing.propertyType === "NEWBUILD" ? "new" : listing.propertyType.toLowerCase(),
    propertyType: listing.propertyType,
    title: pickI18nString(titleI18n, lang, listing.title),
    district: listing.district,
    description: pickI18nString(descriptionI18n, lang, listing.description || ""),
    titleI18n,
    descriptionI18n,
    price: listing.price,
    currency: listing.currency,
    rooms: listing.rooms,
    area: listing.area,
    floor: listing.floor,
    lat: listing.lat,
    lng: listing.lng,
    images: imgs,
    image: imgs[0] || null,
    videoUrl,
    tourPhotos: tour,
    has360: tour.some((t) => t.type === "panorama360"),
    hasVideo: !!videoUrl,
    liveAvailable: !!listing.liveAvailable,
    complexId: listing.complexId,
    complex: listing.complex
      ? {
          id: listing.complex.id,
          slug: listing.complex.slug,
          name: listing.complex.name,
          progressPercent: listing.complex.progressPercent,
          currentStage: listing.complex.currentStage,
          deadline: listing.complex.deadline,
          developer: listing.complex.developer
            ? {
                id: listing.complex.developer.id,
                slug: listing.complex.developer.slug,
                name: listing.complex.developer.name,
                verified: listing.complex.developer.verified,
              }
            : undefined,
        }
      : undefined,
    unitNumber: listing.unitNumber,
    floorPlanPath: listing.floorPlanPath ? imgUrl(listing.floorPlanPath, baseUrl) : null,
    constructionStage: listing.constructionStage || null,
    rentPeriod: listing.rentPeriod ? listing.rentPeriod.toLowerCase() : null,
    installment: listing.installment,
    exchange: listing.exchange,
    urgent: listing.urgent,
    vipUntil: listing.vipUntil || null,
    topUntil: listing.topUntil || null,
    premiumUntil: listing.premiumUntil || null,
    priorityScore: listing.priorityScore || 0,
    status: listing.status.toLowerCase(),
    trustScore: typeof listing.trustScore === "number" ? listing.trustScore : null,
    trustFlags: opts.includeFlags ? flags : undefined,
    createdAt: listing.createdAt,
    user: listing.user
      ? {
          id: listing.user.id,
          name: listing.user.name,
          email: listing.user.email,
          verifiedLevel: listing.user.verifiedLevel,
          ratingAvg: listing.user.ratingAvg,
          ratingCount: listing.user.ratingCount,
          wechatId: listing.user.wechatId || null,
          isAgency: !!listing.user.isAgency,
          agencyName: listing.user.agencyName || null,
          agencySlug: listing.user.agencySlug || null,
          agencyLogo: listing.user.agencyLogo || null,
        }
      : undefined,
  };
}
