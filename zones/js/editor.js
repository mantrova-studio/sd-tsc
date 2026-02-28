(function () {
  // ==========================
  // SIMPLE HIDDEN ACCESS
  // ==========================
  const EDIT_PARAM = "edit";
  const PIN_PARAM = "pin";
  const STORAGE_AUTH = "sd_zones_editor_authed";
  const EDITOR_PIN = "2468"; // поменяй

  const qs = new URLSearchParams(location.search);

  function goToZones() {
    const base = location.href.split("?")[0];
    const folder = base.substring(0, base.lastIndexOf("/") + 1);
    location.href = folder + "zones.html";
  }

  function showBlock(title, text) {
    document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:#0c0f16;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial">
        <div style="max-width:760px;width:100%;border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:18px;background:rgba(255,255,255,.04)">
          <div style="font-size:20px;font-weight:800;margin-bottom:8px;">${title}</div>
          <div style="opacity:.85;line-height:1.5;white-space:pre-wrap">${text}</div>
          <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
            <button id="goZones" style="cursor:pointer;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;padding:10px 12px;border-radius:12px;font-weight:700;">← На zones</button>
            <button id="retry" style="cursor:pointer;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;padding:10px 12px;border-radius:12px;font-weight:700;">↻ Обновить</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById("goZones").onclick = goToZones;
    document.getElementById("retry").onclick = () => location.reload();
  }

  if (qs.get(EDIT_PARAM) !== "1") {
    showBlock("Редактор закрыт", `Открой так:\neditor.html?edit=1\n\nURL:\n${location.href}`);
    return;
  }

  const saved = localStorage.getItem(STORAGE_AUTH) === "1";
  const pinFromUrl = qs.get(PIN_PARAM);

  if (!saved) {
    const okByUrl = pinFromUrl && pinFromUrl === EDITOR_PIN;
    if (!okByUrl) {
      const entered = prompt("PIN для редактора зон:");
      if (entered !== EDITOR_PIN) {
        showBlock("Неверный PIN", "PIN неверный.");
        return;
      }
    }
    localStorage.setItem(STORAGE_AUTH, "1");
  }

  // ==========================
  // TOOLTIP (custom)
  // ==========================
  const tip = document.createElement("div");
  tip.className = "tscTip";
  document.body.appendChild(tip);

  let tipTimer = null;
  let tipVisible = false;

  function showTip(text, x, y) {
    tip.textContent = text;
    const pad = 14;
    let left = x + pad;
    let top = y + pad;

    tip.style.left = "0px";
    tip.style.top = "0px";
    tip.classList.add("show");

    const r = tip.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (left + r.width + 10 > vw) left = vw - r.width - 10;
    if (top + r.height + 10 > vh) top = vh - r.height - 10;

    tip.style.left = left + "px";
    tip.style.top = top + "px";
    tipVisible = true;
  }

  function hideTip() {
    tip.classList.remove("show");
    tipVisible = false;
  }

  document.addEventListener("pointerover", (e) => {
    const el = e.target.closest?.("[data-tip]");
    if (!el) return;
    clearTimeout(tipTimer);
    const text = el.getAttribute("data-tip");
    if (!text) return;
    tipTimer = setTimeout(() => showTip(text, e.clientX, e.clientY), 120);
  });

  document.addEventListener("pointermove", (e) => {
    if (!tipVisible) return;
    const el = e.target.closest?.("[data-tip]");
    if (!el) return;
    showTip(el.getAttribute("data-tip") || "", e.clientX, e.clientY);
  });

  document.addEventListener("pointerout", (e) => {
    const el = e.target.closest?.("[data-tip]");
    if (!el) return;
    clearTimeout(tipTimer);
    hideTip();
  });

  // ==========================
  // FILES + LOCAL DRAFTS
  // ==========================
  const FILES = {
    day: "data/zones/zones_day.geojson",
    night: "data/zones/zones_night.geojson",
  };

  const REPO_PATHS = {
    day: "zones/data/zones/zones_day.geojson",
    night: "zones/data/zones/zones_night.geojson",
  };

  const DRAFT_KEY = (mode) => `sd_zones_draft_${mode}`;

  // ==========================
  // UI
  // ==========================
  const backBtn = document.getElementById("backBtn");
  const drawBtn = document.getElementById("drawBtn");
  const drawIcon = document.getElementById("drawIcon");
  const editBtn = document.getElementById("editBtn");
  const editIcon = document.getElementById("editIcon");
  const delBtn = document.getElementById("delBtn");
  const exportBtn = document.getElementById("exportBtn");
  const resetLocalBtn = document.getElementById("resetLocalBtn");
  const ghBtn = document.getElementById("ghBtn");

  const modeSel = document.getElementById("modeSel");
  const zoneName = document.getElementById("zoneName");
  const zoneDesc = document.getElementById("zoneDesc");
  const savePropsBtn = document.getElementById("savePropsBtn");
  const importFile = document.getElementById("importFile");

  // GitHub modal
  const ghModal = document.getElementById("ghModal");
  const ghClose = document.getElementById("ghClose");
  const ghToken = document.getElementById("ghToken");
  const ghOwner = document.getElementById("ghOwner");
  const ghRepo = document.getElementById("ghRepo");
  const ghBranch = document.getElementById("ghBranch");
  const ghMsg = document.getElementById("ghMsg");
  const ghRemember = document.getElementById("ghRemember");
  const ghSaveBtn = document.getElementById("ghSaveBtn");
  const ghTestBtn = document.getElementById("ghTestBtn");
  const ghStatus = document.getElementById("ghStatus");

  if (!backBtn || !drawBtn || !editBtn || !delBtn || !exportBtn || !modeSel) {
    showBlock("Не тот HTML", "editor.js подключён не на editor.html или элементы UI не найдены.");
    return;
  }

  backBtn.addEventListener("click", goToZones);

  function getMode() {
    return modeSel.value === "night" ? "night" : "day";
  }

  function readDraft(mode) {
    try {
      const raw = localStorage.getItem(DRAFT_KEY(mode));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function writeDraft(mode, geojson) {
    try {
      localStorage.setItem(DRAFT_KEY(mode), JSON.stringify(geojson));
    } catch (e) {
      console.warn("draft save failed", e);
    }
  }

  function clearDraft(mode) {
    localStorage.removeItem(DRAFT_KEY(mode));
  }

  // ==========================
  // MAP / STATE
  // ==========================
  let map;
  let selected = null;
  const polygons = [];
  let drawingPoly = null;
  let isDrawing = false;

  let saveTimer = null;
  function scheduleSaveDraft() {
    if (!map) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      writeDraft(getMode(), buildGeoJsonFromPolys());
    }, 250);
  }

  function makePolyStyle() {
    return {
      fillColor: "#1e2a42",
      strokeColor: "#2b3a55",
      opacity: 1,
      strokeWidth: 2,
      fillOpacity: 0.35,
    };
  }

  function setSelectedStyle(poly, isActive) {
    poly.options.set(
      isActive ? { strokeWidth: 3, fillOpacity: 0.5 } : { strokeWidth: 2, fillOpacity: 0.35 }
    );
  }

  function normalizeProps(props = {}) {
    const p = { ...props };
    if (!p.zone && (p.Name || p.name)) p.zone = p.Name || p.name;
    if (!p.description && p.note) p.description = p.note;
    if (!p.note && p.description) p.note = p.description;
    return p;
  }

  function isEditingSelected() {
    if (!selected || !selected.editor) return false;
    try { return !!selected.editor.state.get("editing"); } catch { return false; }
  }

  function setDrawIconPlus() {
    drawIcon.innerHTML = `<path d="M12 5v14M5 12h14" stroke-width="2" stroke-linecap="round"/>`;
  }
  function setDrawIconCheck() {
    drawIcon.innerHTML = `<path d="M6 12l4 4 8-8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  function setEditIconTriangle() {
    editIcon.innerHTML = `
      <circle class="fill" cx="6" cy="18" r="2"></circle>
      <circle class="fill" cx="18" cy="18" r="2"></circle>
      <circle class="fill" cx="12" cy="6" r="2"></circle>
      <path d="M8 16 L12 8 L16 16 Z" stroke-width="1.5" />
    `;
  }
  function setEditIconCheck() {
    editIcon.innerHTML = `<path d="M6 12l4 4 8-8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  function syncEditBtnUi() {
    const on = isEditingSelected();
    if (on) {
      editBtn.classList.add("active");
      editBtn.setAttribute("data-tip", "Завершить вершины");
      setEditIconCheck();
    } else {
      editBtn.classList.remove("active");
      editBtn.setAttribute("data-tip", "Редактировать вершины");
      setEditIconTriangle();
    }
  }

  function selectPoly(poly) {
    if (selected && selected !== poly) {
      setSelectedStyle(selected, false);
      try { selected.editor && selected.editor.stopEditing(); } catch {}
    }

    selected = poly;

    if (!selected) {
      zoneName.value = "";
      zoneDesc.value = "";
      syncEditBtnUi();
      return;
    }

    setSelectedStyle(selected, true);

    const props = normalizeProps(selected.properties.getAll() || {});
    zoneName.value = props.zone || "";
    zoneDesc.value = props.description || props.note || "";
    syncEditBtnUi();
  }

  function attachPolyEvents(poly) {
    poly.events.add("click", () => selectPoly(poly));
    try { poly.geometry.events.add("change", scheduleSaveDraft); } catch {}
    try { poly.properties.events.add("change", scheduleSaveDraft); } catch {}
  }

  function addPolygonFromLatLonRings(ringsLatLon, props = {}) {
    const p = normalizeProps(props);
    const poly = new ymaps.Polygon(ringsLatLon, p, makePolyStyle());
    attachPolyEvents(poly);
    map.geoObjects.add(poly);
    polygons.push(poly);
    return poly;
  }

  function clearAll() {
    polygons.forEach((p) => {
      try { p.editor && p.editor.stopEditing(); } catch {}
      map.geoObjects.remove(p);
    });
    polygons.length = 0;
    selectPoly(null);
  }

  function fitToAll() {
    const b = map.geoObjects.getBounds();
    if (b) map.setBounds(b, { checkZoomRange: true, zoomMargin: 20 });
  }

  // ==========================
  // GEOJSON
  // ==========================
  function latLonToLonLatRing(ringLatLon) {
    return ringLatLon.map(([lat, lon]) => [lon, lat]);
  }
  function lonLatToLatLonRing(ringLonLat) {
    return ringLonLat.map(([lon, lat]) => [lat, lon]);
  }

  function polyToFeature(poly) {
    const coords = poly.geometry.getCoordinates();
    const ringsLonLat = coords.map((ring) => latLonToLonLatRing(ring));
    const props = normalizeProps(poly.properties.getAll() || {});
    const desc = props.description || props.note || "";
    return {
      type: "Feature",
      properties: {
        id: props.id || props.__id || null,
        zone: props.zone || "",
        description: desc,
        note: desc,
      },
      geometry: { type: "Polygon", coordinates: ringsLonLat },
    };
  }

  function buildGeoJsonFromPolys() {
    return { type: "FeatureCollection", features: polygons.map(polyToFeature) };
  }

  function downloadJson(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/geo+json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function loadGeoJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Не удалось загрузить: " + url);
    return await res.json();
  }

  function applyGeoJson(geo) {
    clearAll();
    const feats = geo?.features || [];
    feats.forEach((f, idx) => {
      const g = f?.geometry;
      if (!g) return;

      const props = normalizeProps(f.properties || {});
      if (!props.id) props.id = f.id || props.__id || `f_${idx}`;

      if (g.type === "Polygon") {
        const ringsLatLon = (g.coordinates || []).map((ring) => lonLatToLatLonRing(ring));
        addPolygonFromLatLonRings(ringsLatLon, props);
      } else if (g.type === "MultiPolygon") {
        (g.coordinates || []).forEach((polyCoords, mIdx) => {
          const ringsLatLon = (polyCoords || []).map((ring) => lonLatToLatLonRing(ring));
          addPolygonFromLatLonRings(ringsLatLon, { ...props, id: `${props.id}_m${mIdx}` });
        });
      }
    });
    fitToAll();
  }

  async function loadCurrentModePreferDraft() {
    const mode = getMode();
    const draft = readDraft(mode);
    if (draft && draft.type === "FeatureCollection") {
      applyGeoJson(draft);
      return;
    }
    const geo = await loadGeoJson(FILES[mode]);
    applyGeoJson(geo);
  }

  // ==========================
  // ACTIONS
  // ==========================
  function startDrawing() {
    if (drawingPoly) {
      try { drawingPoly.editor.stopDrawing(); } catch {}
      drawingPoly = null;
    }

    const props = normalizeProps({
      id: "new_" + Date.now(),
      zone: "Новая зона",
      description: "",
      note: "",
    });

    drawingPoly = addPolygonFromLatLonRings([], props);
    selectPoly(drawingPoly);

    try { drawingPoly.editor.startDrawing(); }
    catch { alert("Не удалось начать рисование. Проверь load=package.full"); }

    scheduleSaveDraft();
  }

  function stopDrawing() {
    if (!drawingPoly) return;
    try { drawingPoly.editor.stopDrawing(); } catch {}
    drawingPoly = null;
    fitToAll();
    scheduleSaveDraft();
  }

  function toggleEdit() {
    if (!selected) return alert("Выбери полигон (клик по зоне).");
    try {
      const on = isEditingSelected();
      if (on) selected.editor.stopEditing();
      else selected.editor.startEditing();
      scheduleSaveDraft();
      syncEditBtnUi();
    } catch {
      alert("Редактирование недоступно.");
    }
  }

  function deleteSelected() {
    if (!selected) return;
    if (!confirm("Удалить выбранный полигон?")) return;

    try { selected.editor && selected.editor.stopEditing(); } catch {}
    map.geoObjects.remove(selected);

    const i = polygons.indexOf(selected);
    if (i >= 0) polygons.splice(i, 1);

    selectPoly(null);
    scheduleSaveDraft();
  }

  function saveProps() {
    if (!selected) return alert("Выбери полигон (клик по зоне).");
    const z = zoneName.value.trim();
    const d = zoneDesc.value.trim();
    const current = normalizeProps(selected.properties.getAll() || {});
    selected.properties.set({ ...current, zone: z, description: d, note: d });
    scheduleSaveDraft();
  }

  function exportGeoJson() {
    const mode = getMode();
    const out = buildGeoJsonFromPolys();
    const filename = mode === "night" ? "zones_night.geojson" : "zones_day.geojson";
    downloadJson(filename, out);
  }

  // ==========================
  // GitHub Save
  // ==========================
  const GH_STORAGE = "sd_zones_github_settings";

  function loadGhSettings() {
    try {
      const raw = localStorage.getItem(GH_STORAGE);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }

  function saveGhSettings(s) {
    try { localStorage.setItem(GH_STORAGE, JSON.stringify(s)); } catch {}
  }

  function setGhStatus(msg) {
    if (ghStatus) ghStatus.textContent = msg || "";
  }

  function openGhModal() {
    const defaults = loadGhSettings() || {
      token: "",
      owner: "mantrova-studio",
      repo: "sd-tsc",
      branch: "main",
      msg: "",
    };

    ghToken.value = defaults.token || "";
    ghOwner.value = defaults.owner || "mantrova-studio";
    ghRepo.value = defaults.repo || "sd-tsc";
    ghBranch.value = defaults.branch || "main";
    ghMsg.value = defaults.msg || "";
    ghRemember.checked = true;

    setGhStatus("");
    ghModal.style.display = "flex";
  }

  function closeGhModal() {
    ghModal.style.display = "none";
  }

  function b64encodeUtf8(str) {
    // UTF-8 safe base64
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin);
  }

  async function ghRequest(url, token, options = {}) {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${token}`,
        ...options.headers,
      },
    });

    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}

    if (!res.ok) {
      const msg = json?.message ? json.message : `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return json;
  }

  async function ghTestAccess(settings) {
    const { token, owner, repo } = settings;
    const url = `https://api.github.com/repos/${owner}/${repo}`;
    const data = await ghRequest(url, token, { method: "GET" });
    return data;
  }

  async function ghUpsertFile(settings, path, contentText, commitMessage) {
    const { token, owner, repo, branch } = settings;

    // 1) get sha if exists
    const getUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
    let sha = null;
    try {
      const current = await ghRequest(getUrl, token, { method: "GET" });
      sha = current?.sha || null;
    } catch (e) {
      // if not found, sha stays null (will create)
      if (!String(e.message || "").toLowerCase().includes("not found")) {
        // sometimes GitHub message: "Not Found"
        // if token has no access it'll be "Not Found" too; but then repo test should fail anyway
        // still rethrow if we can't be sure
        // We'll allow create attempt below when sha==null
      }
    }

    // 2) PUT content
    const putUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
    const body = {
      message: commitMessage,
      content: b64encodeUtf8(contentText),
      branch,
      ...(sha ? { sha } : {}),
    };

    return await ghRequest(putUrl, token, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function nowStamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  async function saveToGitHub() {
    const mode = getMode();
    const geo = buildGeoJsonFromPolys();
    const text = JSON.stringify(geo, null, 2);

    const settings = {
      token: (ghToken.value || "").trim(),
      owner: (ghOwner.value || "").trim(),
      repo: (ghRepo.value || "").trim(),
      branch: (ghBranch.value || "main").trim(),
      msg: (ghMsg.value || "").trim(),
    };

    if (!settings.token || !settings.owner || !settings.repo || !settings.branch) {
      setGhStatus("Заполни token / owner / repo / branch.");
      return;
    }

    const commitMessage =
      settings.msg
        ? settings.msg
        : `zones: update ${mode} (${nowStamp()})`;

    const path = REPO_PATHS[mode];

    setGhStatus("Проверяю доступ…");
    await ghTestAccess(settings);

    setGhStatus(`Коммичу файл:\n${path}\n…`);
    const result = await ghUpsertFile(settings, path, text, commitMessage);

    if (ghRemember.checked) saveGhSettings(settings);

    const commitUrl = result?.commit?.html_url || "";
    setGhStatus(`Готово ✅\nКоммит: ${commitMessage}\n${commitUrl}`);
  }

  // ==========================
  // EVENTS
  // ==========================
  drawBtn.addEventListener("click", () => {
    if (!isDrawing) {
      startDrawing();
      isDrawing = true;
      drawBtn.classList.add("active");
      setDrawIconCheck();
      drawBtn.setAttribute("data-tip", "Завершить рисование");
    } else {
      stopDrawing();
      isDrawing = false;
      drawBtn.classList.remove("active");
      setDrawIconPlus();
      drawBtn.setAttribute("data-tip", "Новый полигон");
    }
  });

  editBtn.addEventListener("click", toggleEdit);
  delBtn.addEventListener("click", deleteSelected);
  exportBtn.addEventListener("click", exportGeoJson);
  savePropsBtn.addEventListener("click", saveProps);

  if (resetLocalBtn) {
    resetLocalBtn.addEventListener("click", async () => {
      const mode = getMode();
      const ok = confirm(
        `Сбросить локальные изменения для режима "${mode === "night" ? "Ночь" : "День"}"?\n\nЛокальный черновик будет удалён, загрузится исходный файл.`
      );
      if (!ok) return;
      clearDraft(mode);
      await loadCurrentModePreferDraft();
      alert("Локальный черновик удалён. Загружен исходный GeoJSON.");
    });
  }

  modeSel.addEventListener("change", async () => {
    if (isDrawing) {
      isDrawing = false;
      drawBtn.classList.remove("active");
      setDrawIconPlus();
      drawBtn.setAttribute("data-tip", "Новый полигон");
      stopDrawing();
    }
    if (isEditingSelected()) {
      try { selected.editor.stopEditing(); } catch {}
      syncEditBtnUi();
    }
    await loadCurrentModePreferDraft();
  });

  importFile.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const geo = JSON.parse(await file.text());
      applyGeoJson(geo);
      scheduleSaveDraft();
      alert("Импортировано и сохранено локально как черновик.");
    } catch (err) {
      alert("Не удалось импортировать: " + err.message);
    } finally {
      importFile.value = "";
    }
  });

  zoneName.addEventListener("input", scheduleSaveDraft);
  zoneDesc.addEventListener("input", scheduleSaveDraft);

  // GitHub modal events
  if (ghBtn && ghModal) {
    ghBtn.addEventListener("click", openGhModal);
    ghClose.addEventListener("click", closeGhModal);
    ghModal.addEventListener("click", (e) => {
      if (e.target === ghModal) closeGhModal();
    });

    ghTestBtn.addEventListener("click", async () => {
      try {
        const settings = {
          token: (ghToken.value || "").trim(),
          owner: (ghOwner.value || "").trim(),
          repo: (ghRepo.value || "").trim(),
          branch: (ghBranch.value || "main").trim(),
          msg: (ghMsg.value || "").trim(),
        };
        setGhStatus("Проверяю доступ…");
        const repoInfo = await ghTestAccess(settings);
        setGhStatus(`Ок ✅\n${repoInfo.full_name}\nDefault branch: ${repoInfo.default_branch}`);
        if (ghRemember.checked) saveGhSettings(settings);
      } catch (e) {
        setGhStatus("Ошибка ❌\n" + (e.message || e));
      }
    });

    ghSaveBtn.addEventListener("click", async () => {
      try {
        await saveToGitHub();
      } catch (e) {
        setGhStatus("Ошибка ❌\n" + (e.message || e));
      }
    });
  }

  // ==========================
  // INIT
  // ==========================
  ymaps.ready(async () => {
    map = new ymaps.Map("map", {
      center: [51.7682, 55.0968],
      zoom: 11,
      controls: ["zoomControl"],
    });

    if (!modeSel.value) modeSel.value = "day";
    setDrawIconPlus();
    syncEditBtnUi();

    try {
      await loadCurrentModePreferDraft();
    } catch (e) {
      alert(e.message);
    }
  });
})();