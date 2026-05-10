import { prisma } from "../prisma.js";
import { notifyUser } from "../realtime/notify.js";

const dealMap = { rent: "RENT", sale: "SALE" };
const typeMap = {
  flat: "FLAT",
  house: "HOUSE",
  office: "OFFICE",
  new: "NEWBUILD",
  room: "ROOM",
  land: "LAND",
  dacha: "DACHA",
  parking: "PARKING",
};

function buildWhere(filters, since) {
  const where = { status: "ACTIVE", createdAt: { gt: since } };
  if (filters.deal && dealMap[filters.deal]) where.deal = dealMap[filters.deal];
  if (filters.type && typeMap[filters.type]) where.propertyType = typeMap[filters.type];
  if (filters.search) {
    const s = String(filters.search).trim();
    where.OR = [
      { title: { contains: s } },
      { district: { contains: s } },
      { description: { contains: s } },
    ];
  }
  if (filters.installment === "true") where.installment = true;
  if (filters.exchange === "true") where.exchange = true;
  if (filters.urgent === "true") where.urgent = true;
  if (filters.district) {
    where.district = { contains: String(filters.district) };
  }
  return where;
}

async function checkOne(saved) {
  const filters = (() => {
    try {
      return JSON.parse(saved.filtersJson || "{}");
    } catch {
      return {};
    }
  })();
  const since = saved.lastNotifiedAt || saved.createdAt;
  const where = buildWhere(filters, since);
  const matches = await prisma.listing.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, title: true, district: true, price: true, currency: true, createdAt: true },
  });
  if (!matches.length) return 0;
  await notifyUser(saved.userId, {
    kind: "saved-search",
    savedSearchId: saved.id,
    savedSearchName: saved.name,
    title: `Новые объявления по поиску «${saved.name}»`,
    body: `${matches.length} ${matches.length === 1 ? "новое объявление" : "новых объявлений"}`,
    url: "/?savedSearch=" + saved.id,
    items: matches.map((m) => ({
      id: m.id,
      title: m.title,
      district: m.district,
      price: m.price,
      currency: m.currency,
    })),
  });
  await prisma.savedSearch.update({
    where: { id: saved.id },
    data: { lastNotifiedAt: new Date() },
  });
  return matches.length;
}

async function tick() {
  try {
    const items = await prisma.savedSearch.findMany({ where: { notify: true } });
    if (!items.length) return;
    let total = 0;
    for (const s of items) {
      try {
        total += await checkOne(s);
      } catch (err) {
        console.error("[saved-search]", s.id, err?.message);
      }
    }
    if (total) console.log(`[saved-search] notified about ${total} new listings`);
  } catch (err) {
    console.error("[saved-search] tick error", err?.message);
  }
}

export function startSavedSearchJob() {
  const minutes = Math.max(1, Number(process.env.SAVED_SEARCH_INTERVAL_MINUTES) || 10);
  const intervalMs = minutes * 60 * 1000;
  console.log(`[saved-search] cron every ${minutes} min`);
  setTimeout(tick, 5000);
  setInterval(tick, intervalMs);
}
