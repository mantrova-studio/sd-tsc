(function () {
  const dbg2 = (t) => {
    const el = document.getElementById("dbg2");
    if (el) el.textContent = "DBG2: " + t;
  };

  const mode = new URLSearchParams(location.search).get("mode") || "day";
  const GEOJSON_URL =
    mode === "night"
      ? "data/zones/zones_night.geojson"
      : "data/zones/zones_day.geojson";

  const CITY_HINT = "Оренбург, Россия";
  const NOMINATIM_COUNTRY = "ru";

  // элементы
  const backBtn = document.getElementById("backBtn");
  const addrInput = document.getElementById("addrInput");
  const clearAddr = document.getElementById("clearAddr");
  const suggest = document.getElementById("addrSuggest");
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
    suggest.style.display = "none";
    zoneInfo.style.display = "none";
  });

  // карта
  const mapEl = document.getElementById("map");
  if (!mapEl) {
    dbg2("нет #map");
    return;
  }

  const map = L.map("map", { zoomControl: true });
  const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
  });
  tiles.on("load", () => dbg2("tiles loaded ✅"));
  tiles.on("tileerror", () => dbg2("tile error ❌"));
  tiles.addTo(map);

  // важно для мобилок
  setTimeout(() => map.invalidateSize(true), 300);
  setTimeout(() => map.invalidateSize(true), 900);

  let zonesGeo = null;
  let zonesLayer = null;
  let marker = null;

  function zoneStyle() {
    return { weight: 2, opacity: 1, fillOpacity: 0.25 };
  }

  function highlightLayer(layer) {
    if (!zonesLayer) return;
    zonesLayer.eachLayer((l) => zonesLayer.resetStyle(l));
    layer.setStyle({ weight: 3, fillOpacity: 0.35 });
  }

  function showZone(p) {
    const zone = p.zone || p.Name || p.name || "Зона";
    const price = p.delivery_price ?? "—";
    const min = p.min_order ?? "—";

    showInfo(`
      <div><b>${zone}</b> <span class="muted">(${mode === "night" ? "Ночь" : "День"})</span></div>
      <div>Стоимость доставки: <b>${price}</b> ₽</div>
      <div>Минимальная сумма заказа: <b>${min}</b> ₽</div>
    `);
  }

  function setMarker(lat, lon) {
    if (marker) marker.remove();
    marker = L.marker([lat, lon]).addTo(map);
    map.setView([lat, lon], Math.max(map.getZoom(), 14));
  }

  function findZoneForPoint(lat, lon) {
    if (!zonesGeo) return null;
    const pt = turf.point([lon, lat]);

    for (const f of zonesGeo.features || []) {
      const t = f?.geometry?.type;
      if (t !== "Polygon" && t !== "MultiPolygon") continue;
      try {
        if (turf.booleanPointInPolygon(pt, f)) return f;
      } catch (e) {}
    }
    return null;
  }

  async function loadZones() {
    try {
      dbg2("loading zones…");
      const res = await fetch(GEOJSON_URL, { cache: "no-store" });
      dbg2("zones HTTP " + res.status);

      if (!res.ok) {
        showInfo(`<div><b>Не удалось загрузить зоны</b></div><div class="muted">${GEOJSON_URL} — HTTP ${res.status}</div>`);
        return;
      }

      zonesGeo = await res.json();

      const onlyPolys = {
        type: "FeatureCollection",
        features: (zonesGeo.features || []).filter(
          (f) => f?.geometry?.type === "Polygon" || f?.geometry?.type === "MultiPolygon"
        ),
      };

      if (zonesLayer) zonesLayer.remove();

      zonesLayer = L.geoJSON(onlyPolys, {
        style: zoneStyle,
        onEachFeature: (feature, layer) => {
          layer.on("click", () => {
            highlightLayer(layer);
            showZone(feature.properties || {});
          });
        },
      }).addTo(map);

      if (onlyPolys.features.length) {
        map.fitBounds(zonesLayer.getBounds(), { padding: [20, 20] });
        dbg2("zones drawn ✅ (" + onlyPolys.features.length + ")");
      } else {
        dbg2("no polygons");
        showInfo(`<div><b>В GeoJSON нет полигонов</b></div><div class="muted">Проверь экспорт зон.</div>`);
      }

      // пересчёт размеров после добавления слоёв
      setTimeout(() => map.invalidateSize(true), 300);
      setTimeout(() => map.invalidateSize(true), 900);
    } catch (e) {
      dbg2("zones error");
      showInfo(`<div><b>Ошибка</b></div><div class="muted">${String(e?.message || e)}</div>`);
    }
  }

  // подсказки адресов
  let tmr = null;

  async function fetchSuggest(q) {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "7");
    url.searchParams.set("countrycodes", NOMINATIM_COUNTRY);
    url.searchParams.set("q", `${q}, ${CITY_HINT}`);

    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    return await res.json();
  }

  function renderSuggest(list) {
