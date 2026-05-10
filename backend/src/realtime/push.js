import webpush from "web-push";
import { prisma } from "../prisma.js";

let configured = false;

export function initWebPush() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@apart.kg";
  if (!pub || !priv) {
    console.warn("[push] VAPID keys not set; web push disabled");
    return;
  }
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
}

export function getVapidPublicKey() {
  return configured ? process.env.VAPID_PUBLIC_KEY : "";
}

export async function sendPushToUser(userId, payload) {
  if (!configured) return { sent: 0, failed: 0 };
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (!subs.length) return { sent: 0, failed: 0 };
  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  const stale = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body
        );
        sent++;
      } catch (err) {
        failed++;
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          stale.push(s.id);
        }
      }
    })
  );
  if (stale.length) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: stale } } });
  }
  return { sent, failed };
}
