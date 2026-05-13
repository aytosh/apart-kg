import { Router } from "express";
import crypto from "crypto";

import bcrypt from "bcryptjs";

import { body, validationResult } from "express-validator";

import { OAuth2Client } from "google-auth-library";

import { prisma } from "../prisma.js";

import { signToken, authRequired } from "../middleware/auth.js";

import { verifyRecaptcha } from "../utils/recaptcha.js";



const router = Router();

const googleClient = new OAuth2Client();



router.post(

  "/register",

  body("email").isEmail().normalizeEmail(),

  body("password").isLength({ min: 6 }),

  body("name").optional().trim(),

  body("phone").optional().trim(),

  body("recaptchaToken").optional().isString(),

  async (req, res) => {

    const errors = validationResult(req);

    if (!errors.isEmpty()) {

      return res.status(400).json({ errors: errors.array() });

    }

    if (process.env.RECAPTCHA_SECRET_KEY) {

      const v = await verifyRecaptcha(req.body.recaptchaToken);

      if (!v.ok) {

        return res.status(400).json({ error: "Проверка reCAPTCHA не пройдена. Обновите страницу и попробуйте снова." });

      }

    }

    const { email, password, name, phone } = req.body;

    const exists = await prisma.user.findUnique({ where: { email } });

    if (exists) {

      return res.status(400).json({ error: "Email уже зарегистрирован" });

    }

    const hash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({

      data: { email, password: hash, name: name || null, phone: phone || null },

    });

    const token = signToken(user.id);

    return res.status(201).json({

      token,

      user: { id: user.id, email: user.email, name: user.name, role: user.role },

    });

  }

);



router.post(

  "/login",

  body("email").isEmail().normalizeEmail(),

  body("password").notEmpty(),

  body("recaptchaToken").optional().isString(),

  async (req, res) => {

    const errors = validationResult(req);

    if (!errors.isEmpty()) {

      return res.status(400).json({ errors: errors.array() });

    }

    if (process.env.RECAPTCHA_SECRET_KEY) {

      const v = await verifyRecaptcha(req.body.recaptchaToken);

      if (!v.ok) {

        return res.status(400).json({ error: "Проверка reCAPTCHA не пройдена. Обновите страницу и попробуйте снова." });

      }

    }

    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {

      return res.status(401).json({ error: "Неверный email или пароль" });

    }

    if (!user.password) {

      return res.status(401).json({

        error: "Этот аккаунт привязан к Google — войдите через «Вход с Google»",

      });

    }

    if (!(await bcrypt.compare(password, user.password))) {

      return res.status(401).json({ error: "Неверный email или пароль" });

    }

    const token = signToken(user.id);

    return res.json({

      token,

      user: { id: user.id, email: user.email, name: user.name, role: user.role },

    });

  }

);



router.post(

  "/google",

  body("credential").notEmpty().isString(),

  async (req, res) => {

    const errors = validationResult(req);

    if (!errors.isEmpty()) {

      return res.status(400).json({ errors: errors.array() });

    }

    const clientId = process.env.GOOGLE_CLIENT_ID;

    if (!clientId) {

      return res.status(503).json({ error: "Вход через Google не настроен на сервере" });

    }

    let payload;

    try {

      const ticket = await googleClient.verifyIdToken({

        idToken: req.body.credential,

        audience: clientId,

      });

      payload = ticket.getPayload();

    } catch {

      return res.status(401).json({ error: "Не удалось проверить токен Google" });

    }

    const sub = payload.sub;

    const email = payload.email;

    const name = payload.name || null;

    if (!email || !sub) {

      return res.status(400).json({ error: "В ответе Google нет email" });

    }



    let user = await prisma.user.findUnique({ where: { googleId: sub } });

    if (!user) {

      const byEmail = await prisma.user.findUnique({ where: { email } });

      if (byEmail) {

        if (byEmail.googleId && byEmail.googleId !== sub) {

          return res.status(400).json({ error: "Этот email уже привязан к другому Google-аккаунту" });

        }

        user = await prisma.user.update({

          where: { id: byEmail.id },

          data: { googleId: sub, name: name || byEmail.name },

        });

      } else {

        user = await prisma.user.create({

          data: { email, password: null, googleId: sub, name },

        });

      }

    }



    const token = signToken(user.id);

    return res.json({

      token,

      user: { id: user.id, email: user.email, name: user.name, role: user.role },

    });

  }

);

router.post(
  "/forgot-password",
  body("email").isEmail().normalizeEmail(),
  body("recaptchaToken").optional().isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    if (process.env.RECAPTCHA_SECRET_KEY) {
      const v = await verifyRecaptcha(req.body.recaptchaToken);
      if (!v.ok) return res.status(400).json({ error: "Проверка reCAPTCHA не пройдена." });
    }
    const email = req.body.email;
    const user = await prisma.user.findUnique({ where: { email } });
    const msg = {
      ok: true,
      message:
        "Если такой email зарегистрирован, на него отправлены инструкции (или ссылка записана в лог сервера при отсутствии SMTP).",
    };
    if (!user?.password) return res.json(msg);
    const raw = crypto.randomBytes(32).toString("hex");
    const exp = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: raw, passwordResetExpires: exp },
    });
    const origin = (process.env.CLIENT_ORIGIN || "http://localhost:3000").split(",")[0].trim();
    const link = `${origin}/?resetToken=${encodeURIComponent(raw)}`;
    if (process.env.SMTP_HOST) {
      console.warn("[auth] SMTP_HOST задан — подключите отправку писем (nodemailer) для ссылки:", link);
    } else {
      console.log(`[auth] password reset for ${email}: ${link}`);
    }
    return res.json(msg);
  }
);

router.post(
  "/reset-password",
  body("token").notEmpty().isString(),
  body("password").isLength({ min: 6 }),
  body("recaptchaToken").optional().isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    if (process.env.RECAPTCHA_SECRET_KEY) {
      const v = await verifyRecaptcha(req.body.recaptchaToken);
      if (!v.ok) return res.status(400).json({ error: "Проверка reCAPTCHA не пройдена." });
    }
    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: req.body.token,
        passwordResetExpires: { gt: new Date() },
      },
    });
    if (!user) return res.status(400).json({ error: "Ссылка недействительна или истекла. Запросите новую." });
    const hash = await bcrypt.hash(req.body.password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hash, passwordResetToken: null, passwordResetExpires: null },
    });
    res.json({ ok: true, message: "Пароль обновлён. Можно войти." });
  }
);

router.post(
  "/facebook",
  body("accessToken").notEmpty().isString(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (!appId || !appSecret) {
      return res.status(503).json({ error: "Вход через Facebook не настроен (FACEBOOK_APP_ID / FACEBOOK_APP_SECRET)" });
    }
    const { accessToken } = req.body;
    const u = new URL("https://graph.facebook.com/me");
    u.searchParams.set("fields", "id,email,name");
    u.searchParams.set("access_token", accessToken);
    const fr = await fetch(u);
    const data = await fr.json().catch(() => ({}));
    if (!data.id) return res.status(401).json({ error: "Facebook не подтвердил аккаунт" });
    const fbId = String(data.id);
    const email = data.email || `fb_${fbId}@oauth.apart.local`;
    const name = data.name || null;
    let user = await prisma.user.findUnique({ where: { facebookId: fbId } });
    if (!user) {
      const byEmail = await prisma.user.findUnique({ where: { email } });
      if (byEmail) {
        if (byEmail.facebookId && byEmail.facebookId !== fbId) {
          return res.status(400).json({ error: "Этот email уже привязан к другому Facebook" });
        }
        user = await prisma.user.update({
          where: { id: byEmail.id },
          data: { facebookId: fbId, name: name || byEmail.name },
        });
      } else {
        user = await prisma.user.create({
          data: { email, password: null, facebookId: fbId, name },
        });
      }
    }
    const token = signToken(user.id);
    return res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  }
);

const ME_SELECT = {
  id: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  verifiedLevel: true,
  ratingAvg: true,
  ratingCount: true,
  wechatId: true,
  preferredLang: true,
  createdAt: true,
  isAgency: true,
  agencyName: true,
  agencySlug: true,
  agencyLogo: true,
  agencyDescription: true,
  agencyCity: true,
};

function slugifyAgency(input) {
  const s = String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  if (!s) return null;
  return s.slice(0, 60);
}

router.get("/me", authRequired, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: ME_SELECT,
  });
  res.json(user);
});

router.patch(
  "/me",
  authRequired,
  body("name").optional().isString().isLength({ max: 80 }),
  body("phone").optional().isString().isLength({ max: 32 }),
  body("wechatId").optional().isString().isLength({ max: 64 }),
  body("preferredLang").optional().isIn(["ru", "kg", "en", "zh"]),
  body("isAgency").optional().isBoolean(),
  body("agencyName").optional().isString().isLength({ max: 120 }),
  body("agencySlug").optional().isString().isLength({ max: 60 }),
  body("agencyLogo").optional().isString().isLength({ max: 300 }),
  body("agencyDescription").optional().isString().isLength({ max: 2000 }),
  body("agencyCity").optional().isString().isLength({ max: 80 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const data = {};
    for (const k of ["name", "phone", "wechatId", "preferredLang"]) {
      if (typeof req.body[k] === "string") data[k] = req.body[k] || null;
    }

    if (typeof req.body.isAgency === "boolean") {
      data.isAgency = req.body.isAgency;
    }
    for (const k of ["agencyName", "agencyLogo", "agencyDescription", "agencyCity"]) {
      if (typeof req.body[k] === "string") {
        data[k] = req.body[k].trim() || null;
      }
    }

    if (data.isAgency === false) {
      data.agencySlug = null;
    } else if (typeof req.body.agencySlug === "string" || data.isAgency === true) {
      const explicit = slugifyAgency(req.body.agencySlug);
      const fromName = slugifyAgency(req.body.agencyName || "");
      const desired = explicit || fromName;
      if (desired) {
        let slug = desired;
        let n = 1;
        while (true) {
          const existing = await prisma.user.findUnique({
            where: { agencySlug: slug },
            select: { id: true },
          });
          if (!existing || existing.id === req.user.id) break;
          n += 1;
          slug = `${desired}-${n}`;
          if (n > 50) {
            slug = `${desired}-${Date.now().toString(36)}`;
            break;
          }
        }
        data.agencySlug = slug;
      }
    }

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: ME_SELECT,
    });
    res.json(user);
  }
);



export default router;

