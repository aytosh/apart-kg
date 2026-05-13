import { appConfig, getCurrentCurrency } from "./state.js";

const SYMBOL = {
  KGS: "сом",
  USD: "$",
  EUR: "€",
  CNY: "¥",
  RUB: "₽",
};

/**
 * Возвращает курс «1 единица валюты `code` = ? KGS» из конфига.
 * Базовая валюта в конфиге — KGS, поэтому rate(USD) = 87.5 значит 1 USD = 87.5 KGS.
 */
function rateInBase(code) {
  const rates = appConfig.currency?.rates || {};
  const r = Number(rates[code]);
  if (!r || Number.isNaN(r)) return null;
  return r;
}

function parseAmount(raw) {
  if (raw == null) return null;
  const s = String(raw).replace(/[^\d.,-]/g, "").replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Конвертирует сумму из исходной валюты в выбранную пользователем.
 * Если курс неизвестен — возвращает исходное число.
 */
export function convertAmount(amount, fromCode, toCode) {
  const from = String(fromCode || "KGS").toUpperCase();
  const to = String(toCode || getCurrentCurrency()).toUpperCase();
  if (from === to) return amount;
  const fromR = rateInBase(from);
  const toR = rateInBase(to);
  if (!fromR || !toR) return amount;
  return (amount * fromR) / toR;
}

export function formatCurrencyAmount(amount, code) {
  if (amount == null || Number.isNaN(amount)) return "";
  const c = String(code || getCurrentCurrency()).toUpperCase();
  const isStrong = c === "USD" || c === "EUR" || c === "CNY" || c === "RUB";
  const decimals = isStrong && Math.abs(amount) < 1000 ? 0 : 0;
  const rounded = Number(amount.toFixed(decimals));
  return rounded.toLocaleString("ru-RU");
}

export function currencySymbol(code) {
  const c = String(code || getCurrentCurrency()).toUpperCase();
  return SYMBOL[c] || c;
}

/**
 * Универсальный helper для карточек/модалок:
 * передаём исходную цену + исходную валюту, получаем строку в текущей валюте.
 * Возвращает объект для гибкой вёрстки.
 */
export function priceInCurrentCurrency(rawPrice, rawCurrency) {
  const target = getCurrentCurrency();
  const from = String(rawCurrency || "KGS").toUpperCase();
  const num = parseAmount(rawPrice);
  if (num == null) {
    return {
      target,
      symbol: currencySymbol(target),
      formatted: String(rawPrice ?? ""),
      converted: false,
    };
  }
  const conv = convertAmount(num, from, target);
  return {
    target,
    symbol: currencySymbol(target),
    formatted: formatCurrencyAmount(conv, target),
    converted: from !== target,
    originalSymbol: currencySymbol(from),
    originalFormatted: formatCurrencyAmount(num, from),
  };
}
