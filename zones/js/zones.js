(function () {
  // ====== ПАРАМЕТРЫ ======
  const mode = new URLSearchParams(location.search).get("mode");

  const GEOJSON_URL =
    mode === "night"
      ? "/zones/data/zones/zones_night.geojson"
      : "/zones/data/zones/zones_day.geojson";

  // Центр по умолчанию (Оренбург)
  const DEFAULT_CENTER = [51.7682, 55.0968]; // [lat, lon]
  const DEFAULT_ZOOM = 11;
  const CITY_HINT = "Оренбург";

  // ====== UI ======
  const backBtn = document.getElementById("backBtn");
  const addrInput = document.getElementById("addrInput");
  const clearAddr = document.getElementById("clearAddr");
  const zoneInfo = document.getElementById("zoneInfo");

  function showInfo(html) {
    zoneInfo.innerHTML = html;
    zoneInfo.style.display = "block";
  }

  backBtn.addEventListener("click", () => {
    if (history.length > 1) history.back();
    else location.href = "index.html";
  });

  clearAddr.style.display = "none";
  clearAddr.addEventListener("click", () => {
    addrInput.value = "";
    clearAddr.style.display = "none";
    zoneInfo.style.display = "none";
    removeMarker();
    resetHighlight();
  });

  // ====== ЯНДЕКС КАРТА ======
  let map = null;
  let zonesGeo = null;
  let polygonObjects = []; // ymaps.GeoObject (Polygon / MultiPolygon)
  let marker = null;

  function resetHighlight() {
    if (!polygonObjects.length) return;
    polygonObjects.forEach((obj) => {
      obj.options.set({
        strokeWidth: 2,
        strokeColor: "#2b3a55",
        fillColor: "#1e2a42",
        fillOpacity: 0.35,
        opacity: 1,
      });
    });
  }

  function highlight(obj) {
    resetHighlight();
    obj.options.set({
      strokeWidth: 3,
      strokeColor: "#3f5b87",
      fillColor: "#243654",
      fillOpacity: 0.5,
    });
  }

  function showZone(p) {
    const zoneName = p.zone || p.Name || p.name || "Зона";
    const description = p.description || p.note || "";
    const title = `${zoneName} (${mode === "night" ? "Ночь" : "День"})`;

    showInfo(`
      <div style="font-size:16px;font-weight:700;margin-bottom:8px;">${title}</div>
      <div style="opacity:.85;line-height:1.5;">${description}</div>
    `);
  }

  function setMarker(coords) {
    removeMarker();
    marker = new ymaps.Placemark(coords, {}, { zIndex: 10000 });
    map.geoObjects.add(marker);
    map.setCenter(coords, Math.max(map.getZoom(), 14), { duration: 250 });
  }

  function removeMarker() {
    if (marker && map) {
      map.geoObjects.remove(marker);
    }
    marker = null;
  }

  // ====== ПОИСК ЗОНЫ (Turf) ======
  function findZoneForPoint(lat, lon) {
    if (!zonesGeo) return null;
    const pt = turf.point([lon, lat]); // Turf: [lon, lat]

    for (const f of zonesGeo.features || []) {
      const t = f?.geometry?.type;
      if (t !== "Polygon" && t !== "MultiPolygon") continue;
      try {
        if (turf.booleanPointInPolygon(pt, f)) return f;
      } catch {
        // ignore
      }
    }
    return null;
  }

  async function loadZones() {
    try {
      const res = await fetch(GEOJSON_URL, { cache: "no-store" });
      if (!res.ok) return;
      zonesGeo = await res.json();

      // Создаём объекты на карте из GeoJSON
      const q = ymaps.geoQuery(zonesGeo).addToMap(map);

      // Оставляем только полигоны
      polygonObjects = q
        .search('geometry.type = "Polygon" || geometry.type = "MultiPolygon"')
        .get();

      resetHighlight();

      // Клик по зоне
      polygonObjects.forEach((obj) => {
        obj.events.add("click", () => {
          highlight(obj);
          const props = obj.properties.getAll() || {};
          showZone(props);
        });
      });

      // Подогнать границы
      try {
        const bounds = q.getBounds();
        if (bounds) map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 24 });
      } catch {
        // ignore
      }
    } catch {
      // ignore
    }
  }

  function ensureCityHint(q) {
    const s = (q || "").trim();
    if (!s) return "";
    if (/оренбург/i.test(s)) return s;
    return `${s}, ${CITY_HINT}`;
  }

  async function handleAddress(value) {
    const query = ensureCityHint(value);
    if (!query) return;

    clearAddr.style.display = "block";

    try {
      const res = await ymaps.geocode(query, { results: 1 });
      const first = res.geoObjects.get(0);
      if (!first) return;

      const coords = first.geometry.getCoordinates(); // [lat, lon]
      setMarker(coords);

      const z = findZoneForPoint(coords[0], coords[1]);
      if (z) {
        // Попробуем подсветить соответствующий полигон по названию
        const zp = z.properties || {};
        const b = (zp.zone || zp.Name || zp.name || "").toString().trim();

        if (b) {
          const match = polygonObjects.find((obj) => {
            const props = obj.properties.getAll() || {};
            const a = (props.zone || props.Name || props.name || "").toString().trim();
            return a === b;
          });
          if (match) highlight(match);
        }

        showZone(zp);
      } else {
        resetHighlight();
        showInfo(`
          <div><b>Адрес вне зон доставки</b></div>
          <div class="muted">Проверь адрес или добавь зону.</div>
        `);
      }
    } catch {
      // ignore
    }
  }

  function initSuggest() {
    // Автоподсказки от Яндекс.Карт
    const sv = new ymaps.SuggestView("addrInput", { results: 7 });

    sv.events.add("select", (e) => {
      const item = e.get("item");
      const value = item?.value || addrInput.value;
      addrInput.value = value;
      handleAddress(value);
    });

    // Enter
    addrInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleAddress(addrInput.value);
      }
    });

    // Показ/скрытие крестика
    addrInput.addEventListener("input", () => {
      const q = addrInput.value.trim();
      clearAddr.style.display = q ? "block" : "none";
      if (!q) {
        zoneInfo.style.display = "none";
        removeMarker();
        resetHighlight();
      }
    });
  }

  function initMap() {
    if (!window.ymaps) {
      showInfo(
        `<div><b>Не загружена Яндекс.Карта</b></div><div class="muted">Проверь API-ключ в zones.html</div>`
      );
      return;
    }

    map = new ymaps.Map(
      "map",
      {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        controls: ["zoomControl"],
      },
      {
        suppressMapOpenBlock: true,
      }
    );

    initSuggest();
    loadZones();
  }

  ymaps.ready(initMap);
})();
