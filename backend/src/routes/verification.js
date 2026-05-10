import { Router } from "express";
import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { prisma } from "../prisma.js";
import { authRequired } from "../middleware/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, "../../uploads");

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `verify_${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype);
    cb(ok ? null : new Error("Только изображения"), ok);
  },
});

const router = Router();

router.get("/me", authRequired, async (req, res) => {
  const last = await prisma.verification.findFirst({
    where: { userId: req.user.id },
    orderBy: { createdAt: "desc" },
  });
  const me = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { verifiedLevel: true, verifiedAt: true },
  });
  res.json({
    user: me,
    request: last
      ? {
          id: last.id,
          status: last.status,
          note: last.note,
          createdAt: last.createdAt,
          decidedAt: last.decidedAt,
        }
      : null,
  });
});

router.post(
  "/start",
  authRequired,
  (req, res, next) => {
    upload.fields([
      { name: "selfie", maxCount: 1 },
      { name: "idDoc", maxCount: 1 },
    ])(req, res, (err) => {
      if (err) return next(err);
      next();
    });
  },
  async (req, res) => {
    const selfie = req.files?.selfie?.[0];
    const idDoc = req.files?.idDoc?.[0];
    if (!selfie || !idDoc) {
      return res.status(400).json({ error: "Нужны селфи и фото документа" });
    }
    const existing = await prisma.verification.findFirst({
      where: { userId: req.user.id, status: "PENDING" },
    });
    if (existing) {
      return res.status(409).json({ error: "Уже есть заявка на проверке", id: existing.id });
    }
    const item = await prisma.verification.create({
      data: {
        userId: req.user.id,
        selfiePath: `/uploads/${selfie.filename}`,
        idDocPath: `/uploads/${idDoc.filename}`,
      },
    });
    res.status(201).json({ id: item.id, status: item.status });
  }
);

export default router;
