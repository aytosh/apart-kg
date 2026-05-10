import { Router } from "express";
import { body, validationResult } from "express-validator";
import { prisma } from "../prisma.js";
import { authRequired, authOptional, requireAdmin } from "../middleware/auth.js";

const router = Router();

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
  let s = slugify(base) || `dev-${Date.now()}`;
  let i = 0;
  while (await prisma.developer.findUnique({ where: { slug: i ? `${s}-${i}` : s } })) {
    i++;
  }
  return i ? `${s}-${i}` : s;
}

function publicDeveloper(d) {
  return {
    id: d.id,
    slug: d.slug,
    name: d.name,
    logoPath: d.logoPath,
    about: d.about,
    contactPhone: d.contactPhone,
    contactEmail: d.contactEmail,
    website: d.website,
    verified: d.verified,
    complexCount: d._count?.complexes,
    createdAt: d.createdAt,
  };
}

router.get("/", async (_req, res) => {
  const items = await prisma.developer.findMany({
    orderBy: [{ verified: "desc" }, { createdAt: "desc" }],
    include: { _count: { select: { complexes: true } } },
  });
  res.json({ items: items.map(publicDeveloper) });
});

router.get("/:idOrSlug", async (req, res) => {
  const key = req.params.idOrSlug;
  const dev = await prisma.developer.findFirst({
    where: { OR: [{ id: key }, { slug: key }] },
    include: {
      _count: { select: { complexes: true } },
      complexes: {
        orderBy: [{ createdAt: "desc" }],
        select: {
          id: true,
          slug: true,
          name: true,
          district: true,
          progressPercent: true,
          currentStage: true,
          deadline: true,
          photoCover: true,
          totalUnits: true,
        },
      },
    },
  });
  if (!dev) return res.status(404).json({ error: "Застройщик не найден" });
  res.json({ ...publicDeveloper(dev), complexes: dev.complexes });
});

router.post(
  "/",
  authRequired,
  body("name").isString().isLength({ min: 2, max: 120 }),
  body("about").optional().isString().isLength({ max: 4000 }),
  body("contactPhone").optional().isString().isLength({ max: 32 }),
  body("contactEmail").optional().isString().isLength({ max: 120 }),
  body("website").optional().isString().isLength({ max: 200 }),
  body("logoPath").optional().isString().isLength({ max: 200 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    if (!["ADMIN", "AGENT"].includes(req.user.role)) {
      return res.status(403).json({ error: "Только агент или админ может заводить застройщика" });
    }
    const slug = await uniqueSlug(req.body.name);
    const dev = await prisma.developer.create({
      data: {
        slug,
        name: req.body.name,
        about: req.body.about || null,
        contactPhone: req.body.contactPhone || null,
        contactEmail: req.body.contactEmail || null,
        website: req.body.website || null,
        logoPath: req.body.logoPath || null,
        verified: req.user.role === "ADMIN",
        members: {
          create: { userId: req.user.id, role: "OWNER" },
        },
      },
      include: { _count: { select: { complexes: true } } },
    });
    res.status(201).json(publicDeveloper(dev));
  }
);

router.patch(
  "/:id",
  authRequired,
  async (req, res) => {
    const dev = await prisma.developer.findUnique({
      where: { id: req.params.id },
      include: { members: true },
    });
    if (!dev) return res.status(404).json({ error: "Не найдено" });
    const isOwner = dev.members.some((m) => m.userId === req.user.id);
    if (!isOwner && req.user.role !== "ADMIN") {
      return res.status(403).json({ error: "Нет доступа" });
    }
    const data = {};
    for (const k of ["name", "about", "contactPhone", "contactEmail", "website", "logoPath"]) {
      if (typeof req.body[k] === "string") data[k] = req.body[k];
    }
    if (req.user.role === "ADMIN" && typeof req.body.verified === "boolean") {
      data.verified = req.body.verified;
    }
    const updated = await prisma.developer.update({
      where: { id: dev.id },
      data,
      include: { _count: { select: { complexes: true } } },
    });
    res.json(publicDeveloper(updated));
  }
);

router.post("/:id/verify", authRequired, requireAdmin, async (req, res) => {
  const updated = await prisma.developer.update({
    where: { id: req.params.id },
    data: { verified: true },
    include: { _count: { select: { complexes: true } } },
  });
  res.json(publicDeveloper(updated));
});

export default router;
