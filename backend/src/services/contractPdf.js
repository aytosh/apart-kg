import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, "../../uploads");
const fontPath = path.join(__dirname, "../../assets/fonts/DejaVuSans.ttf");

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ru-RU");
}

function fmtMoney(amount, currency) {
  if (amount == null) return "—";
  return `${Number(amount).toLocaleString("ru-RU")} ${currency || ""}`.trim();
}

/**
 * Генерирует PDF договора аренды или купли-продажи.
 * Возвращает путь файла относительно /uploads/.
 */
export async function generateDealPdf(deal) {
  const filename = `deal_${deal.id}.pdf`;
  const target = path.join(uploadDir, filename);
  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const stream = fs.createWriteStream(target);
    doc.pipe(stream);
    if (fs.existsSync(fontPath)) {
      doc.registerFont("body", fontPath);
      doc.font("body");
    }
    const isRent = deal.type === "RENT";
    const title = isRent
      ? "ДОГОВОР АРЕНДЫ ЖИЛОГО ПОМЕЩЕНИЯ"
      : "ДОГОВОР КУПЛИ-ПРОДАЖИ ЖИЛОГО ПОМЕЩЕНИЯ";
    doc.fontSize(16).text(title, { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Сформирован Apart.kg, ${fmtDate(new Date())}.`, { align: "center" });
    doc.moveDown(1.5);

    doc.fontSize(11);
    doc.text("СТОРОНЫ", { underline: true });
    doc.moveDown(0.3);
    doc.text(
      `Арендодатель/Продавец: ${deal.landlord?.name || deal.landlord?.email || ""} (id ${deal.landlord?.id || deal.landlordId})`
    );
    doc.text(
      `Арендатор/Покупатель: ${deal.tenant?.name || deal.tenant?.email || ""} (id ${deal.tenant?.id || deal.tenantId})`
    );
    doc.moveDown(1);

    doc.text("ОБЪЕКТ", { underline: true });
    doc.moveDown(0.3);
    doc.text(`«${deal.listing?.title || "—"}»`);
    doc.text(`Адрес/район: ${deal.listing?.district || "—"}`);
    doc.moveDown(1);

    doc.text("УСЛОВИЯ", { underline: true });
    doc.moveDown(0.3);
    if (isRent) {
      doc.text(`Срок: с ${fmtDate(deal.startDate)} по ${fmtDate(deal.endDate)}`);
      doc.text(`Ежемесячный платёж: ${fmtMoney(deal.monthlyAmount, deal.currency)}`);
      doc.text(`Депозит (эскроу): ${fmtMoney(deal.depositAmount, deal.currency)}`);
    } else {
      doc.text(`Сумма сделки: ${fmtMoney(deal.saleAmount, deal.currency)}`);
      doc.text(`Депозит (эскроу): ${fmtMoney(deal.depositAmount, deal.currency)}`);
    }
    doc.moveDown(1);

    if (deal.termsJson) {
      try {
        const terms = JSON.parse(deal.termsJson);
        const lines = Object.entries(terms);
        if (lines.length) {
          doc.text("ДОПОЛНИТЕЛЬНЫЕ УСЛОВИЯ", { underline: true });
          doc.moveDown(0.3);
          for (const [k, v] of lines) {
            doc.text(`• ${k}: ${v}`);
          }
          doc.moveDown(1);
        }
      } catch {
        /* ignore */
      }
    }

    doc.text("ПОДПИСИ", { underline: true });
    doc.moveDown(0.3);
    doc.text(
      `Арендодатель/Продавец: ${
        deal.signedLandlordAt
          ? `подписано онлайн-кодом ${fmtDate(deal.signedLandlordAt)}`
          : "подпись отсутствует"
      }`
    );
    doc.text(
      `Арендатор/Покупатель: ${
        deal.signedTenantAt
          ? `подписано онлайн-кодом ${fmtDate(deal.signedTenantAt)}`
          : "подпись отсутствует"
      }`
    );
    doc.moveDown(1);
    doc.fontSize(9).fillColor("#555").text(
      "Документ сгенерирован автоматически на платформе Apart.kg. Подпись подтверждается одноразовым кодом, отправленным на email/телефон стороны. Спор по сделке регулируется законодательством Кыргызской Республики."
    );

    doc.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
  return `/uploads/${filename}`;
}
