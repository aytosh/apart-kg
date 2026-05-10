import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import fs from "fs";
import http from "http";
import { fileURLToPath } from "url";

import authRoutes from "./routes/auth.js";
import listingsRoutes from "./routes/listings.js";
import favoritesRoutes from "./routes/favorites.js";
import messagesRoutes from "./routes/messages.js";
import adminRoutes from "./routes/admin.js";
import uploadRoutes from "./routes/upload.js";
import paymentsRoutes from "./routes/payments.js";
import pushRoutes from "./routes/push.js";
import savedSearchesRoutes from "./routes/savedSearches.js";
import verificationRoutes from "./routes/verification.js";
import reviewsRoutes from "./routes/reviews.js";
import viewingsRoutes from "./routes/viewings.js";
import dealsRoutes from "./routes/deals.js";
import developersRoutes from "./routes/developers.js";
import complexesRoutes from "./routes/complexes.js";
import reservationsRoutes from "./routes/reservations.js";
import roommatesRoutes from "./routes/roommates.js";
import buildingsRoutes from "./routes/buildings.js";
import i18nRoutes from "./routes/i18n.js";
import qrRoutes from "./routes/qr.js";
import zhRoutes from "./routes/zh.js";
import eventsRoutes from "./routes/events.js";
import { getFeatureFlags } from "./services/featureFlags.js";

import { initWebSocket } from "./realtime/ws.js";
import { initWebPush, getVapidPublicKey } from "./realtime/push.js";
import { startSavedSearchJob } from "./jobs/savedSearches.js";
import { startRentReminderJob } from "./jobs/rentReminders.js";
import { ensureFonts } from "../scripts/fetchFonts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const uploadDir = process.env.UPLOAD_DIR || path.join(root, "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const app = express();
const port = Number(process.env.PORT) || 3000;
const clientOrigin =
  process.env.CLIENT_ORIGIN ||
  "http://localhost:3000,http://127.0.0.1:3000,http://127.0.0.1:5500,http://localhost:5500";

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "img-src": ["'self'", "data:", "blob:", "https:"],
        "media-src": ["'self'", "blob:", "data:", "https:"],
        "style-src": ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
        "style-src-elem": ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
        "script-src": [
          "'self'",
          "'unsafe-inline'",
          "https://unpkg.com",
          "https://cdn.jsdelivr.net",
          "https://accounts.google.com",
          "https://www.gstatic.com",
        ],
        "script-src-elem": [
          "'self'",
          "'unsafe-inline'",
          "https://unpkg.com",
          "https://cdn.jsdelivr.net",
          "https://accounts.google.com",
          "https://www.gstatic.com",
        ],
        "connect-src": [
          "'self'",
          "ws:",
          "wss:",
          "https://www.google.com",
          "https://www.gstatic.com",
          "https://accounts.google.com",
          "stun:",
          "stuns:",
        ],
        "frame-src": ["'self'", "https://accounts.google.com"],
      },
    },
  })
);
app.use(
  cors({
    origin: clientOrigin.split(",").map((s) => s.trim()),
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));

app.use("/uploads", express.static(uploadDir));

const seoDir = path.join(root, "public", "seo");
if (fs.existsSync(seoDir)) {
  app.use("/seo", express.static(seoDir));
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "apart-kg-api" });
});

app.get("/api/config", (_req, res) => {
  res.json({
    recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY || "",
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    vapidPublicKey: getVapidPublicKey(),
    featureFlags: getFeatureFlags(),
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/listings", listingsRoutes);
app.use("/api/favorites", favoritesRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/saved-searches", savedSearchesRoutes);
app.use("/api/verification", verificationRoutes);
app.use("/api/reviews", reviewsRoutes);
app.use("/api/viewings", viewingsRoutes);
app.use("/api/deals", dealsRoutes);
app.use("/api/developers", developersRoutes);
app.use("/api/complexes", complexesRoutes);
app.use("/api/reservations", reservationsRoutes);
app.use("/api/roommates", roommatesRoutes);
app.use("/api/buildings", buildingsRoutes);
app.use("/api/i18n", i18nRoutes);
app.use("/api/qr", qrRoutes);
app.use("/api/zh", zhRoutes);
app.use("/api/events", eventsRoutes);

const frontendDir = path.join(root, "..", "frontend");
const frontendDistDir = path.join(frontendDir, "dist");
if (fs.existsSync(frontendDistDir)) {
  app.use("/dist", express.static(frontendDistDir));
}
if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir));
  app.get("/zh", (_req, res) => {
    res.sendFile(path.join(frontendDir, "zh.html"));
  });
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(frontendDir, "index.html"));
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  if (err.message === "Только изображения") {
    return res.status(400).json({ error: err.message });
  }
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: "Файл слишком большой (макс. 5 МБ)" });
  }
  if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
    return res.status(400).json({ error: "Слишком много файлов (макс. 12)" });
  }
  res.status(500).json({ error: "Внутренняя ошибка сервера" });
});

const server = http.createServer(app);
initWebPush();
initWebSocket(server);
startSavedSearchJob();
startRentReminderJob();
ensureFonts().catch(() => {});

server.listen(port, () => {
  console.log(`Apart.kg http://localhost:${port}`);
  console.log(`API + веб-интерфейс (папка frontend)`);
  console.log(`WebSocket: ws://localhost:${port}/ws`);
  console.log(`CORS: ${clientOrigin}`);
});
