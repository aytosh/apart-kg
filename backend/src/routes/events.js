import { Router } from "express";
import { body, validationResult } from "express-validator";
import { prisma } from "../prisma.js";
import { authOptional, authRequired, requireAdmin } from "../middleware/auth.js";

const router = Router();

router.post(
  "/",
  authOptional,
  body("type").isString().isLength({ min: 1, max: 64 }),
  body("payload").optional(),
  body("url").optional().isString().isLength({ max: 400 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
      await prisma.analyticsEvent.create({
        data: {
          userId: req.user?.id || null,
          type: req.body.type,
          payload:
            req.body.payload != null
              ? JSON.stringify(req.body.payload).slice(0, 4000)
              : null,
          url: req.body.url ? String(req.body.url).slice(0, 400) : null,
        },
      });
    } catch (err) {
      console.warn("[events] write failed", err?.message);
    }
    res.status(204).send();
  }
);

router.get("/summary", authRequired, requireAdmin, async (_req, res) => {
  const since = new Date(Date.now() - 7 * 86400 * 1000);
  const items = await prisma.analyticsEvent.groupBy({
    by: ["type"],
    where: { createdAt: { gte: since } },
    _count: true,
    orderBy: { _count: { type: "desc" } },
  });
  res.json({
    since,
    items: items.map((i) => ({ type: i.type, count: i._count })),
  });
});

export default router;
