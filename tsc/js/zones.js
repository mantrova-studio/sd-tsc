(function(){
  const dbg2 = (t) => {
    const el = document.getElementById("dbg2");
    if (el) el.textContent = "DBG2: " + t;
  };

  // Проверим что #map реально есть и имеет размер
  const mapEl = document.getElementById("map");
  if(!mapEl){
    dbg2("НЕ найден #map (проверь id='map')");
    return;
  }
  dbg2("map size: " + mapEl.clientWidth + "x" + mapEl.clientHeight);

  // Создаём карту
  let map;
  try{
    map = L.map("map");
  }catch(e){
    dbg2("L.map ошибка: " + (e.message || e));
    return;
  }

  map.setView([51.7682, 55.0968], 12); // Оренбург

  // Добавляем тайлы + события (как в maptest)
  const layer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 });

  layer.on("loading", ()=>dbg2("tiles loading…"));
  layer.on("load", ()=>dbg2("tiles loaded ✅"));
  layer.on("tileerror", ()=>dbg2("tile error ❌ (тайлы не грузятся)"));

  layer.addTo(map);

  // Очень важно для сложной верстки
  const fixSize = () => {
    map.invalidateSize(true);
    dbg2("invalidateSize ✅ / map size: " + mapEl.clientWidth + "x" + mapEl.clientHeight);
  };

  // несколько попыток — помогает на мобилках
  setTimeout(fixSize, 200);
  setTimeout(fixSize, 800);
  window.addEventListener("resize", fixSize);

})();
