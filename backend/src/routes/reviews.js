import { Router } from "express";
import { body, validationResult } from "express-validator";
import { prisma } from "../prisma.js";
import { authRequired } from "../middleware/auth.js";
import { notifyUser } from "../realtime/notify.js";

const router = Router();

async function recomputeUserRating(userId) {
  const agg = await prisma.review.aggregate({
    where: { toUserId: userId },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await prisma.user.update({
    where: { id: userId },
    data: {
      ratingAvg: agg._avg.rating ?? null,
      ratingCount: agg._count._all,
    },
  });
}

router.get("/user/:userId", async (req, res) => {
  const items = await prisma.review.findMany({
    where: { toUserId: req.params.userId },
    include: {
      fromUser: { select: { id: true, name: true, email: true } },
      listing: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json({
    items: items.map((r) => ({
      id: r.id,
      rating: r.rating,
      role: r.role,
      text: r.text,
      createdAt: r.createdAt,
      fromUser: { id: r.fromUser.id, name: r.fromUser.name },
      listing: r.listing ? { id: r.listing.id, title: r.listing.title } : null,
    })),
  });
});

router.post(
  "/",
  authRequired,
  body("toUserId").isString().notEmpty(),
  body("role").isIn(["LANDLORD", "TENANT"]),
  body("rating").isInt({ min: 1, max: 5 }),
  body("text").optional().isString().isLength({ max: 1000 }),
  body("listingId").optional().isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    if (req.body.toUserId === req.user.id) {
      return res.status(400).json({ error: "Нельзя оценить самого себя" });
    }
    const target = await prisma.user.findUnique({ where: { id: req.body.toUserId } });
    if (!target) return res.status(404).json({ error: "Пользователь не найден" });

    const review = await prisma.review.create({
      data: {
        listingId: req.body.listingId || null,
        fromUserId: req.user.id,
        toUserId: req.body.toUserId,
        role: req.body.role,
        rating: Number(req.body.rating),
        text: req.body.text || null,
      },
    });

    await recomputeUserRating(req.body.toUserId);
    notifyUser(req.body.toUserId, {
      kind: "review",
      title: "Новый отзыв",
      body: `Вам поставили ${review.rating}/5`,
      url: `/?profile=${req.body.toUserId}`,
    }).catch(() => {});

    res.status(201).json({ id: review.id, rating: review.rating });
  }
);

router.get("/profile/:userId", async (req, res) => {
  const u = await prisma.user.findUnique({
    where: { id: req.params.userId },
    select: {
      id: true,
      name: true,
      email: true,
      verifiedLevel: true,
      verifiedAt: true,
      ratingAvg: true,
      ratingCount: true,
      createdAt: true,
      _count: { select: { listings: true } },
    },
  });
  if (!u) return res.status(404).json({ error: "Не найдено" });
  res.json({
    id: u.id,
    name: u.name,
    email: u.email,
    verifiedLevel: u.verifiedLevel,
    verifiedAt: u.verifiedAt,
    ratingAvg: u.ratingAvg,
    ratingCount: u.ratingCount,
    listingsCount: u._count.listings,
    memberSince: u.createdAt,
  });
});

export { recomputeUserRating };
export default router;
