// Общие функции и настройки

export const ADMIN_PASSWORD = "601/18";

// ===== GitHub API (очень простой вариант: токен в коде) =====
// ВАЖНО: Этот токен будет виден всем, кто откроет сайт. Вы просили так.
export const GITHUB_TOKEN = "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";      // <-- вставь токен
export const GITHUB_OWNER = "mantrova-studio";       // <-- твой username
export const GITHUB_REPO  = "sd-tsc";                // <-- имя репозитория

// ВАЖНО: сайт лежит в папке /TSC в репозитории:
export const GITHUB_PATH  = "TSC/data/dishes.json";       // <-- путь файла dishes.json в репо
export const GITHUB_ASSETS_PHOTOS_DIR = "TSC/assets/photos"; // <-- куда грузим фото в репо

export const PLACEHOLDER_PHOTO = "assets/photos/placeholder.jpg";

export const DELIVERY_LIST = [
  "Все",
  "Кракен",
  "4Руки",
  "Япоша/Самурай",
  "Лососнем",
  "ЧудоПицца",
  "Банзай",
  "Прожарим",
  "Сушидза"
];

const STORAGE_KEY = "tcards_dishes_override_v2";
const FAV_KEY = "tcards_favorites_v1";
const ADMIN_SESSION_KEY = "tcards_admin_ok_v1";

export function qs(sel, root=document){ return root.querySelector(sel); }
export function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

export function escapeHtml(str){
  return (str ?? "").toString()
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

export function setText(el, text){
  if(!el) return;
  el.textContent = text ?? "";
}

export function uniqSorted(arr){
  return Array.from(new Set(arr.filter(Boolean))).sort((a,b)=>a.localeCompare(b, "ru"));
}

export function normalizeDishes(list){
  const safe = Array.isArray(list) ? list : [];
  const byId = new Map();
  for(const d of safe){
    if(!d) continue;
    const id = (d.id || "").trim();
    if(!id) continue;
    byId.set(id, {
      id,
      delivery: (d.delivery || "").trim(),
      category: (d.category || "").trim(),
      name: (d.name || "").trim(),
      photo: (d.photo || PLACEHOLDER_PHOTO).trim() || PLACEHOLDER_PHOTO,
      description: (d.description || "").toString()
    });
  }
  return Array.from(byId.values());
}

// ===== Favorites =====
export function getFavorites(){
  try{
    const raw = localStorage.getItem(FAV_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  }catch{
    return new Set();
  }
}
export function setFavorites(set){
  localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(set)));
}
export function toggleFavorite(id){
  const fav = getFavorites();
  if(fav.has(id)) fav.delete(id); else fav.add(id);
  setFavorites(fav);
  return fav;
}

// ===== Admin session =====
export function isAdmin(){ return sessionStorage.getItem(ADMIN_SESSION_KEY) === "1"; }
export function setAdminSession(ok){
  if(ok) sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
  else sessionStorage.removeItem(ADMIN_SESSION_KEY);
}

// ===== Local override for admin edits (backup) =====
export function getOverride(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return null;
    return JSON.parse(raw);
  }catch{
    return null;
  }
}
export function setOverride(dishes){ localStorage.setItem(STORAGE_KEY, JSON.stringify(dishes, null, 2)); }
export function clearOverride(){ localStorage.removeItem(STORAGE_KEY); }

// ===== Data loading =====
export async function loadDishes(){
  const res = await fetch("data/dishes.json", { cache: "no-store" });
  if(!res.ok) throw new Error("Не удалось загрузить data/dishes.json");
  const fileDishes = await res.json();
  const override = getOverride();
  if(Array.isArray(override)) return normalizeDishes(override);
  return normalizeDishes(fileDishes);
}

// ===== Icons (пути-заглушки, иконки ты можешь заменить своими) =====
export function deliveryIconPath(_deliveryName){
  return "assets/icons/delivery/default.png";
}

// ===== Dropdown helpers =====
export function buildMenu(menuEl, items, activeValue){
  menuEl.innerHTML = "";
  for(const item of items){
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("data-value", item);
    b.textContent = item;
    if(item === activeValue) b.classList.add("active");
    menuEl.appendChild(b);
  }
}

/**
 * dropdown fix: поднимаем активный dropdown наверх и закрываем корректно
 */
export function wireDropdown(dropRoot, onPick){
  const btn = qs(".dropBtn", dropRoot);
  const menu = qs(".menu", dropRoot);

  function close(){
    menu.classList.remove("open");
    dropRoot.classList.remove("open");
  }

  btn.addEventListener("click", (e)=>{
    e.stopPropagation();

    document.querySelectorAll(".menu.open").forEach(m => m.classList.remove("open"));
    document.querySelectorAll(".dropdown.open").forEach(d => d.classList.remove("open"));

    const isOpen = menu.classList.contains("open");
    if(isOpen){
      close();
    }else{
      menu.classList.add("open");
      dropRoot.classList.add("open");
    }
  });

  menu.addEventListener("click", (e)=>{
    const b = e.target.closest("button[data-value]");
    if(!b) return;
    const value = b.getAttribute("data-value");
    onPick?.(value);
    close();
  });

  document.addEventListener("click", close);
}

export function downloadTextFile(filename, text){
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}

// ===== GitHub save / upload (PUT contents API) =====
function toBase64Utf8(str){
  return btoa(unescape(encodeURIComponent(str)));
}

async function githubGetFileSha(repoPath){
  const api = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${repoPath}`;
  const res = await fetch(api, {
    headers: { "Authorization": `token ${GITHUB_TOKEN}` }
  });

  if(res.ok){
    const data = await res.json();
    return data.sha;
  }
  if(res.status === 404) return null;
  throw new Error("GitHub read failed: " + (await res.text()));
}

export async function githubPutFile({ repoPath, contentBase64, message }){
  if(!GITHUB_TOKEN || GITHUB_TOKEN.includes("PASTE_YOUR_TOKEN_HERE")){
    throw new Error("GITHUB_TOKEN не задан в js/common.js");
  }
  if(!GITHUB_OWNER || GITHUB_OWNER.includes("YOUR_GITHUB_USERNAME")){
    throw new Error("GITHUB_OWNER не задан в js/common.js");
  }

  const api = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${repoPath}`;
  const sha = await githubGetFileSha(repoPath);

  const body = {
    message: message || `Update ${repoPath}`,
    content: contentBase64
  };
  if(sha) body.sha = sha;

  const putRes = await fetch(api, {
    method: "PUT",
    headers: {
      "Authorization": `token ${GITHUB_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if(!putRes.ok){
    throw new Error("GitHub PUT failed: " + (await putRes.text()));
  }
  return await putRes.json();
}

export async function githubSaveDishes(dishes){
  const jsonText = JSON.stringify(dishes, null, 2);
  const content = toBase64Utf8(jsonText);
  return await githubPutFile({
    repoPath: GITHUB_PATH,
    contentBase64: content,
    message: "Update dishes.json via admin panel"
  });
}

// ===== Upload image to GitHub =====
function arrayBufferToBase64(buffer){
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for(let i=0;i<bytes.length;i+=chunk){
    binary += String.fromCharCode(...bytes.subarray(i, i+chunk));
  }
  return btoa(binary);
}

function sanitizeFilenameBase(name){
  let base = (name ?? "").toString().trim();
  base = base.replace(/[/\\?%*:|"<>]/g, "-");
  base = base.replace(/\s+/g, " ").trim();
  base = base.replace(/[^\p{L}\p{N} _-]+/gu, "-");
  base = base.replace(/\s/g, "-");
  base = base.replace(/-+/g, "-").replace(/^-|-$/g, "");
  return base || "photo";
}

async function githubFileExists(repoPath){
  const api = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${repoPath}`;
  const res = await fetch(api, {
    headers: { "Authorization": `token ${GITHUB_TOKEN}` }
  });
  if(res.ok) return true;
  if(res.status === 404) return false;
  throw new Error("GitHub exists check failed: " + (await res.text()));
}

function getFileExt(file){
  const fromName = (file?.name || "").split(".").pop();
  const ext = (fromName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if(ext) return ext;
  const type = (file?.type || "").toLowerCase();
  if(type.includes("png")) return "png";
  if(type.includes("webp")) return "webp";
  if(type.includes("gif")) return "gif";
  return "jpg";
}

export async function githubUploadDishPhoto(file, dishName){
  if(!(file instanceof File)){
    throw new Error("Не выбран файл фото");
  }

  const ext = getFileExt(file);
  const base = sanitizeFilenameBase(dishName);

  let n = 1;
  let filename = `${base}.${ext}`;
  let repoPath = `${GITHUB_ASSETS_PHOTOS_DIR}/${filename}`;

  while(await githubFileExists(repoPath)){
    n += 1;
    filename = `${base}-${n}.${ext}`;
    repoPath = `${GITHUB_ASSETS_PHOTOS_DIR}/${filename}`;
    if(n > 50) throw new Error("Слишком много файлов с таким именем. Переименуй блюдо.");
  }

  const buffer = await file.arrayBuffer();
  const contentBase64 = arrayBufferToBase64(buffer);

  await githubPutFile({
    repoPath,
    contentBase64,
    message: `Upload photo ${filename}`
  });

  return `assets/photos/${filename}`;
}

