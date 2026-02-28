import {
  loadDishes, normalizeDishes, uniqSorted, qs, setText,
  DELIVERY_LIST, SORT_OPTIONS, sortDishes,
  wireDropdown, buildMenu,
  PLACEHOLDER_PHOTO,
  ADMIN_PASSWORD, isAdmin, setAdminSession,
  setOverride, clearOverride,
  downloadTextFile,
  githubSaveDishes, githubUploadFile,
  getGithubToken, setGithubToken, clearGithubToken, githubValidateToken
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
const exportBtn = qs("#exportBtn"); // может быть закомментирована в HTML
const resetBtn = qs("#resetBtn");   // может быть закомментирована в HTML
const logoutBtn = qs("#logoutBtn");
const deleteSelectedBtn = qs("#deleteSelectedBtn");// Нормализуем пути, чтобы работало и на /tsc/admin.html, и если сервер откроет как /tsc/admin
function resolveTscPath(p){
  if(!p) return p;
  const str = String(p);
  if(str.startsWith("http://") || str.startsWith("https://")) return str;
  if(str.startsWith("/")) return str;
  if(str.startsWith("assets/")) return "/tsc/" + str;
  return str; // на всякий случай
}

function updateBulkDeleteBtn(){
  if(!deleteSelectedBtn) return;
  const selectedCount = document.querySelectorAll(".bulkCheck:checked").length;
  const shouldShow = selectedCount > 0;

  deleteSelectedBtn.classList.toggle("is-hidden", !shouldShow);
  deleteSelectedBtn.disabled = !shouldShow;

  const badge = deleteSelectedBtn.querySelector(".badgeCount");
  if(badge) badge.textContent = String(selectedCount);
}

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

// GitHub token modal
const tokenWrap = qs("#tokenWrap");
const tokenClose = qs("#tokenClose");
const tokenCancel = qs("#tokenCancel");
const tokenInput = qs("#tokenInput");
const tokenRemember = qs("#tokenRemember");
const tokenStatus = qs("#tokenStatus");
const tokenCheckBtn = qs("#tokenCheckBtn");
const tokenSaveBtn = qs("#tokenSaveBtn");

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
        <img class="thumb" src="${resolveTscPath(d.photo)}" alt="" />
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
          <img src="/tsc/assets/icons/edit.svg" alt="edit" />
        </button>
        <button class="iconBtn delete" data-act="delete" title="Удалить">
          <img src="/tsc/assets/icons/delete.svg" alt="delete" />
        </button>
      </div>
    `;

    row.querySelector('[data-act="edit"]').addEventListener("click", ()=>openEdit(d.id));
    row.querySelector('[data-act="delete"]').addEventListener("click", ()=>removeDish(d.id));

    listEl.appendChild(row);
  }
  updateBulkDeleteBtn();
}

function escapeText(s){ return (s ?? "").toString(); }
function escapeAttr(s){ return (s ?? "").toString().replaceAll('"', "&quot;"); }

function persist(){
  // сохраняем как локальный override (страховка, пока не нажали "Сохранить в GitHub")
  setOverride(dishes);
  refreshCategoryDropdown();
  applyFilters();

  // показывать/скрывать кнопку удаления выбранных
  listEl.addEventListener("change", (e)=>{
    const t = e.target;
    if(t && t.classList && t.classList.contains("bulkCheck")) updateBulkDeleteBtn();
  });
}

function openTokenModal({ prefFill = true } = {}){
  if(!tokenWrap) return Promise.resolve(null);

  tokenStatus.textContent = "";
  tokenStatus.className = "tokenStatus";

  const saved = getGithubToken();
  tokenRemember.checked = !!saved;

  // по умолчанию не светим токен целиком — но даём подсказку, что он сохранён
  if(prefFill && saved){
    tokenInput.value = saved;
  }else{
    tokenInput.value = "";
  }

  tokenWrap.classList.add("open");
  tokenWrap.setAttribute("aria-hidden", "false");
  setTimeout(()=> tokenInput.focus(), 50);

  return new Promise((resolve)=>{
    let busy = false;

    const setBusy = (v)=>{
      busy = v;
      tokenSaveBtn.disabled = v;
      tokenCheckBtn.disabled = v;
    };

    const close = (result)=>{
      tokenWrap.classList.remove("open");
      tokenWrap.setAttribute("aria-hidden", "true");
      cleanup();
      resolve(result);
    };

    const setStatus = (text, kind = "")=>{
      tokenStatus.textContent = text || "";
      tokenStatus.className = "tokenStatus" + (kind ? ` ${kind}` : "");
    };

    const onBackdrop = (e)=>{ if(e.target === tokenWrap && !busy) close(null); };
    const onCancel = ()=>{ if(!busy) close(null); };
    const onClose = ()=>{ if(!busy) close(null); };
    const onKey = (e)=>{
      if(e.key === "Escape") onCancel();
      if(e.key === "Enter") onSave();
    };

    const onCheck = async ()=>{
      setBusy(true);
      setStatus("Проверяю ключ…");
      try{
        const res = await githubValidateToken(tokenInput.value);
        if(res.ok) setStatus(res.message, "ok");
        else setStatus(res.message, "bad");
        return res.ok;
      }catch(err){
        console.error(err);
        setStatus("Ошибка проверки ключа.", "bad");
        return false;
      }finally{
        setBusy(false);
      }
    };

    const onSave = async ()=>{
      const ok = await onCheck();
      if(!ok) return;

      const t = (tokenInput.value || "").trim();
      if(tokenRemember.checked) setGithubToken(t);
      else clearGithubToken();

      close(t);
    };

    const cleanup = ()=>{
      tokenWrap.removeEventListener("click", onBackdrop);
      tokenCancel.removeEventListener("click", onCancel);
      tokenClose.removeEventListener("click", onClose);
      tokenCheckBtn.removeEventListener("click", onCheck);
      tokenSaveBtn.removeEventListener("click", onSave);
      tokenInput.removeEventListener("keydown", onKey);
    };

    tokenWrap.addEventListener("click", onBackdrop);
    tokenCancel.addEventListener("click", onCancel);
    tokenClose.addEventListener("click", onClose);
    tokenCheckBtn.addEventListener("click", onCheck);
    tokenSaveBtn.addEventListener("click", onSave);
    tokenInput.addEventListener("keydown", onKey);
  });
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

  // показывать/скрывать кнопку удаления выбранных
  listEl.addEventListener("change", (e)=>{
    const t = e.target;
    if(t && t.classList && t.classList.contains("bulkCheck")) updateBulkDeleteBtn();
  });
  });

  const categoryMenu = categoryDrop.querySelector(".menu");
  buildMenu(categoryMenu, getCategories(), currentCategory);
  wireDropdown(categoryDrop, (val)=>{
    currentCategory = val;
    setText(categoryValue, val);
    buildMenu(categoryMenu, getCategories(), currentCategory);
    applyFilters();

  // показывать/скрывать кнопку удаления выбранных
  listEl.addEventListener("change", (e)=>{
    const t = e.target;
    if(t && t.classList && t.classList.contains("bulkCheck")) updateBulkDeleteBtn();
  });
  });

  const sortMenu = sortDrop.querySelector(".menu");
  buildMenu(sortMenu, SORT_OPTIONS, currentSort);
  wireDropdown(sortDrop, (val)=>{
    currentSort = val;
    setText(sortValue, val);
    buildMenu(sortMenu, SORT_OPTIONS, currentSort);
    applyFilters();

  // показывать/скрывать кнопку удаления выбранных
  listEl.addEventListener("change", (e)=>{
    const t = e.target;
    if(t && t.classList && t.classList.contains("bulkCheck")) updateBulkDeleteBtn();
  });
  });
}

function wireSearch(){
  const syncClear = ()=> clearSearch.style.display = searchInput.value ? "block" : "none";
  clearSearch.style.display = "none";

  searchInput.addEventListener("input", ()=>{
    query = searchInput.value;
    syncClear();
    applyFilters();

  // показывать/скрывать кнопку удаления выбранных
  listEl.addEventListener("change", (e)=>{
    const t = e.target;
    if(t && t.classList && t.classList.contains("bulkCheck")) updateBulkDeleteBtn();
  });
  });

  clearSearch.addEventListener("click", ()=>{
    searchInput.value = "";
    query = "";
    syncClear();
    applyFilters();

  // показывать/скрывать кнопку удаления выбранных
  listEl.addEventListener("change", (e)=>{
    const t = e.target;
    if(t && t.classList && t.classList.contains("bulkCheck")) updateBulkDeleteBtn();
  });
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

  // ===== ЗАГРУЗКА ФОТО =====
  if(f_photo && f_photo.files && f_photo.files[0]){
    // Для загрузки фото нужен токен (т.к. фото коммитится сразу в репо)
    if(!getGithubToken()){
      const t = await openTokenModal({ prefFill:false });
      if(!t){
        alert("Чтобы загрузить фото, нужен ключ сохранения. Операция отменена.");
        return;
      }
    }

    const file = f_photo.files[0];

    const baseName = name.toLowerCase().replace(/[^a-z0-9а-яё]/gi,"_");
    let fileName = baseName + ".jpg";
    let counter = 1;

    while(dishes.some(d => (d.photo || "").includes(fileName))){
      fileName = baseName + "_" + counter + ".jpg";
      counter++;
    }

    const reader = new FileReader();

    const base64 = await new Promise(resolve=>{
      reader.onload = ()=> resolve(reader.result.split(",")[1]);
      reader.readAsDataURL(file);
    });

    await githubUploadFile(
      `tsc/assets/photos/${fileName}`,
      base64,
      `Upload photo ${fileName}`
    );

    photoPath = `assets/photos/${fileName}`;
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

function exportJson(){
  const text = JSON.stringify(dishes, null, 2);
  downloadTextFile("dishes.json", text);
  alert("Скачан dishes.json. Можно использовать как бэкап.");
}

async function saveGithub(){
  try{
    const token = await openTokenModal({ prefFill:true });
    if(!token) return;

    saveGithubBtn.disabled = true;
    saveGithubBtn.dataset.loading = "1";
    await githubSaveDishes(dishes, token);
    // После успешного коммита можно очистить local override, чтобы не путаться
    clearOverride();
    saveGithubBtn.dataset.state = "ok";
    setTimeout(()=>{ delete saveGithubBtn.dataset.state; }, 1200);
    alert("Сохранено. Обновление займёт 10-60 секунд.");
  }catch(e){
    console.error(e);
    alert("Ошибка сохранения: " + e.message);
  }finally{
    saveGithubBtn.disabled = false;
    delete saveGithubBtn.dataset.loading;
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

  if(exportBtn) exportBtn.addEventListener("click", exportJson);
  saveGithubBtn.addEventListener("click", saveGithub);

  if(resetBtn) resetBtn.addEventListener("click", async ()=>{
    if(!confirm("Сбросить локальные изменения (localStorage)?")) return;
    clearOverride();
    dishes = await loadDishes();
    refreshCategoryDropdown();
    applyFilters();

  // показывать/скрывать кнопку удаления выбранных
  listEl.addEventListener("change", (e)=>{
    const t = e.target;
    if(t && t.classList && t.classList.contains("bulkCheck")) updateBulkDeleteBtn();
  });
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

  // показывать/скрывать кнопку удаления выбранных
  listEl.addEventListener("change", (e)=>{
    const t = e.target;
    if(t && t.classList && t.classList.contains("bulkCheck")) updateBulkDeleteBtn();
  });

// ===== Scroll To Top =====
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
