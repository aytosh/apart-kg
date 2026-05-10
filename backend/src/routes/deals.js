import { Router } from "express";
import { body, validationResult } from "express-validator";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "../prisma.js";
import { authRequired } from "../middleware/auth.js";
import { generateDealPdf } from "../services/contractPdf.js";
import { issueSignatureCode, verifySignatureCode } from "../services/signature.js";
import { notifyUser } from "../realtime/notify.js";
import { ensureFonts } from "../../scripts/fetchFonts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const router = Router();

function publicDeal(d, baseUrl) {
  return {
    id: d.id,
    listingId: d.listingId,
    listingTitle: d.listing?.title,
    landlordId: d.landlordId,
    tenantId: d.tenantId,
    type: d.type,
    status: d.status,
    monthlyAmount: d.monthlyAmount,
    saleAmount: d.saleAmount,
    depositAmount: d.depositAmount,
    currency: d.currency,
    startDate: d.startDate,
    endDate: d.endDate,
    signedLandlordAt: d.signedLandlordAt,
    signedTenantAt: d.signedTenantAt,
    pdfUrl: d.pdfPath ? `${baseUrl}${d.pdfPath}` : null,
    landlord: d.landlord
      ? { id: d.landlord.id, name: d.landlord.name, email: d.landlord.email }
      : undefined,
    tenant: d.tenant
      ? { id: d.tenant.id, name: d.tenant.name, email: d.tenant.email }
      : undefined,
    rentPayments: d.rentPayments?.map((p) => ({
      id: p.id,
      dueDate: p.dueDate,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      paidAt: p.paidAt,
    })),
    escrow: d.escrow
      ? {
          id: d.escrow.id,
          amount: d.escrow.amount,
          currency: d.escrow.currency,
          status: d.escrow.status,
          heldUntil: d.escrow.heldUntil,
          releasedAt: d.escrow.releasedAt,
        }
      : null,
    createdAt: d.createdAt,
  };
}

const fullInclude = {
  listing: { select: { id: true, title: true, district: true, userId: true } },
  landlord: { select: { id: true, name: true, email: true, phone: true } },
  tenant: { select: { id: true, name: true, email: true, phone: true } },
  rentPayments: { orderBy: { dueDate: "asc" } },
  escrow: true,
};

router.get("/mine", authRequired, async (req, res) => {
  const items = await prisma.deal.findMany({
    where: { OR: [{ landlordId: req.user.id }, { tenantId: req.user.id }] },
    orderBy: { createdAt: "desc" },
    include: fullInclude,
  });
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  res.json({ items: items.map((d) => publicDeal(d, baseUrl)) });
});

router.get("/:id", authRequired, async (req, res) => {
  const d = await prisma.deal.findUnique({
    where: { id: req.params.id },
    include: fullInclude,
  });
  if (!d) return res.status(404).json({ error: "Не найдено" });
  if (d.landlordId !== req.user.id && d.tenantId !== req.user.id && req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Нет доступа" });
  }
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  res.json(publicDeal(d, baseUrl));
});

router.post(
  "/",
  authRequired,
  body("listingId").isString().notEmpty(),
  body("type").isIn(["RENT", "SALE"]),
  body("monthlyAmount").optional().isInt({ min: 0 }),
  body("saleAmount").optional().isInt({ min: 0 }),
  body("depositAmount").optional().isInt({ min: 0 }),
  body("startDate").optional().isISO8601(),
  body("endDate").optional().isISO8601(),
  body("currency").optional().isString(),
  body("terms").optional().isObject(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const listing = await prisma.listing.findUnique({
      where: { id: req.body.listingId },
    });
    if (!listing) return res.status(404).json({ error: "Объявление не найдено" });
    if (listing.userId === req.user.id) {
      return res.status(400).json({ error: "Нельзя оформить сделку с собой" });
    }

    const deal = await prisma.deal.create({
      data: {
        listingId: listing.id,
        landlordId: listing.userId,
        tenantId: req.user.id,
        type: req.body.type,
        status: "PENDING_LANDLORD",
        monthlyAmount: req.body.monthlyAmount || null,
        saleAmount: req.body.saleAmount || null,
        depositAmount: req.body.depositAmount || 0,
        currency: req.body.currency || "KGS",
        startDate: req.body.startDate ? new Date(req.body.startDate) : null,
        endDate: req.body.endDate ? new Date(req.body.endDate) : null,
        termsJson: req.body.terms ? JSON.stringify(req.body.terms) : null,
      },
      include: fullInclude,
    });

    if (deal.type === "RENT" && deal.monthlyAmount && deal.startDate && deal.endDate) {
      const months = Math.max(
        1,
        Math.round(
          (new Date(deal.endDate) - new Date(deal.startDate)) / (1000 * 60 * 60 * 24 * 30)
        )
      );
      const start = new Date(deal.startDate);
      const records = [];
      for (let i = 0; i < months; i++) {
        const due = new Date(start);
        due.setMonth(due.getMonth() + i);
        records.push({
          dealId: deal.id,
          dueDate: due,
          amount: deal.monthlyAmount,
          currency: deal.currency,
        });
      }
      if (records.length) {
        await prisma.rentPayment.createMany({ data: records });
      }
    }

    notifyUser(deal.landlordId, {
      kind: "deal-created",
      title: "Запрос на сделку",
      body: `Арендатор предложил оформить через Apart.kg`,
      url: `/?deal=${deal.id}`,
    }).catch(() => {});

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const fresh = await prisma.deal.findUnique({
      where: { id: deal.id },
      include: fullInclude,
    });
    res.status(201).json(publicDeal(fresh, baseUrl));
  }
);

router.post(
  "/:id/sign/request",
  authRequired,
  async (req, res) => {
    const d = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!d) return res.status(404).json({ error: "Не найдено" });
    if (d.landlordId !== req.user.id && d.tenantId !== req.user.id) {
      return res.status(403).json({ error: "Нет доступа" });
    }
    const u = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { email: true, phone: true },
    });
    const channel = u.phone ? "PHONE" : "EMAIL";
    const target = u.phone || u.email;
    await issueSignatureCode({
      userId: req.user.id,
      channel,
      target,
      context: `deal:${d.id}`,
    });
    res.json({ ok: true, channel, target: maskTarget(target, channel) });
  }
);

function maskTarget(value, channel) {
  if (!value) return "";
  if (channel === "PHONE") return value.replace(/(\d{3})\d{3,}(\d{2})/, "$1***$2");
  if (channel === "EMAIL") {
    const [a, b] = value.split("@");
    if (!b) return value;
    return `${a.slice(0, 2)}***@${b}`;
  }
  return value;
}

router.post(
  "/:id/sign",
  authRequired,
  body("code").isString().isLength({ min: 4, max: 8 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const d = await prisma.deal.findUnique({
      where: { id: req.params.id },
      include: fullInclude,
    });
    if (!d) return res.status(404).json({ error: "Не найдено" });
    const isLandlord = d.landlordId === req.user.id;
    const isTenant = d.tenantId === req.user.id;
    if (!isLandlord && !isTenant) return res.status(403).json({ error: "Нет доступа" });

    const ok = await verifySignatureCode({
      userId: req.user.id,
      context: `deal:${d.id}`,
      code: req.body.code,
    });
    if (!ok) return res.status(400).json({ error: "Неверный или просроченный код" });

    const data = {};
    if (isLandlord) data.signedLandlordAt = new Date();
    if (isTenant) data.signedTenantAt = new Date();
    let nextStatus = d.status;
    const updated = await prisma.deal.update({
      where: { id: d.id },
      data,
      include: fullInclude,
    });
    if (updated.signedLandlordAt && updated.signedTenantAt) {
      nextStatus = "SIGNED";
    } else if (updated.signedLandlordAt) {
      nextStatus = "PENDING_TENANT";
    } else if (updated.signedTenantAt) {
      nextStatus = "PENDING_LANDLORD";
    }
    if (nextStatus !== updated.status) {
      await prisma.deal.update({ where: { id: d.id }, data: { status: nextStatus } });
    }

    if (nextStatus === "SIGNED") {
      try {
        await ensureFonts();
        const refreshed = await prisma.deal.findUnique({
          where: { id: d.id },
          include: fullInclude,
        });
        const pdfPath = await generateDealPdf(refreshed);
        await prisma.deal.update({ where: { id: d.id }, data: { pdfPath } });
      } catch (err) {
        console.error("[deal] pdf generation failed", err?.message);
      }
      const peerId = isLandlord ? d.tenantId : d.landlordId;
      notifyUser(peerId, {
        kind: "deal-signed",
        title: "Сделка подписана",
        body: "Стороны подтвердили условия. Договор готов к скачиванию.",
        url: `/?deal=${d.id}`,
      }).catch(() => {});
    } else {
      const peerId = isLandlord ? d.tenantId : d.landlordId;
      notifyUser(peerId, {
        kind: "deal-progress",
        title: "Сделка: подпись стороны",
        body: "Одна из сторон подписала договор кодом. Очередь за вами.",
        url: `/?deal=${d.id}`,
      }).catch(() => {});
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const fresh = await prisma.deal.findUnique({ where: { id: d.id }, include: fullInclude });
    res.json(publicDeal(fresh, baseUrl));
  }
);

router.post(
  "/:id/escrow/hold",
  authRequired,
  async (req, res) => {
    const d = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!d) return res.status(404).json({ error: "Не найдено" });
    if (d.tenantId !== req.user.id) {
      return res.status(403).json({ error: "Только арендатор может вносить депозит" });
    }
    if (!d.depositAmount) return res.status(400).json({ error: "Депозит не указан" });
    const existing = await prisma.escrow.findUnique({ where: { dealId: d.id } });
    if (existing) return res.json({ id: existing.id, status: existing.status, demo: true });

    const payment = await prisma.payment.create({
      data: {
        userId: d.tenantId,
        listingId: d.listingId,
        plan: "PREMIUM_LISTING",
        provider: "DEMO",
        amountSom: d.depositAmount,
        currency: d.currency,
        description: `Эскроу-депозит по сделке ${d.id}`,
        status: "PAID",
        paidAt: new Date(),
        externalRef: `escrow_${d.id}`,
      },
    });
    const escrow = await prisma.escrow.create({
      data: {
        dealId: d.id,
        amount: d.depositAmount,
        currency: d.currency,
        paymentId: payment.id,
      },
    });
    notifyUser(d.landlordId, {
      kind: "escrow-held",
      title: "Депозит на эскроу",
      body: `Арендатор внёс ${d.depositAmount} ${d.currency} на эскроу.`,
      url: `/?deal=${d.id}`,
    }).catch(() => {});
    res.status(201).json({ id: escrow.id, status: escrow.status, demo: true });
  }
);

router.post(
  "/:id/escrow/release",
  authRequired,
  async (req, res) => {
    const d = await prisma.deal.findUnique({ where: { id: req.params.id }, include: { escrow: true } });
    if (!d || !d.escrow) return res.status(404).json({ error: "Эскроу не найдено" });
    if (d.tenantId !== req.user.id && req.user.role !== "ADMIN") {
      return res.status(403).json({ error: "Только арендатор может разблокировать" });
    }
    const updated = await prisma.escrow.update({
      where: { id: d.escrow.id },
      data: { status: "RELEASED", releasedAt: new Date() },
    });
    notifyUser(d.landlordId, {
      kind: "escrow-released",
      title: "Депозит разблокирован",
      body: `Арендатор подтвердил заселение. Деньги ушли на ваш счёт.`,
      url: `/?deal=${d.id}`,
    }).catch(() => {});
    res.json({ id: updated.id, status: updated.status });
  }
);

router.post(
  "/:id/dispute",
  authRequired,
  async (req, res) => {
    const d = await prisma.deal.findUnique({ where: { id: req.params.id }, include: { escrow: true } });
    if (!d) return res.status(404).json({ error: "Не найдено" });
    if (d.landlordId !== req.user.id && d.tenantId !== req.user.id) {
      return res.status(403).json({ error: "Нет доступа" });
    }
    await prisma.deal.update({ where: { id: d.id }, data: { status: "DISPUTED" } });
    if (d.escrow) {
      await prisma.escrow.update({
        where: { id: d.escrow.id },
        data: { status: "DISPUTED" },
      });
    }
    res.json({ ok: true });
  }
);

router.post(
  "/:id/payments/:paymentId/pay",
  authRequired,
  async (req, res) => {
    const rp = await prisma.rentPayment.findUnique({
      where: { id: req.params.paymentId },
      include: { deal: true },
    });
    if (!rp || rp.dealId !== req.params.id) return res.status(404).json({ error: "Не найдено" });
    if (rp.deal.tenantId !== req.user.id) {
      return res.status(403).json({ error: "Только арендатор" });
    }
    if (rp.status === "PAID") return res.json({ id: rp.id, status: rp.status });
    const pay = await prisma.payment.create({
      data: {
        userId: rp.deal.tenantId,
        listingId: rp.deal.listingId,
        plan: "PREMIUM_LISTING",
        provider: "DEMO",
        amountSom: rp.amount,
        currency: rp.currency,
        description: `Аренда ${new Date(rp.dueDate).toLocaleDateString("ru-RU")} по сделке ${rp.dealId}`,
        status: "PAID",
        paidAt: new Date(),
        externalRef: `rent_${rp.id}`,
      },
    });
    const updated = await prisma.rentPayment.update({
      where: { id: rp.id },
      data: { status: "PAID", paidAt: new Date(), paymentId: pay.id },
    });
    notifyUser(rp.deal.landlordId, {
      kind: "rent-paid",
      title: "Получен арендный платёж",
      body: `${rp.amount} ${rp.currency}`,
      url: `/?deal=${rp.dealId}`,
    }).catch(() => {});
    res.json({ id: updated.id, status: updated.status });
  }
);

router.post(
  "/:id/cancel",
  authRequired,
  async (req, res) => {
    const d = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!d) return res.status(404).json({ error: "Не найдено" });
    if (d.landlordId !== req.user.id && d.tenantId !== req.user.id) {
      return res.status(403).json({ error: "Нет доступа" });
    }
    if (["SIGNED", "ACTIVE", "COMPLETED"].includes(d.status)) {
      return res.status(400).json({ error: "Нельзя отменить подписанный договор" });
    }
    await prisma.deal.update({ where: { id: d.id }, data: { status: "CANCELLED" } });
    res.json({ ok: true });
  }
);

export default router;
