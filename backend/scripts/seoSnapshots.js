/**
 * SSR-снепшоты для SEO. Запускать опционально перед деплоем:
 *
 *   npm run seo:snapshots -- http://localhost:3000
 *
 * Скрипт обходит главную, /zh, по 3 объявления и сохраняет статичные .html-страницы
 * в backend/public/seo/, чтобы поисковые краулеры (Yandex/Bing/Baidu) видели контент
 * без выполнения JS. Сервер раздаёт эти снимки по `/seo/...`.
 *
 * Зависимость puppeteer ставится по требованию: `npm i -D puppeteer`.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "public", "seo");

async function main() {
  const baseUrl = process.argv[2] || "http://localhost:3000";
  let puppeteer;
  try {
    puppeteer = (await import("puppeteer")).default;
  } catch {
    console.error("[seo] puppeteer не установлен. Запустите `npm i -D puppeteer`.");
    process.exit(1);
  }
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.setUserAgent("Apart.kgSEOBot/1.0 (+https://apart.kg)");

  async function snapshot(url, filename) {
    console.log(`[seo] ${url} → ${filename}`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    await page.waitForTimeout(1500);
    const html = await page.content();
    fs.writeFileSync(path.join(outDir, filename), html, "utf8");
  }

  await snapshot(`${baseUrl}/`, "index.html");
  await snapshot(`${baseUrl}/zh`, "zh.html");

  try {
    const r = await fetch(`${baseUrl}/api/listings`);
    const data = await r.json();
    const top = (data.items || []).slice(0, 5);
    for (const item of top) {
      await snapshot(`${baseUrl}/?listing=${item.id}`, `listing-${item.id}.html`);
    }
  } catch (err) {
    console.warn("[seo] failed to fetch listings:", err.message);
  }

  await browser.close();
  console.log(`[seo] готово, файлы в ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
