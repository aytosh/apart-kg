import { Router } from "express";
import { body, validationResult } from "express-validator";
import { randomUUID } from "crypto";
import { prisma } from "../prisma.js";
import { authRequired } from "../middleware/auth.js";
import { notifyUser } from "../realtime/notify.js";

const router = Router();

function publicView(v) {
  return {
    id: v.id,
    listingId: v.listingId,
    listingTitle: v.listing?.title,
    requesterId: v.requesterId,
    ownerId: v.ownerId,
    status: v.status,
    slot: v.slot,
    roomId: v.roomId,
    message: v.message,
    ownerNote: v.ownerNote,
    createdAt: v.createdAt,
    requester: v.requester
      ? { id: v.requester.id, name: v.requester.name, email: v.requester.email }
      : undefined,
    owner: v.owner ? { id: v.owner.id, name: v.owner.name, email: v.owner.email } : undefined,
  };
}

router.get("/mine", authRequired, async (req, res) => {
  const items = await prisma.viewingRequest.findMany({
    where: {
      OR: [{ requesterId: req.user.id }, { ownerId: req.user.id }],
    },
    include: {
      listing: { select: { id: true, title: true } },
      requester: { select: { id: true, name: true, email: true } },
      owner: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json({ items: items.map(publicView) });
});

router.post(
  "/listing/:listingId",
  authRequired,
  body("slot").optional().isISO8601(),
  body("message").optional().isString().isLength({ max: 500 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const listing = await prisma.listing.findUnique({
      where: { id: req.params.listingId },
    });
    if (!listing || listing.status !== "ACTIVE") {
      return res.status(404).json({ error: "Объявление не найдено" });
    }
    if (listing.userId === req.user.id) {
      return res.status(400).json({ error: "Нельзя запросить просмотр собственного объявления" });
    }
    const created = await prisma.viewingRequest.create({
      data: {
        listingId: listing.id,
        requesterId: req.user.id,
        ownerId: listing.userId,
        slot: req.body.slot ? new Date(req.body.slot) : null,
        message: req.body.message || null,
        roomId: randomUUID(),
      },
      include: {
        listing: { select: { id: true, title: true } },
        requester: { select: { id: true, name: true, email: true } },
        owner: { select: { id: true, name: true, email: true } },
      },
    });
    notifyUser(listing.userId, {
      kind: "viewing-request",
      title: "Запрос онлайн-показа",
      body: `${created.requester.name || created.requester.email} хочет посмотреть «${listing.title}»`,
      url: `/?viewings=${created.id}`,
    }).catch(() => {});
    res.status(201).json(publicView(created));
  }
);

async function transition(req, res, expected, nextStatus, kind) {
  const v = await prisma.viewingRequest.findUnique({
    where: { id: req.params.id },
    include: {
      listing: { select: { id: true, title: true } },
      requester: { select: { id: true, name: true, email: true } },
      owner: { select: { id: true, name: true, email: true } },
    },
  });
  if (!v) return res.status(404).json({ error: "Не найдено" });
  if (req.user.id !== v.ownerId && req.user.id !== v.requesterId) {
    return res.status(403).json({ error: "Нет доступа" });
  }
  if (expected.who === "owner" && req.user.id !== v.ownerId) {
    return res.status(403).json({ error: "Только владелец может это сделать" });
  }
  if (expected.statuses && !expected.statuses.includes(v.status)) {
    return res.status(400).json({ error: `Нельзя перевести из ${v.status}` });
  }
  const data = { status: nextStatus };
  if (req.body?.note) data.ownerNote = req.body.note;
  const updated = await prisma.viewingRequest.update({
    where: { id: v.id },
    data,
    include: {
      listing: { select: { id: true, title: true } },
      requester: { select: { id: true, name: true, email: true } },
      owner: { select: { id: true, name: true, email: true } },
    },
  });
  const target = req.user.id === v.ownerId ? v.requesterId : v.ownerId;
  notifyUser(target, {
    kind,
    title: `Онлайн-показ: ${nextStatus}`,
    body: v.listing?.title || "",
    viewingId: v.id,
    roomId: v.roomId,
    url: `/?viewings=${v.id}`,
  }).catch(() => {});
  res.json(publicView(updated));
}

router.post("/:id/accept", authRequired, (req, res) =>
  transition(req, res, { who: "owner", statuses: ["PENDING"] }, "CONFIRMED", "viewing-accepted")
);
router.post("/:id/decline", authRequired, (req, res) =>
  transition(
    req,
    res,
    { who: "owner", statuses: ["PENDING", "CONFIRMED"] },
    "DECLINED",
    "viewing-declined"
  )
);
router.post("/:id/start", authRequired, (req, res) =>
  transition(
    req,
    res,
    { statuses: ["CONFIRMED", "PENDING"] },
    "STARTED",
    "viewing-started"
  )
);
router.post("/:id/end", authRequired, (req, res) =>
  transition(req, res, { statuses: ["STARTED", "CONFIRMED"] }, "ENDED", "viewing-ended")
);
router.post("/:id/cancel", authRequired, (req, res) =>
  transition(
    req,
    res,
    { statuses: ["PENDING", "CONFIRMED", "STARTED"] },
    "CANCELLED",
    "viewing-cancelled"
  )
);

export default router;
