import { THEME_KEY, FALLBACK_IMG } from "./constants.js";

export function toast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.hidden = true), 2800);
}

export function esc(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

export function plural(n, a, b, c) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m100 >= 11 && m100 <= 14) return c;
  if (m10 === 1) return a;
  if (m10 >= 2 && m10 <= 4) return b;
  return c;
}

export function applyTheme(theme) {
  const next = theme === "light" ? "light" : "dark";
  document.body.setAttribute("data-theme", next);
  localStorage.setItem(THEME_KEY, next);
}

export function toggleTheme() {
  const current = document.body.getAttribute("data-theme") || "dark";
  applyTheme(current === "dark" ? "light" : "dark");
}

export function pickCardImage(it) {
  const raw = it.image || it.images?.[0];
  return raw && String(raw).trim() ? String(raw).trim() : FALLBACK_IMG;
}

export function attachCardImageFallback(root) {
  root.querySelectorAll(".card__img").forEach((img) => {
    img.addEventListener(
      "error",
      () => {
        img.src = FALLBACK_IMG;
      },
      { once: true }
    );
  });
}
