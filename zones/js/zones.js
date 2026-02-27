(function () {
  const qs = new URLSearchParams(location.search);
  const mode = qs.get("mode"); // "night" => ночь, иначе день

  // ВАЖНО: относительный путь (работает и на Pages, и на домене)
  const GEOJSON_URL =
    mode === "night"
      ? "data/zones/zones_night.geojson"
      : "data/zones/zones_day.geojson";

  const backBtn = document.getElementById("backBtn");
  const addrInput = document.getElementById("addrInput");
  const clearAddr = document.getElementById("clearAddr");
  const zoneInfo = document.getElementById("zoneInfo");

  function showInfo(html) {
    zoneInfo.innerHTML = html;
    zoneInfo.style.display = "block";
  }
  function hideInfo() {
    zoneInfo.style.display = "none";
  }

  backBtn?.addEventListener("click", () => {
    if (history.length > 1) history.back();
    else location.href = "index.html";
  });

  clearAddr.style.display = "none";
  clearAddr.addEventListener("click", () => {
    addrInput.value = "";
    clearAddr.style.display = "none";
    hideInfo();
    if (placemark) map.geoObjects.remove(placemark);
    placemark = null;
  });

  // ====== SAFETY: если DOM не тот, не падаем ======
  const mapEl = document.getElementById("map");
  if (!mapEl || !addrInput) {
    console.error("zones: не найден #map или #addrInput (проверь zones.html)");
    return;
  }

  let map;
  let placemark = null;

  // хранение: geojson + соответствие featureId -> ymaps polygon
  let zonesGeo = null;
  const polyById = new Map();

  function getFeatureId(f, idx) {
    return f.id ?? f.properties?.id ?? `f_${idx}`;
  }

  function polygonStyleDefault() {
    return {
      fillColor: "#1e2a42",
      strokeColor: "#2b3a55",
      opacity: 1,
      strokeWidth: 2,
      fillOpacity: 0.35,
    };
  }

  function polygonStyleActive() {
    return {
      fillColor: "#243654",
      strokeColor: "#3f5b87",
      opacity: 1,
      strokeWidth: 3,
      fillOpacity: 0.5,
    };
  }

  function resetHighlight() {
    for (const poly of polyById.values()) poly.options.set(polygonStyleDefault());
  }

  function showZone(props = {}) {
    const zoneName = props.zone || props.Name || props.name || "Зона";
    const description = props.description || props.note || "";
    const title = `${zoneName} (${mode === "night" ? "Ночь" : "День"})`;

    showInfo(`
      <div style="font-size:16px;font-weight:700;margin-bottom:8px;">${title}</div>
      <div style="opacity:.85;line-height:1.5;">${description}</div>
    `);
  }

  function setPlacemark(lat, lon) {
    const coords = [lat, lon];
    if (placemark) map.geoObjects.remove(placemark);

    placemark = new ymaps.Placemark(coords, {}, { preset: "islands#redDotIcon" });
    map.geoObjects.add(placemark);

    map.setCenter(coords, Math.max(map.getZoom(), 14), { duration: 200 });
  }

  function findZoneForPoint(lat, lon) {
    if (!zonesGeo?.features?.length) return null;
    const pt = turf.point([lon, lat]);

    for (let i = 0; i < zonesGeo.features.length; i++) {
      const f = zonesGeo.features[i];
      const t = f?.geometry?.type;
      if (t !== "Polygon" && t !== "MultiPolygon") continue;
      try {
        if (turf.booleanPointInPolygon(pt, f)) return { feature: f, index: i };
      } catch (e) {}
    }
    return null;
  }

  async function loadZones() {
    try {
      const res = await fetch(GEOJSON_URL, { cache: "no-store" });
      if (!res.ok) {
        console.warn("zones: GeoJSON не найден:", GEOJSON_URL, res.status);
        return;
      }
      zonesGeo = await res.json();

      const polys = (zonesGeo.features || []).filter(
        (f) => f?.geometry?.type === "Polygon" || f?.geometry?.type === "MultiPolygon"
      );

      if (!polys.length) {
        console.warn("zones: в GeoJSON нет полигонов");
        return;
      }

      // Рисуем полигоны. У GeoJSON координаты [lon,lat], у ymaps нужны [lat,lon]
      polys.forEach((f, idx) => {
        const id = getFeatureId(f, idx);

        const g = f.geometry;
        let contours = [];

        if (g.type === "Polygon") {
          contours = g.coordinates.map((ring) => ring.map(([lon, lat]) => [lat, lon]));
        } else if (g.type === "MultiPolygon") {
          // берём все полигоны: каждый полигон — массив колец
          // ymaps.Polygon принимает "контуры" как массив колец,
          // поэтому MultiPolygon рисуем как несколько Polygon
          g.coordinates.forEach((polyCoords, mIdx) => {
            const mpId = `${id}_m${mIdx}`;
            const rings = polyCoords.map((ring) => ring.map(([lon, lat]) => [lat, lon]));
            const poly = new ymaps.Polygon(rings, { __featureId: id }, polygonStyleDefault());
            poly.events.add("click", () => {
              resetHighlight();
              poly.options.set(polygonStyleActive());
              showZone(f.properties || {});
            });
            map.geoObjects.add(poly);
            polyById.set(mpId, poly);
          });
          return;
        }

        const poly = new ymaps.Polygon(contours, { __featureId: id }, polygonStyleDefault());
        poly.events.add("click", () => {
          resetHighlight();
          poly.options.set(polygonStyleActive());
          showZone(f.properties || {});
        });

        map.geoObjects.add(poly);
        polyById.set(id, poly);
      });

      // авто-центрирование по зонам
      const bounds = map.geoObjects.getBounds();
      if (bounds) map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 20 });
    } catch (e) {
      console.error("zones: ошибка загрузки GeoJSON", e);
    }
  }

 function initSearch() {

  const suggestView = new ymaps.SuggestView('addrInput');

  suggestView.events.add('select', function (e) {

    const value = e.get('item').value;

    ymaps.geocode(value, { results: 1 }).then(function (res) {

      const obj = res.geoObjects.get(0);
      if (!obj) return;

      const coords = obj.geometry.getCoordinates();
      const [lat, lon] = coords;

      setPlacemark(lat, lon);

      const found = findZoneForPoint(lat, lon);

      if (!found) {
        showInfo(`<b>Адрес вне зон доставки</b>`);
        resetHighlight();
        return;
      }

      const props = found.feature.properties || {};
      showZone(props);

      resetHighlight();
      const id = getFeatureId(found.feature, found.index);

      for (const [k, poly] of polyById.entries()) {
        if (k === id || k.startsWith(id + "_")) {
          poly.options.set(polygonStyleActive());
        }
      }

    });

  });

}

  ymaps.ready(async () => {
    map = new ymaps.Map("map", {
      center: [51.7682, 55.0968], // Оренбург
      zoom: 11,
      controls: ["zoomControl"],
    });

    initSearch();
    await loadZones();
  });
})();
