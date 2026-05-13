import { Router } from "express";
import { body, query, validationResult } from "express-validator";
import { prisma } from "../prisma.js";
import { authOptional, authRequired } from "../middleware/auth.js";
import { auditListing } from "../services/trust.js";
import { translateAll, hasProvider, translateText } from "../services/translate.js";
import { listingToPublic } from "../services/listingPublic.js";
import { parseI18nMap, resolveListingLang } from "../utils/listingLang.js";
import { listingMatchesRooms, normalizeRoomsFilter } from "../utils/rooms.js";

const router = Router();

const dealMap = { rent: "RENT", sale: "SALE" };
const typeMap = {
  flat: "FLAT",
  house: "HOUSE",
  office: "OFFICE",
  new: "NEWBUILD",
  room: "ROOM",
  land: "LAND",
  dacha: "DACHA",
  parking: "PARKING",
};

async function enrichListingLiveTranslate(listing, pub, lang) {
  if (lang === "ru" || !hasProvider()) return pub;
  const ti = parseI18nMap(listing.titleI18n);
  const di = parseI18nMap(listing.descriptionI18n);
  const out = { ...pub };
  const jobs = [];
  if (!ti?.[lang]) {
    jobs.push(translateText(listing.title, lang).then((x) => {
      out.title = x;
    }));
  }
  if (listing.description && !di?.[lang]) {
    jobs.push(translateText(listing.description, lang).then((x) => {
      out.description = x;
    }));
  }
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
  await Promise.all(jobs);
  return out;
}

router.get("/", authOptional, async (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const q = req.query;
  const lang = resolveListingLang(q.lang);

  const where = {
    status: "ACTIVE",
  };

  if (q.deal === "rent" || q.deal === "sale") {
    where.deal = dealMap[q.deal];
  }

  if (q.type && q.type !== "all" && typeMap[q.type]) {
    where.propertyType = typeMap[q.type];
  } else if (q.type === "new") {
    where.propertyType = "NEWBUILD";
  }

  if (q.search) {
    const s = String(q.search).trim();
    where.OR = [
      { title: { contains: s } },
      { district: { contains: s } },
      { description: { contains: s } },
    ];
  }

  if (q.installment === "true") where.installment = true;
  if (q.exchange === "true") where.exchange = true;
  if (q.urgent === "true") where.urgent = true;
  if (q.verifiedOnly === "true") {
    where.user = { verifiedLevel: "ID" };
  }
  if (q.minTrust) {
    const min = Number(q.minTrust);
    if (!Number.isNaN(min)) where.trustScore = { gte: min };
  }
  if (q.has360 === "true") {
    where.tourPhotos = { contains: "panorama360" };
  }
  if (q.hasVideo === "true") {
    where.videoUrl = { not: null };
  }
  if (q.liveAvailable === "true") {
    where.liveAvailable = true;
  }
  if (q.complexId) {
    where.complexId = String(q.complexId);
  }
  if (q.complexSlug) {
    where.complex = { slug: String(q.complexSlug) };
  }
  if (q.constructionStage) {
    const stage = String(q.constructionStage).toUpperCase();
    if (["PLANNED", "FOUNDATION", "FRAME", "FACADE", "INTERIOR", "READY"].includes(stage)) {
      where.constructionStage = stage;
    }
  }
  if (q.deadlineYear) {
    const y = Number(q.deadlineYear);
    if (Number.isInteger(y)) {
      where.complex = {
        ...(where.complex || {}),
        deadline: {
          gte: new Date(`${y}-01-01T00:00:00.000Z`),
          lt: new Date(`${y + 1}-01-01T00:00:00.000Z`),
        },
      };
    }
  }

  let listings = await prisma.listing.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          verifiedLevel: true,
          ratingAvg: true,
          ratingCount: true,
          wechatId: true,
          isAgency: true,
          agencyName: true,
          agencySlug: true,
          agencyLogo: true,
        },
      },
      complex: {
        include: {
          developer: { select: { id: true, slug: true, name: true, verified: true } },
        },
      },
    },
    orderBy: [{ priorityScore: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  const roomsFilter = normalizeRoomsFilter(q.rooms);
  if (roomsFilter) {
    listings = listings.filter((l) => listingMatchesRooms(l, roomsFilter));
  }

  const mine = req.user?.id;
  let favoriteIds = new Set();
  if (mine) {
    const favs = await prisma.favorite.findMany({
      where: { userId: mine },
      select: { listingId: true },
    });
    favoriteIds = new Set(favs.map((f) => f.listingId));
  }

  res.json({
    items: listings.map((l) => ({
      ...listingToPublic(l, baseUrl, { lang }),
      isFavorite: favoriteIds.has(l.id),
    })),
  });
});

router.get("/:id/similar", authOptional, async (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const lang = resolveListingLang(req.query.lang);
  const base = await prisma.listing.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      deal: true,
      propertyType: true,
      district: true,
      rooms: true,
    },
  });
  if (!base) return res.json({ items: [] });

  const where = {
    status: "ACTIVE",
    id: { not: base.id },
    deal: base.deal,
    propertyType: base.propertyType,
  };
  // Сначала пробуем по району; если ничего — fallback по комнатам/типу.
  if (base.district) where.district = base.district;

  let items = await prisma.listing.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          verifiedLevel: true,
          ratingAvg: true,
          ratingCount: true,
          wechatId: true,
          isAgency: true,
          agencyName: true,
          agencySlug: true,
          agencyLogo: true,
        },
      },
      complex: {
        include: {
          developer: { select: { id: true, slug: true, name: true, verified: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 6,
  });

  if (items.length < 4 && base.district) {
    const more = await prisma.listing.findMany({
      where: {
        status: "ACTIVE",
        id: { not: base.id },
        deal: base.deal,
        propertyType: base.propertyType,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            verifiedLevel: true,
            ratingAvg: true,
            ratingCount: true,
            wechatId: true,
            isAgency: true,
            agencyName: true,
            agencySlug: true,
            agencyLogo: true,
          },
        },
        complex: {
          include: {
            developer: { select: { id: true, slug: true, name: true, verified: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 6,
    });
    const seen = new Set(items.map((i) => i.id));
    for (const m of more) {
      if (items.length >= 6) break;
      if (!seen.has(m.id)) items.push(m);
    }
  }

  res.json({
    items: items.map((l) => listingToPublic(l, baseUrl, { lang })),
  });
});

router.get("/:id", authOptional, async (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const listing = await prisma.listing.findUnique({
    where: { id: req.params.id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          verifiedLevel: true,
          ratingAvg: true,
          ratingCount: true,
          wechatId: true,
          createdAt: true,
          isAgency: true,
          agencyName: true,
          agencySlug: true,
          agencyLogo: true,
        },
      },
      complex: {
        include: {
          developer: { select: { id: true, slug: true, name: true, verified: true } },
        },
      },
    },
  });
  if (!listing || listing.status !== "ACTIVE") {
    return res.status(404).json({ error: "Объявление не найдено" });
  }
  let isFavorite = false;
  if (req.user) {
    const f = await prisma.favorite.findUnique({
      where: { userId_listingId: { userId: req.user.id, listingId: listing.id } },
    });
    isFavorite = !!f;
  }
  const includeFlags =
    req.user && (req.user.role === "ADMIN" || req.user.id === listing.userId);
  const lang = resolveListingLang(req.query.lang);
  let pub = listingToPublic(listing, baseUrl, { includeFlags, lang });
  pub = await enrichListingLiveTranslate(listing, pub, lang);
  res.json({ ...pub, isFavorite });
});

router.post(
  "/",
  authRequired,
  body("deal").isIn(["rent", "sale"]),
  body("type").isIn(["flat", "house", "office", "new", "room", "land", "dacha", "parking"]),
  body("title").trim().notEmpty(),
  body("district").trim().notEmpty(),
  body("price").trim().notEmpty(),
  body("currency").trim().notEmpty(),
  body("rooms").trim().notEmpty(),
  body("area").trim().notEmpty(),
  body("floor").trim().notEmpty(),
  body("lat").isFloat(),
  body("lng").isFloat(),
  body("images").optional().isArray(),
  body("description").optional(),
  body("videoUrl").optional(),
  body("rentPeriod").optional().isIn(["monthly", "daily", "hourly"]),
  body("installment").optional().isBoolean(),
  body("exchange").optional().isBoolean(),
  body("urgent").optional().isBoolean(),
  body("tourPhotos").optional().isArray(),
  body("liveAvailable").optional().isBoolean(),
  body("complexId").optional().isString(),
  body("unitNumber").optional().isString().isLength({ max: 32 }),
  body("floorPlanPath").optional().isString().isLength({ max: 200 }),
  body("constructionStage")
    .optional()
    .isIn(["PLANNED", "FOUNDATION", "FRAME", "FACADE", "INTERIOR", "READY"]),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const b = req.body;
    const propertyType = typeMap[b.type] || "FLAT";
    const rentPeriod =
      b.rentPeriod === "daily"
        ? "DAILY"
        : b.rentPeriod === "hourly"
          ? "HOURLY"
          : b.rentPeriod === "monthly"
            ? "MONTHLY"
            : null;

    const images = Array.isArray(b.images) ? b.images : [];
    const imagesJson = JSON.stringify(images);
    const tourPhotos = Array.isArray(b.tourPhotos)
      ? b.tourPhotos
          .filter((p) => p && p.path)
          .map((p) => ({
            path: String(p.path).slice(0, 300),
            type: p.type === "panorama360" ? "panorama360" : "flat",
            label: p.label ? String(p.label).slice(0, 60) : null,
          }))
      : [];

    let complexConnect = null;
    if (b.complexId) {
      const cx = await prisma.complex.findUnique({
        where: { id: b.complexId },
        include: { developer: { include: { members: true } } },
      });
      if (cx) {
        const isMember =
          req.user.role === "ADMIN" ||
          cx.developer.members.some((m) => m.userId === req.user.id);
        if (isMember) complexConnect = cx.id;
      }
    }

    const listing = await prisma.listing.create({
      data: {
        userId: req.user.id,
        deal: dealMap[b.deal],
        propertyType,
        title: b.title,
        district: b.district,
        description: b.description || null,
        price: b.price,
        currency: b.currency,
        rooms: b.rooms,
        area: b.area,
        floor: b.floor,
        lat: Number(b.lat),
        lng: Number(b.lng),
        images: imagesJson,
        videoUrl: b.videoUrl || null,
        tourPhotos: tourPhotos.length ? JSON.stringify(tourPhotos) : null,
        liveAvailable: !!b.liveAvailable,
        rentPeriod: b.deal === "rent" ? rentPeriod || "MONTHLY" : null,
        installment: !!b.installment,
        exchange: !!b.exchange,
        urgent: !!b.urgent,
        status:
          req.user.role === "ADMIN" || req.user.role === "MODERATOR"
            ? "ACTIVE"
            : "PENDING",
        complexId: complexConnect,
        unitNumber: b.unitNumber || null,
        floorPlanPath: b.floorPlanPath || null,
        constructionStage: b.constructionStage || null,
      },
    });

    let trustResult = null;
    try {
      trustResult = await auditListing(listing.id, { imagePaths: images });
    } catch (err) {
      console.error("[trust] audit failed", err?.message);
    }

    if (hasProvider()) {
      (async () => {
        try {
          const titleI18n = await translateAll(listing.title);
          const descriptionI18n = listing.description
            ? await translateAll(listing.description)
            : null;
          await prisma.listing.update({
            where: { id: listing.id },
            data: {
              titleI18n: JSON.stringify(titleI18n),
              descriptionI18n: descriptionI18n
                ? JSON.stringify(descriptionI18n)
                : null,
            },
          });
        } catch (err) {
          console.warn("[translate] background failed", err?.message);
        }
      })();
    }

    const fresh = await prisma.listing.findUnique({
      where: { id: listing.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            verifiedLevel: true,
          ratingAvg: true,
          ratingCount: true,
          wechatId: true,
          },
        },
        complex: {
          include: {
            developer: { select: { id: true, slug: true, name: true, verified: true } },
          },
        },
      },
    });
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res.status(201).json({
      ...listingToPublic(fresh, baseUrl, { includeFlags: true }),
      trust: trustResult
        ? {
            score: trustResult.trustScore,
            requiresManual: trustResult.requiresManual,
          }
        : null,
    });
  }
);

router.patch("/:id", authRequired, async (req, res) => {
  const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
  if (!listing) return res.status(404).json({ error: "Не найдено" });
  if (listing.userId !== req.user.id && req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Нет доступа" });
  }
  const allowed = [
    "title",
    "district",
    "description",
    "price",
    "currency",
    "rooms",
    "area",
    "floor",
    "lat",
    "lng",
    "videoUrl",
    "installment",
    "exchange",
    "urgent",
    "liveAvailable",
    "unitNumber",
    "floorPlanPath",
  ];
  const data = {};
  for (const k of allowed) {
    if (req.body[k] !== undefined) data[k] = req.body[k];
  }
  if (req.body.images && Array.isArray(req.body.images)) {
    data.images = JSON.stringify(req.body.images);
  }
  if (req.body.tourPhotos && Array.isArray(req.body.tourPhotos)) {
    const tour = req.body.tourPhotos
      .filter((p) => p && p.path)
      .map((p) => ({
        path: String(p.path).slice(0, 300),
        type: p.type === "panorama360" ? "panorama360" : "flat",
        label: p.label ? String(p.label).slice(0, 60) : null,
      }));
    data.tourPhotos = tour.length ? JSON.stringify(tour) : null;
  }
  if (
    typeof req.body.constructionStage === "string" &&
    ["PLANNED", "FOUNDATION", "FRAME", "FACADE", "INTERIOR", "READY"].includes(req.body.constructionStage)
  ) {
    data.constructionStage = req.body.constructionStage;
  }
  if (req.body.complexId !== undefined) {
    if (req.body.complexId === null) {
      data.complexId = null;
    } else {
      const cx = await prisma.complex.findUnique({
        where: { id: req.body.complexId },
        include: { developer: { include: { members: true } } },
      });
      if (cx) {
        const allowed =
          req.user.role === "ADMIN" ||
          cx.developer.members.some((m) => m.userId === req.user.id);
        if (allowed) data.complexId = cx.id;
      }
    }
  }
  const updated = await prisma.listing.update({
    where: { id: listing.id },
    data,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          verifiedLevel: true,
          ratingAvg: true,
          ratingCount: true,
          wechatId: true,
        },
      },
      complex: {
        include: {
          developer: { select: { id: true, slug: true, name: true, verified: true } },
        },
      },
    },
  });
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  res.json(listingToPublic(updated, baseUrl));
});

router.delete("/:id", authRequired, async (req, res) => {
  const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
  if (!listing) return res.status(404).json({ error: "Не найдено" });
  if (listing.userId !== req.user.id && req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Нет доступа" });
  }
  await prisma.listing.delete({ where: { id: listing.id } });
  res.status(204).send();
});

export default router;
