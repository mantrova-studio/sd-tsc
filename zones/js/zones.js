(function () {
  const mode = new URLSearchParams(location.search).get("mode");

  const GEOJSON_URL =
    mode === "night"
      ? "/zones/data/zones/zones_night.geojson"
      : "/zones/data/zones/zones_day.geojson";

  const CITY_HINT = "Оренбург, Россия";

  const backBtn = document.getElementById("backBtn");
  const addrInput = document.getElementById("addrInput");
  const clearAddr = document.getElementById("clearAddr");
  const suggest = document.getElementById("addrSuggest"); // в этом варианте не используем, но не мешает
  const zoneInfo = document.getElementById("zoneInfo");

  function showInfo(html) {
    zoneInfo.innerHTML = html;
    zoneInfo.style.display = "block";
  }

  function hideInfo() {
    zoneInfo.style.display = "none";
    zoneInfo.innerHTML = "";
  }

  backBtn.addEventListener("click", () => {
    if (history.length > 1) history.back();
    else location.href = "/"; // если у тебя другая главная — поменяй
  });

  clearAddr.style.display = "none";
  clearAddr.addEventListener("click", () => {
    addrInput.value = "";
    clearAddr.style.display = "none";
    if (suggest) suggest.style.display = "none";
    hideInfo();
    if (marker && map) {
      map.geoObjects.remove(marker);
      marker = null;
    }
    unhighlightAll();
  });

  // ===== YANDEX MAP =====
  let map = null;
  let marker = null;

  /** @type {ymaps.GeoQueryResult|null} */
  let zonesCollection = null;

  function zoneStyleDefault(obj) {
    obj.options.set({
      fillColor: "rgba(30, 42, 66, 0.35)",
      strokeColor: "#2b3a55",
      strokeWidth: 2,
      opacity: 1
    });
  }

  function zoneStyleHighlight(obj) {
    obj.options.set({
      fillColor: "rgba(36, 54, 84, 0.50)",
      strokeColor: "#3f5b87",
      strokeWidth: 3,
      opacity: 1
    });
  }

  function unhighlightAll() {
    if (!zonesCollection) return;
    zonesCollection.each((obj) => zoneStyleDefault(obj));
  }

  function showZone(props) {
    const zoneName = props.zone || props.Name || props.name || "Зона";
    const description = props.description || props.note || "";
    const title = `${zoneName} (${mode === "night" ? "Ночь" : "День"})`;

    showInfo(`
      <div style="font-size:16px;font-weight:700;margin-bottom:8px;">
        ${title}
      </div>
      <div style="opacity:.85;line-height:1.5;">
        ${description}
      </div>
    `);
  }

  function setMarker(lat, lon) {
    const coords = [lat, lon];

    if (marker) map.geoObjects.remove(marker);

    marker = new ymaps.Placemark(coords, {}, {
      preset: "islands#redDotIcon",
      draggable: false
    });

    map.geoObjects.add(marker);

    const z = Math.max(map.getZoom(), 14);
    map.setCenter(coords, z, { duration: 200 });
  }

  function findZoneForPoint(lat, lon) {
    if (!zonesCollection) return null;
    const pt = [lat, lon];
    let found = null;

    zonesCollection.each((obj) => {
      if (found) return;
      try {
        // contains работает для полигонов
        if (obj.geometry && obj.geometry.contains(pt)) found = obj;
      } catch {}
    });

    return found;
  }

  async function loadZones() {
    const res = await fetch(GEOJSON_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("Не удалось загрузить GeoJSON: " + GEOJSON_URL);

    const zonesGeo = await res.json();

    // все объекты
    zonesCollection = ymaps.geoQuery(zonesGeo).addToMap(map);

    // оставляем только полигоны
    zonesCollection = zonesCollection.search(
      "geometry.type = 'Polygon' OR geometry.type = 'MultiPolygon'"
    );

    // стиль + клик
    zonesCollection.each((obj) => {
      zoneStyleDefault(obj);

      obj.events.add("click", () => {
        unhighlightAll();
        zoneStyleHighlight(obj);

        const props =
          (obj.properties && obj.properties.getAll && obj.properties.getAll()) || {};
        showZone(props);
      });
    });

    // fit bounds
    const bounds = zonesCollection.getBounds();
    if (bounds) {
      map.setBounds(bounds, { checkZoomRange: true, zoomMargin: 30 });
    }
  }

  // ===== SEARCH (Yandex Suggest + Geocode) =====

  let suggestView = null;

  async function geocodeAddress(text) {
    const q = `${text}, ${CITY_HINT}`;
    const res = await ymaps.geocode(q, { results: 1 });
    const first = res.geoObjects.get(0);
    if (!first) return null;

    const coords = first.geometry.getCoordinates(); // [lat, lon]
    const name = first.getAddressLine ? first.getAddressLine() : q;

    return { coords, name };
  }

  function handlePoint(lat, lon, displayName) {
    clearAddr.style.display = "block";
    if (displayName) addrInput.value = displayName;

    setMarker(lat, lon);

    const z = findZoneForPoint(lat, lon);
    if (z) {
      unhighlightAll();
      zoneStyleHighlight(z);

      const props =
        (z.properties && z.properties.getAll && z.properties.getAll()) || {};
      showZone(props);
    } else {
      showInfo(`
        <div><b>Адрес вне зон доставки</b></div>
        <div class="muted">Проверь адрес или добавь зону.</div>
      `);
    }
  }

  function initSearch() {
    // твой suggest div мы не используем (у Яндекса свой выпадающий список)
    if (suggest) suggest.style.display = "none";

    suggestView = new ymaps.SuggestView(addrInput, {
      results: 7,
      provider: {
        suggest: function (request) {
          return ymaps.suggest(`${request}, ${CITY_HINT}`, { results: 7 });
        }
      }
    });

    addrInput.addEventListener("input", () => {
      const q = addrInput.value.trim();
      clearAddr.style.display = q ? "block" : "none";
    });

    // Enter → геокод
    addrInput.addEventListener("keydown", async (e) => {
      if (e.key !== "Enter") return;

      const q = addrInput.value.trim();
      if (!q) return;

      try {
        const g = await geocodeAddress(q);
        if (!g) return;
        const [lat, lon] = g.coords;
        handlePoint(lat, lon, g.name);
      } catch {}
    });

    // Выбор подсказки
    suggestView.events.add("select", async (e) => {
      try {
        const item = e.get("item");
        const value = item && item.value ? item.value : addrInput.value;

        const g = await geocodeAddress(value);
        if (!g) return;

        const [lat, lon] = g.coords;
        handlePoint(lat, lon, g.name);
      } catch {}
    });
  }

  // ===== START =====
  if (!window.ymaps || !ymaps.ready) {
    showInfo(`<div><b>Ошибка:</b> Яндекс.Карты не загрузились. Проверь API ключ.</div>`);
    return;
  }

  ymaps.ready(async () => {
    // карта
    map = new ymaps.Map("map", {
      center: [51.7875, 55.1019], // Оренбург
      zoom: 11,
      controls: ["zoomControl"]
    });

    initSearch();

    try {
      await loadZones();
    } catch (e) {
      showInfo(`<div><b>Ошибка:</b> ${String(e.message || e)}</div>`);
    }
  });

})();