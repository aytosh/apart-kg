const DEFAULTS = {
  trustScore: true,
  immersiveTour: true,
  liveViewing: true,
  safeDeal: true,
  newbuildTracker: true,
  community: true,
  wechat: true,
  i18n: true,
  pwaOffline: true,
};

let cache = null;

function load() {
  if (cache) return cache;
  cache = { ...DEFAULTS };
  try {
    if (process.env.FEATURE_FLAGS) {
      const parsed = JSON.parse(process.env.FEATURE_FLAGS);
      cache = { ...cache, ...parsed };
    }
  } catch (err) {
    console.warn("[flags] FEATURE_FLAGS parse failed:", err?.message);
  }
  return cache;
}

export function getFeatureFlags() {
  return { ...load() };
}

export function isEnabled(name) {
  return Boolean(load()[name]);
}
