import { Router } from "express";
import { body, query, validationResult } from "express-validator";
import { prisma } from "../prisma.js";
import { authRequired, authOptional } from "../middleware/auth.js";
import { notifyUser } from "../realtime/notify.js";

const router = Router();

const STAGES = ["PLANNED", "FOUNDATION", "FRAME", "FACADE", "INTERIOR", "READY"];

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

async function uniqueSlug(base) {
  let s = slugify(base) || `cx-${Date.now()}`;
  let i = 0;
  while (await prisma.complex.findUnique({ where: { slug: i ? `${s}-${i}` : s } })) {
    i++;
  }
  return i ? `${s}-${i}` : s;
}

function parsePhotos(json) {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function publicComplex(c) {
  return {
    id: c.id,
    slug: c.slug,
    developerId: c.developerId,
    developer: c.developer
      ? {
          id: c.developer.id,
          slug: c.developer.slug,
          name: c.developer.name,
          verified: c.developer.verified,
          logoPath: c.developer.logoPath,
        }
      : undefined,
    name: c.name,
    district: c.district,
    address: c.address,
    lat: c.lat,
    lng: c.lng,
    totalUnits: c.totalUnits,
    deadline: c.deadline,
    photoCover: c.photoCover,
    about: c.about,
    progressPercent: c.progressPercent,
    currentStage: c.currentStage,
    listingCount: c._count?.listings,
    subscriberCount: c._count?.subscriptions,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

async function ensureCanEdit(complex, user) {
  if (user.role === "ADMIN") return true;
  const member = await prisma.developerMember.findFirst({
    where: { developerId: complex.developerId, userId: user.id },
  });
  return Boolean(member);
}

router.get(
  "/",
  query("stage").optional().isIn(STAGES),
  query("deadlineYear").optional().isInt({ min: 2020, max: 2100 }),
  query("district").optional().isString(),
  async (req, res) => {
    const where = {};
    if (req.query.stage) where.currentStage = req.query.stage;
    if (req.query.district) where.district = { contains: req.query.district };
    if (req.query.deadlineYear) {
      const y = Number(req.query.deadlineYear);
      where.deadline = {
        gte: new Date(`${y}-01-01T00:00:00.000Z`),
        lt: new Date(`${y + 1}-01-01T00:00:00.000Z`),
      };
    }
    const items = await prisma.complex.findMany({
      where,
      orderBy: [{ progressPercent: "desc" }, { createdAt: "desc" }],
      include: {
        developer: {
          select: { id: true, slug: true, name: true, verified: true, logoPath: true },
        },
        _count: { select: { listings: true, subscriptions: true } },
      },
    });
    res.json({ items: items.map(publicComplex) });
  }
);

router.get("/:idOrSlug", authOptional, async (req, res) => {
  const key = req.params.idOrSlug;
  const c = await prisma.complex.findFirst({
    where: { OR: [{ id: key }, { slug: key }] },
    include: {
      developer: true,
      _count: { select: { listings: true, subscriptions: true } },
    },
  });
  if (!c) return res.status(404).json({ error: "ЖК не найден" });
  let isSubscribed = false;
  if (req.user) {
    const sub = await prisma.complexSubscription.findUnique({
      where: { userId_complexId: { userId: req.user.id, complexId: c.id } },
    });
    isSubscribed = Boolean(sub?.notify);
  }
  res.json({ ...publicComplex(c), isSubscribed });
});

router.get("/:id/feed", async (req, res) => {
  const c = await prisma.complex.findFirst({
    where: { OR: [{ id: req.params.id }, { slug: req.params.id }] },
    select: { id: true },
  });
  if (!c) return res.status(404).json({ error: "ЖК не найден" });
  const items = await prisma.constructionUpdate.findMany({
    where: { complexId: c.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json({
    items: items.map((u) => ({
      id: u.id,
      complexId: u.complexId,
      text: u.text,
      photos: parsePhotos(u.photos),
      progressPercent: u.progressPercent,
      stage: u.stage,
      milestone: u.milestone,
      createdAt: u.createdAt,
    })),
  });
});

router.get("/:id/units", async (req, res) => {
  const c = await prisma.complex.findFirst({
    where: { OR: [{ id: req.params.id }, { slug: req.params.id }] },
    select: { id: true },
  });
  if (!c) return res.status(404).json({ error: "ЖК не найден" });
  const items = await prisma.listing.findMany({
    where: { complexId: c.id, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      price: true,
      currency: true,
      rooms: true,
      area: true,
      floor: true,
      unitNumber: true,
      images: true,
      floorPlanPath: true,
      constructionStage: true,
    },
  });
  res.json({ items });
});

router.post(
  "/",
  authRequired,
  body("developerId").isString().notEmpty(),
  body("name").isString().isLength({ min: 2, max: 160 }),
  body("district").isString().isLength({ min: 2, max: 80 }),
  body("address").optional().isString().isLength({ max: 240 }),
  body("lat").optional().isFloat(),
  body("lng").optional().isFloat(),
  body("totalUnits").optional().isInt({ min: 1, max: 5000 }),
  body("deadline").optional().isISO8601(),
  body("photoCover").optional().isString(),
  body("about").optional().isString().isLength({ max: 4000 }),
  body("progressPercent").optional().isInt({ min: 0, max: 100 }),
  body("currentStage").optional().isIn(STAGES),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const dev = await prisma.developer.findUnique({
      where: { id: req.body.developerId },
      include: { members: true },
    });
    if (!dev) return res.status(404).json({ error: "Застройщик не найден" });
    const isOwner = dev.members.some((m) => m.userId === req.user.id);
    if (!isOwner && req.user.role !== "ADMIN") {
      return res.status(403).json({ error: "Нет доступа" });
    }
    const slug = await uniqueSlug(req.body.name);
    const c = await prisma.complex.create({
      data: {
        developerId: dev.id,
        slug,
        name: req.body.name,
        district: req.body.district,
        address: req.body.address || null,
        lat: req.body.lat != null ? Number(req.body.lat) : null,
        lng: req.body.lng != null ? Number(req.body.lng) : null,
        totalUnits: req.body.totalUnits || null,
        deadline: req.body.deadline ? new Date(req.body.deadline) : null,
        photoCover: req.body.photoCover || null,
        about: req.body.about || null,
        progressPercent: req.body.progressPercent || 0,
        currentStage: req.body.currentStage || "PLANNED",
      },
      include: {
        developer: true,
        _count: { select: { listings: true, subscriptions: true } },
      },
    });
    res.status(201).json(publicComplex(c));
  }
);

router.patch("/:id", authRequired, async (req, res) => {
  const c = await prisma.complex.findUnique({ where: { id: req.params.id } });
  if (!c) return res.status(404).json({ error: "ЖК не найден" });
  if (!(await ensureCanEdit(c, req.user))) {
    return res.status(403).json({ error: "Нет доступа" });
  }
  const data = {};
  for (const k of ["name", "district", "address", "photoCover", "about"]) {
    if (typeof req.body[k] === "string") data[k] = req.body[k];
  }
  if (req.body.lat != null) data.lat = Number(req.body.lat);
  if (req.body.lng != null) data.lng = Number(req.body.lng);
  if (typeof req.body.totalUnits === "number") data.totalUnits = req.body.totalUnits;
  if (req.body.deadline) data.deadline = new Date(req.body.deadline);
  if (typeof req.body.progressPercent === "number") {
    data.progressPercent = Math.max(0, Math.min(100, req.body.progressPercent));
  }
  if (STAGES.includes(req.body.currentStage)) data.currentStage = req.body.currentStage;
  const updated = await prisma.complex.update({
    where: { id: c.id },
    data,
    include: {
      developer: true,
      _count: { select: { listings: true, subscriptions: true } },
    },
  });
  res.json(publicComplex(updated));
});

router.post(
  "/:id/updates",
  authRequired,
  body("text").isString().isLength({ min: 3, max: 2000 }),
  body("photos").optional().isArray(),
  body("progressPercent").optional().isInt({ min: 0, max: 100 }),
  body("stage").optional().isIn(STAGES),
  body("milestone").optional().isBoolean(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const c = await prisma.complex.findUnique({
      where: { id: req.params.id },
      include: { subscriptions: true },
    });
    if (!c) return res.status(404).json({ error: "ЖК не найден" });
    if (!(await ensureCanEdit(c, req.user))) {
      return res.status(403).json({ error: "Нет доступа" });
    }
    const milestone = !!req.body.milestone;
    const update = await prisma.constructionUpdate.create({
      data: {
        complexId: c.id,
        text: req.body.text,
        photos: req.body.photos ? JSON.stringify(req.body.photos) : null,
        progressPercent: req.body.progressPercent ?? null,
        stage: req.body.stage || null,
        milestone,
      },
    });
    const complexData = {};
    if (typeof req.body.progressPercent === "number") {
      complexData.progressPercent = Math.max(0, Math.min(100, req.body.progressPercent));
    }
    if (req.body.stage && STAGES.includes(req.body.stage)) {
      complexData.currentStage = req.body.stage;
    }
    if (Object.keys(complexData).length) {
      await prisma.complex.update({ where: { id: c.id }, data: complexData });
    }
    if (c.subscriptions?.length) {
      const photoCount = req.body.photos?.length || 0;
      const body =
        update.text.length > 120 ? `${update.text.slice(0, 120)}…` : update.text;
      const title = milestone
        ? `Этап стройки «${c.name}»`
        : `Обновление по ЖК «${c.name}»`;
      for (const sub of c.subscriptions) {
        if (sub.notify) {
          notifyUser(sub.userId, {
            kind: milestone ? "complex-milestone" : "complex-update",
            title,
            body: photoCount ? `${body} (фото: ${photoCount})` : body,
            url: `/?complex=${c.slug}`,
          }).catch(() => {});
        }
      }
    }
    res.status(201).json({
      id: update.id,
      complexId: update.complexId,
      text: update.text,
      photos: parsePhotos(update.photos),
      progressPercent: update.progressPercent,
      stage: update.stage,
      milestone: update.milestone,
      createdAt: update.createdAt,
    });
  }
);

router.post("/:id/subscribe", authRequired, async (req, res) => {
  const c = await prisma.complex.findUnique({ where: { id: req.params.id } });
  if (!c) return res.status(404).json({ error: "ЖК не найден" });
  const existing = await prisma.complexSubscription.findUnique({
    where: { userId_complexId: { userId: req.user.id, complexId: c.id } },
  });
  if (existing) {
    const updated = await prisma.complexSubscription.update({
      where: { id: existing.id },
      data: { notify: true },
    });
    return res.json({ id: updated.id, notify: updated.notify });
  }
  const sub = await prisma.complexSubscription.create({
    data: { userId: req.user.id, complexId: c.id, notify: true },
  });
  res.status(201).json({ id: sub.id, notify: sub.notify });
});

router.post("/:id/unsubscribe", authRequired, async (req, res) => {
  const c = await prisma.complex.findUnique({ where: { id: req.params.id } });
  if (!c) return res.status(404).json({ error: "ЖК не найден" });
  await prisma.complexSubscription.deleteMany({
    where: { userId: req.user.id, complexId: c.id },
  });
  res.json({ ok: true });
});

router.get("/mine/subscriptions", authRequired, async (req, res) => {
  const items = await prisma.complexSubscription.findMany({
    where: { userId: req.user.id },
    include: {
      complex: {
        include: {
          developer: { select: { id: true, slug: true, name: true, verified: true } },
          _count: { select: { listings: true, subscriptions: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ items: items.map((s) => ({ ...publicComplex(s.complex), notify: s.notify })) });
});

export default router;
