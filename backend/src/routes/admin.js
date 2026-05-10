import { Router } from "express";
import { body, validationResult } from "express-validator";
import { prisma } from "../prisma.js";
import { authRequired, requireAdmin } from "../middleware/auth.js";

const router = Router();

router.use(authRequired, requireAdmin);

router.get("/dashboard", async (_req, res) => {
  const [users, listingsAll, listingsPending, listingsActive, payments, paidSum] = await Promise.all([
    prisma.user.count(),
    prisma.listing.count(),
    prisma.listing.count({ where: { status: "PENDING" } }),
    prisma.listing.count({ where: { status: "ACTIVE" } }),
    prisma.payment.count(),
    prisma.payment.aggregate({ where: { status: "PAID" }, _sum: { amountSom: true } }),
  ]);
  res.json({
    users,
    listingsAll,
    listingsPending,
    listingsActive,
    paymentsAll: payments,
    paymentsRevenueSom: paidSum._sum.amountSom || 0,
  });
});

router.get("/listings/pending", async (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const listings = await prisma.listing.findMany({
    where: { status: "PENDING" },
    include: { user: { select: { id: true, email: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  const parseImages = (s) => {
    try {
      const a = JSON.parse(s || "[]");
      return Array.isArray(a) ? a.map((p) => `${baseUrl}${p}`) : [];
    } catch {
      return [];
    }
  };

  res.json({
    items: listings.map((l) => ({
      id: l.id,
      title: l.title,
      district: l.district,
      deal: l.deal,
      propertyType: l.propertyType,
      status: l.status,
      createdAt: l.createdAt,
      user: l.user,
      images: parseImages(l.images),
    })),
  });
});

router.get("/payments/recent", async (_req, res) => {
  const items = await prisma.payment.findMany({
    include: {
      user: { select: { id: true, email: true, name: true } },
      listing: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 80,
  });
  res.json({ items });
});

router.post(
  "/listings/:id/approve",
  async (req, res) => {
    const listing = await prisma.listing.update({
      where: { id: req.params.id },
      data: { status: "ACTIVE", rejectReason: null },
    });
    res.json({ id: listing.id, status: listing.status.toLowerCase() });
  }
);

router.post(
  "/listings/:id/reject",
  body("reason").optional().trim(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const listing = await prisma.listing.update({
      where: { id: req.params.id },
      data: { status: "REJECTED", rejectReason: req.body.reason || null },
    });
    res.json({ id: listing.id, status: listing.status.toLowerCase() });
  }
);

router.get("/verifications", async (req, res) => {
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const items = await prisma.verification.findMany({
    where: { status: "PENDING" },
    include: { user: { select: { id: true, email: true, name: true, phone: true } } },
    orderBy: { createdAt: "asc" },
  });
  res.json({
    items: items.map((v) => ({
      id: v.id,
      status: v.status,
      createdAt: v.createdAt,
      user: v.user,
      selfieUrl: `${baseUrl}${v.selfiePath}`,
      idDocUrl: `${baseUrl}${v.idDocPath}`,
    })),
  });
});

router.post(
  "/verifications/:id/approve",
  async (req, res) => {
    const v = await prisma.verification.findUnique({ where: { id: req.params.id } });
    if (!v) return res.status(404).json({ error: "Не найдено" });
    await prisma.$transaction([
      prisma.verification.update({
        where: { id: v.id },
        data: { status: "APPROVED", decidedAt: new Date(), decidedById: req.user.id },
      }),
      prisma.user.update({
        where: { id: v.userId },
        data: { verifiedLevel: "ID", verifiedAt: new Date() },
      }),
    ]);
    res.json({ ok: true });
  }
);

router.post(
  "/verifications/:id/reject",
  body("note").optional().trim(),
  async (req, res) => {
    const v = await prisma.verification.findUnique({ where: { id: req.params.id } });
    if (!v) return res.status(404).json({ error: "Не найдено" });
    await prisma.verification.update({
      where: { id: v.id },
      data: {
        status: "REJECTED",
        decidedAt: new Date(),
        decidedById: req.user.id,
        note: req.body.note || null,
      },
    });
    res.json({ ok: true });
  }
);

export default router;
