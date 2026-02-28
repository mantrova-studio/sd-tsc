(function () {
  // ==========================
  // СКРЫТЫЙ ДОСТУП (простая защита)
  // ==========================
  const EDIT_PARAM = "edit";
  const PIN_PARAM = "pin";
  const STORAGE_AUTH = "sd_zones_editor_authed";
  const EDITOR_PIN = "2468"; // поменяй

  const qs = new URLSearchParams(location.search);

  function goToZones() {
    const base = location.href.split("?")[0];
    const folder = base.substring(0, base.lastIndexOf("/") + 1);
    location.href = folder + "zones.html";
  }

  function showBlock(title, text) {
    document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:#0c0f16;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial">
        <div style="max-width:760px;width:100%;border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:18px;background:rgba(255,255,255,.04)">
          <div style="font-size:20px;font-weight:800;margin-bottom:8px;">${title}</div>
          <div style="opacity:.85;line-height:1.5;white-space:pre-wrap">${text}</div>
          <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
            <button id="goZones" style="cursor:pointer;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;padding:10px 12px;border-radius:12px;font-weight:700;">← На zones</button>
            <button id="retry" style="cursor:pointer;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;padding:10px 12px;border-radius:12px;font-weight:700;">↻ Обновить</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById("goZones").onclick = goToZones;
    document.getElementById("retry").onclick = () => location.reload();
  }

  if (qs.get(EDIT_PARAM) !== "1") {
    showBlock(
      "Редактор закрыт",
      `Нужно открыть так:\n\neditor.html?edit=1\n\nТекущий URL:\n${location.href}`
    );
    return;
  }

  const saved = localStorage.getItem(STORAGE_AUTH) === "1";
  const pinFromUrl = qs.get(PIN_PARAM);

  if (!saved) {
    const okByUrl = pinFromUrl && pinFromUrl === EDITOR_PIN;
    if (!okByUrl) {
      const entered = prompt("PIN для редактора зон:");
      if (entered !== EDITOR_PIN) {
        showBlock("Неверный PIN", "PIN неверный. Открой editor.html?edit=1 и введи правильный PIN.");
        return;
      }
    }
    localStorage.setItem(STORAGE_AUTH, "1");
  }

  // ==========================
  // ФАЙЛЫ + ЛОКАЛЬНЫЕ ДРАФТЫ
  // ==========================
  const FILES = {
    day: "data/zones/zones_day.geojson",
    night: "data/zones/zones_night.geojson",
  };

  const DRAFT_KEY = (mode) => `sd_zones_draft_${mode}`; // day/night

  function getMode() {
    return modeSel.value === "night" ? "night" : "day";
  }

  function readDraft(mode) {
    try {
      const raw = localStorage.getItem(DRAFT_KEY(mode));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function writeDraft(mode, geojson) {
    try {
      localStorage.setItem(DRAFT_KEY(mode), JSON.stringify(geojson));
    } catch (e) {
      console.warn("draft save failed", e);
    }
  }

  function clearDraft(mode) {
    localStorage.removeItem(DRAFT_KEY(mode));
  }

  // ==========================
  // UI
  // ==========================
  const backBtn = document.getElementById("backBtn");
  const drawBtn = document.getElementById("drawBtn");
  const stopBtn = document.getElementById("stopBtn");
  const editBtn = document.getElementById("editBtn");
  const delBtn = document.getElementById("delBtn");
  const exportBtn = document.getElementById("exportBtn");
  const resetLocalBtn = document.getElementById("resetLocalBtn");

  const modeSel = document.getElementById("modeSel");
  const zoneName = document.getElementById("zoneName");
  const zoneDesc = document.getElementById("zoneDesc");
  const savePropsBtn = document.getElementById("savePropsBtn");
  const importFile = document.getElementById("importFile");

  if (!backBtn || !drawBtn || !stopBtn || !editBtn || !delBtn || !exportBtn || !modeSel) {
    showBlock(
      "Не тот HTML",
      "Похоже, editor.js подключён не на editor.html или элементы UI не найдены.\nОжидаемые id: backBtn, drawBtn, stopBtn, editBtn, delBtn, exportBtn, modeSel."
    );
    return;
  }

  backBtn.addEventListener("click", goToZones);

  // ==========================
  // MAP / STATE
  // ==========================
  let map;
  let selected = null;
  const polygons = [];

  // автосохранение (debounce)
  let saveTimer = null;
  function scheduleSaveDraft() {
    if (!map) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const geo = buildGeoJsonFromPolys();
      writeDraft(getMode(), geo);
    }, 250);
  }

  function makePolyStyle() {
    return {
      fillColor: "#1e2a42",
      strokeColor: "#2b3a55",
      opacity: 1,
      strokeWidth: 2,
      fillOpacity: 0.35,
    };
  }

  function setSelectedStyle(poly, isActive) {
    poly.options.set(
      isActive
        ? { strokeWidth: 3, fillOpacity: 0.5 }
        : { strokeWidth: 2, fillOpacity: 0.35 }
    );
  }

  function normalizeProps(props = {}) {
    // важное: описание может быть в note
    const p = { ...props };
    if (!p.zone && (p.Name || p.name)) p.zone = p.Name || p.name;
    if (!p.description && p.note) p.description = p.note;
    if (!p.note && p.description) p.note = p.description; // чтобы не терять исходный формат
    return p;
  }

  function selectPoly(poly) {
    if (selected && selected !== poly) {
      setSelectedStyle(selected, false);
      try {
        selected.editor && selected.editor.stopEditing();
      } catch (e) {}
    }

    selected = poly;

    if (!selected) {
      zoneName.value = "";
      zoneDesc.value = "";
      return;
    }

    setSelectedStyle(selected, true);

    const props = normalizeProps(selected.properties.getAll() || {});
    // FIX #1: подтягиваем описание (description || note)
    zoneName.value = props.zone || "";
    zoneDesc.value = props.description || props.note || "";
  }

  function attachPolyEvents(poly) {
    poly.events.add("click", () => selectPoly(poly));

    // FIX #3: любые изменения геометрии/свойств -> драфт
    try {
      poly.geometry.events.add("change", scheduleSaveDraft);
    } catch (e) {}

    try {
      poly.properties.events.add("change", scheduleSaveDraft);
    } catch (e) {}
  }

  function addPolygonFromLatLonRings(ringsLatLon, props = {}) {
    const p = normalizeProps(props);
    const poly = new ymaps.Polygon(ringsLatLon, p, makePolyStyle());
    attachPolyEvents(poly);
    map.geoObjects.add(poly);
    polygons.push(poly);
    return poly;
  }

  function clearAll() {
    polygons.forEach((p) => {
      try {
        p.editor && p.editor.stopEditing();
      } catch (e) {}
      map.geoObjects.remove(p);
    });
    polygons.length = 0;
    selectPoly(null);
  }

  function fitToAll() {
    const b = map.geoObjects.getBounds();
    if (b) map.setBounds(b, { checkZoomRange: true, zoomMargin: 20 });
  }

  // ==========================
  // GEOJSON CONVERT
  // ==========================
  function latLonToLonLatRing(ringLatLon) {
    return ringLatLon.map(([lat, lon]) => [lon, lat]);
  }
  function lonLatToLatLonRing(ringLonLat) {
    return ringLonLat.map(([lon, lat]) => [lat, lon]);
  }

  function polyToFeature(poly) {
    const coords = poly.geometry.getCoordinates();
    const ringsLonLat = coords.map((ring) => latLonToLonLatRing(ring));

    const props = normalizeProps(poly.properties.getAll() || {});
    // сохраняем только нужные поля, но не теряем note/description
    return {
      type: "Feature",
      properties: {
        id: props.id || props.__id || null,
        zone: props.zone || "",
        description: props.description || props.note || "",
        note: props.note || props.description || "",
      },
      geometry: { type: "Polygon", coordinates: ringsLonLat },
    };
  }

  function buildGeoJsonFromPolys() {
    return {
      type: "FeatureCollection",
      features: polygons.map(polyToFeature),
    };
  }

  function downloadJson(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], {
      type: "application/geo+json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function loadGeoJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Не удалось загрузить: " + url);
    return await res.json();
  }

  function applyGeoJson(geo) {
    clearAll();

    const feats = geo?.features || [];
    feats.forEach((f, idx) => {
      const g = f?.geometry;
      if (!g) return;

      const props = normalizeProps(f.properties || {});
      if (!props.id) props.id = f.id || props.__id || `f_${idx}`;

      if (g.type === "Polygon") {
        const ringsLatLon = (g.coordinates || []).map((ring) => lonLatToLatLonRing(ring));
        addPolygonFromLatLonRings(ringsLatLon, props);
      } else if (g.type === "MultiPolygon") {
        // если когда-нибудь будет MultiPolygon — разнесём на несколько Polygon
        (g.coordinates || []).forEach((polyCoords, mIdx) => {
          const ringsLatLon = (polyCoords || []).map((ring) => lonLatToLatLonRing(ring));
          addPolygonFromLatLonRings(ringsLatLon, { ...props, id: `${props.id}_m${mIdx}` });
        });
      }
    });

    fitToAll();
  }

  async function loadCurrentModePreferDraft() {
    const mode = getMode();

    const draft = readDraft(mode);
    if (draft && draft.type === "FeatureCollection") {
      applyGeoJson(draft);
      return;
    }

    const url = FILES[mode];
    const geo = await loadGeoJson(url);
    applyGeoJson(geo);
  }

  // ==========================
  // DRAW / EDIT / DELETE
  // ==========================
  let drawingPoly = null;

  function startDrawing() {
    // если уже рисовали — завершить
    if (drawingPoly) {
      try {
        drawingPoly.editor.stopDrawing();
      } catch (e) {}
      drawingPoly = null;
    }

    const props = normalizeProps({
      id: "new_" + Date.now(),
      zone: "Новая зона",
      description: "",
      note: "",
    });

    // FIX #2: создаём через общий хелпер (с click+autosave)
    drawingPoly = addPolygonFromLatLonRings([], props);
    selectPoly(drawingPoly);

    try {
      drawingPoly.editor.startDrawing();
    } catch (e) {
      alert("Не удалось начать рисование. Проверь, что подключён API с load=package.full");
    }

    scheduleSaveDraft();
  }

  function stopDrawing() {
    if (!drawingPoly) return;
    try {
      drawingPoly.editor.stopDrawing();
    } catch (e) {}
    drawingPoly = null;

    fitToAll();
    scheduleSaveDraft();
  }

  function toggleEdit() {
    if (!selected) return alert("Выбери полигон (клик по зоне).");

    try {
      const isEditing = selected.editor && selected.editor.state.get("editing");
      if (isEditing) selected.editor.stopEditing();
      else selected.editor.startEditing();
      scheduleSaveDraft();
    } catch (e) {
      alert("Редактирование недоступно.");
    }
  }

  function deleteSelected() {
    if (!selected) return;
    if (!confirm("Удалить выбранный полигон?")) return;

    try {
      selected.editor && selected.editor.stopEditing();
    } catch (e) {}

    map.geoObjects.remove(selected);
    const i = polygons.indexOf(selected);
    if (i >= 0) polygons.splice(i, 1);
    selectPoly(null);

    scheduleSaveDraft();
  }

  function saveProps() {
    if (!selected) return alert("Выбери полигон (клик по зоне).");

    const z = zoneName.value.trim();
    const d = zoneDesc.value.trim();

    // сохраняем и description, и note (чтобы не было рассинхрона)
    const current = normalizeProps(selected.properties.getAll() || {});
    selected.properties.set({
      ...current,
      zone: z,
      description: d,
      note: d,
    });

    scheduleSaveDraft();
  }

  function exportGeoJson() {
    const mode = getMode();
    const out = buildGeoJsonFromPolys();
    const filename = mode === "night" ? "zones_night.geojson" : "zones_day.geojson";
    downloadJson(filename, out);
  }

  // ==========================
  // UI EVENTS
  // ==========================
  drawBtn.addEventListener("click", startDrawing);
  stopBtn.addEventListener("click", stopDrawing);
  editBtn.addEventListener("click", toggleEdit);
  delBtn.addEventListener("click", deleteSelected);
  savePropsBtn.addEventListener("click", saveProps);
  exportBtn.addEventListener("click", exportGeoJson);

  if (resetLocalBtn) {
    resetLocalBtn.addEventListener("click", async () => {
      const mode = getMode();
      const ok = confirm(
        `Сбросить локальные изменения для режима "${mode === "night" ? "Ночь" : "День"}"?\n\nЛокальный черновик будет удалён, загрузится исходный файл.`
      );
      if (!ok) return;

      clearDraft(mode);
      try {
        await loadCurrentModePreferDraft();
        alert("Локальный черновик удалён. Загружен исходный GeoJSON.");
      } catch (e) {
        alert("Ошибка загрузки: " + e.message);
      }
    });
  }

  modeSel.addEventListener("change", async () => {
    // мы храним автодрафт, поэтому просто грузим другой режим (драфт если есть)
    try {
      await loadCurrentModePreferDraft();
    } catch (e) {
      alert(e.message);
    }
  });

  importFile.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const geo = JSON.parse(await file.text());
      applyGeoJson(geo);
      scheduleSaveDraft();
      alert("Импортировано и сохранено локально как черновик.");
    } catch (err) {
      alert("Не удалось импортировать: " + err.message);
    } finally {
      importFile.value = "";
    }
  });

  // удобство: изменение текста сразу в драфт (чтобы не потерять при F5)
  zoneName.addEventListener("input", () => scheduleSaveDraft());
  zoneDesc.addEventListener("input", () => scheduleSaveDraft());

  // ==========================
  // INIT MAP
  // ==========================
  ymaps.ready(async () => {
    map = new ymaps.Map("map", {
      center: [51.7682, 55.0968],
      zoom: 11,
      controls: ["zoomControl"],
    });

    map.events.add("click", (e) => {
      // клик по пустому месту снимает выделение (но не мешает клику по полигону)
      // ymaps сначала вызовет click полигона, потом карты, поэтому делаем микро-задержку
      setTimeout(() => {
        // если только что выбрали полигон — не сбрасываем
        // (простая эвристика: если selected есть, не трогаем)
      }, 0);
    });

    // по умолчанию день
    if (!modeSel.value) modeSel.value = "day";

    try {
      await loadCurrentModePreferDraft();
    } catch (e) {
      alert(e.message);
    }
  });
})();
