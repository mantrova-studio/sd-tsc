import {
  loadDishes, normalizeDishes, uniqSorted, qs, setText,
  DELIVERY_LIST, SORT_OPTIONS, sortDishes,
  wireDropdown, buildMenu,
  PLACEHOLDER_PHOTO,
  ADMIN_PASSWORD, isAdmin, setAdminSession,
  setOverride, clearOverride,
  downloadTextFile,

  // GitHub save (token via modal now)
  githubEnsureTokenModal, githubSaveWithModal
} from "./common.js";

/* =========================
   GitHub settings (techcards)
========================= */
const GITHUB_OWNER = "mantrova-studio";
const GITHUB_REPO  = "sd-tsc"; // <-- если репо другое, поменяй тут

// Авто-определение базовой папки проекта внутри репо (например "tsc/")
function guessBaseDir(){
  const parts = (location.pathname || "").split("/").filter(Boolean);
  // Если открыли .../tsc/admin.html -> baseDir = "tsc/"
  const idx = parts.indexOf("tsc");
  if(idx >= 0) return "tsc/";
  return "";
}
const BASE_DIR = guessBaseDir();

// Где лежит JSON внутри репо:
const JSON_PATH = `${BASE_DIR}data/dishes.json`;

/* =========================
   UI bindings
========================= */
const backToSite = qs("#backToSite");
const listEl = qs("#list");
const emptyEl = qs("#empty");

const addBtn = qs("#addBtn");
const saveGithubBtn = qs("#saveGithubBtn");
const exportBtn = qs("#exportBtn"); // может быть закомментирована в HTML
const resetBtn = qs("#resetBtn");   // может быть закомментирована в HTML
const logoutBtn = qs("#logoutBtn");
const deleteSelectedBtn = qs("#deleteSelectedBtn");

// Показывать/скрывать кнопку "Удалить выбранные" только когда есть выбранные чекбоксы
function updateBulkDeleteBtn(){
  if(!deleteSelectedBtn) return;
  const selectedCount = document.querySelectorAll(".bulkCheck:checked").length;
  const shouldShow = selectedCount > 0;

  deleteSelectedBtn.classList.toggle("is-hidden", !shouldShow);
  deleteSelectedBtn.disabled = !shouldShow;
}

const deliveryDrop = qs("#deliveryDrop");
const categoryDrop = qs("#categoryDrop");
const sortDrop = qs("#sortDrop");
const deliveryValue = qs("#deliveryValue");
const categoryValue = qs("#categoryValue");
const sortValue = qs("#sortValue");
const deliveryMenu = qs("#deliveryMenu");
const categoryMenu = qs("#categoryMenu");
const sortMenu = qs("#sortMenu");
const searchInput = qs("#searchInput");

const modal = qs("#modal");
const modalTitle = qs("#modalTitle");
const closeModal = qs("#closeModal");
const cancelBtn = qs("#cancelBtn");
const saveBtn = qs("#saveBtn");

const f_delivery = qs("#f_delivery");
const f_category = qs("#f_category");
const f_name = qs("#f_name");
const f_id = qs("#f_id");
const f_photo = qs("#f_photo");
const f_desc = qs("#f_desc");

/* =========================
   State
========================= */
let dishes = [];
let filtered = [];
let editingId = null;

let currentDelivery = "Все";
let currentCategory = "Все";
let currentSort = SORT_OPTIONS[0]?.value || "name_asc";
let query = "";

/* =========================
   Helpers
========================= */
function norm(s){ return (s||"").toString().trim().toLowerCase(); }
function escapeText(s){ return (s||"").toString().replace(/[&<>"']/g, (m)=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[m])); }
function escapeAttr(s){ return escapeText(s); }

function requireAuth(){
  // если уже админ — ок
  if(isAdmin()) return true;

  const pass = prompt("Пароль админки:");
  if(pass === ADMIN_PASSWORD){
    setAdminSession(true);
    return true;
  }
  alert("Неверный пароль.");
  return false;
}

function persist(){
  // локально сохраняем override, чтобы сайт сразу менялся
  setOverride(dishes);
}

function refreshCategoryDropdown(){
  const cats = ["Все", ...uniqSorted(dishes.map(d => d.category))];
  buildMenu(categoryMenu, cats, (val)=>{
    currentCategory = val;
    setText(categoryValue, val);
    applyFilters();
  });
}

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
    updateBulkDeleteBtn();
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

    row.addEventListener("click", (e)=>{
      const t = e.target;
      const btn = t.closest?.("button");
      if(btn){
        const act = btn.dataset.act;
        if(act === "edit"){ openEdit(d.id); }
        if(act === "delete"){ removeOne(d.id); }
        e.stopPropagation();
        return;
      }
    });

    listEl.appendChild(row);
  }
  updateBulkDeleteBtn();
}

function openModal(title){
  modalTitle.textContent = title;
  modal.style.display = "flex";
}

function closeModalUI(){
  modal.style.display = "none";
  editingId = null;
}

function fillForm(d){
  f_delivery.value = d?.delivery || "";
  f_category.value = d?.category || "";
  f_name.value = d?.name || "";
  f_id.value = d?.id || "";
  f_photo.value = d?.photo || "";
  f_desc.value = d?.description || "";
}

function collectForm(){
  const delivery = f_delivery.value.trim();
  const category = f_category.value.trim();
  const name = f_name.value.trim();
  let id = f_id.value.trim();
  const photo = f_photo.value.trim() || PLACEHOLDER_PHOTO;
  const description = f_desc.value.trim();

  if(!delivery || !category || !name){
    alert("Заполните: Доставка, Категория, Название");
    return null;
  }

  // если id пустой — генерим
  if(!id){
    id = `${norm(category).replace(/\s+/g,"-")}-${Date.now()}`;
  }

  return { id, delivery, category, name, photo, description };
}

function openAdd(){
  editingId = null;
  fillForm(null);
  openModal("Добавить блюдо");
}

function openEdit(id){
  const d = dishes.find(x=>x.id===id);
  if(!d) return;
  editingId = id;
  fillForm(d);
  openModal("Редактировать блюдо");
}

function saveForm(){
  const data = collectForm();
  if(!data) return;

  if(editingId){
    const idx = dishes.findIndex(x=>x.id===editingId);
    if(idx>=0) dishes[idx] = data;
  }else{
    dishes.push(data);
  }

  persist();
  refreshCategoryDropdown();
  applyFilters();
  closeModalUI();
}

function removeOne(id){
  if(!confirm("Удалить блюдо?")) return;
  dishes = dishes.filter(d => d.id !== id);
  persist();
  refreshCategoryDropdown();
  applyFilters();
}

/* =========================
   Dropdowns & search
========================= */
function fillDeliverySelect(){
  buildMenu(deliveryMenu, ["Все", ...DELIVERY_LIST], (val)=>{
    currentDelivery = val;
    setText(deliveryValue, val);
    applyFilters();
  });
}
function setupDropdowns(){
  // delivery
  wireDropdown(deliveryDrop, deliveryMenu);
  wireDropdown(categoryDrop, categoryMenu);
  wireDropdown(sortDrop, sortMenu);

  buildMenu(sortMenu, SORT_OPTIONS.map(o=>o.label), (label)=>{
    const found = SORT_OPTIONS.find(o=>o.label===label);
    if(found){
      currentSort = found.value;
      setText(sortValue, found.label);
      applyFilters();
    }
  });
}
function wireSearch(){
  let t=null;
  searchInput.addEventListener("input", ()=>{
    clearTimeout(t);
    t = setTimeout(()=>{
      query = searchInput.value;
      applyFilters();
    }, 120);
  });
}

/* =========================
   Init
========================= */
async function init(){
  if(!requireAuth()) return;

  backToSite.addEventListener("click", ()=> location.href = "index.html");

  logoutBtn.addEventListener("click", ()=>{
    setAdminSession(false);
    location.href = "index.html";
  });

  addBtn.addEventListener("click", openAdd);
  closeModal.addEventListener("click", closeModalUI);
  cancelBtn.addEventListener("click", closeModalUI);
  saveBtn.addEventListener("click", saveForm);

  // ensure GitHub modal exists (created in common.js)
  githubEnsureTokenModal();

  saveGithubBtn.addEventListener("click", async ()=>{
    // сохраняем dishes в репо (dishes.json)
    await githubSaveWithModal({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path: JSON_PATH,
      json: normalizeDishes(dishes),
      commitMessage: "Update techcards dishes.json (admin)",
    });
  });

  if(exportBtn){
    exportBtn.addEventListener("click", ()=>{
      const json = JSON.stringify(normalizeDishes(dishes), null, 2);
      downloadTextFile(json, "dishes.json");
    });
  }

  if(resetBtn){
    resetBtn.addEventListener("click", async ()=>{
      if(!confirm("Сбросить локальные изменения?")) return;
      clearOverride();
      dishes = await loadDishes();
      refreshCategoryDropdown();
      applyFilters();
      alert("Локальные изменения очищены.");
    });
  }

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
    refreshCategoryDropdown();
    applyFilters();
  });

  fillDeliverySelect();
  dishes = await loadDishes();
  setupDropdowns();
  wireSearch();
  applyFilters();

  // Отслеживаем выбор чекбоксов для bulk-удаления
  listEl.addEventListener("change", (e)=>{
    const t = e.target;
    if(t && t.classList && t.classList.contains("bulkCheck")){
      updateBulkDeleteBtn();
    }
  });

// ===== Scroll To Top =====
  const toTopBtn = document.querySelector("#toTopBtn")
  window.addEventListener("scroll", ()=>{
    if(window.scrollY > 600){
      toTopBtn.classList.add("show");
    }else{
      toTopBtn.classList.remove("show");
    }
  });
  toTopBtn.addEventListener("click", ()=> window.scrollTo({top:0, behavior:"smooth"}));
}

init();