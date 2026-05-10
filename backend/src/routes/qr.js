import { Router } from "express";
import QRCode from "qrcode";
import { prisma } from "../prisma.js";

const router = Router();

router.get("/listings/:id", async (req, res) => {
  const listing = await prisma.listing.findUnique({
    where: { id: req.params.id },
    select: { id: true, status: true },
  });
  if (!listing || listing.status !== "ACTIVE") {
    return res.status(404).send("Not found");
  }
  const protocol = req.protocol;
  const host = req.get("host");
  const lang = req.query.lang === "zh" ? "/zh" : "";
  const link = `${protocol}://${host}${lang}/?listing=${listing.id}`;
  res.set("Content-Type", "image/svg+xml");
  res.set("Cache-Control", "public, max-age=86400");
  const svg = await QRCode.toString(link, {
    type: "svg",
    margin: 1,
    width: 240,
    color: { dark: "#1a1a2a", light: "#ffffff" },
  });
  res.send(svg);
});

router.get("/wechat/:userId", async (req, res) => {
  const u = await prisma.user.findUnique({
    where: { id: req.params.userId },
    select: { wechatId: true },
  });
  if (!u?.wechatId) return res.status(404).send("Not found");
  res.set("Content-Type", "image/svg+xml");
  res.set("Cache-Control", "public, max-age=600");
  const svg = await QRCode.toString(`weixin://contacts/profile/${u.wechatId}`, {
    type: "svg",
    margin: 1,
    width: 240,
    color: { dark: "#1aad19", light: "#ffffff" },
  });
  res.send(svg);
});

export default router;
