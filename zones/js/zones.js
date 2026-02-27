(function () {
  const qs = new URLSearchParams(location.search);
  const mode = qs.get("mode");

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

  const mapEl = document.getElementById("map");
  if (!mapEl || !addrInput || !clearAddr || !zoneInfo) {
    console.error("zones: не найден #map или элементы UI");
    return;
  }

  let map;
  let placemark = null;
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
    for (const poly of polyById.values()) {
      poly.options.set(polygonStyleDefault());
    }
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

    if (placemark) {
      map.geoObjects.remove(placemark);
    }

    placemark = new ymaps.Placemark(coords, {}, {
      preset: "islands#redDotIcon"
    });

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
        if (turf.booleanPointInPolygon(pt, f)) {
          return { feature: f, index: i };
        }
      } catch (e) {}
    }

    return null;
  }

  async function loadZones() {
    try {
      const res = await fetch(GEOJSON_URL, { cache: "no-store" });

      if (!res.ok) {
        showInfo(`<b>Не удалось загрузить зоны</b>`);
        return;
      }

      zonesGeo = await res.json();

      const polys = (zonesGeo.features || []).filter(
        f => f?.geometry?.type === "Polygon" || f?.geometry?.type === "MultiPolygon"
      );

      polys.forEach((f, idx) => {
        const id = getFeatureId(f, idx);
        const g = f.geometry;

        if (g.type === "Polygon") {
          const contours = g.coordinates.map(ring =>
            ring.map(([lon, lat]) => [lat, lon])
          );

          const poly = new ymaps.Polygon(contours, {}, polygonStyleDefault());

          poly.events.add("click", () => {
            resetHighlight();
            poly.options.set(polygonStyleActive());
            showZone(f.properties || {});
          });

          map.geoObjects.add(poly);
          polyById.set(id, poly);
        }

        if (g.type === "MultiPolygon") {
          g.coordinates.forEach((polyCoords, mIdx) => {
            const mpId = `${id}_${mIdx}`;
            const rings = polyCoords.map(ring =>
              ring.map(([lon, lat]) => [lat, lon])
            );

            const poly = new ymaps.Polygon(rings, {}, polygonStyleDefault());

            poly.events.add("click", () => {
              resetHighlight();
              poly.options.set(polygonStyleActive());
              showZone(f.properties || {});
            });

            map.geoObjects.add(poly);
            polyById.set(mpId, poly);
          });
        }
      });

      const bounds = map.geoObjects.getBounds();
      if (bounds) {
        map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 20 });
      }

    } catch (e) {
      showInfo(`<b>Ошибка загрузки зон</b>`);
    }
  }

  // =========================================
  // 🔥 ПОИСК ЧЕРЕЗ ЯНДЕКС
  // =========================================

  function initSearch() {

    clearAddr.style.display = "none";

    // автоподсказки Яндекса
    new ymaps.SuggestView("addrInput", {
      results: 7
    });

    clearAddr.addEventListener("click", () => {
      addrInput.value = "";
      clearAddr.style.display = "none";
      hideInfo();
      resetHighlight();
      if (placemark) map.geoObjects.remove(placemark);
      placemark = null;
    });

    addrInput.addEventListener("input", () => {
      clearAddr.style.display = addrInput.value.trim() ? "block" : "none";
    });

    addrInput.addEventListener("keydown", function (e) {

      if (e.key !== "Enter") return;
      e.preventDefault();

      const q = addrInput.value.trim();
      if (!q) return;

      const searchQuery = q + ", Оренбургский район";

      ymaps.geocode(searchQuery, { results: 1 })
        .then(function (res) {

          const obj = res.geoObjects.get(0);

          if (!obj) {
            showInfo(`<b>Адрес не найден</b>`);
            return;
          }

          const coords = obj.geometry.getCoordinates();
          const [lat, lon] = coords;

          setPlacemark(lat, lon);

          const found = findZoneForPoint(lat, lon);

          if (!found) {
            showInfo(`<b>Адрес вне зон доставки</b>`);
            resetHighlight();
            return;
          }

          showZone(found.feature.properties || {});
          resetHighlight();

        })
        .catch(function () {
          showInfo(`<b>Ошибка поиска</b>`);
        });
    });
  }

  ymaps.ready(async () => {
    map = new ymaps.Map("map", {
      center: [51.7682, 55.0968],
      zoom: 11,
      controls: ["zoomControl"],
    });

    initSearch();
    await loadZones();
  });

})();
