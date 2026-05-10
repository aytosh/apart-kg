export function parseImages(imagesJson) {
  try {
    const arr = JSON.parse(imagesJson || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function imgUrl(p, baseUrl) {
  if (!p) return null;
  if (p.startsWith("http")) return p;
  const path = p.startsWith("/") ? p : `/${p}`;
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}
