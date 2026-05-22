import { Router } from "express";
import { prisma } from "../prisma.js";
import { authOptional } from "../middleware/auth.js";
import { resolveListingLang } from "../utils/listingLang.js";
import { mapListingsEnriched } from "../services/listingEnrich.js";

const router = Router();

function publicAgency(u, extra = {}) {
  return {
    id: u.id,
    slug: u.agencySlug || u.id,
    name: u.agencyName || u.name || "Агентство",
    logo: u.agencyLogo || null,
    city: u.agencyCity || null,
    description: u.agencyDescription || null,
    verified: u.verifiedLevel === "ID",
    ratingAvg: u.ratingAvg || null,
    ratingCount: u.ratingCount || 0,
    listingsCount: extra.listingsCount ?? 0,
  };
}

router.get("/", authOptional, async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 24, 1), 100);
  const search = (req.query.search || "").toString().trim();

  const where = { isAgency: true };
  if (search) {
    where.OR = [
      { agencyName: { contains: search } },
      { agencyCity: { contains: search } },
    ];
  }

  const agents = await prisma.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      verifiedLevel: true,
      ratingAvg: true,
      ratingCount: true,
      isAgency: true,
      agencyName: true,
      agencySlug: true,
      agencyLogo: true,
      agencyCity: true,
      agencyDescription: true,
    },
    orderBy: [{ ratingAvg: "desc" }, { createdAt: "desc" }],
    take: limit,
  });

  if (!agents.length) {
    return res.json({ items: [] });
  }

  const ids = agents.map((a) => a.id);
  const counts = await prisma.listing.groupBy({
    by: ["userId"],
    where: { userId: { in: ids }, status: "ACTIVE" },
    _count: { _all: true },
  });
  const countByUser = Object.fromEntries(counts.map((c) => [c.userId, c._count._all]));

  const items = agents
    .map((a) => publicAgency(a, { listingsCount: countByUser[a.id] || 0 }))
    .sort((a, b) => (b.listingsCount || 0) - (a.listingsCount || 0));

  res.json({ items });
});

router.get("/:slug", authOptional, async (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const slug = req.params.slug;
  const lang = resolveListingLang(req.query.lang);

  const agent = await prisma.user.findFirst({
    where: {
      isAgency: true,
      OR: [{ agencySlug: slug }, { id: slug }],
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      verifiedLevel: true,
      ratingAvg: true,
      ratingCount: true,
      isAgency: true,
      agencyName: true,
      agencySlug: true,
      agencyLogo: true,
      agencyCity: true,
      agencyDescription: true,
    },
  });
  if (!agent) return res.status(404).json({ error: "Agency not found" });

  const listings = await prisma.listing.findMany({
    where: { userId: agent.id, status: "ACTIVE" },
    include: {
      user: {
        select: {
          id: true,
          name: true,
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
    orderBy: { createdAt: "desc" },
    take: 60,
  });

  const mine = req.user?.id;
  let favoriteIds = new Set();
  if (mine) {
    const favs = await prisma.favorite.findMany({
      where: { userId: mine },
      select: { listingId: true },
    });
    favoriteIds = new Set(favs.map((f) => f.listingId));
  }

  const enriched = await mapListingsEnriched(listings, baseUrl, lang, (l) => ({
    isFavorite: favoriteIds.has(l.id),
  }));
  res.json({
    agency: publicAgency(agent, { listingsCount: listings.length }),
    listings: enriched,
  });
});

export default router;
