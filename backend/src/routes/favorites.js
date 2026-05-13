import { Router } from "express";
import { prisma } from "../prisma.js";
import { authRequired } from "../middleware/auth.js";
import { listingToPublic } from "../services/listingPublic.js";
import { resolveListingLang } from "../utils/listingLang.js";

const router = Router();

router.get("/", authRequired, async (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const lang = resolveListingLang(req.query.lang);
  const favs = await prisma.favorite.findMany({
    where: { userId: req.user.id },
    include: {
      listing: {
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
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const items = favs
    .map((f) => f.listing)
    .filter((l) => l.status === "ACTIVE")
    .map((l) => ({
      ...listingToPublic(l, baseUrl, { lang }),
      isFavorite: true,
    }));
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
