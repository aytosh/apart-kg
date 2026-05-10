import { Router } from "express";
import { prisma } from "../prisma.js";
import { authRequired } from "../middleware/auth.js";

const router = Router();

import { parseImages, imgUrl } from "../utils/images.js";

function toItem(listing, baseUrl) {
  const imgs = parseImages(listing.images).map((p) => imgUrl(p, baseUrl));
  return {
    id: listing.id,
    userId: listing.userId,
    deal: listing.deal === "RENT" ? "rent" : "sale",
    type: listing.propertyType === "NEWBUILD" ? "new" : listing.propertyType.toLowerCase(),
    title: listing.title,
    district: listing.district,
    price: listing.price,
    currency: listing.currency,
    rooms: listing.rooms,
    area: listing.area,
    floor: listing.floor,
    lat: listing.lat,
    lng: listing.lng,
    images: imgs,
    image: imgs[0] || null,
    tag: listing.deal === "RENT" ? "Аренда" : "Продажа",
    status: listing.status.toLowerCase(),
    installment: listing.installment,
    exchange: listing.exchange,
    urgent: listing.urgent,
    isFavorite: true,
  };
}

router.get("/", authRequired, async (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const favs = await prisma.favorite.findMany({
    where: { userId: req.user.id },
    include: { listing: true },
    orderBy: { createdAt: "desc" },
  });
  const items = favs
    .map((f) => f.listing)
    .filter((l) => l.status === "ACTIVE")
    .map((l) => ({ ...toItem(l, baseUrl), isFavorite: true }));
  res.json({ items });
});

router.post("/:listingId", authRequired, async (req, res) => {
  const listing = await prisma.listing.findUnique({ where: { id: req.params.listingId } });
  if (!listing || listing.status !== "ACTIVE") {
    return res.status(404).json({ error: "Объявление не найдено" });
  }
  await prisma.favorite.upsert({
    where: {
      userId_listingId: { userId: req.user.id, listingId: listing.id },
    },
    create: { userId: req.user.id, listingId: listing.id },
    update: {},
  });
  res.json({ ok: true });
});

router.delete("/:listingId", authRequired, async (req, res) => {
  try {
    await prisma.favorite.delete({
      where: {
        userId_listingId: { userId: req.user.id, listingId: req.params.listingId },
      },
    });
  } catch {
    /* ignore */
  }
  res.json({ ok: true });
});

export default router;
