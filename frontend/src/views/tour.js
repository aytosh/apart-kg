let pannellumLoading = null;

function loadPannellum() {
  if (window.pannellum) return Promise.resolve(window.pannellum);
  if (pannellumLoading) return pannellumLoading;
  pannellumLoading = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.css";
    document.head.appendChild(css);
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/pannellum@2.5.6/build/pannellum.js";
    s.async = true;
    s.onload = () => resolve(window.pannellum);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return pannellumLoading;
}

export async function open360Viewer(panoramaUrl, label) {
  const wrap = document.getElementById("modalTour");
  const container = document.getElementById("tourViewer");
  const titleEl = document.getElementById("tourTitle");
  if (!wrap || !container) return;
  if (titleEl) titleEl.textContent = label || "Панорама 360°";
  wrap.hidden = false;
  document.body.style.overflow = "hidden";
  container.innerHTML = "";
  try {
    const pn = await loadPannellum();
    pn.viewer(container, {
      type: "equirectangular",
      panorama: panoramaUrl,
      autoLoad: true,
      autoRotate: -2,
      compass: false,
      hfov: 110,
      showZoomCtrl: true,
      showFullscreenCtrl: true,
    });
  } catch (err) {
    container.innerHTML =
      "<p class='form__intro'>Не удалось загрузить просмотрщик 360°. Проверьте интернет.</p>";
    console.error("[tour] pannellum load failed", err);
  }
}

export function close360Viewer() {
  const wrap = document.getElementById("modalTour");
  if (!wrap) return;
  wrap.hidden = true;
  const container = document.getElementById("tourViewer");
  if (container) container.innerHTML = "";
  document.body.style.overflow = "";
}

export function bindTour() {
  document
    .querySelectorAll("[data-close-tour]")
    .forEach((el) => el.addEventListener("click", close360Viewer));
}
