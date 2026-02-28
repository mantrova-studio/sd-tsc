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
  const mapEl = document.getElementById("map");

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

  if (!mapEl || !addrInput || !clearAddr || !zoneInfo) {
    console.error("zones: не найден #map или элементы UI (проверь zones.html)");
    return;
  }

  let map;
  let placemark = null;

  // geojson + polygons
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

  function applyPoint(lat, lon) {
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

      polys.forEach((f, idx) => {
        const id = getFeatureId(f, idx);
        const g = f.geometry;

        if (g.type === "Polygon") {
          const contours = g.coordinates.map((ring) => ring.map(([lon, lat]) => [lat, lon]));
          const poly = new ymaps.Polygon(contours, { __featureId: id }, polygonStyleDefault());

          poly.events.add("click", () => {
            resetHighlight();
            poly.options.set(polygonStyleActive());
            showZone(f.properties || {});
          });

          map.geoObjects.add(poly);
          polyById.set(id, poly);
          return;
        }

        if (g.type === "MultiPolygon") {
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
        }
      });

      const bounds = map.geoObjects.getBounds();
      if (bounds) map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 20 });
    } catch (e) {
      console.error("zones: ошибка загрузки GeoJSON", e);
      showInfo(`<b>Ошибка загрузки зон</b>`);
    }
  }

  // =========================================================
  // ПОИСК: выпадающие подсказки (свои) через геокодер Яндекса
  // Сначала Оренбург, ниже Оренбургский район
  // =========================================================

  let dd = null;

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function ensureDd() {
    if (dd) return dd;

    dd = document.createElement("div");
    dd.style.position = "absolute";
    dd.style.zIndex = "999999";
    dd.style.background = "rgba(15,18,25,0.92)";
    dd.style.border = "1px solid rgba(255,255,255,0.08)";
    dd.style.borderRadius = "12px";
    dd.style.backdropFilter = "blur(10px)";
    dd.style.padding = "6px";
    dd.style.display = "none";
    dd.style.maxHeight = "260px";
    dd.style.overflow = "auto";
    dd.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";
    document.body.appendChild(dd);
    return dd;
  }

  function positionDd() {
    const box = ensureDd();
    const r = addrInput.getBoundingClientRect();
    box.style.left = Math.round(r.left + window.scrollX) + "px";
    box.style.top = Math.round(r.bottom + window.scrollY + 8) + "px";
    box.style.width = Math.round(r.width) + "px";
  }

  function hideDd() {
    if (!dd) return;
    dd.style.display = "none";
    dd.innerHTML = "";
  }

  function renderDd(items) {
    const box = ensureDd();
    positionDd();
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
        addrInput.value = it.title;
        hideDd();
        applyPoint(it.lat, it.lon);
      });

      box.appendChild(row);
    });

    box.style.display = items.length ? "block" : "none";
  }

  function shortAddressLine(line) {
    if (!line) return "";
    return String(line).replace(/^Россия,\s*/i, "");
  }

  function geocodeList(query, limit = 7) {
    return ymaps.geocode(query, { results: limit }).then((res) => {
      const items = [];
      res.geoObjects.each((obj) => {
        const coords = obj.geometry?.getCoordinates?.();
        if (!coords) return;
        const [lat, lon] = coords;

        const line = shortAddressLine(
          (obj.getAddressLine && obj.getAddressLine()) ||
            obj.properties?.get?.("text") ||
            obj.properties?.get?.("name") ||
            ""
        );

        const name = obj.properties?.get?.("name") || "";
        const desc = obj.properties?.get?.("description") || "";

        const title = shortAddressLine(name || line || "");
        const sub = shortAddressLine(desc || line || "");

        if (title) items.push({ title, sub, lat, lon });
      });

      // убираем дубли по title
      const seen = new Set();
      return items.filter((it) => {
        const k = it.title.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    });
  }

  function isInsideOrenburgCity(item) {
    const t = (item.sub || item.title || "").toLowerCase();
    const hasOrenburg = t.includes("оренбург");
    const isVillage =
      t.includes("посел") || t.includes("село") || t.includes("хутор") || t.includes("деревн");
    const isDistrict = t.includes("оренбургский район");
    return hasOrenburg && !isVillage && !isDistrict;
  }

  function initSearch() {
    clearAddr.style.display = "none";

    clearAddr.addEventListener("click", () => {
      addrInput.value = "";
      clearAddr.style.display = "none";
      hideInfo();
      hideDd();
      resetHighlight();
      if (placemark) map.geoObjects.remove(placemark);
      placemark = null;
    });

    document.addEventListener("click", (e) => {
      if (e.target === addrInput) return;
      if (dd && dd.contains(e.target)) return;
      hideDd();
    });

    window.addEventListener("resize", () => {
      if (dd && dd.style.display === "block") positionDd();
    });

    let t = null;
    let reqId = 0;

    addrInput.addEventListener("input", () => {
      const q = addrInput.value.trim();
      clearAddr.style.display = q ? "block" : "none";

      hideInfo();
      resetHighlight();

      if (!q) {
        hideDd();
        return;
      }
      if (q.length < 3) {
        hideDd();
        return;
      }

      if (t) clearTimeout(t);
      t = setTimeout(() => {
        const my = ++reqId;

        const qCity = q + ", Оренбург";
        const qDistrict = q + ", Оренбургский район";

        Promise.allSettled([geocodeList(qCity, 7), geocodeList(qDistrict, 7)])
          .then((results) => {
            if (my !== reqId) return;

            const city = results[0].status === "fulfilled" ? results[0].value : [];
            const district = results[1].status === "fulfilled" ? results[1].value : [];

            const cityFiltered = city.filter(isInsideOrenburgCity);
            const finalCity = cityFiltered.length ? cityFiltered : city;

            const merged = [];
            const seen = new Set();

            function pushList(list) {
              list.forEach((it) => {
                const k = (it.title + "|" + it.sub).toLowerCase();
                if (seen.has(k)) return;
                seen.add(k);
                merged.push(it);
              });
            }

            pushList(finalCity);
            pushList(district);

            renderDd(merged.slice(0, 10));
          })
          .catch(() => hideDd());
      }, 250);
    });

    // Enter: сначала Оренбург, потом район
    addrInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();

      const q = addrInput.value.trim();
      if (!q) return;

      hideDd();

      const qCity = q + ", Оренбург";
      const qDistrict = q + ", Оренбургский район";

      ymaps
        .geocode(qCity, { results: 1 })
        .then((res) => {
          const obj = res.geoObjects.get(0);
          if (obj) {
            const [lat, lon] = obj.geometry.getCoordinates();
            applyPoint(lat, lon);
            return true;
          }
          return false;
        })
        .then((ok) => {
          if (ok) return;

          return ymaps.geocode(qDistrict, { results: 1 }).then((res2) => {
            const obj2 = res2.geoObjects.get(0);
            if (!obj2) {
              showInfo(`<b>Адрес не найден</b>`);
              return;
            }
            const [lat, lon] = obj2.geometry.getCoordinates();
            applyPoint(lat, lon);
          });
        })
        .catch(() => {
          showInfo(`<b>Ошибка поиска</b>`);
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
