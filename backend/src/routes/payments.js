import { Router } from "express";
import { body, validationResult } from "express-validator";
import { prisma } from "../prisma.js";
import { authOptional, authRequired } from "../middleware/auth.js";

const router = Router();

const planCatalog = {
  BOOST: { title: "Поднять в ТОП (7 дней)", amountSom: 790 },
  AGENT_SUBSCRIPTION: { title: "Подписка агента (30 дней)", amountSom: 4990 },
  PREMIUM_LISTING: { title: "Премиум-объявление (14 дней)", amountSom: 1490 },
};

router.get("/plans", authOptional, async (_req, res) => {
  res.json({
    providers: [
      { code: "MBANK", name: "MBank", enabled: false },
      { code: "ELSOM", name: "Элсом", enabled: false },
      { code: "O_DENGI", name: "О!Деньги", enabled: false },
      { code: "DEMO", name: "Demo Sandbox", enabled: true },
    ],
    plans: Object.entries(planCatalog).map(([code, cfg]) => ({ code, ...cfg })),
    note:
      "Пока включен demo-провайдер. Для боевого запуска подключите платежный шлюз и webhook.",
  });
});

router.get("/mine", authRequired, async (req, res) => {
  const rows = await prisma.payment.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json({ items: rows });
});

router.post(
  "/create",
  authRequired,
  body("plan").isIn(Object.keys(planCatalog)),
  body("provider").optional().isIn(["MBANK", "ELSOM", "O_DENGI", "DEMO"]),
  body("listingId").optional().isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const plan = req.body.plan;
    const provider = req.body.provider || "DEMO";
    const cfg = planCatalog[plan];

    const payment = await prisma.payment.create({
      data: {
        userId: req.user.id,
        listingId: req.body.listingId || null,
        plan,
        provider,
        amountSom: cfg.amountSom,
        description: cfg.title,
        status: "PENDING",
        metadata: JSON.stringify({ source: "web", at: new Date().toISOString() }),
      },
    });

    const checkoutUrl =
      provider === "DEMO"
        ? `/api/payments/demo-pay/${payment.id}`
        : "https://example-gateway.local/checkout";

    res.status(201).json({
      id: payment.id,
      status: payment.status,
      amountSom: payment.amountSom,
      checkoutUrl,
      message:
        provider === "DEMO"
          ? "Демо-платеж создан. Используйте demo-pay для имитации успешной оплаты."
          : "Инициализация успешна. Подключите реальный gateway URL.",
    });
  }
);

router.post("/demo-pay/:id", authRequired, async (req, res) => {
  const row = await prisma.payment.findUnique({ where: { id: req.params.id } });
  if (!row || row.userId !== req.user.id) return res.status(404).json({ error: "Платеж не найден" });
  const updated = await prisma.payment.update({
    where: { id: row.id },
    data: { status: "PAID", paidAt: new Date(), externalRef: `demo_${Date.now()}` },
  });
  res.json({ id: updated.id, status: updated.status, paidAt: updated.paidAt });
});

export default router;
