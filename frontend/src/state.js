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
  googleClientId: "",
  vapidPublicKey: "",
  featureFlags: {},
};

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
