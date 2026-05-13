import jwt from "jsonwebtoken";
import { prisma } from "../prisma.js";

export function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

export async function authOptional(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) {
    req.user = null;
    return next();
  }
  try {
    const payload = jwt.verify(h.slice(7), process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    req.user = user ? { id: user.id, role: user.role, email: user.email, name: user.name } : null;
  } catch {
    req.user = null;
  }
  next();
}

export async function authRequired(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Требуется авторизация" });
  }
  try {
    const payload = jwt.verify(h.slice(7), process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) return res.status(401).json({ error: "Пользователь не найден" });
    req.user = { id: user.id, role: user.role, email: user.email, name: user.name };
    next();
  } catch {
    return res.status(401).json({ error: "Недействительный токен" });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "ADMIN") {
    return res.status(403).json({ error: "Только администратор" });
  }
  next();
}

export function requireModerator(req, res, next) {
  const r = req.user?.role;
  if (r !== "ADMIN" && r !== "MODERATOR") {
    return res.status(403).json({ error: "Нужны права модератора или администратора" });
  }
  next();
}
