import { Router } from "express";
import { body, validationResult } from "express-validator";
import { prisma } from "../prisma.js";
import { authRequired } from "../middleware/auth.js";

const router = Router();

router.get("/threads", authRequired, async (req, res) => {
  const userId = req.user.id;
  const messages = await prisma.message.findMany({
    where: { OR: [{ senderId: userId }, { recipientId: userId }] },
    include: {
      listing: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const seen = new Set();
  const threads = [];
  for (const m of messages) {
    if (seen.has(m.listingId)) continue;
    seen.add(m.listingId);
    const unread = await prisma.message.count({
      where: { listingId: m.listingId, recipientId: userId, read: false },
    });
    threads.push({
      listingId: m.listing.id,
      title: m.listing.title,
      lastMessage: m.body,
      lastAt: m.createdAt,
      unread,
    });
  }

  res.json({ threads });
});

router.get("/listing/:listingId", authRequired, async (req, res) => {
  const listing = await prisma.listing.findUnique({ where: { id: req.params.listingId } });
  if (!listing) return res.status(404).json({ error: "Не найдено" });

  const userId = req.user.id;
  if (listing.userId !== userId && listing.status !== "ACTIVE") {
    return res.status(404).json({ error: "Не найдено" });
  }

  const messages = await prisma.message.findMany({
    where: { listingId: listing.id },
    include: {
      sender: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  await prisma.message.updateMany({
    where: { listingId: listing.id, recipientId: userId, read: false },
    data: { read: true },
  });

  res.json({
    listingId: listing.id,
    ownerId: listing.userId,
    messages: messages.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt,
      senderId: m.senderId,
      senderName: m.sender.name,
      mine: m.senderId === userId,
    })),
  });
});

router.post(
  "/",
  authRequired,
  body("listingId").notEmpty(),
  body("body").trim().isLength({ min: 1, max: 4000 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const listing = await prisma.listing.findUnique({ where: { id: req.body.listingId } });
    if (!listing || listing.status !== "ACTIVE") {
      return res.status(404).json({ error: "Объявление не найдено" });
    }

    const senderId = req.user.id;
    const recipientId = listing.userId;
    if (senderId === recipientId) {
      return res.status(400).json({ error: "Нельзя отправить сообщение самому себе" });
    }

    const msg = await prisma.message.create({
      data: {
        listingId: listing.id,
        senderId,
        recipientId,
        body: req.body.body,
      },
      include: { sender: { select: { id: true, name: true } } },
    });

    res.status(201).json({
      id: msg.id,
      body: msg.body,
      createdAt: msg.createdAt,
      senderId: msg.senderId,
      senderName: msg.sender.name,
      mine: true,
    });
  }
);

export default router;
