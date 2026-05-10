import { Router } from "express";
import { body, validationResult } from "express-validator";
import { prisma } from "../prisma.js";
import { authRequired, authOptional, requireAdmin } from "../middleware/auth.js";
import {
  ensureBuildingProfile,
  recomputeBuildingRating,
  isVerifiedMember,
  normalizeAddress,
} from "../services/buildings.js";

const router = Router();

function publicProfile(b, isMember) {
  return {
    id: b.id,
    address: b.address,
    district: b.district,
    lat: b.lat,
    lng: b.lng,
    ratingAvg: b.ratingAvg,
    ratingCount: b.ratingCount,
    reviewCount: b._count?.reviews ?? b.ratingCount,
    memberCount: b._count?.members,
    isMember: !!isMember,
  };
}

router.post(
  "/lookup",
  authOptional,
  body("address").isString().isLength({ min: 3, max: 240 }),
  body("district").optional().isString().isLength({ max: 80 }),
  body("lat").optional().isFloat(),
  body("lng").optional().isFloat(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const profile = await ensureBuildingProfile({
      address: req.body.address,
      district: req.body.district,
      lat: req.body.lat,
      lng: req.body.lng,
    });
    if (!profile) return res.status(400).json({ error: "Адрес не распознан" });
    const fresh = await prisma.buildingProfile.findUnique({
      where: { id: profile.id },
      include: { _count: { select: { reviews: true, members: true } } },
    });
    let isMember = false;
    if (req.user) {
      isMember = await isVerifiedMember(profile.id, req.user.id);
    }
    res.json(publicProfile(fresh, isMember));
  }
);

router.get("/:id", authOptional, async (req, res) => {
  const b = await prisma.buildingProfile.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { reviews: true, members: true } } },
  });
  if (!b) return res.status(404).json({ error: "Не найдено" });
  let isMember = false;
  if (req.user) isMember = await isVerifiedMember(b.id, req.user.id);
  res.json(publicProfile(b, isMember));
});

router.get("/:id/reviews", async (req, res) => {
  const items = await prisma.buildingReview.findMany({
    where: { buildingId: req.params.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          verifiedLevel: true,
          ratingAvg: true,
          ratingCount: true,
        },
      },
    },
  });
  res.json({
    items: items.map((r) => ({
      id: r.id,
      rating: r.rating,
      pros: r.pros,
      cons: r.cons,
      livedFrom: r.livedFrom,
      livedTo: r.livedTo,
      createdAt: r.createdAt,
      user: r.user,
    })),
  });
});

router.post(
  "/:id/reviews",
  authRequired,
  body("rating").isInt({ min: 1, max: 5 }),
  body("pros").optional().isString().isLength({ max: 600 }),
  body("cons").optional().isString().isLength({ max: 600 }),
  body("livedFrom").optional().isISO8601(),
  body("livedTo").optional().isISO8601(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const b = await prisma.buildingProfile.findUnique({ where: { id: req.params.id } });
    if (!b) return res.status(404).json({ error: "Не найдено" });
    const review = await prisma.buildingReview.create({
      data: {
        buildingId: b.id,
        userId: req.user.id,
        rating: req.body.rating,
        pros: req.body.pros || null,
        cons: req.body.cons || null,
        livedFrom: req.body.livedFrom ? new Date(req.body.livedFrom) : null,
        livedTo: req.body.livedTo ? new Date(req.body.livedTo) : null,
      },
    });
    await recomputeBuildingRating(b.id);
    res.status(201).json({ id: review.id });
  }
);

router.post("/:id/membership/request", authRequired, async (req, res) => {
  const b = await prisma.buildingProfile.findUnique({ where: { id: req.params.id } });
  if (!b) return res.status(404).json({ error: "Не найдено" });
  const existing = await prisma.buildingMember.findUnique({
    where: { buildingId_userId: { buildingId: b.id, userId: req.user.id } },
  });
  if (existing) {
    return res.json({ id: existing.id, status: existing.status });
  }
  const dealAtThisBuilding = await prisma.deal.findFirst({
    where: {
      tenantId: req.user.id,
      status: { in: ["SIGNED", "ACTIVE", "COMPLETED"] },
      listing: {
        district: { contains: b.address.split(",")[0]?.slice(0, 30) || b.address.slice(0, 30) },
      },
    },
  });
  const u = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { verifiedLevel: true },
  });
  const autoApprove =
    u?.verifiedLevel === "ID" && Boolean(dealAtThisBuilding);
  const m = await prisma.buildingMember.create({
    data: {
      buildingId: b.id,
      userId: req.user.id,
      status: autoApprove ? "APPROVED" : "PENDING",
      verifiedAt: autoApprove ? new Date() : null,
      note: autoApprove ? "Автоодобрено: верифицирован + активная сделка" : null,
    },
  });
  res.status(201).json({ id: m.id, status: m.status });
});

router.post(
  "/:id/membership/:userId/decide",
  authRequired,
  requireAdmin,
  body("status").isIn(["APPROVED", "REJECTED"]),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const m = await prisma.buildingMember.findUnique({
      where: {
        buildingId_userId: { buildingId: req.params.id, userId: req.params.userId },
      },
    });
    if (!m) return res.status(404).json({ error: "Не найдено" });
    const updated = await prisma.buildingMember.update({
      where: { id: m.id },
      data: {
        status: req.body.status,
        verifiedAt: req.body.status === "APPROVED" ? new Date() : null,
      },
    });
    res.json({ id: updated.id, status: updated.status });
  }
);

router.get("/:id/chat", authRequired, async (req, res) => {
  const b = await prisma.buildingProfile.findUnique({ where: { id: req.params.id } });
  if (!b) return res.status(404).json({ error: "Не найдено" });
  if (!(await isVerifiedMember(b.id, req.user.id)) && req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Доступ только для подтверждённых жильцов" });
  }
  const items = await prisma.buildingChatMessage.findMany({
    where: { buildingId: b.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      user: {
        select: { id: true, name: true, verifiedLevel: true },
      },
    },
  });
  res.json({
    items: items.reverse().map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt,
      user: m.user,
    })),
  });
});

router.post(
  "/:id/chat",
  authRequired,
  body("body").isString().isLength({ min: 1, max: 1000 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const b = await prisma.buildingProfile.findUnique({ where: { id: req.params.id } });
    if (!b) return res.status(404).json({ error: "Не найдено" });
    if (!(await isVerifiedMember(b.id, req.user.id)) && req.user.role !== "ADMIN") {
      return res.status(403).json({ error: "Доступ только для подтверждённых жильцов" });
    }
    const msg = await prisma.buildingChatMessage.create({
      data: {
        buildingId: b.id,
        userId: req.user.id,
        body: req.body.body,
      },
      include: {
        user: { select: { id: true, name: true, verifiedLevel: true } },
      },
    });
    res.status(201).json({
      id: msg.id,
      body: msg.body,
      createdAt: msg.createdAt,
      user: msg.user,
    });
  }
);

router.get("/admin/membership-requests", authRequired, requireAdmin, async (_req, res) => {
  const items = await prisma.buildingMember.findMany({
    where: { status: "PENDING" },
    include: {
      building: true,
      user: { select: { id: true, name: true, email: true, verifiedLevel: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({
    items: items.map((m) => ({
      id: m.id,
      buildingId: m.buildingId,
      userId: m.userId,
      address: m.building.address,
      user: m.user,
      createdAt: m.createdAt,
    })),
  });
});

export default router;
