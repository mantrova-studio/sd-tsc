(function () {
  // ==========================
  // СКРЫТЫЙ ДОСТУП (простая защита)
  // ==========================
  const EDIT_PARAM = "edit";
  const PIN_PARAM = "pin";
  const STORAGE_KEY = "sd_zones_editor_authed";

  // Поменяй PIN на свой
  const EDITOR_PIN = "2468";

  const qs = new URLSearchParams(location.search);

  // 1) вход только если ?edit=1
  if (qs.get(EDIT_PARAM) !== "1") {
    // чтобы случайно не нашли
    location.replace("zones.html");
    return;
  }

  // 2) простая проверка PIN: либо ?pin=..., либо prompt один раз (запомним в localStorage)
  const saved = localStorage.getItem(STORAGE_KEY) === "1";
  const pinFromUrl = qs.get(PIN_PARAM);

  if (!saved) {
    const okByUrl = pinFromUrl && pinFromUrl === EDITOR_PIN;
    if (!okByUrl) {
      const entered = prompt("PIN для редактора зон:");
      if (entered !== EDITOR_PIN) {
        alert("Неверный PIN");
        location.replace("zones.html");
        return;
      }
    }
    localStorage.setItem(STORAGE_KEY, "1");
  }

  // ==========================
  // PATHS
  // ==========================
  const FILES = {
    day: "data/zones/zones_day.geojson",
    night: "data/zones/zones_night.geojson",
  };

  // ==========================
  // UI
  // ==========================
  const backBtn = document.getElementById("backBtn");
  const drawBtn = document.getElementById("drawBtn");
  const stopBtn = document.getElementById("stopBtn");
  const editBtn = document.getElementById("editBtn");
  const delBtn = document.getElementById("delBtn");
  const exportBtn = document.getElementById("exportBtn");

  const modeSel = document.getElementById("modeSel");
  const zoneName = document.getElementById("zoneName");
  const zoneDesc = document.getElementById("zoneDesc");
  const savePropsBtn = document.getElementById("savePropsBtn");
  const importFile = document.getElementById("importFile");

  backBtn.addEventListener("click", () => location.href = "zones.html");

  // ==========================
  // MAP + STATE
  // ==========================
  let map;
  let selected = null; // ymaps.Polygon
  const polygons = []; // all polygons on map

  function selectPoly(poly) {
    if (selected && selected !== poly) {
      selected.options.set({ strokeWidth: 2, fillOpacity: 0.35 });
      selected.editor && selected.editor.stopEditing();
    }
    selected = poly;

    if (!selected) {
      zoneName.value = "";
      zoneDesc.value = "";
      return;
    }

    selected.options.set({ strokeWidth: 3, fillOpacity: 0.5 });

    const props = selected.properties.getAll() || {};
    zoneName.value = props.zone || "";
    zoneDesc.value = props.description || "";
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

  function ensureEditor(poly) {
    // editor доступен в 2.1 для Polygon
    // ничего делать не надо, но держим единый подход
    return poly;
  }

  function addPolygonFromLatLonRings(ringsLatLon, props = {}) {
    const poly = new ymaps.Polygon(ringsLatLon, props, makePolyStyle());
    ensureEditor(poly);

    poly.events.add("click", () => selectPoly(poly));
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
  // GEOJSON IMPORT/EXPORT
  // ==========================
  function latLonToLonLatRing(ringLatLon) {
    return ringLatLon.map(([lat, lon]) => [lon, lat]);
  }

  function lonLatToLatLonRing(ringLonLat) {
    return ringLonLat.map(([lon, lat]) => [lat, lon]);
  }

  function polyToFeature(poly) {
    // ymaps polygon coords: [ [ [lat,lon], ... ] , [hole...], ... ]
    const coords = poly.geometry.getCoordinates();

    // GeoJSON Polygon expects [ [ [lon,lat], ... ] , [hole...], ... ]
    const ringsLonLat = coords.map((ring) => latLonToLonLatRing(ring));

    const props = poly.properties.getAll() || {};
    return {
      type: "Feature",
      properties: {
        id: props.id || props.__id || null,
        zone: props.zone || "",
        description: props.description || "",
      },
      geometry: {
        type: "Polygon",
        coordinates: ringsLonLat,
      },
    };
  }

  function downloadJson(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/geo+json;charset=utf-8" });
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

      const props = f.properties || {};
      if (!props.id) props.id = props.__id || f.id || `f_${idx}`;

      if (g.type === "Polygon") {
        const ringsLatLon = (g.coordinates || []).map((ring) => lonLatToLatLonRing(ring));
        addPolygonFromLatLonRings(ringsLatLon, props);
      }

      if (g.type === "MultiPolygon") {
        // Разворачиваем MultiPolygon в несколько отдельных Polygon (так проще редактировать)
        (g.coordinates || []).forEach((polyCoords, mIdx) => {
          const ringsLatLon = (polyCoords || []).map((ring) => lonLatToLatLonRing(ring));
          addPolygonFromLatLonRings(ringsLatLon, { ...props, id: `${props.id}_m${mIdx}` });
        });
      }
    });

    fitToAll();
  }

  async function loadCurrentMode() {
    const mode = modeSel.value === "night" ? "night" : "day";
    const url = FILES[mode];
    const geo = await loadGeoJson(url);
    applyGeoJson(geo);
  }

  // ==========================
  // DRAW / EDIT / DELETE
  // ==========================
  let drawingPoly = null;

  function startDrawing() {
    // создаём пустой полигон и запускаем редактор рисования
    if (drawingPoly) {
      try { drawingPoly.editor.stopDrawing(); } catch (e) {}
      drawingPoly = null;
    }

    const props = { id: "new_" + Date.now(), zone: "Новая зона", description: "" };
    drawingPoly = new ymaps.Polygon([], props, makePolyStyle());
    map.geoObjects.add(drawingPoly);
    polygons.push(drawingPoly);

    selectPoly(drawingPoly);

    try {
      drawingPoly.editor.startDrawing();
    } catch (e) {
      alert("Не удалось начать рисование. Проверь, что загружен package.full.");
    }
  }

  function stopDrawing() {
    if (!drawingPoly) return;
    try {
      drawingPoly.editor.stopDrawing();
    } catch (e) {}
    drawingPoly = null;
    fitToAll();
  }

  function toggleEdit() {
    if (!selected) {
      alert("Выбери полигон (клик по зоне).");
      return;
    }
    try {
      if (selected.editor && selected.editor.state.get("editing")) {
        selected.editor.stopEditing();
      } else {
        selected.editor.startEditing();
      }
    } catch (e) {
      alert("Редактирование недоступно для этого объекта.");
    }
  }

  function deleteSelected() {
    if (!selected) return;
    const ok = confirm("Удалить выбранный полигон?");
    if (!ok) return;

    try { selected.editor && selected.editor.stopEditing(); } catch (e) {}
    map.geoObjects.remove(selected);
    const i = polygons.indexOf(selected);
    if (i >= 0) polygons.splice(i, 1);
    selectPoly(null);
  }

  function saveProps() {
    if (!selected) {
      alert("Выбери полигон (клик по зоне).");
      return;
    }
    selected.properties.set({
      ...selected.properties.getAll(),
      zone: zoneName.value.trim(),
      description: zoneDesc.value.trim(),
    });
  }

  function exportGeoJson() {
    const mode = modeSel.value === "night" ? "night" : "day";
    const features = polygons.map(polyToFeature);

    const out = {
      type: "FeatureCollection",
      features,
    };

    const filename = mode === "night" ? "zones_night.geojson" : "zones_day.geojson";
    downloadJson(filename, out);
  }

  drawBtn.addEventListener("click", startDrawing);
  stopBtn.addEventListener("click", stopDrawing);
  editBtn.addEventListener("click", toggleEdit);
  delBtn.addEventListener("click", deleteSelected);
  savePropsBtn.addEventListener("click", saveProps);
  exportBtn.addEventListener("click", exportGeoJson);

  modeSel.addEventListener("change", () => {
    const ok = confirm("Переключить режим? Несохранённые изменения будут потеряны (если не экспортировал).");
    if (!ok) return;
    loadCurrentMode().catch((e) => alert(e.message));
  });

  importFile.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const geo = JSON.parse(text);
      applyGeoJson(geo);
      alert("Импортировано. Теперь можешь править и экспортировать.");
    } catch (err) {
      alert("Не удалось импортировать: " + err.message);
    } finally {
      importFile.value = "";
    }
  });

  // ==========================
  // INIT
  // ==========================
  ymaps.ready(async () => {
    map = new ymaps.Map("map", {
      center: [51.7682, 55.0968], // Оренбург
      zoom: 11,
      controls: ["zoomControl"],
    });

    // клик по пустой карте снимает выделение
    map.events.add("click", () => selectPoly(null));

    // по умолчанию day
    modeSel.value = "day";
    try {
      await loadCurrentMode();
    } catch (e) {
      alert(e.message);
    }
  });
})();
