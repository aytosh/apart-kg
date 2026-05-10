import { Router } from "express";
import { body, validationResult } from "express-validator";
import { prisma } from "../prisma.js";
import { authRequired } from "../middleware/auth.js";
import { notifyUser } from "../realtime/notify.js";

const router = Router();

const HOLD_HOURS = 48;

function publicReservation(r) {
  return {
    id: r.id,
    listingId: r.listingId,
    listingTitle: r.listing?.title,
    userId: r.userId,
    user: r.user
      ? { id: r.user.id, name: r.user.name, email: r.user.email }
      : undefined,
    status: r.status,
    reservedUntil: r.reservedUntil,
    prepayAmount: r.prepayAmount,
    prepayCurrency: r.prepayCurrency,
    paymentId: r.paymentId,
    notes: r.notes,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

router.get("/mine", authRequired, async (req, res) => {
  const items = await prisma.reservation.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
    include: { listing: { select: { id: true, title: true, complexId: true } } },
  });
  res.json({ items: items.map(publicReservation) });
});

router.post(
  "/listings/:id",
  authRequired,
  body("prepayAmount").optional().isInt({ min: 0 }),
  body("notes").optional().isString().isLength({ max: 500 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const listing = await prisma.listing.findUnique({
      where: { id: req.params.id },
      include: {
        complex: {
          include: {
            developer: { include: { members: true } },
          },
        },
      },
    });
    if (!listing) return res.status(404).json({ error: "Объявление не найдено" });
    if (listing.userId === req.user.id) {
      return res.status(400).json({ error: "Нельзя бронировать собственный юнит" });
    }
    const existing = await prisma.reservation.findFirst({
      where: {
        listingId: listing.id,
        status: { in: ["RESERVED", "CONTRACTED", "PAID"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing && existing.reservedUntil && existing.reservedUntil > new Date()) {
      return res.status(409).json({ error: "Юнит уже забронирован" });
    }

    const reservedUntil = new Date(Date.now() + HOLD_HOURS * 3600 * 1000);
    const prepay = req.body.prepayAmount || 0;

    let payment = null;
    if (prepay > 0) {
      payment = await prisma.payment.create({
        data: {
          userId: req.user.id,
          listingId: listing.id,
          plan: "PREMIUM_LISTING",
          provider: "DEMO",
          amountSom: prepay,
          currency: listing.currency || "KGS",
          description: `Аванс за бронь ${listing.title}`,
          status: "PAID",
          paidAt: new Date(),
          externalRef: `reserve_${listing.id}_${Date.now()}`,
        },
      });
    }

    const r = await prisma.reservation.create({
      data: {
        listingId: listing.id,
        userId: req.user.id,
        status: prepay > 0 ? "PAID" : "RESERVED",
        reservedUntil,
        prepayAmount: prepay || null,
        prepayCurrency: prepay > 0 ? listing.currency || "KGS" : null,
        paymentId: payment?.id || null,
        notes: req.body.notes || null,
      },
      include: {
        listing: { select: { id: true, title: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    notifyUser(listing.userId, {
      kind: "reservation-new",
      title: "Бронь нового юнита",
      body: prepay
        ? `Внесён аванс ${prepay} ${listing.currency || "KGS"} за «${listing.title}».`
        : `Поступила бронь без аванса на «${listing.title}».`,
      url: `/?listing=${listing.id}`,
    }).catch(() => {});

    if (listing.complex?.developer?.members?.length) {
      for (const m of listing.complex.developer.members) {
        if (m.userId === listing.userId) continue;
        notifyUser(m.userId, {
          kind: "reservation-new",
          title: `Бронь в ЖК «${listing.complex.name}»`,
          body: `Юнит «${listing.title}» забронирован.`,
          url: `/?complex=${listing.complex.slug}`,
        }).catch(() => {});
      }
    }

    res.status(201).json(publicReservation(r));
  }
);

router.post("/:id/cancel", authRequired, async (req, res) => {
  const r = await prisma.reservation.findUnique({
    where: { id: req.params.id },
    include: { listing: true },
  });
  if (!r) return res.status(404).json({ error: "Не найдено" });
  if (r.userId !== req.user.id && r.listing?.userId !== req.user.id && req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Нет доступа" });
  }
  const updated = await prisma.reservation.update({
    where: { id: r.id },
    data: { status: "CANCELLED" },
  });
  res.json({ id: updated.id, status: updated.status });
});

router.post("/:id/contract", authRequired, async (req, res) => {
  const r = await prisma.reservation.findUnique({
    where: { id: req.params.id },
    include: { listing: true },
  });
  if (!r) return res.status(404).json({ error: "Не найдено" });
  if (r.listing?.userId !== req.user.id && req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Только владелец юнита" });
  }
  const updated = await prisma.reservation.update({
    where: { id: r.id },
    data: { status: "CONTRACTED" },
  });
  notifyUser(r.userId, {
    kind: "reservation-contracted",
    title: "Бронь переведена в договор",
    body: `Владелец «${r.listing?.title}» подтвердил оформление сделки.`,
    url: `/?listing=${r.listingId}`,
  }).catch(() => {});
  res.json({ id: updated.id, status: updated.status });
});

export default router;
