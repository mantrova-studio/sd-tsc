const f_photo = qs("#f_photo");
const deleteSelectedBtn = qs("#deleteSelectedBtn");

import {
  loadDishes, normalizeDishes, uniqSorted, qs, setText,
  DELIVERY_LIST, SORT_OPTIONS, sortDishes,
  wireDropdown, buildMenu,
  PLACEHOLDER_PHOTO,
  ADMIN_PASSWORD, isAdmin, setAdminSession,
  setOverride, clearOverride,
  downloadTextFile,
  githubSaveDishes
} from "./common.js";

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

function requireAuth(){
  if(isAdmin()) return true;
  const input = prompt("Введите пароль администратора:");
  if(input === ADMIN_PASSWORD){
    setAdminSession(true);
    return true;
  }
  alert("Неверный пароль.");
  location.href = "index.html";
  return false;
}

function norm(s){ return (s ?? "").toString().trim().toLowerCase(); }

function getCategories(){
  return ["Все", ...uniqSorted(dishes.map(d => d.category))];
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

function persist(){
  // сохраняем как локальный override (страховка, пока не нажали "Сохранить в GitHub")
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

  openModal();
}

function removeDish(id){
  const d = dishes.find(x=>x.id===id);
  if(!d) return;
  if(!confirm(`Удалить блюдо "${d.name}"?`)) return;

  dishes = dishes.filter(x=>x.id!==id);
  persist();
}

function saveDish(){
  const id = (f_id.value || "").trim();
  const delivery = (f_delivery.value || "").trim();
  const category = (f_category.value || "").trim();
  const name = (f_name.value || "").trim();
  const description = (f_desc.value || "").toString();

  if(!id || !delivery || !category || !name || !description){
    alert("Заполни все поля.");
    return;
  }

  if(editMode === "add"){
    if(dishes.some(x=>x.id === id)){
      alert("ID уже существует. Укажи другой ID.");
      return;
    }
    dishes = normalizeDishes([...dishes, {
      id, delivery, category, name,
      photo: PLACEHOLDER_PHOTO,
      description
    }]);
  }else{
    dishes = normalizeDishes(dishes.map(x=>{
      if(x.id !== editingId) return x;
      return {
        id: x.id, delivery, category, name,
        photo: x.photo || PLACEHOLDER_PHOTO,
        description
      };
    }));
  }

  persist();
  closeModalFn();
}

function exportJson(){
  const text = JSON.stringify(dishes, null, 2);
  downloadTextFile("dishes.json", text);
  alert("Скачан dishes.json. Можно использовать как бэкап.");
}

async function saveGithub(){
  try{
    saveGithubBtn.disabled = true;
    saveGithubBtn.textContent = "Сохраняю...";
    await githubSaveDishes(dishes);
    // После успешного коммита можно очистить local override, чтобы не путаться
    clearOverride();
    saveGithubBtn.textContent = "Сохранено ✓";
    setTimeout(()=> saveGithubBtn.textContent = "Сохранить в GitHub", 1200);
    alert("Сохранено в GitHub. GitHub Pages обновится автоматически.");
  }catch(e){
    console.error(e);
    alert("Ошибка сохранения в GitHub: " + e.message);
    saveGithubBtn.textContent = "Сохранить в GitHub";
  }finally{
    saveGithubBtn.disabled = false;
  }
}

async function init(){
  if(!requireAuth()) return;

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
    alert("Локальные изменения очищены.");
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
}

init();
