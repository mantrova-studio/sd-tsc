(function () {

  const mode = new URLSearchParams(location.search).get("mode");

const GEOJSON_URL =
  mode === "night"
    ? "data/zones/zones_night.geojson"
    : "data/zones/zones_day.geojson";
  const CITY_HINT = "Оренбург, Россия";
  const NOMINATIM_COUNTRY = "ru";

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

  // ===== КАРТА =====

  const map = L.map("map", { zoomControl: true });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
  }).addTo(map);

  setTimeout(() => map.invalidateSize(true), 300);
  setTimeout(() => map.invalidateSize(true), 900);

  let zonesGeo = null;
  let zonesLayer = null;
  let marker = null;

  function zoneStyle(feature) {
    return {
      weight: 2,
      color: "#2b3a55",      // контур
      fillColor: "#1e2a42",  // заливка
      fillOpacity: 0.35,
      opacity: 1
    };
  }

  function highlightLayer(layer) {
    if (!zonesLayer) return;
    zonesLayer.eachLayer((l) => zonesLayer.resetStyle(l));
    layer.setStyle({ weight: 3, fillOpacity: 0.5, color: "#3f5b87", fillColor: "#243654" });
  }

  // ===== НОВЫЙ ФОРМАТ ВЫВОДА =====
  function showZone(p) {
    const zoneName = p.zone || p.Name || p.name || "Зона";
    const description = p.description || p.note || "";

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
      } catch {}
    }
    return null;
  }

  async function loadZones() {
    try {
      const res = await fetch(GEOJSON_URL, { cache: "no-store" });
      if (!res.ok) return;

      zonesGeo = await res.json();

      const onlyPolys = {
        type: "FeatureCollection",
        features: (zonesGeo.features || []).filter(
          (f) =>
            f?.geometry?.type === "Polygon" ||
            f?.geometry?.type === "MultiPolygon"
        ),
      };

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
      }

      setTimeout(() => map.invalidateSize(true), 300);
    } catch {}
  }

  // ===== ПОИСК =====

  let tmr = null;

  async function fetchSuggest(q) {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "json");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "7");
    url.searchParams.set("countrycodes", NOMINATIM_COUNTRY);
    url.searchParams.set("q", `${q}, ${CITY_HINT}`);

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });

    return await res.json();
  }

  function renderSuggest(list) {
    suggest.innerHTML = "";
    if (!list.length) {
      suggest.style.display = "none";
      return;
    }

    for (const item of list) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "addrItem";
      btn.textContent = item.display_name;

      btn.addEventListener("click", () => {
        suggest.style.display = "none";
        addrInput.value = item.display_name;
        clearAddr.style.display = "block";

        const lat = Number(item.lat);
        const lon = Number(item.lon);

        setMarker(lat, lon);

        const z = findZoneForPoint(lat, lon);
        if (z) {
          zonesLayer.eachLayer((layer) => {
            if (layer.feature === z) highlightLayer(layer);
          });
          showZone(z.properties || {});
        } else {
          showInfo(`
            <div><b>Адрес вне зон доставки</b></div>
            <div class="muted">Проверь адрес или добавь зону.</div>
          `);
        }
      });

      suggest.appendChild(btn);
    }

    suggest.style.display = "block";
  }

  addrInput.addEventListener("input", () => {
    const q = addrInput.value.trim();
    clearAddr.style.display = q ? "block" : "none";

    if (tmr) clearTimeout(tmr);

    if (q.length < 3) {
      suggest.style.display = "none";
      return;
    }

    tmr = setTimeout(async () => {
      try {
        const list = await fetchSuggest(q);
        renderSuggest(list);
      } catch {}
    }, 350);
  });

  document.addEventListener("click", (e) => {
    if (!suggest.contains(e.target) && e.target !== addrInput) {
      suggest.style.display = "none";
    }
  });

  loadZones();

})();
