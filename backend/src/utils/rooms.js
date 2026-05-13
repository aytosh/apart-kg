/**
 * Категории комнат, которые понимает API:
 * "studio" | "1" | "2" | "3" | "4" | "5plus" | "free"
 *
 * Парсим неструктурированную строку `rooms` из БД и возвращаем категорию.
 */
export function parseRoomsCategory(raw) {
  if (raw == null) return null;
  const s = String(raw).toLowerCase().trim();
  if (!s) return null;
  if (/(студ|studio|студия)/i.test(s)) return "studio";
  if (/(своб|free|open|открыт|план)/i.test(s)) return "free";
  const m = s.match(/(\d+)/);
  if (m) {
    const n = Number(m[1]);
    if (n <= 0) return null;
    if (n >= 5) return "5plus";
    return String(n);
  }
  return null;
}

const ALLOWED = new Set(["studio", "1", "2", "3", "4", "5plus", "free"]);

export function normalizeRoomsFilter(raw) {
  if (!raw) return null;
  const v = String(raw).toLowerCase().trim();
  if (!ALLOWED.has(v)) return null;
  return v;
}

export function listingMatchesRooms(listing, category) {
  if (!category) return true;
  return parseRoomsCategory(listing.rooms) === category;
}
