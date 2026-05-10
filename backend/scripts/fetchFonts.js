import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontDir = path.join(__dirname, "..", "assets", "fonts");
const fontPath = path.join(fontDir, "DejaVuSans.ttf");
const FONT_URL = "https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf";

export async function ensureFonts() {
  if (fs.existsSync(fontPath)) return fontPath;
  fs.mkdirSync(fontDir, { recursive: true });
  try {
    const r = await fetch(FONT_URL);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(fontPath, buf);
    console.log(`[fonts] saved ${fontPath} (${buf.length} bytes)`);
    return fontPath;
  } catch (err) {
    console.warn(`[fonts] fetch failed: ${err?.message}`);
    return null;
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (invokedDirectly) {
  ensureFonts().then((p) => {
    if (!p) process.exit(1);
  });
}
