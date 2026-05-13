import { Router } from "express";
import { body, validationResult } from "express-validator";
import { prisma } from "../prisma.js";
import { authRequired } from "../middleware/auth.js";
import { notifyUser } from "../realtime/notify.js";

const router = Router();

function parseTags(json) {
  try {
    const a = JSON.parse(json || "[]");
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

function publicPost(p, viewer) {
  const tags = parseTags(p.lifestyleTags);
  return {
    id: p.id,
    userId: p.userId,
    user: p.user
      ? {
          id: p.user.id,
          name: p.user.name,
          email: viewer === p.userId ? p.user.email : undefined,
          verifiedLevel: p.user.verifiedLevel,
          ratingAvg: p.user.ratingAvg,
          ratingCount: p.user.ratingCount,
        }
      : undefined,
    district: p.district,
    budgetMin: p.budgetMin,
    budgetMax: p.budgetMax,
    bio: p.bio,
    lifestyleTags: tags,
    lookingFor: p.lookingFor,
    gender: p.gender,
    ageMin: p.ageMin,
    ageMax: p.ageMax,
    photoPath: p.photoPath,
    active: p.active,
    createdAt: p.createdAt,
  };
}

function jaccard(a, b) {
  if (!a.length && !b.length) return 0;
  const A = new Set(a.map((s) => s.toLowerCase()));
  const B = new Set(b.map((s) => s.toLowerCase()));
  let inter = 0;
  for (const v of A) if (B.has(v)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

function budgetOverlap(p1, p2) {
  const lo = Math.max(p1.budgetMin, p2.budgetMin);
  const hi = Math.min(p1.budgetMax, p2.budgetMax);
  if (lo > hi) return 0;
  const span1 = Math.max(1, p1.budgetMax - p1.budgetMin);
  const span2 = Math.max(1, p2.budgetMax - p2.budgetMin);
  return (hi - lo) / Math.min(span1, span2);
}

router.get("/feed", authRequired, async (req, res) => {
  const my = await prisma.roommatePost.findFirst({
    where: { userId: req.user.id, active: true },
    orderBy: { createdAt: "desc" },
  });
  if (!my) {
    return res.status(400).json({ error: "Сначала создайте свою анкету" });
  }
  const myTags = parseTags(my.lifestyleTags);
  const candidates = await prisma.roommatePost.findMany({
    where: {
      active: true,
      userId: { not: req.user.id },
      district: my.district,
    },
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
    take: 200,
  });
  const liked = await prisma.roommateLike.findMany({
    where: { fromUserId: req.user.id },
    select: { toPostId: true },
  });
  const likedSet = new Set(liked.map((l) => l.toPostId));
  const scored = candidates
    .filter((c) => !likedSet.has(c.id))
    .map((c) => {
      const tags = parseTags(c.lifestyleTags);
      const tagScore = jaccard(myTags, tags);
      const budgetScore = budgetOverlap(my, c);
      const lookingScore = c.lookingFor === my.lookingFor ? 1 : 0.4;
      const score =
        tagScore * 0.5 + budgetScore * 0.35 + lookingScore * 0.15;
      return { post: c, score, tagScore, budgetScore };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
  res.json({
    myPostId: my.id,
    items: scored.map((s) => ({
      ...publicPost(s.post, req.user.id),
      matchScore: Math.round(s.score * 100),
      tagOverlap: Math.round(s.tagScore * 100),
      budgetOverlap: Math.round(s.budgetScore * 100),
    })),
  });
});

router.get("/mine", authRequired, async (req, res) => {
  const items = await prisma.roommatePost.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          verifiedLevel: true,
          ratingAvg: true,
          ratingCount: true,
        },
      },
    },
  });
  res.json({ items: items.map((p) => publicPost(p, req.user.id)) });
});

router.post(
  "/",
  authRequired,
  body("district").isString().isLength({ min: 2, max: 80 }),
  body("budgetMin").isInt({ min: 0, max: 1000000000 }),
  body("budgetMax").isInt({ min: 0, max: 1000000000 }),
  body("bio").optional({ checkFalsy: true }).isString().isLength({ max: 1000 }),
  body("lifestyleTags").optional().isArray({ max: 24 }),
  body("lookingFor").isIn(["ROOM", "SHARE_FLAT"]),
  body("gender").optional().isString().isLength({ max: 16 }),
  body("ageMin").optional().isInt({ min: 16, max: 90 }),
  body("ageMax").optional().isInt({ min: 16, max: 90 }),
  body("photoPath").optional().isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    if (req.body.budgetMax < req.body.budgetMin) {
      return res.status(400).json({ error: "budgetMax должен быть ≥ budgetMin" });
    }
    const tags = (req.body.lifestyleTags || [])
      .filter((t) => typeof t === "string" && t.length > 0 && t.length < 30)
      .slice(0, 24);
    const post = await prisma.roommatePost.create({
      data: {
        userId: req.user.id,
        district: req.body.district,
        budgetMin: req.body.budgetMin,
        budgetMax: req.body.budgetMax,
        bio: String(req.body.bio || "").trim(),
        lifestyleTags: JSON.stringify(tags),
        lookingFor: req.body.lookingFor,
        gender: req.body.gender || null,
        ageMin: req.body.ageMin || null,
        ageMax: req.body.ageMax || null,
        photoPath: req.body.photoPath || null,
      },
      include: { user: true },
    });
    res.status(201).json(publicPost(post, req.user.id));
  }
);

router.patch("/:id", authRequired, async (req, res) => {
  const post = await prisma.roommatePost.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: "Не найдено" });
  if (post.userId !== req.user.id) return res.status(403).json({ error: "Нет доступа" });
  const data = {};
  for (const k of ["district", "bio", "gender", "photoPath"]) {
    if (typeof req.body[k] === "string") data[k] = req.body[k];
  }
  for (const k of ["budgetMin", "budgetMax", "ageMin", "ageMax"]) {
    if (typeof req.body[k] === "number") data[k] = req.body[k];
  }
  if (typeof req.body.active === "boolean") data.active = req.body.active;
  if (req.body.lookingFor && ["ROOM", "SHARE_FLAT"].includes(req.body.lookingFor)) {
    data.lookingFor = req.body.lookingFor;
  }
  if (Array.isArray(req.body.lifestyleTags)) {
    const tags = req.body.lifestyleTags
      .filter((t) => typeof t === "string" && t.length > 0 && t.length < 30)
      .slice(0, 24);
    data.lifestyleTags = JSON.stringify(tags);
  }
  const updated = await prisma.roommatePost.update({
    where: { id: post.id },
    data,
    include: { user: true },
  });
  res.json(publicPost(updated, req.user.id));
});

router.delete("/:id", authRequired, async (req, res) => {
  const post = await prisma.roommatePost.findUnique({ where: { id: req.params.id } });
  if (!post) return res.status(404).json({ error: "Не найдено" });
  if (post.userId !== req.user.id) return res.status(403).json({ error: "Нет доступа" });
  await prisma.roommatePost.delete({ where: { id: post.id } });
  res.status(204).send();
});

router.post(
  "/:postId/like",
  authRequired,
  body("liked").optional().isBoolean(),
  async (req, res) => {
    const target = await prisma.roommatePost.findUnique({
      where: { id: req.params.postId },
    });
    if (!target) return res.status(404).json({ error: "Не найдено" });
    if (target.userId === req.user.id) {
      return res.status(400).json({ error: "Нельзя лайкнуть себя" });
    }
    const my = await prisma.roommatePost.findFirst({
      where: { userId: req.user.id, active: true },
      orderBy: { createdAt: "desc" },
    });
    if (!my) return res.status(400).json({ error: "Сначала создайте свою анкету" });
    const liked = req.body.liked !== false;
    await prisma.roommateLike.upsert({
      where: { fromUserId_toPostId: { fromUserId: req.user.id, toPostId: target.id } },
      update: { liked },
      create: {
        fromUserId: req.user.id,
        toUserId: target.userId,
        fromPostId: my.id,
        toPostId: target.id,
        liked,
      },
    });

    let match = false;
    if (liked) {
      const reverse = await prisma.roommateLike.findFirst({
        where: {
          fromUserId: target.userId,
          toPostId: my.id,
          liked: true,
        },
      });
      if (reverse) match = true;
      if (match) {
        notifyUser(target.userId, {
          kind: "roommate-match",
          title: "Совпадение в Сосед!",
          body: `Вы и ${req.user.name || req.user.email} взаимно отметили друг друга — теперь можно общаться.`,
          url: `/?roommate=${my.id}`,
        }).catch(() => {});
        notifyUser(req.user.id, {
          kind: "roommate-match",
          title: "Совпадение в Сосед!",
          body: `Вы и ${target.userId} согласны жить вместе. Откройте чат и обсудите.`,
          url: `/?roommate=${target.id}`,
        }).catch(() => {});
      }
    }
    res.json({ ok: true, match });
  }
);

router.get("/matches", authRequired, async (req, res) => {
  const myPosts = await prisma.roommatePost.findMany({
    where: { userId: req.user.id },
    select: { id: true },
  });
  const myPostIds = myPosts.map((p) => p.id);
  if (!myPostIds.length) return res.json({ items: [] });
  const incoming = await prisma.roommateLike.findMany({
    where: { toPostId: { in: myPostIds }, liked: true },
    select: { fromUserId: true },
  });
  const incomingSet = new Set(incoming.map((l) => l.fromUserId));
  const outgoing = await prisma.roommateLike.findMany({
    where: { fromUserId: req.user.id, liked: true },
    include: {
      toPost: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              verifiedLevel: true,
              ratingAvg: true,
              ratingCount: true,
            },
          },
        },
      },
    },
  });
  const matches = outgoing
    .filter((l) => incomingSet.has(l.toUserId))
    .map((l) => publicPost(l.toPost, req.user.id));
  res.json({ items: matches });
});

export default router;
