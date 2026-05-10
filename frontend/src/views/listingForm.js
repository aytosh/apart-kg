import { state } from "../state.js";
import { api, uploadFiles } from "../api.js";
import { toast, esc } from "../utils.js";
import { BISHKEK } from "../constants.js";
import { openAuth } from "./auth.js";
import { setView } from "../router.js";
import { loadListings } from "./home.js";

let pendingPhotos = [];

export function updateAddFormState() {
  const ok = !!state.token;
  const hint = document.getElementById("addLoginHint");
  if (hint) hint.hidden = ok;
  document
    .getElementById("formListing")
    ?.querySelectorAll("input,select,button")
    .forEach((el) => {
      if (el.id === "btnSubmitListing") el.disabled = !ok;
    });
}

function renderTourEditor() {
  const wrap = document.getElementById("tourPhotosWrap");
  const list = document.getElementById("tourPhotoList");
  if (!wrap || !list) return;
  if (!pendingPhotos.length) {
    wrap.hidden = true;
    list.innerHTML = "";
    return;
  }
  wrap.hidden = false;
  list.innerHTML = pendingPhotos
    .map(
      (p, i) => `<li>
      <span>Фото ${i + 1}</span>
      <select data-photo-type="${i}">
        <option value="flat" ${p.type === "flat" ? "selected" : ""}>Обычное</option>
        <option value="panorama360" ${p.type === "panorama360" ? "selected" : ""}>Панорама 360°</option>
      </select>
    </li>`
    )
    .join("");
  list.querySelectorAll("select[data-photo-type]").forEach((sel) => {
    sel.addEventListener("change", () => {
      const idx = Number(sel.getAttribute("data-photo-type"));
      pendingPhotos[idx].type = sel.value;
    });
  });
}

async function uploadVideoFile(file) {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch("/api/upload/video", {
    method: "POST",
    headers: state.token ? { Authorization: `Bearer ${state.token}` } : {},
    body: fd,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data.path;
}

export function bindListingForm() {
  const form = document.getElementById("formListing");
  if (!form) return;
  const dealSelect = form.querySelector("select[name=deal]");
  if (dealSelect) {
    dealSelect.addEventListener("change", (e) => {
      const wrap = document.getElementById("rentPeriodWrap");
      if (wrap) wrap.style.display = e.target.value === "rent" ? "block" : "none";
    });
  }
  const photoInput = form.querySelector("input[name=files]");
  if (photoInput) {
    photoInput.addEventListener("change", async () => {
      const files = Array.from(photoInput.files || []);
      if (!files.length) {
        pendingPhotos = [];
        renderTourEditor();
        return;
      }
      try {
        const paths = await uploadFiles(files);
        pendingPhotos = paths.map((p) => ({ path: p, type: "flat", label: null }));
        renderTourEditor();
        toast(`Загружено фото: ${paths.length}`);
      } catch (err) {
        toast(err.message);
      }
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.token) {
      toast("Войдите");
      openAuth();
      return;
    }
    const fd = new FormData(e.target);

    let photoPaths = pendingPhotos.map((p) => p.path);
    if (!photoPaths.length) {
      const files = fd.getAll("files").filter((f) => f.size);
      if (files.length) {
        try {
          photoPaths = await uploadFiles(files);
          pendingPhotos = photoPaths.map((p) => ({ path: p, type: "flat", label: null }));
        } catch (err) {
          toast(err.message);
          return;
        }
      }
    }

    let videoUrl = undefined;
    const videoFile = fd.get("video");
    if (videoFile && videoFile.size) {
      try {
        videoUrl = await uploadVideoFile(videoFile);
      } catch (err) {
        toast("Ошибка загрузки видео: " + err.message);
        return;
      }
    }

    const deal = fd.get("deal");
    const type = fd.get("type");
    const jitter = () => (Math.random() - 0.5) * 0.06;
    const body = {
      deal,
      type,
      title: String(fd.get("title")).trim(),
      district: String(fd.get("district")).trim(),
      price: String(fd.get("price")).trim(),
      currency: String(fd.get("currency")).trim(),
      rooms: String(fd.get("rooms")).trim(),
      area: String(fd.get("area")).trim(),
      floor: String(fd.get("floor")).trim(),
      lat: BISHKEK[0] + jitter(),
      lng: BISHKEK[1] + jitter(),
      images: photoPaths,
      tourPhotos: pendingPhotos,
      videoUrl,
      installment: fd.get("installment") === "on",
      exchange: fd.get("exchange") === "on",
      urgent: fd.get("urgent") === "on",
      liveAvailable: fd.get("liveAvailable") === "on",
      rentPeriod: deal === "rent" ? fd.get("rentPeriod") : undefined,
    };
    try {
      await api("/listings", { method: "POST", body });
      toast("Отправлено на модерацию");
      e.target.reset();
      pendingPhotos = [];
      renderTourEditor();
      setView("home");
      loadListings();
    } catch (err) {
      toast(err.message);
    }
  });
}
