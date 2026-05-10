import { state } from "../state.js";
import { BISHKEK } from "../constants.js";
import { esc } from "../utils.js";
import { openDetail } from "./detail.js";

let MAP_PIN_ICON = null;

export function refreshMapMarkers() {
  if (!state.map || !state.markersLayer) return;
  state.markersLayer.clearLayers();
  state.items.forEach((it) => {
    const m = L.marker([it.lat, it.lng], MAP_PIN_ICON ? { icon: MAP_PIN_ICON } : {});
    m.on("click", () => openDetail(it));
    m.bindPopup(`<strong>${esc(it.title)}</strong><br>${esc(it.price)}`);
    state.markersLayer.addLayer(m);
  });
  if (state.items.length) {
    const b = L.latLngBounds(state.items.map((i) => [i.lat, i.lng]));
    state.map.fitBounds(b.pad(0.15));
  } else {
    state.map.setView(BISHKEK, 12);
  }
}

export function initMap() {
  const el = document.getElementById("mapContainer");
  if (!el || typeof L === "undefined") return;
  if (!MAP_PIN_ICON) {
    MAP_PIN_ICON = L.divIcon({
      className: "map-pin",
      html: '<div class="map-pin__dot" aria-hidden="true"></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
  }
  if (!state.map) {
    state.map = L.map(el).setView(BISHKEK, 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OSM",
      maxZoom: 19,
    }).addTo(state.map);
    state.markersLayer = L.layerGroup().addTo(state.map);
  }
  const invalidate = () => {
    try {
      state.map.invalidateSize();
    } catch (_) {
      /* ignore */
    }
  };
  invalidate();
  requestAnimationFrame(invalidate);
  setTimeout(invalidate, 200);
  setTimeout(invalidate, 600);
  refreshMapMarkers();
}
