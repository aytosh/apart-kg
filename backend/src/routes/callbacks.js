import { Router } from "express";
import { body, validationResult } from "express-validator";
import { prisma } from "../prisma.js";
import { authOptional, authRequired } from "../middleware/auth.js";
import { notifyUser } from "../realtime/notify.js";

const router = Router();

const STATUSES = ["NEW", "CONTACTED", "DONE", "CANCELLED"];

function publicCallback(c) {
  return {
    id: c.id,
    listingId: c.listingId,
    listing: c.listing
      ? {
          id: c.listing.id,
          title: c.listing.title,
          district: c.listing.district,
        }
      : undefined,
    name: c.name,
    phone: c.phone,
    preferredAt: c.preferredAt,
    comment: c.comment,
    status: c.status,
    createdAt: c.createdAt,
    requesterId: c.requesterId,
    requester: c.requester
      ? { id: c.requester.id, name: c.requester.name, email: c.requester.email }
      : undefined,
  };
}

router.post(
  "/",
  authOptional,
  body("listingId").isString().isLength({ min: 1, max: 64 }),
  body("name").isString().trim().isLength({ min: 1, max: 80 }),
  body("phone").isString().trim().isLength({ min: 4, max: 32 }),
  body("preferredAt").optional({ nullable: true }).isString().isLength({ max: 80 }),
  body("comment").optional({ nullable: true }).isString().isLength({ max: 500 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const listing = await prisma.listing.findUnique({
      where: { id: req.body.listingId },
      select: { id: true, userId: true, title: true, district: true, status: true },
    });
    if (!listing || listing.status !== "ACTIVE") {
      return res.status(404).json({ error: "Объявление не найдено" });
    }
    if (req.user?.id && req.user.id === listing.userId) {
      return res.status(400).json({ error: "Нельзя оставить заявку на собственное объявление" });
    }

    const created = await prisma.callbackRequest.create({
      data: {
        listingId: listing.id,
        ownerId: listing.userId,
        requesterId: req.user?.id || null,
        name: String(req.body.name).trim(),
        phone: String(req.body.phone).trim(),
        preferredAt: req.body.preferredAt ? String(req.body.preferredAt).trim() : null,
        comment: req.body.comment ? String(req.body.comment).trim() : null,
      },
    });

    notifyUser(listing.userId, {
      title: `Заявка на звонок: ${listing.title}`,
      body: `${created.name} · ${created.phone}${created.preferredAt ? ` · ${created.preferredAt}` : ""}`,
      data: { type: "callback", callbackId: created.id, listingId: listing.id },
    }).catch(() => {});

    res.status(201).json({ ok: true, id: created.id });
  }
);

router.get("/", authRequired, async (req, res) => {
  const role = (req.query.role || "owner").toString();
  const status = STATUSES.includes(String(req.query.status || "").toUpperCase())
    ? String(req.query.status).toUpperCase()
    : null;
  const where = {};
  if (role === "mine") {
    where.requesterId = req.user.id;
  } else {
    where.ownerId = req.user.id;
  }
  if (status) where.status = status;

  const items = await prisma.callbackRequest.findMany({
    where,
    include: {
      listing: { select: { id: true, title: true, district: true } },
      requester: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json({ items: items.map(publicCallback) });
});

router.patch(
  "/:id",
  authRequired,
  body("status").isIn(STATUSES),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const cb = await prisma.callbackRequest.findUnique({ where: { id: req.params.id } });
    if (!cb) return res.status(404).json({ error: "Не найдено" });
    if (cb.ownerId !== req.user.id && req.user.role !== "ADMIN") {
      return res.status(403).json({ error: "Нет доступа" });
    }
    const updated = await prisma.callbackRequest.update({
      where: { id: cb.id },
      data: { status: req.body.status },
      include: {
        listing: { select: { id: true, title: true, district: true } },
        requester: { select: { id: true, name: true, email: true } },
      },
    });
    res.json(publicCallback(updated));
  }
);

export default router;
