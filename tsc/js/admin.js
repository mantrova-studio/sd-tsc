import {
  loadDishes, normalizeDishes, uniqSorted, qs, setText,
  DELIVERY_LIST, SORT_OPTIONS, sortDishes,
  wireDropdown, buildMenu,
  PLACEHOLDER_PHOTO,
  ADMIN_PASSWORD, isAdmin, setAdminSession,
  setOverride, clearOverride,
  downloadTextFile
} from "./common.js";

/* =========================
   GitHub settings (techcards)
========================= */
const GITHUB_OWNER = "mantrova-studio";
const GITHUB_REPO  = "sd-tsc"; // <-- если репо другое, поменяй тут

// Авто-определение базовой папки проекта внутри репо (например "tsc/")
function guessBaseDir(){
  const parts = (location.pathname || "").split("/").filter(Boolean);
  const idx = parts.indexOf("tsc");     // если сайт лежит в /tsc/
  if(idx >= 0) return "tsc";
  const idx2 = parts.indexOf("tech");   // если вдруг лежит в /tech/
  if(idx2 >= 0) return "tech";
  return ""; // корень
}
const BASE_DIR = guessBaseDir(); // "" | "tsc" | ...

const GH_DISHES_PATH = `${BASE_DIR ? BASE_DIR + "/" : ""}data/dishes.json`;
const GH_PHOTOS_DIR  = `${BASE_DIR ? BASE_DIR + "/" : ""}assets/photos/`;

/* =========================
   Token modal + toast (uses your HTML #tokenWrap + #toast)
========================= */
const TOKEN_SESSION_KEY = "tsc_tc_token_session_v1";
const TOKEN_LOCAL_KEY   = "tsc_tc_token_local_v1";

function getSavedToken(){
  return sessionStorage.getItem(TOKEN_SESSION_KEY)
    || localStorage.getItem(TOKEN_LOCAL_KEY)
    || "";
}
function saveToken(token, remember){
  if(remember){
    localStorage.setItem(TOKEN_LOCAL_KEY, token);
    sessionStorage.removeItem(TOKEN_SESSION_KEY);
  }else{
    sessionStorage.setItem(TOKEN_SESSION_KEY, token);
    localStorage.removeItem(TOKEN_LOCAL_KEY);
  }
}
function clearSavedToken(){
  sessionStorage.removeItem(TOKEN_SESSION_KEY);
  localStorage.removeItem(TOKEN_LOCAL_KEY);
}

function escapeHtml(s){
  return (s ?? "").toString()
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* =========================
   Toast (как в копилках)
   Требует CSS, который ты добавлял (toast/toastBox/toastIcon/...)
========================= */
const TOAST_ICONS = {
  ok: `
    <svg viewBox="0 0 24 24">
      <path d="M20 6L9 17l-5-5"/>
    </svg>
  `,
  err: `
    <svg viewBox="0 0 24 24">
      <path d="M12 9v4"/>
      <path d="M12 17h.01"/>
      <path d="M10 3h4l7 7v4l-7 7h-4l-7-7v-4z"/>
    </svg>
  `,
  info: `
    <svg viewBox="0 0 24 24">
      <path d="M12 8h.01"/>
      <path d="M11 12h1v6h1"/>
      <path d="M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z"/>
    </svg>
  `
};

function ensureToastHost(){
  let el = document.getElementById("toast");
  if(el) return el;
  el = document.createElement("div");
  el.id = "toast";
  el.className = "toast";
  el.setAttribute("aria-live", "polite");
  document.body.appendChild(el);
  return el;
}

function showToast(title, text, ms = 4500, type = "ok"){
  const el = ensureToastHost();

  el.innerHTML = `
    <div class="toastBox">
      <div class="toastIcon">${TOAST_ICONS[type] || TOAST_ICONS.ok}</div>
      <div class="toastText">
        <div class="toastTitle">${escapeHtml(title)}</div>
        <div class="toastMsg">${escapeHtml(text)}</div>
      </div>
      <button class="toastClose" type="button" aria-label="Закрыть">✕</button>
    </div>
  `;

  // показать
  el.classList.add("show");

  const closeBtn = el.querySelector(".toastClose");
  const close = ()=>{
    el.classList.remove("show");
  };

  closeBtn?.addEventListener("click", close, { once:true });

  clearTimeout(showToast._t);
  showToast._t = setTimeout(close, ms);
}

/* =========================
   Token modal
========================= */
function openTokenModal({ title = "GitHub Token", prefill = "" } = {}){
  const wrap = document.getElementById("tokenWrap");
  const input = document.getElementById("tokenInput");
  const remember = document.getElementById("tokenRemember");
  const err = document.getElementById("tokenError");
  const closeX = document.getElementById("tokenClose");
  const cancel = document.getElementById("tokenCancel");
  const ok = document.getElementById("tokenOk");

  // если модалки в HTML нет — просто fallback
  if(!wrap || !input || !remember || !ok || !cancel){
    const t = prompt("Вставь GitHub token:");
    return Promise.resolve((t || "").trim() || null);
  }

  // title применим только если есть элемент .tokenTitle
  const titleEl = wrap.querySelector(".tokenTitle");
  if(titleEl) titleEl.textContent = title;

  const open = ()=>{
    wrap.classList.add("open");
    wrap.setAttribute("aria-hidden","false");
    if(err){
      err.style.display = "none";
      err.textContent = "";
    }
    input.value = prefill || getSavedToken() || "";
    remember.checked = !!localStorage.getItem(TOKEN_LOCAL_KEY);
    setTimeout(()=>input.focus(), 50);
  };
  const close = ()=>{
    wrap.classList.remove("open");
    wrap.setAttribute("aria-hidden","true");
  };
  const showError = (msg)=>{
    if(!err) return;
    err.textContent = msg || "Ошибка";
    err.style.display = "block";
  };

  return new Promise((resolve)=>{
    open();

    const cleanup = ()=>{
      ok.removeEventListener("click", onOk);
      cancel.removeEventListener("click", onCancel);
      closeX?.removeEventListener("click", onCancel);
      wrap.removeEventListener("click", onBackdrop);
      input.removeEventListener("keydown", onKey);
    };

    const onOk = ()=>{
      const token = (input.value || "").trim();
      if(!token) return showError("Вставь токен.");
      saveToken(token, remember.checked);
      close();
      cleanup();
      resolve(token);
    };

    const onCancel = ()=>{
      close();
      cleanup();
      resolve(null);
    };

    const onBackdrop = (e)=>{
      if(e.target === wrap) onCancel();
    };

    const onKey = (e)=>{
      if(e.key === "Enter") onOk();
      if(e.key === "Escape") onCancel();
    };

    ok.addEventListener("click", onOk);
    cancel.addEventListener("click", onCancel);
    closeX?.addEventListener("click", onCancel); // ✅ крестик работает
    wrap.addEventListener("click", onBackdrop);
    input.addEventListener("keydown", onKey);
  });
}

/* =========================
   GitHub API helpers
========================= */
function ghHeaders(token){
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

function toBase64Utf8(str){
  return btoa(unescape(encodeURIComponent(str)));
}

async function githubGetMeta(path, token){
  const api = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
  const res = await fetch(api, { headers: ghHeaders(token) });

  if(res.status === 404) return null;
  if(!res.ok){
    const t = await res.text();
    throw new Error(t);
  }
  return await res.json(); // { sha, content? ...}
}

async function githubPut(path, contentBase64, message, token, sha){
  const api = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;

  const body = {
    message: message || `Update ${path}`,
    content: contentBase64
  };
  if(sha) body.sha = sha;

  const res = await fetch(api, {
    method: "PUT",
    headers: { ...ghHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if(!res.ok){
    const t = await res.text();
    throw new Error(t);
  }
  return await res.json();
}

async function validateToken(token){
  // лёгкая проверка: читаем мету dishes.json
  await githubGetMeta(GH_DISHES_PATH, token);
  return true;
}

async function ensureToken(){
  // 1) пробуем сохранённый
  let token = getSavedToken();
  if(token){
    try{
      await validateToken(token);
      return token;
    }catch{
      clearSavedToken();
      token = "";
    }
  }

  // 2) спрашиваем у пользователя, пока не отменит или не введёт рабочий
  while(true){
    const t = await openTokenModal({ title: "Токен для сохранения" });
    if(!t) return null;

    try{
      await validateToken(t);
      return t;
    }catch(e){
      // покажем ошибку прямо в токен-окне
      const err = document.getElementById("tokenError");
      const wrap = document.getElementById("tokenWrap");
      if(err && wrap){
        wrap.classList.add("open");
        wrap.setAttribute("aria-hidden","false");
        err.style.display = "block";
        err.textContent = "Токен не подошёл (истёк / нет прав / не тот репозиторий).\n\n" + (e?.message || "");
        const inp = document.getElementById("tokenInput");
        if(inp) inp.value = t;
      }else{
        showToast("Ошибка", "Токен не подошёл: " + (e?.message || e), 6000, "err");
      }
      // дальше пользователь может снова нажать “Использовать”
      clearSavedToken();
    }
  }
}

/* =========================
   UI icons for save button
========================= */
const ICON_SPIN = `
<svg class="spinIcon" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round">
  <path d="M21 12a9 9 0 1 1-3-6.7"/>
  <path d="M21 3v6h-6"/>
</svg>`;

const ICON_DONE = `
<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round">
  <path d="M20 6L9 17l-5-5"/>
</svg>`;

function setBtnState(btn, state, fallbackText){
  // state: "idle" | "spin" | "done"
  if(!btn) return;
  if(!btn.dataset.origHtml) btn.dataset.origHtml = btn.innerHTML;

  if(state === "spin"){
    btn.innerHTML = ICON_SPIN;
    btn.classList.add("isSpinning");
    return;
  }
  if(state === "done"){
    btn.innerHTML = ICON_DONE;
    btn.classList.remove("isSpinning");
    return;
  }
  // idle
  btn.classList.remove("isSpinning");
  btn.innerHTML = btn.dataset.origHtml || fallbackText || "Сохранить в GitHub";
}

/* =========================
   App state
========================= */
let dishes = [];
let filtered = [];

let currentDelivery = "Все";
let currentCategory = "Все";
let currentSort = "Название A→Z";
let query = "";

let editMode = "add"; // add | edit
let editingId = null;

const backToSite = qs("#backToSite");
const listEl = qs("#list");
const emptyEl = qs("#empty");

const addBtn = qs("#addBtn");
const saveGithubBtn = qs("#saveGithubBtn");
const exportBtn = qs("#exportBtn");
const resetBtn = qs("#resetBtn");
const logoutBtn = qs("#logoutBtn");
const deleteSelectedBtn = qs("#deleteSelectedBtn");

const deliveryDrop = qs("#deliveryDrop");
const categoryDrop = qs("#categoryDrop");
const sortDrop = qs("#sortDrop");
const deliveryValue = qs("#deliveryValue");
const categoryValue = qs("#categoryValue");
const sortValue = qs("#sortValue");

const searchInput = qs("#searchInput");
const clearSearch = qs("#clearSearch");

const modalWrap = qs("#modalWrap");
const modalTitle = qs("#modalTitle");
const closeModal = qs("#closeModal");
const cancelBtn = qs("#cancelBtn");
const saveBtn = qs("#saveBtn");

const f_id = qs("#f_id");
const f_delivery = qs("#f_delivery");
const f_category = qs("#f_category");
const f_name = qs("#f_name");
const f_desc = qs("#f_desc");
const f_photo = qs("#f_photo");

/* =========================
   Auth
========================= */
async function requireAuth(){
  if(isAdmin()) return true;

  const wrap = qs("#loginWrap");
  const pass = qs("#loginPass");
  const okBtn = qs("#loginOk");
  const cancelBtn = qs("#loginCancel");
  const err = qs("#loginError");

  function open(){
    wrap.classList.add("open");
    wrap.setAttribute("aria-hidden","false");
    err.style.display = "none";
    pass.value = "";
    setTimeout(()=>pass.focus(), 50);
  }
  function close(){
    wrap.classList.remove("open");
    wrap.setAttribute("aria-hidden","true");
  }

  return await new Promise((resolve)=>{
    open();

    const cleanup = ()=>{
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      wrap.removeEventListener("click", onBackdrop);
      pass.removeEventListener("keydown", onKey);
    };

    const onOk = ()=>{
      if(pass.value === ADMIN_PASSWORD){
        setAdminSession(true);
        close();
        cleanup();
        resolve(true);
      }else{
        err.style.display = "block";
        pass.select();
      }
    };

    const onCancel = ()=>{
      close();
      cleanup();
      location.href = "index.html";
      resolve(false);
    };

    const onBackdrop = (e)=>{
      if(e.target === wrap) onCancel();
    };

    const onKey = (e)=>{
      if(e.key === "Enter") onOk();
      if(e.key === "Escape") onCancel();
    };

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    wrap.addEventListener("click", onBackdrop);
    pass.addEventListener("keydown", onKey);
  });
}

/* =========================
   Filters / render
========================= */
function norm(s){ return (s ?? "").toString().trim().toLowerCase(); }
function getCategories(){ return ["Все", ...uniqSorted(dishes.map(d => d.category))]; }

function applyFilters(){
  const q = norm(query);
  filtered = dishes.filter(d=>{
    const okDel = (currentDelivery === "Все") || d.delivery === currentDelivery;
    const okCat = (currentCategory === "Все") || d.category === currentCategory;
    const okQ = !q || norm(d.name).includes(q);
    return okDel && okCat && okQ;
  });

  filtered = sortDishes(filtered, currentSort);
  renderList();
}

function renderList(){
  listEl.innerHTML = "";

  if(!filtered.length){
    emptyEl.style.display = "block";
    return;
  }
  emptyEl.style.display = "none";

  for(const d of filtered){
    const row = document.createElement("div");
    row.className = "row";

    row.innerHTML = `
      <div class="rowLeft">
        <input type="checkbox" class="bulkCheck" data-id="${d.id}" />
        <img class="thumb" src="${d.photo}" alt="" />
        <div class="rowText">
          <div class="rowMeta">
            <span>${d.delivery}</span>
            <span>—</span>
            <span>${d.category}</span>
          </div>
          <div class="rowName" title="${escapeAttr(d.name)}">${escapeText(d.name)}</div>
        </div>
      </div>

      <div class="rowRight">
        <button class="iconBtn" data-act="edit" title="Редактировать">
          <img src="assets/icons/edit.svg" alt="edit" />
        </button>
        <button class="iconBtn delete" data-act="delete" title="Удалить">
          <img src="assets/icons/delete.svg" alt="delete" />
        </button>
      </div>
    `;

    row.querySelector('[data-act="edit"]').addEventListener("click", ()=>openEdit(d.id));
    row.querySelector('[data-act="delete"]').addEventListener("click", ()=>removeDish(d.id));

    listEl.appendChild(row);
  }
}

function escapeText(s){ return (s ?? "").toString(); }
function escapeAttr(s){ return (s ?? "").toString().replaceAll('"', "&quot;"); }

/* =========================
   Persist local override
========================= */
function persist(){
  setOverride(dishes);
  refreshCategoryDropdown();
  applyFilters();
}

function refreshCategoryDropdown(){
  const categoryMenu = categoryDrop.querySelector(".menu");
  const cats = getCategories();
  if(currentCategory !== "Все" && !cats.includes(currentCategory)){
    currentCategory = "Все";
    setText(categoryValue, "Все");
  }
  buildMenu(categoryMenu, cats, currentCategory);
}

/* =========================
   Dropdowns / search
========================= */
function setupDropdowns(){
  const deliveryMenu = deliveryDrop.querySelector(".menu");
  buildMenu(deliveryMenu, DELIVERY_LIST, currentDelivery);
  wireDropdown(deliveryDrop, (val)=>{
    currentDelivery = val;
    setText(deliveryValue, val);
    buildMenu(deliveryMenu, DELIVERY_LIST, currentDelivery);
    applyFilters();
  });

  const categoryMenu = categoryDrop.querySelector(".menu");
  buildMenu(categoryMenu, getCategories(), currentCategory);
  wireDropdown(categoryDrop, (val)=>{
    currentCategory = val;
    setText(categoryValue, val);
    buildMenu(categoryMenu, getCategories(), currentCategory);
    applyFilters();
  });

  const sortMenu = sortDrop.querySelector(".menu");
  buildMenu(sortMenu, SORT_OPTIONS, currentSort);
  wireDropdown(sortDrop, (val)=>{
    currentSort = val;
    setText(sortValue, val);
    buildMenu(sortMenu, SORT_OPTIONS, currentSort);
    applyFilters();
  });
}

function wireSearch(){
  const syncClear = ()=> clearSearch.style.display = searchInput.value ? "block" : "none";
  clearSearch.style.display = "none";

  searchInput.addEventListener("input", ()=>{
    query = searchInput.value;
    syncClear();
    applyFilters();
  });

  clearSearch.addEventListener("click", ()=>{
    searchInput.value = "";
    query = "";
    syncClear();
    applyFilters();
    searchInput.focus();
  });

  syncClear();
}

/* =========================
   Modal add/edit
========================= */
function openModal(){
  modalWrap.classList.add("open");
  modalWrap.setAttribute("aria-hidden","false");
}
function closeModalFn(){
  modalWrap.classList.remove("open");
  modalWrap.setAttribute("aria-hidden","true");
}

function fillDeliverySelect(){
  const list = DELIVERY_LIST.filter(x => x !== "Все");
  f_delivery.innerHTML = "";
  for(const d of list){
    const opt = document.createElement("option");
    opt.value = d;
    opt.textContent = d;
    f_delivery.appendChild(opt);
  }
}

function openAdd(){
  editMode = "add";
  editingId = null;
  modalTitle.textContent = "Добавить блюдо";

  f_id.disabled = false;
  f_id.value = "";
  f_delivery.value = DELIVERY_LIST.filter(x=>x!=="Все")[0] || "";
  f_category.value = "";
  f_name.value = "";
  f_desc.value = "";
  if(f_photo) f_photo.value = "";

  openModal();
}

function openEdit(id){
  const d = dishes.find(x => x.id === id);
  if(!d) return;

  editMode = "edit";
  editingId = id;
  modalTitle.textContent = "Редактировать блюдо";

  f_id.value = d.id;
  f_id.disabled = true;
  f_delivery.value = d.delivery;
  f_category.value = d.category;
  f_name.value = d.name;
  f_desc.value = d.description;
  if(f_photo) f_photo.value = "";

  openModal();
}

function removeDish(id){
  const d = dishes.find(x=>x.id===id);
  if(!d) return;
  if(!confirm(`Удалить блюдо "${d.name}"?`)) return;

  dishes = dishes.filter(x=>x.id!==id);
  persist();
}

/* =========================
   Photo upload (uses token)
========================= */
async function uploadPhotoToGithub(file, dishName){
  const token = await ensureToken();
  if(!token) throw new Error("Сохранение отменено.");

  const baseName = (dishName || "photo").toLowerCase().replace(/[^a-z0-9а-яё]/gi,"_");
  let fileName = baseName + ".jpg";
  let counter = 1;

  while(dishes.some(d => (d.photo || "").includes(fileName))){
    fileName = baseName + "_" + counter + ".jpg";
    counter++;
  }

  const base64 = await new Promise((resolve)=>{
    const reader = new FileReader();
    reader.onload = ()=> resolve(String(reader.result).split(",")[1]);
    reader.readAsDataURL(file);
  });

  const fullPath = `${GH_PHOTOS_DIR}${fileName}`;
  const meta = await githubGetMeta(fullPath, token); // null if not exists
  const sha = meta?.sha;

  await githubPut(
    fullPath,
    base64,
    `Upload photo ${fileName}`,
    token,
    sha
  );

  return `assets/photos/${fileName}`; // относительный путь в проекте
}

async function saveDish(){
  const id = (f_id.value || "").trim();
  const delivery = (f_delivery.value || "").trim();
  const category = (f_category.value || "").trim();
  const name = (f_name.value || "").trim();
  const description = (f_desc.value || "").toString();

  if(!id || !delivery || !category || !name || !description){
    alert("Заполни все поля.");
    return;
  }

  // по умолчанию: при edit оставляем старое фото, при add — заглушка
  let photoPath = (editMode === "edit")
    ? (dishes.find(x => x.id === editingId)?.photo || PLACEHOLDER_PHOTO)
    : PLACEHOLDER_PHOTO;

  // загрузка фото (если выбрано)
  if(f_photo && f_photo.files && f_photo.files[0]){
    photoPath = await uploadPhotoToGithub(f_photo.files[0], name);
  }

  if(editMode === "add"){
    if(dishes.some(x=>x.id === id)){
      alert("ID уже существует.");
      return;
    }

    dishes = normalizeDishes([...dishes, {
      id,
      delivery,
      category,
      name,
      photo: photoPath,
      description
    }]);

  } else {

    dishes = normalizeDishes(dishes.map(x=>{
      if(x.id !== editingId) return x;
      return {
        ...x,
        delivery,
        category,
        name,
        photo: photoPath || x.photo || PLACEHOLDER_PHOTO,
        description
      };
    }));
  }

  persist();
  closeModalFn();
}

/* =========================
   Export / Save GitHub
========================= */
function exportJson(){
  const text = JSON.stringify(dishes, null, 2);
  downloadTextFile("dishes.json", text);
  showToast("Бэкап", "Скачан dishes.json", 2500, "info");
}

async function saveGithub(){
  try{
    saveGithubBtn.disabled = true;
    setBtnState(saveGithubBtn, "spin");

    const token = await ensureToken();
    if(!token){
      setBtnState(saveGithubBtn, "idle");
      return;
    }

    // 1) берём sha текущего dishes.json
    const meta = await githubGetMeta(GH_DISHES_PATH, token);
    const sha = meta?.sha;

    // 2) пушим новый json
    const jsonText = JSON.stringify(dishes, null, 2);
    await githubPut(
      GH_DISHES_PATH,
      toBase64Utf8(jsonText),
      "Update dishes.json via web",
      token,
      sha
    );

    // ✅ успех
    clearOverride();
    setBtnState(saveGithubBtn, "done");
    showToast("Готово", "Изменения сохранены. Обновление займёт 10–60 секунд.", 4500, "ok");

    setTimeout(()=> setBtnState(saveGithubBtn, "idle"), 1400);

  }catch(e){
    console.error(e);
    setBtnState(saveGithubBtn, "idle");
    showToast("Ошибка", "Не удалось сохранить: " + (e?.message || e), 6500, "err");
  }finally{
    saveGithubBtn.disabled = false;
  }
}

/* =========================
   Init
========================= */
async function init(){
  if(!(await requireAuth())) return;

  backToSite.addEventListener("click", ()=> location.href = "index.html");

  logoutBtn.addEventListener("click", ()=>{
    setAdminSession(false);
    location.href = "index.html";
  });

  addBtn.addEventListener("click", openAdd);
  closeModal.addEventListener("click", closeModalFn);
  cancelBtn.addEventListener("click", closeModalFn);
  modalWrap.addEventListener("click", (e)=>{ if(e.target === modalWrap) closeModalFn(); });
  saveBtn.addEventListener("click", saveDish);

  exportBtn.addEventListener("click", exportJson);
  saveGithubBtn.addEventListener("click", saveGithub);

  resetBtn.addEventListener("click", async ()=>{
    if(!confirm("Сбросить локальные изменения (localStorage)?")) return;
    clearOverride();
    dishes = await loadDishes();
    refreshCategoryDropdown();
    applyFilters();
    showToast("Готово", "Локальные изменения очищены.", 3000, "info");
  });

  deleteSelectedBtn.addEventListener("click", ()=>{
    const checked = [...document.querySelectorAll(".bulkCheck:checked")];
    if(!checked.length){
      alert("Выберите блюда для удаления.");
      return;
    }
    if(!confirm("Удалить выбранные блюда?")) return;

    const ids = checked.map(cb => cb.dataset.id);
    dishes = dishes.filter(d => !ids.includes(d.id));
    persist();
  });

  fillDeliverySelect();
  dishes = await loadDishes();
  setupDropdowns();
  wireSearch();
  applyFilters();

  // Scroll To Top
  const toTopBtn = document.querySelector("#toTopBtn");
  if(toTopBtn){
    const toggle = ()=>{
      if(window.scrollY > 400) toTopBtn.classList.add("show");
      else toTopBtn.classList.remove("show");
    };

    window.addEventListener("scroll", toggle, { passive: true });
    toggle();

    toTopBtn.addEventListener("click", ()=>{
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
}

init();