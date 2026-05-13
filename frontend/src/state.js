import { TOKEN_KEY, TOKEN_LEGACY } from "./constants.js";

function readStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_LEGACY);
}

export const state = {
  token: readStoredToken(),
  user: null,
  view: "home",
  items: [],
  filters: {
    deal: "all",
    type: "all",
    rooms: "all",
    search: "",
    verifiedOnly: false,
    has360: false,
    hasVideo: false,
    liveAvailable: false,
  },
  map: null,
  markersLayer: null,
  detail: null,
  chatListingId: null,
  authMode: "login",
  savedSearches: [],
  pushSubscribed: false,
  complexFilters: { stage: "", deadlineYear: "" },
  complexes: [],
  complexDetail: null,
};

export const appConfig = {
  recaptchaSiteKey: "",
  recaptchaVersion: "v3",
  googleClientId: "",
  facebookAppId: "",
  appleSignInEnabled: false,
  vapidPublicKey: "",
  featureFlags: {},
  currency: {
    base: "KGS",
    rates: { KGS: 1, USD: 87.5, EUR: 95, CNY: 12.1, RUB: 0.94 },
    updatedAt: null,
  },
};

const CURRENCY_KEY = "apartCurrency";
const SUPPORTED_CURRENCIES = ["KGS", "USD", "EUR", "CNY", "RUB"];

export function getCurrentCurrency() {
  const stored = localStorage.getItem(CURRENCY_KEY);
  if (stored && SUPPORTED_CURRENCIES.includes(stored)) return stored;
  return "KGS";
}

export function setCurrentCurrency(code) {
  const norm = SUPPORTED_CURRENCIES.includes(code) ? code : "KGS";
  localStorage.setItem(CURRENCY_KEY, norm);
}

export function getSupportedCurrencies() {
  return SUPPORTED_CURRENCIES.slice();
}

export function setAppConfig(cfg) {
  Object.assign(appConfig, cfg || {});
}

export function setToken(t) {
  state.token = t;
  if (t) {
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.removeItem(TOKEN_LEGACY);
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_LEGACY);
  }
}
