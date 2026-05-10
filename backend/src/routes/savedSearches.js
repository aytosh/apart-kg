import { Router } from "express";
import { body, validationResult } from "express-validator";
import { prisma } from "../prisma.js";
import { authRequired } from "../middleware/auth.js";

const router = Router();

const ALLOWED_FILTERS = [
  "deal",
  "type",
  "search",
  "installment",
  "exchange",
  "urgent",
  "minPrice",
  "maxPrice",
  "rooms",
  "district",
];

function sanitizeFilters(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  for (const key of ALLOWED_FILTERS) {
    if (input[key] === undefined || input[key] === null || input[key] === "") continue;
    out[key] = String(input[key]).slice(0, 200);
  }
  return out;
}

router.get("/", authRequired, async (req, res) => {
  const items = await prisma.savedSearch.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
  });
  res.json({
    items: items.map((s) => ({
      id: s.id,
      name: s.name,
      filters: JSON.parse(s.filtersJson || "{}"),
      notify: s.notify,
      lastNotifiedAt: s.lastNotifiedAt,
      createdAt: s.createdAt,
    })),
  });
});

router.post(
  "/",
  authRequired,
  body("name").trim().isLength({ min: 1, max: 80 }),
  body("filters").isObject(),
  body("notify").optional().isBoolean(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const filters = sanitizeFilters(req.body.filters);
    const item = await prisma.savedSearch.create({
      data: {
        userId: req.user.id,
        name: req.body.name,
        filtersJson: JSON.stringify(filters),
        notify: req.body.notify === undefined ? true : !!req.body.notify,
        lastNotifiedAt: new Date(),
      },
    });
    res.status(201).json({
      id: item.id,
      name: item.name,
      filters,
      notify: item.notify,
      lastNotifiedAt: item.lastNotifiedAt,
    });
  }
);

router.patch(
  "/:id",
  authRequired,
  body("name").optional().trim().isLength({ min: 1, max: 80 }),
  body("notify").optional().isBoolean(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const existing = await prisma.savedSearch.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.userId !== req.user.id) {
      return res.status(404).json({ error: "Не найдено" });
    }
    const data = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.notify !== undefined) data.notify = !!req.body.notify;
    const updated = await prisma.savedSearch.update({ where: { id: existing.id }, data });
    res.json({
      id: updated.id,
      name: updated.name,
      filters: JSON.parse(updated.filtersJson || "{}"),
      notify: updated.notify,
      lastNotifiedAt: updated.lastNotifiedAt,
    });
  }
);

router.delete("/:id", authRequired, async (req, res) => {
  const existing = await prisma.savedSearch.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.userId !== req.user.id) {
    return res.status(404).json({ error: "Не найдено" });
  }
  await prisma.savedSearch.delete({ where: { id: existing.id } });
  res.status(204).send();
});

export default router;
