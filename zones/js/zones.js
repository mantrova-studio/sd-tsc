(function () {
  const qs = new URLSearchParams(location.search);
  const mode = qs.get("mode"); // "night" => ночь, иначе день

  // относительный путь (работает и на Pages, и на домене)
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

  // ====== SAFETY: если DOM не тот, не падаем ======
  const mapEl = document.getElementById("map");
  if (!mapEl || !addrInput || !clearAddr || !zoneInfo) {
    console.error("zones: не найден #map или элементы UI (проверь zones.html)");
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
        showInfo(`<b>Не удалось загрузить зоны</b><div class="muted">${GEOJSON_URL}</div>`);
        return;
      }
      zonesGeo = await res.json();

      const polys = (zonesGeo.features || []).filter(
        (f) => f?.geometry?.type === "Polygon" || f?.geometry?.type === "MultiPolygon"
      );

      if (!polys.length) {
        console.warn("zones: в GeoJSON нет полигонов");
        showInfo(`<b>В файле зон нет полигонов</b>`);
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
          // MultiPolygon рисуем как несколько Polygon
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
      showInfo(`<b>Ошибка загрузки зон</b>`);
    }
  }

  // =========================================================
  // ПОИСК: бесплатный и стабильный (OSM Nominatim)
  // Карта остаётся Яндекс, но адреса ищем через OpenStreetMap.
  // =========================================================
  let suggestBox = null;

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function ensureSuggestBox() {
    if (suggestBox) return suggestBox;

    suggestBox = document.createElement("div");
    suggestBox.style.position = "absolute";
    suggestBox.style.zIndex = "9999";
    suggestBox.style.background = "rgba(15,18,25,0.92)";
    suggestBox.style.border = "1px solid rgba(255,255,255,0.08)";
    suggestBox.style.borderRadius = "12px";
    suggestBox.style.backdropFilter = "blur(10px)";
    suggestBox.style.padding = "6px";
    suggestBox.style.display = "none";
    suggestBox.style.maxHeight = "260px";
    suggestBox.style.overflow = "auto";
    suggestBox.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";

    document.body.appendChild(suggestBox);
    return suggestBox;
  }

  function positionSuggestBox() {
    const box = ensureSuggestBox();
    const r = addrInput.getBoundingClientRect();
    box.style.left = Math.round(r.left + window.scrollX) + "px";
    box.style.top = Math.round(r.bottom + window.scrollY + 8) + "px";
    box.style.width = Math.round(r.width) + "px";
  }

  function hideSuggestBox() {
    if (!suggestBox) return;
    suggestBox.style.display = "none";
    suggestBox.innerHTML = "";
  }

  function renderSuggest(items) {
    const box = ensureSuggestBox();
    positionSuggestBox();
    box.innerHTML = "";

    items.forEach((it) => {
      const row = document.createElement("button");
      row.type = "button";
      row.style.width = "100%";
      row.style.textAlign = "left";
      row.style.border = "0";
      row.style.cursor = "pointer";
      row.style.background = "transparent";
      row.style.color = "rgba(255,255,255,0.92)";
      row.style.padding = "10px 10px";
      row.style.borderRadius = "10px";
      row.style.fontSize = "14px";
      row.style.lineHeight = "1.35";

      row.addEventListener("mouseenter", () => {
        row.style.background = "rgba(255,255,255,0.06)";
      });
      row.addEventListener("mouseleave", () => {
        row.style.background = "transparent";
      });

      row.innerHTML = `
        <div style="font-weight:600;margin-bottom:2px;">${escapeHtml(it.title)}</div>
        <div style="opacity:.75;font-size:12px;">${escapeHtml(it.sub)}</div>
      `;

      row.addEventListener("click", () => {
        addrInput.value = it.label;
        hideSuggestBox();
        handlePoint(it.lat, it.lon);
      });

      box.appendChild(row);
    });

    box.style.display = items.length ? "block" : "none";
  }

  async function nominatimSearch(query) {
  // Прямоугольник вокруг Оренбурга + район (lon1,lat1,lon2,lat2)
  // запад/юг/восток/север — с запасом
  const viewbox = [54.85, 51.65, 55.35, 52.05].join(",");

  const url =
    "https://nominatim.openstreetmap.org/search" +
    "?format=jsonv2" +
    "&addressdetails=1" +
    "&limit=10" +
    "&countrycodes=ru" +
    "&bounded=1" +
    "&viewbox=" + encodeURIComponent(viewbox) +
    "&q=" + encodeURIComponent(query);

  const res = await fetch(url, {
    headers: { "Accept-Language": "ru" },
  });

  if (!res.ok) throw new Error("OSM search failed: " + res.status);
  return await res.json();
  }

  function handlePoint(lat, lon) {
    setPlacemark(lat, lon);

    const found = findZoneForPoint(lat, lon);
    if (!found) {
      showInfo(`<div><b>Адрес вне зон доставки</b></div>`);
      resetHighlight();
      return;
    }

    showZone(found.feature.properties || {});
    resetHighlight();

    const id = getFeatureId(found.feature, found.index);
    for (const [k, poly] of polyById.entries()) {
      if (k === id || k.startsWith(id + "_")) poly.options.set(polygonStyleActive());
    }
  }

  function initSearch() {
    clearAddr.style.display = "none";

    // очистка
    clearAddr.addEventListener("click", () => {
      addrInput.value = "";
      clearAddr.style.display = "none";
      hideInfo();
      hideSuggestBox();
      resetHighlight();
      if (placemark) map.geoObjects.remove(placemark);
      placemark = null;
    });

    // закрывать подсказки при клике вне
    document.addEventListener("click", (e) => {
      if (e.target === addrInput) return;
      if (suggestBox && suggestBox.contains(e.target)) return;
      hideSuggestBox();
    });

    window.addEventListener("resize", () => {
      if (suggestBox && suggestBox.style.display === "block") positionSuggestBox();
    });

    // debounce
    let t = null;
    let lastQ = "";
    let reqId = 0;

    addrInput.addEventListener("input", () => {
      const q = addrInput.value.trim();
      clearAddr.style.display = q ? "block" : "none";
      hideInfo();
      resetHighlight();

      if (!q) {
        hideSuggestBox();
        return;
      }

      if (t) clearTimeout(t);
      t = setTimeout(async () => {
        const my = ++reqId;
        lastQ = q;

        try {
          const data = await nominatimSearch(q);
          if (my !== reqId || addrInput.value.trim() !== lastQ) return;

          const items = (data || []).map((d) => {
            const lat = Number(d.lat);
            const lon = Number(d.lon);

            const road = d.address?.road || d.address?.pedestrian || d.address?.footway || "";
            const house = d.address?.house_number || "";
            const title = (road ? road : d.display_name.split(",")[0]) + (house ? " " + house : "");
            const sub = d.display_name;

            return {
              label: title || d.display_name,
              title: title || d.display_name,
              sub,
              lat,
              lon,
            };
          });

          renderSuggest(items);
        } catch (e) {
          console.warn("OSM search error", e);
          hideSuggestBox();
        }
      }, 250);
    });

    // Enter = берём первый вариант из списка (если есть)
    addrInput.addEventListener("keydown", async (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();

      const q = addrInput.value.trim();
      if (!q) return;

      try {
        const data = await nominatimSearch(q);
        const first = data?.[0];
        if (!first) {
          showInfo(`<b>Адрес не найден</b>`);
          return;
        }
        handlePoint(Number(first.lat), Number(first.lon));
        hideSuggestBox();
      } catch (err) {
        console.error(err);
        showInfo(`<b>Ошибка поиска</b><div class="muted">Попробуй другой адрес.</div>`);
      }
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
