import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import sharp from "sharp";
import exifr from "exifr";
import { prisma } from "../prisma.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, "../../uploads");

const PENALTY = {
  STOCK_OR_DUPLICATE: 25,
  NO_EXIF: 10,
  NO_GPS: 6,
  TEXT_DUPLICATE: 20,
  SUSPICIOUS_PHONE: 30,
  UNVERIFIED_OWNER: 8,
};

const MAX_DHASH_DISTANCE = 8;
const TEXT_JACCARD_THRESHOLD = 0.85;
const PHONE_LIMIT = 5;

function resolvePath(p) {
  if (!p) return null;
  if (path.isAbsolute(p)) return p;
  if (p.startsWith("/uploads/")) return path.join(uploadDir, p.replace(/^\/uploads\//, ""));
  return path.join(uploadDir, p);
}

export async function computeDHash(absPath) {
  try {
    const buf = await sharp(absPath)
      .grayscale()
      .resize(9, 8, { fit: "fill" })
      .raw()
      .toBuffer();
    let bits = "";
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const idx = row * 9 + col;
        const next = idx + 1;
        bits += buf[idx] > buf[next] ? "1" : "0";
      }
    }
    let hex = "";
    for (let i = 0; i < 64; i += 4) {
      hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
    }
    return hex;
  } catch (err) {
    console.warn("[trust] dhash failed for", absPath, err?.message);
    return null;
  }
}

function hammingDistance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    const x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    let v = x;
    while (v) {
      d += v & 1;
      v >>= 1;
    }
  }
  return d;
}

export async function readExifInfo(absPath) {
  try {
    const data = await exifr.parse(absPath, {
      tiff: true,
      gps: true,
      ifd0: true,
      exif: true,
    });
    if (!data || !Object.keys(data).length) {
      return { hasExif: false, hasGps: false };
    }
    const hasGps =
      typeof data.latitude === "number" && typeof data.longitude === "number";
    return { hasExif: true, hasGps, exif: data };
  } catch {
    return { hasExif: false, hasGps: false };
  }
}

function tokenizeForJaccard(text) {
  const norm = String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .trim();
  if (!norm) return new Set();
  const tokens = norm.split(/\s+/).filter((t) => t.length > 2);
  const grams = new Set();
  for (let i = 0; i < tokens.length - 1; i++) {
    grams.add(`${tokens[i]} ${tokens[i + 1]}`);
  }
  if (grams.size < 3) tokens.forEach((t) => grams.add(t));
  return grams;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const uni = a.size + b.size - inter;
  return uni ? inter / uni : 0;
}

export async function detectTextDuplicate(listingId, ownerId, description) {
  if (!description || description.length < 30) return { duplicate: false, ratio: 0 };
  const candidates = await prisma.listing.findMany({
    where: {
      id: { not: listingId || undefined },
      userId: { not: ownerId },
      description: { not: null },
      status: { in: ["ACTIVE", "PENDING"] },
    },
    select: { id: true, description: true },
    take: 200,
    orderBy: { createdAt: "desc" },
  });
  const a = tokenizeForJaccard(description);
  let best = { duplicate: false, ratio: 0, matchedListingId: null };
  for (const c of candidates) {
    const ratio = jaccard(a, tokenizeForJaccard(c.description));
    if (ratio > best.ratio) {
      best = { duplicate: ratio >= TEXT_JACCARD_THRESHOLD, ratio, matchedListingId: c.id };
    }
  }
  return best;
}

export async function checkSuspiciousPhone(phone, ownerId) {
  if (!phone || phone.length < 6) return { suspicious: false, count: 0 };
  const owners = await prisma.user.findMany({
    where: { phone, id: { not: ownerId } },
    select: { id: true, listings: { select: { id: true } } },
  });
  const total = owners.reduce((acc, u) => acc + u.listings.length, 0);
  return { suspicious: total >= PHONE_LIMIT, count: total };
}

export async function findSimilarPhotoOwners(hashes, ownerId) {
  if (!hashes.length) return [];
  const candidates = await prisma.photoHash.findMany({
    where: { listing: { userId: { not: ownerId } } },
    select: { hash: true, listingId: true, listing: { select: { userId: true } } },
    take: 5000,
  });
  const matches = [];
  for (const cand of candidates) {
    for (const h of hashes) {
      if (hammingDistance(h, cand.hash) <= MAX_DHASH_DISTANCE) {
        matches.push({
          hash: h,
          matchedListingId: cand.listingId,
          ownerUserId: cand.listing.userId,
        });
        break;
      }
    }
  }
  return matches;
}

export async function processListingPhotos(listingId, listing, imagePaths) {
  const stats = {
    photos: imagePaths.length,
    photosWithExif: 0,
    photosWithGps: 0,
    duplicateMatches: [],
  };
  for (const p of imagePaths) {
    const abs = resolvePath(p);
    if (!abs || !fs.existsSync(abs)) continue;
    const [hash, exif] = await Promise.all([computeDHash(abs), readExifInfo(abs)]);
    if (!hash) continue;
    let metadata;
    try {
      metadata = await sharp(abs).metadata();
    } catch {
      metadata = {};
    }
    if (exif.hasExif) stats.photosWithExif++;
    if (exif.hasGps) stats.photosWithGps++;
    await prisma.photoHash.create({
      data: {
        listingId,
        path: p,
        hash,
        hasExif: !!exif.hasExif,
        hasGps: !!exif.hasGps,
        width: metadata.width || null,
        height: metadata.height || null,
      },
    });
  }
  const hashes = (
    await prisma.photoHash.findMany({
      where: { listingId },
      select: { hash: true },
    })
  ).map((h) => h.hash);
  if (hashes.length && listing?.userId) {
    stats.duplicateMatches = await findSimilarPhotoOwners(hashes, listing.userId);
  }
  return stats;
}

function computeScore(flags) {
  let score = 100;
  if (flags.duplicatePhotos?.length) score -= PENALTY.STOCK_OR_DUPLICATE;
  if (flags.missingExif) score -= PENALTY.NO_EXIF;
  if (flags.missingGps) score -= PENALTY.NO_GPS;
  if (flags.textDuplicate) score -= PENALTY.TEXT_DUPLICATE;
  if (flags.suspiciousPhone) score -= PENALTY.SUSPICIOUS_PHONE;
  if (flags.unverifiedOwner) score -= PENALTY.UNVERIFIED_OWNER;
  return Math.max(0, Math.min(100, score));
}

/**
 * Полный аудит объявления: фото + текст + телефон + статус владельца.
 * Сохраняет PhotoHash, обновляет Listing.trustScore и trustFlags,
 * возвращает {trustScore, flags, requiresManual}.
 */
export async function auditListing(listingId, { imagePaths = [] } = {}) {
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { user: true },
  });
  if (!listing) return null;

  const photoStats = await processListingPhotos(listingId, listing, imagePaths);
  const dup = await detectTextDuplicate(listingId, listing.userId, listing.description);
  const phoneCheck = await checkSuspiciousPhone(listing.user?.phone, listing.userId);

  const flags = {
    photos: photoStats.photos,
    duplicatePhotos: photoStats.duplicateMatches,
    missingExif: photoStats.photos > 0 && photoStats.photosWithExif === 0,
    missingGps: photoStats.photos > 0 && photoStats.photosWithGps === 0,
    textDuplicate: dup.duplicate,
    textDuplicateRatio: dup.ratio,
    textDuplicateMatchedListingId: dup.matchedListingId,
    suspiciousPhone: phoneCheck.suspicious,
    suspiciousPhoneCount: phoneCheck.count,
    unverifiedOwner: listing.user?.verifiedLevel !== "ID",
  };

  const trustScore = computeScore(flags);
  await prisma.listing.update({
    where: { id: listingId },
    data: { trustScore, trustFlags: JSON.stringify(flags) },
  });

  return {
    trustScore,
    flags,
    requiresManual: trustScore < 40,
  };
}

export function parseTrustFlags(json) {
  try {
    return JSON.parse(json || "{}");
  } catch {
    return {};
  }
}
