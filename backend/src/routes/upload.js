import { Router } from "express";
import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { authRequired } from "../middleware/auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const router = Router();

const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, "../../uploads");

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `${randomUUID()}${ext}`);
  },
});

const imageOnly = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|webp|gif)$/i.test(file.mimetype);
    cb(ok ? null : new Error("Только изображения"), ok);
  },
});

const videoOnly = multer({
  storage,
  limits: { fileSize: 80 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /^video\/(mp4|webm|quicktime|x-matroska)$/i.test(file.mimetype);
    cb(ok ? null : new Error("Только видео"), ok);
  },
});

router.post("/", authRequired, (req, res, next) => {
  imageOnly.array("files", 12)(req, res, (err) => {
    if (err) return next(err);
    const paths = (req.files || []).map((f) => `/uploads/${f.filename}`);
    res.json({ paths });
  });
});

router.post("/video", authRequired, (req, res, next) => {
  videoOnly.single("file")(req, res, (err) => {
    if (err) return next(err);
    if (!req.file) return res.status(400).json({ error: "Файл не загружен" });
    res.json({ path: `/uploads/${req.file.filename}` });
  });
});

export default router;
