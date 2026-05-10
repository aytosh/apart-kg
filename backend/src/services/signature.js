import { randomInt } from "crypto";
import { prisma } from "../prisma.js";
import { notifyUser } from "../realtime/notify.js";

const CODE_TTL_MIN = 10;

function generateCode() {
  return String(randomInt(0, 1000000)).padStart(6, "0");
}

export async function issueSignatureCode({ userId, channel, target, context }) {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60 * 1000);
  await prisma.signatureCode.create({
    data: {
      userId,
      channel,
      target: target || "",
      code,
      context,
      expiresAt,
    },
  });
  notifyUser(userId, {
    kind: "signature-code",
    title: `Код подтверждения: ${code}`,
    body: `Используйте для подписания (${context}). Действителен ${CODE_TTL_MIN} минут.`,
    code,
    context,
  }).catch(() => {});
  if (process.env.NODE_ENV !== "production") {
    console.log(`[signature] dev code for user=${userId} context=${context}: ${code}`);
  }
  return { expiresAt };
}

export async function verifySignatureCode({ userId, context, code }) {
  if (!code) return false;
  const row = await prisma.signatureCode.findFirst({
    where: { userId, context, code, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return false;
  await prisma.signatureCode.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });
  return true;
}
