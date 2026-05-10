import { Router } from "express";
import { body, validationResult } from "express-validator";
import { prisma } from "../prisma.js";
import { authRequired } from "../middleware/auth.js";
import { getVapidPublicKey } from "../realtime/push.js";

const router = Router();

router.get("/public-key", (_req, res) => {
  res.json({ publicKey: getVapidPublicKey() });
});

router.post(
  "/subscribe",
  authRequired,
  body("endpoint").isString().notEmpty(),
  body("keys.p256dh").isString().notEmpty(),
  body("keys.auth").isString().notEmpty(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { endpoint, keys } = req.body;
    const userAgent = req.headers["user-agent"] || null;
    const sub = await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId: req.user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent,
      },
      update: {
        userId: req.user.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent,
      },
    });
    res.status(201).json({ id: sub.id, ok: true });
  }
);

router.post(
  "/unsubscribe",
  authRequired,
  body("endpoint").isString().notEmpty(),
  async (req, res) => {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: req.body.endpoint, userId: req.user.id },
    });
    res.json({ ok: true });
  }
);

export default router;
