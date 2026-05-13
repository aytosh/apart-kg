import { state, setToken } from "./state.js";
import { getCurrentLang } from "./i18n.js";

function withLangQuery(path, method) {
  const m = (method || "GET").toUpperCase();
  if (m !== "GET") return path;
  const base = path.startsWith("/") ? path : `/${path}`;
  if (!base.startsWith("/listings") && !base.startsWith("/favorites")) return path;
  const lang = getCurrentLang();
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}lang=${encodeURIComponent(lang)}`;
}

export async function api(path, opts = {}) {
  const method = opts.method || "GET";
  const pathWithLang = opts.skipLang ? path : withLangQuery(path, method);
  const headers = { "Content-Type": "application/json", ...opts.headers };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const r = await fetch(`/api${pathWithLang}`, {
    ...opts,
    method,
    headers,
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data.error || (data.errors && JSON.stringify(data.errors)) || r.statusText;
    throw new Error(msg);
  }
  return data;
}

export async function uploadFiles(files) {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  const r = await fetch("/api/upload", {
    method: "POST",
    headers: state.token ? { Authorization: `Bearer ${state.token}` } : {},
    body: fd,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data.paths || [];
}

export async function refreshUser() {
  if (!state.token) {
    state.user = null;
    return;
  }
  try {
    state.user = await api("/auth/me");
  } catch {
    setToken(null);
    state.user = null;
  }
}
