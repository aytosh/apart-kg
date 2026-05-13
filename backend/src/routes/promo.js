import { Router } from "express";
import { body, validationResult } from "express-validator";
import { prisma } from "../prisma.js";
import { authOptional, authRequired } from "../middleware/auth.js";

const router = Router();

const TIERS = {
  TOP: {
    code: "TOP",
    title: "TOP",
    days: 7,
    amountSom: 490,
    priority: 100,
    field: "topUntil",
    plan: "BOOST",
    perks: [
      "Карточка отмечена бейджем «TOP»",
      "Поднимается выше обычных в ленте 7 дней",
      "Подходит для срочных продаж/аренды",
    ],
  },
  VIP: {
    code: "VIP",
    title: "VIP",
    days: 14,
    amountSom: 1490,
    priority: 200,
    field: "vipUntil",
    plan: "PREMIUM_LISTING",
    perks: [
      "Бейдж «VIP» и приоритет в ленте 14 дней",
      "Подсветка карточки и крупный заголовок в карусели",
      "Включает все возможности TOP",
    ],
  },
  PREMIUM: {
    code: "PREMIUM",
    title: "Премиум",
    days: 30,
    amountSom: 3490,
    priority: 300,
    field: "premiumUntil",
    plan: "PREMIUM_LISTING",
    perks: [
      "Бейдж «Премиум» и максимальный приоритет 30 дней",
      "Закрепление в верхней части ленты раздела",
      "Усиленный показ в каруселях «Топ» и в выдаче по фильтрам",
    ],
  },
};

function calculatePriority(listing, now = new Date()) {
  let score = 0;
  if (listing.premiumUntil && new Date(listing.premiumUntil) > now) score += TIERS.PREMIUM.priority;
  if (listing.vipUntil && new Date(listing.vipUntil) > now) score += TIERS.VIP.priority;
  if (listing.topUntil && new Date(listing.topUntil) > now) score += TIERS.TOP.priority;
  if (listing.urgent) score += 25;
  return score;
}

router.get("/tiers", authOptional, (_req, res) => {
  res.json({
    items: Object.values(TIERS).map((t) => ({
      code: t.code,
      title: t.title,
      days: t.days,
      amountSom: t.amountSom,
      perks: t.perks,
    })),
    note: "Сейчас активация работает в demo-режиме (без оплаты). Подключите платёжный шлюз для боевого запуска.",
  });
});

router.post(
  "/activate",
  authRequired,
  body("listingId").isString().isLength({ min: 1, max: 64 }),
  body("tier").isIn(Object.keys(TIERS)),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const tier = TIERS[req.body.tier];
    const listing = await prisma.listing.findUnique({
      where: { id: req.body.listingId },
      select: {
        id: true,
        userId: true,
        vipUntil: true,
        topUntil: true,
        premiumUntil: true,
        urgent: true,
      },
    });
    if (!listing) return res.status(404).json({ error: "Объявление не найдено" });
    if (listing.userId !== req.user.id && req.user.role !== "ADMIN") {
      return res.status(403).json({ error: "Нет доступа" });
    }

    const now = new Date();
    const current = listing[tier.field] && new Date(listing[tier.field]) > now
      ? new Date(listing[tier.field])
      : now;
    const until = new Date(current.getTime() + tier.days * 24 * 60 * 60 * 1000);

    const updatedDraft = { ...listing, [tier.field]: until };
    const newPriority = calculatePriority(updatedDraft, now);

    const updated = await prisma.listing.update({
      where: { id: listing.id },
      data: {
        [tier.field]: until,
        priorityScore: newPriority,
      },
      select: {
        id: true,
        vipUntil: true,
        topUntil: true,
        premiumUntil: true,
        priorityScore: true,
      },
    });

    await prisma.payment.create({
      data: {
        userId: req.user.id,
        listingId: listing.id,
        plan: tier.plan,
        provider: "DEMO",
        amountSom: tier.amountSom,
        description: `Активация ${tier.title} на ${tier.days} дн.`,
        status: "PAID",
        paidAt: new Date(),
        externalRef: `promo_${tier.code.toLowerCase()}_${Date.now()}`,
        metadata: JSON.stringify({ tier: tier.code, days: tier.days }),
      },
    });

    res.json({ ok: true, listing: updated });
  }
);

export default router;
