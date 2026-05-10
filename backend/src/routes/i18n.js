import { Router } from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { authRequired } from "../middleware/auth.js";
import { translateAll, hasProvider } from "../services/translate.js";
import { prisma } from "../prisma.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dictDir = path.join(__dirname, "../i18n");

const SUPPORTED = ["ru", "kg", "en", "zh"];

const cache = {};

function loadDict(lang) {
  if (cache[lang]) return cache[lang];
  const file = path.join(dictDir, `${lang}.json`);
  if (!fs.existsSync(file)) return null;
  cache[lang] = JSON.parse(fs.readFileSync(file, "utf8"));
  return cache[lang];
}

const router = Router();

router.get("/", (_req, res) => {
  res.json({
    languages: SUPPORTED.map((lang) => {
      const d = loadDict(lang);
      return { code: lang, name: d?.name || lang };
    }),
    autoTranslate: hasProvider(),
  });
});

router.get("/:lang", (req, res) => {
  const lang = String(req.params.lang).toLowerCase();
  if (!SUPPORTED.includes(lang)) return res.status(404).json({ error: "Не поддерживается" });
  res.json(loadDict(lang) || {});
});

router.post(
  "/listings/:id/retranslate",
  authRequired,
  async (req, res) => {
    const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
    if (!listing) return res.status(404).json({ error: "Не найдено" });
    if (listing.userId !== req.user.id && req.user.role !== "ADMIN") {
      return res.status(403).json({ error: "Нет доступа" });
    }
    const titleI18n = await translateAll(listing.title);
    const descriptionI18n = listing.description ? await translateAll(listing.description) : null;
    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        titleI18n: JSON.stringify(titleI18n),
        descriptionI18n: descriptionI18n ? JSON.stringify(descriptionI18n) : null,
      },
    });
    res.json({ ok: true, autoProvider: hasProvider(), titleI18n, descriptionI18n });
  }
);

export default router;
