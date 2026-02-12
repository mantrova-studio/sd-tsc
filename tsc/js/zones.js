(function(){
  function addDbg(msg){
    const el = document.createElement("div");
    el.style.cssText =
      "position:fixed;left:12px;right:12px;bottom:58px;z-index:99999;" +
      "padding:10px 12px;border-radius:14px;background:rgba(21,25,36,.95);" +
      "border:1px solid rgba(42,50,70,.95);color:#e9edf5;font-weight:900;" +
      "font-family:system-ui";
    el.textContent = msg;
    document.documentElement.appendChild(el); // НЕ body
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => addDbg("DBG2: zones.js EXECUTED"));
  } else {
    addDbg("DBG2: zones.js EXECUTED");
  }
})();

document.body.insertAdjacentHTML(
  "beforeend",
  "<div style='position:fixed;left:12px;right:12px;bottom:58px;z-index:99999;padding:10px 12px;border-radius:14px;background:rgba(21,25,36,.95);border:1px solid rgba(42,50,70,.95);color:#e9edf5;font-weight:900;font-family:system-ui'>DBG2: zones.js EXECUTED</div>"
);


const DBG = (msg) => {
  const el = document.getElementById("dbg");
  if (el) el.textContent = "DBG: " + msg;
};
DBG("zones.js запустился");

const mode = new URLSearchParams(location.search).get("mode") || "day";

// пока только день
const GEOJSON_URL = "data/zones/zones_day.geojson";

// Подсказка, чтобы Nominatim не уводил в другие города
const CITY_HINT = "Оренбург, Россия";

// Можно жёстче ограничить страну и район (полезно!)
const NOMINATIM_COUNTRY = "ru";

const backBtn = document.getElementById("backBtn");
const addrInput = document.getElementById("addrInput");
const clearAddr = document.getElementById("clearAddr");
const suggest = document.getElementById("addrSuggest");
const zoneInfo = document.getElementById("zoneInfo");

backBtn.addEventListener("click", ()=>history.length > 1 ? history.back() : (location.href="index.html"));

clearAddr.style.display = "none";
clearAddr.addEventListener("click", ()=>{
  addrInput.value = "";
  clearAddr.style.display = "none";
  suggest.style.display = "none";
  zoneInfo.style.display = "none";
});

function showInfo(html){
  zoneInfo.innerHTML = html;
  zoneInfo.style.display = "block";
}

// ----- карта -----
const map = L.map("map", { zoomControl: true });
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap"
}).addTo(map);

let zonesGeo = null;
let zonesLayer = null;
let marker = null;

function zoneStyle(){
  return { weight: 2, opacity: 1, fillOpacity: 0.25 };
}

function highlightLayer(layer){
  if(!zonesLayer) return;
  zonesLayer.eachLayer(l=>zonesLayer.resetStyle(l));
  layer.setStyle({ weight: 3, fillOpacity: 0.35 });
}


async function loadZones(){
  try{
    DBG("загружаю GeoJSON…");

    const res = await fetch(GEOJSON_URL, { cache: "no-store" });
    DBG("GeoJSON ответ: " + res.status);

    if(!res.ok){
      showInfo(`<div><b>Не удалось загрузить зоны</b></div><div class="muted">${GEOJSON_URL} — HTTP ${res.status}</div>`);
      return;
    }

    zonesGeo = await res.json();
    DBG("GeoJSON загружен, features=" + ((zonesGeo.features||[]).length));

    const onlyPolys = {
      type: "FeatureCollection",
      features: (zonesGeo.features || []).filter(f =>
        f?.geometry?.type === "Polygon" || f?.geometry?.type === "MultiPolygon"
      )
    };
    DBG("полигоны=" + onlyPolys.features.length);

    if(zonesLayer) zonesLayer.remove();

    zonesLayer = L.geoJSON(onlyPolys, {
      style: zoneStyle,
      onEachFeature: (feature, layer)=>{
        layer.on("click", ()=>{
          highlightLayer(layer);
          showZone(feature.properties || {});
        });
      }
    }).addTo(map);

    if(onlyPolys.features.length){
      map.fitBounds(zonesLayer.getBounds(), { padding: [20, 20] });
      DBG("карта отрисована");
    }else{
      showInfo(`<div><b>В GeoJSON нет полигонов</b></div><div class="muted">Проверь, что экспортировал именно зоны, а не точки.</div>`);
      DBG("нет полигонов");
    }

  }catch(e){
    DBG("ошибка: " + (e?.message || e));
    showInfo(`<div><b>Ошибка карты</b></div><div class="muted">${String(e?.message || e)}</div>`);
  }
}

//async function loadZones(){
//  const res = await fetch(GEOJSON_URL, { cache: "no-store" });
//  zonesGeo = await res.json();

  // рисуем ТОЛЬКО полигоны (точки отдельно)
//  const onlyPolys = {
//    type: "FeatureCollection",
  //  features: (zonesGeo.features || []).filter(f =>
  //    f?.geometry?.type === "Polygon" || f?.geometry?.type === "MultiPolygon"
 //   )
//  };

//  if(zonesLayer) zonesLayer.remove();

//  zonesLayer = L.geoJSON(onlyPolys, {
  //  style: zoneStyle,
 //   onEachFeature: (feature, layer)=>{
  //    layer.on("click", ()=>{
  //      highlightLayer(layer);
    //    showZone(feature.properties || {});
 //     });
  //  }
//  }).addTo(map);

//  map.fitBounds(zonesLayer.getBounds(), { padding: [20, 20] });
//}

function showZone(p){
  const zone = p.zone  p.Name  "Зона";
  const price = p.delivery_price ?? "—";
  const min = p.min_order ?? "—";

  showInfo(
    <div><b>${zone}</b> <span class="muted">(День)</span></div>
    <div>Стоимость доставки: <b>${price}</b> ₽</div>
    <div>Минимальная сумма заказа: <b>${min}</b> ₽</div>
  );
}

function findZoneForPoint(lat, lon){
  if(!zonesGeo) return null;
  const pt = turf.point([lon, lat]);

  for(const f of (zonesGeo.features || [])){
    const t = f?.geometry?.type;
    if(t !== "Polygon" && t !== "MultiPolygon") continue;

    try{
      if(turf.booleanPointInPolygon(pt, f)) return f;
    }catch(e){}
  }
  return null;
}

function setMarker(lat, lon){
  if(marker) marker.remove();
  marker = L.marker([lat, lon]).addTo(map);
  map.setView([lat, lon], Math.max(map.getZoom(), 14));
}

// ----- подсказки адресов (Nominatim) -----
let tmr = null;

async function fetchSuggest(q){
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "7");
  url.searchParams.set("countrycodes", NOMINATIM_COUNTRY);
  url.searchParams.set("q", ${q}, ${CITY_HINT});

  const res = await fetch(url.toString(), { headers: { "Accept": "application/json" } });
  return await res.json();
}

function renderSuggest(list){
  suggest.innerHTML = "";
  if(!list.length){
    suggest.style.display = "none";
    return;
  }

  for(const item of list){
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "addrItem";
    btn.textContent = item.display_name;

    btn.addEventListener("click", ()=>{
      suggest.style.display = "none";
      addrInput.value = item.display_name;
      clearAddr.style.display = "block";
      const lat = Number(item.lat);
      const lon = Number(item.lon);

      setMarker(lat, lon);

      const zoneFeature = findZoneForPoint(lat, lon);
      if(zoneFeature){
        // подсветим
        zonesLayer.eachLayer(layer=>{
          if(layer.feature === zoneFeature) highlightLayer(layer);
        });
        showZone(zoneFeature.properties || {});
      }else{
        showInfo(<div><b>Адрес вне зон доставки</b></div><div class="muted">Проверь адрес или добавь зону на карте.</div>);
      }
    });

    suggest.appendChild(btn);
  }

  suggest.style.display = "block";
}

addrInput.addEventListener("input", ()=>{
  const q = addrInput.value.trim();
  clearAddr.style.display = q ? "block" : "none";

  if(tmr) clearTimeout(tmr);
  if(q.length < 3){
    suggest.style.display = "none";
    return;
  }

  tmr = setTimeout(async ()=>{
    try{
      const list = await fetchSuggest(q);
      renderSuggest(list);
    }catch(e){
      console.error(e);
    }
  }, 350);
});

document.addEventListener("click", (e)=>{
  if(!suggest.contains(e.target) && e.target !== addrInput){
    suggest.style.display = "none";
  }
});

// старт

loadZones();


