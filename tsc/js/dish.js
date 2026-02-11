import {
  loadDishes, qs, setText,
  deliveryIconPath,
  getFavorites, setFavorites
} from "./common.js";

const backBtn = qs("#backBtn");
const card = qs("#card");
const err = qs("#err");

const photo = qs("#photo");
const meta = qs("#meta");
const nameEl = qs("#name");
const desc = qs("#desc");

const favBtn = qs("#favBtn");
const copyBtn = qs("#copyBtn");
const printBtn = qs("#printBtn");

let currentDish = null;

function getId(){
  return new URLSearchParams(location.search).get("id");
}

backBtn.addEventListener("click", ()=>{
  if(history.length > 1) history.back();
  else location.href = "index.html";
});

copyBtn.addEventListener("click", async ()=>{
  if(!currentDish) return;
  try{
    await navigator.clipboard.writeText(currentDish.description || "");
    const old = copyBtn.innerHTML;
    copyBtn.innerHTML = "Скопировано ✓";
    setTimeout(()=> copyBtn.innerHTML = old, 900);
  }catch{
    alert("Не удалось скопировать. Попробуй вручную выделить текст.");
  }
});

printBtn.addEventListener("click", ()=> window.print());

favBtn.addEventListener("click", ()=>{
  if(!currentDish) return;
  const fav = getFavorites();
  if(fav.has(currentDish.id)) fav.delete(currentDish.id);
  else fav.add(currentDish.id);
  setFavorites(fav);
  favBtn.textContent = fav.has(currentDish.id) ? "В избранном ✓" : "Избранное";
});

async function init(){
  try{
    const id = getId();
    if(!id){
      err.style.display = "block";
      err.textContent = "Не указан id блюда.";
      return;
    }

    const dishes = await loadDishes();
    const d = dishes.find(x => x.id === id);

    if(!d){
      err.style.display = "block";
      err.textContent = "Блюдо не найдено.";
      return;
    }

    currentDish = d;

    photo.src = d.photo;
    photo.alt = d.name;

    meta.innerHTML = `
      <img class="iconTiny" src="${deliveryIconPath(d.delivery)}" alt="" />
      <span>${d.delivery}</span>
      <span class="dot"></span>
      <span>${d.category}</span>
    `;

    setText(nameEl, d.name);
    // Описание простым текстом (без авто-разделов)
    desc.textContent = d.description;

    const fav = getFavorites();
    favBtn.textContent = fav.has(d.id) ? "В избранном ✓" : "Избранное";

    card.style.display = "block";
  }catch(e){
    console.error(e);
    err.style.display = "block";
    err.textContent = "Ошибка загрузки блюда. Проверь data/dishes.json";
  }
}

init();
