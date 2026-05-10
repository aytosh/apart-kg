import { Router } from "express";
import { prisma } from "../prisma.js";
import { parseImages, imgUrl } from "../utils/images.js";

const router = Router();

function pickI18n(json, lang, fallback) {
  if (!json) return fallback;
  try {
    const v = JSON.parse(json);
    return v?.[lang] || fallback;
  } catch {
    return fallback;
  }
}

router.get("/listings", async (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const where = { status: "ACTIVE" };
  if (req.query.deal === "rent") where.deal = "RENT";
  if (req.query.deal === "sale") where.deal = "SALE";
  if (req.query.district) where.district = { contains: String(req.query.district) };
  const listings = await prisma.listing.findMany({
    where,
    take: 60,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, name: true, wechatId: true, verifiedLevel: true } },
    },
  });
  res.json({
    items: listings.map((l) => {
      const imgs = parseImages(l.images).map((p) => imgUrl(p, baseUrl));
      return {
        id: l.id,
        title: pickI18n(l.titleI18n, "zh", l.title),
        description: pickI18n(l.descriptionI18n, "zh", l.description),
        district: l.district,
        price: l.price,
        currency: l.currency,
        rooms: l.rooms,
        area: l.area,
        floor: l.floor,
        image: imgs[0] || null,
        deal: l.deal,
        owner: {
          id: l.user.id,
          name: l.user.name,
          verified: l.user.verifiedLevel === "ID",
          wechatId: l.user.wechatId,
        },
        qr: `${baseUrl}/api/qr/listings/${l.id}?lang=zh`,
      };
    }),
  });
});

router.get("/listings/:id", async (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const l = await prisma.listing.findUnique({
    where: { id: req.params.id },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          wechatId: true,
          verifiedLevel: true,
          ratingAvg: true,
          ratingCount: true,
        },
      },
    },
  });
  if (!l || l.status !== "ACTIVE") return res.status(404).json({ error: "Not found" });
  const imgs = parseImages(l.images).map((p) => imgUrl(p, baseUrl));
  res.json({
    id: l.id,
    title: pickI18n(l.titleI18n, "zh", l.title),
    description: pickI18n(l.descriptionI18n, "zh", l.description),
    district: l.district,
    price: l.price,
    currency: l.currency,
    rooms: l.rooms,
    area: l.area,
    floor: l.floor,
    images: imgs,
    deal: l.deal,
    propertyType: l.propertyType,
    qr: `${baseUrl}/api/qr/listings/${l.id}?lang=zh`,
    owner: {
      id: l.user.id,
      name: l.user.name,
      verified: l.user.verifiedLevel === "ID",
      wechatId: l.user.wechatId,
      wechatQr: l.user.wechatId ? `${baseUrl}/api/qr/wechat/${l.user.id}` : null,
      ratingAvg: l.user.ratingAvg,
      ratingCount: l.user.ratingCount,
    },
  });
});

export default router;
