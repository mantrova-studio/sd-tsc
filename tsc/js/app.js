import {
  loadDishes, uniqSorted, qs, setText,
  DELIVERY_LIST, //SORT_OPTIONS, sortDishes,
  wireDropdown, buildMenu,
  deliveryIconPath,
  getFavorites, toggleFavorite
} from "./common.js";

let allDishes = [];
let currentDelivery = "Все";
let currentCategory = "Все";
//let currentSort = "Название A→Z";
let query = "";
let favOnly = false;

const grid = qs("#grid");
const empty = qs("#empty");

const deliveryDrop = qs("#deliveryDrop");
const categoryDrop = qs("#categoryDrop");
const sortDrop = qs("#sortDrop");

const deliveryValue = qs("#deliveryValue");
const categoryValue = qs("#categoryValue");
const sortValue = qs("#sortValue");

const searchInput = qs("#searchInput");
const clearSearch = qs("#clearSearch");

const lockBtn = qs("#lockBtn");
const favOnlyBtn = qs("#favOnlyBtn");

function norm(s){ return (s ?? "").toString().trim().toLowerCase(); }

function getCategories(dishes){
  return ["Все", ...uniqSorted(dishes.map(d => d.category))];
}

function applyFilters(){
  const q = norm(query);
  const favSet = getFavorites();

  let filtered = allDishes.filter(d => {
    const okDel = (currentDelivery === "Все") || d.delivery === currentDelivery;
    const okCat = (currentCategory === "Все") || d.category === currentCategory;
    const okQ = !q || norm(d.name).includes(q);
    const okFav = !favOnly || favSet.has(d.id);
    return okDel && okCat && okQ && okFav;
  });

  //filtered = sortDishes(filtered, currentSort);
  renderGrid(filtered);
}

function renderGrid(list){
  grid.innerHTML = "";

  if(!list.length){
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  const favSet = getFavorites();

  for(const d of list){
    const card = document.createElement("div");
    card.className = "card";

    card.innerHTML = `
      <img class="cardImg" src="${d.photo}" alt="${escapeAttr(d.name)}" />

      <button class="favBtn ${favSet.has(d.id) ? "active":""}" type="button" title="Избранное">
        <img src="assets/icons/bookmark.svg" alt="fav" />
      </button>

      <div class="cardBody">
        <div class="meta">
          <img class="iconTiny" src="${deliveryIconPath(d.delivery)}" alt="" />
          <span>${escapeText(d.delivery)}</span>
          <span class="dot"></span>
          <span>${escapeText(d.category)}</span>
        </div>
        <h2 class="h2">${escapeText(d.name)}</h2>
        <button class="btn" type="button">Посмотреть блюдо</button>
      </div>
    `;

    card.querySelector(".btn").addEventListener("click", ()=>{
      location.href = `dish.html?id=${encodeURIComponent(d.id)}`;
    });

    card.querySelector(".favBtn").addEventListener("click", (e)=>{
      e.stopPropagation();
      toggleFavorite(d.id);
      applyFilters();
    });

    grid.appendChild(card);
  }
}

function escapeText(s){ return (s ?? "").toString(); }
function escapeAttr(s){ return (s ?? "").toString().replaceAll('"', "&quot;"); }

function setupDropdowns(){
  // Delivery
  const deliveryMenu = deliveryDrop.querySelector(".menu");
  buildMenu(deliveryMenu, DELIVERY_LIST, currentDelivery);
  wireDropdown(deliveryDrop, (val)=>{
    currentDelivery = val;
    setText(deliveryValue, val);
    buildMenu(deliveryMenu, DELIVERY_LIST, currentDelivery);
    applyFilters();
  });

  // Category
  const categoryMenu = categoryDrop.querySelector(".menu");
  const cats = getCategories(allDishes);
  buildMenu(categoryMenu, cats, currentCategory);
  wireDropdown(categoryDrop, (val)=>{
    currentCategory = val;
    setText(categoryValue, val);
    buildMenu(categoryMenu, cats, currentCategory);
    applyFilters();
  });

  // Sort
  // const sortMenu = sortDrop.querySelector(".menu");
  // buildMenu(sortMenu, SORT_OPTIONS, currentSort);
  // wireDropdown(sortDrop, (val)=>{
  //   currentSort = val;
  //   setText(sortValue, val);
  //   buildMenu(sortMenu, SORT_OPTIONS, currentSort);
  //   applyFilters();
  // });
}

function wireSearch(){
  const syncClear = ()=>{
    clearSearch.style.display = searchInput.value ? "block" : "none";
  };
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

function wireFavOnly(){
  const sync = ()=>{
    favOnlyBtn.classList.toggle("active", favOnly);
    favOnlyBtn.querySelector("span").textContent = favOnly ? "Избранное ✓" : "Избранное";
  };
  favOnlyBtn.addEventListener("click", ()=>{
    favOnly = !favOnly;
    sync();
    applyFilters();
  });
  sync();
}

// function wireAdminButton(){
//   lockBtn.addEventListener("click", ()=>{
//     location.href = "admin.html";
//   });
// }
import { ADMIN_PASSWORD, setAdminSession, isAdmin } from "./common.js";

function wireAdminButton(){
  lockBtn.addEventListener("click", ()=>{
    if(isAdmin()){
      location.href = "admin.html";
      return;
    }
    const input = prompt("Введите пароль администратора:");
    if(input === null) return;

    if(input === ADMIN_PASSWORD){
      setAdminSession(true);
      location.href = "admin.html";
    }else{
      alert("Неверный пароль.");
    }
  });
}

async function init(){
  try{
    allDishes = await loadDishes();
    setupDropdowns();
    wireSearch();
    wireFavOnly();
    wireAdminButton();
    applyFilters();
  }catch(e){
    console.error(e);
    empty.style.display = "block";
    empty.textContent = "Ошибка загрузки блюд. Проверь файл data/dishes.json";
  }
}

init();
