import { prisma } from "../prisma.js";

export function normalizeAddress(address) {
  return String(address || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function ensureBuildingProfile({ address, district, lat, lng }) {
  const key = normalizeAddress(address);
  if (!key) return null;
  const existing = await prisma.buildingProfile.findUnique({ where: { normalizedKey: key } });
  if (existing) return existing;
  return prisma.buildingProfile.create({
    data: {
      normalizedKey: key,
      address: address.slice(0, 240),
      district: district || null,
      lat: typeof lat === "number" ? lat : null,
      lng: typeof lng === "number" ? lng : null,
    },
  });
}

export async function recomputeBuildingRating(buildingId) {
  const reviews = await prisma.buildingReview.findMany({
    where: { buildingId },
    select: { rating: true },
  });
  if (!reviews.length) {
    await prisma.buildingProfile.update({
      where: { id: buildingId },
      data: { ratingAvg: null, ratingCount: 0 },
    });
    return;
  }
  const avg =
    reviews.reduce((a, r) => a + (r.rating || 0), 0) / reviews.length;
  await prisma.buildingProfile.update({
    where: { id: buildingId },
    data: { ratingAvg: Math.round(avg * 10) / 10, ratingCount: reviews.length },
  });
}

export async function isVerifiedMember(buildingId, userId) {
  const m = await prisma.buildingMember.findUnique({
    where: { buildingId_userId: { buildingId, userId } },
  });
  return m?.status === "APPROVED";
}
