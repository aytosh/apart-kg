import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "../src/prisma.js";

const REALTOR_PATTERNS = [
  /риелтор/i,
  /риэлтор/i,
  /агентств/i,
  /посредник/i,
  /комисси/i,
  /broker/i,
  /agency/i,
  /agent/i,
];

function isLikelyOwner(item) {
  const hay = `${item.title || ""} ${item.description || ""} ${item.contactName || ""}`;
  return !REALTOR_PATTERNS.some((re) => re.test(hay));
}

function normalizeItem(raw, source) {
  return {
    source,
    title: raw.title || raw.name || "",
    description: raw.description || raw.body || "",
    price: String(raw.price || raw.cost || ""),
    district: raw.district || raw.address || raw.city || "",
    url: raw.url || raw.link || "",
    contactName: raw.contactName || raw.author || raw.sellerName || "",
    raw,
  };
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  const text = await res.text();
  const start = text.trimStart();
  if (contentType.includes("text/html") || start.startsWith("<!") || start.startsWith("<html")) {
    throw new Error(
      "ответ — HTML (страница сайта), а скрипт ждёт JSON. Укажите URL JSON-фида или положите данные в файл и импортируйте его. Главные URL вроде house.kg не являются API."
    );
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`не удалось разобрать JSON: ${e.message}`);
  }
}

function pickArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

async function main() {
  const sourcesRaw = process.env.IMPORT_SOURCES || "";
  const importToDb = String(process.env.IMPORT_TO_DB || "").toLowerCase() === "true";
  const importUserEmail = process.env.IMPORT_USER_EMAIL || "demo@demo.kg";
  const defaultDeal = (process.env.IMPORT_DEAL || "rent").toLowerCase();
  const defaultType = (process.env.IMPORT_TYPE || "flat").toLowerCase();
  const sources = sourcesRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!sources.length) {
    console.log("No sources provided. Set IMPORT_SOURCES=url1,url2");
    process.exit(0);
  }

  const imported = [];
  for (const source of sources) {
    try {
      let payload;
      if (source.startsWith("file:")) {
        const filePath = fileURLToPath(source);
        const raw = await fs.readFile(filePath, "utf8");
        payload = JSON.parse(raw);
      } else if (/^https?:\/\//i.test(source)) {
        payload = await fetchJson(source);
      } else {
        const raw = await fs.readFile(path.resolve(source), "utf8");
        payload = JSON.parse(raw);
      }
      const rows = pickArray(payload).map((r) => normalizeItem(r, source));
      imported.push(...rows);
      console.log(`Loaded ${rows.length} from ${source}`);
    } catch (e) {
      console.error(`Skip ${source}: ${e.message}`);
    }
  }

  const ownerOnly = imported.filter(isLikelyOwner).filter((x) => x.title && x.price);
  const outPath = path.join(process.cwd(), "data", "owner-import-preview.json");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(ownerOnly, null, 2), "utf8");

  console.log(`Total loaded: ${imported.length}`);
  console.log(`Owner-like listings: ${ownerOnly.length}`);
  console.log(`Saved preview: ${outPath}`);

  if (!importToDb || !ownerOnly.length) {
    await prisma.$disconnect();
    return;
  }

  const user = await prisma.user.findUnique({ where: { email: importUserEmail } });
  if (!user) {
    throw new Error(`IMPORT_USER_EMAIL not found: ${importUserEmail}`);
  }

  const deal = defaultDeal === "sale" ? "SALE" : "RENT";
  const propertyTypeMap = {
    flat: "FLAT",
    house: "HOUSE",
    office: "OFFICE",
    new: "NEWBUILD",
    room: "ROOM",
    land: "LAND",
    dacha: "DACHA",
    parking: "PARKING",
  };
  const propertyType = propertyTypeMap[defaultType] || "FLAT";

  let created = 0;
  for (const item of ownerOnly) {
    const lat = 42.8746 + (Math.random() - 0.5) * 0.05;
    const lng = 74.5698 + (Math.random() - 0.5) * 0.05;
    await prisma.listing.create({
      data: {
        userId: user.id,
        deal,
        propertyType,
        title: item.title.slice(0, 120),
        district: item.district || "Не указан",
        description: [item.description, item.url ? `Источник: ${item.url}` : ""].filter(Boolean).join("\n"),
        price: item.price,
        currency: deal === "RENT" ? "сом / мес" : "$",
        rooms: "—",
        area: "—",
        floor: "—",
        lat,
        lng,
        images: "[]",
        rentPeriod: deal === "RENT" ? "MONTHLY" : null,
        installment: false,
        exchange: false,
        urgent: false,
        status: "PENDING",
      },
    });
    created += 1;
  }
  await prisma.$disconnect();
  console.log(`Imported to DB (PENDING): ${created}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
