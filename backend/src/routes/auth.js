import { Router } from "express";

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



router.get("/me", authRequired, async (req, res) => {

  const user = await prisma.user.findUnique({

    where: { id: req.user.id },

    select: {
      id: true, email: true, name: true, phone: true, role: true,
      verifiedLevel: true, ratingAvg: true, ratingCount: true,
      wechatId: true, preferredLang: true, createdAt: true,
    },

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
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const data = {};
    for (const k of ["name", "phone", "wechatId", "preferredLang"]) {
      if (typeof req.body[k] === "string") data[k] = req.body[k] || null;
    }
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data,
      select: {
        id: true, email: true, name: true, phone: true, role: true,
        verifiedLevel: true, wechatId: true, preferredLang: true,
      },
    });
    res.json(user);
  }
);



export default router;

