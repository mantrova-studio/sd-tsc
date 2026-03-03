// Custom tooltip for elements with title="" or data-tip=""
// In tsc style. Works on hover (PC) + tap/hold (mobile).

let tipEl = null;
let activeEl = null;
let hideT = null;

function ensureTip(){
  if(tipEl) return tipEl;
  tipEl = document.createElement("div");
  tipEl.className = "tscTip";
  tipEl.innerHTML = `<div class="tt"></div><div class="ts"></div>`;
  document.body.appendChild(tipEl);
  return tipEl;
}

function getTipText(el){
  // priority: data-tip, then title
  const dt = el.getAttribute("data-tip");
  const tt = el.getAttribute("title");
  return (dt && dt.trim()) || (tt && tt.trim()) || "";
}

function moveTitleToDataTip(el){
  // чтобы убрать стандартный браузерный tooltip
  const t = el.getAttribute("title");
  if(t && !el.getAttribute("data-tip")){
    el.setAttribute("data-tip", t);
  }
  if(t) el.removeAttribute("title");
}

function setTipContent(text){
  const box = ensureTip();
  const [head, ...rest] = String(text).split("\n");
  box.querySelector(".tt").textContent = head || "";
  box.querySelector(".ts").textContent = rest.join("\n").trim();
}

function positionTip(clientX, clientY){
  const box = ensureTip();
  const pad = 12;

  // temporarily show to measure
  box.style.left = "0px";
  box.style.top = "0px";
  box.dataset.show = "1";

  const r = box.getBoundingClientRect();
  let x = clientX + 14;
  let y = clientY + 14;

  if(x + r.width > window.innerWidth - pad) x = window.innerWidth - pad - r.width;
  if(y + r.height > window.innerHeight - pad) y = clientY - 14 - r.height;
  if(x < pad) x = pad;
  if(y < pad) y = pad;

  box.style.left = `${x}px`;
  box.style.top = `${y}px`;
}

function showTipFor(el, x, y){
  if(!el) return;
  moveTitleToDataTip(el);

  const text = getTipText(el);
  if(!text) return;

  activeEl = el;
  setTipContent(text);
  positionTip(x, y);
  ensureTip().dataset.show = "1";

  if(hideT){ clearTimeout(hideT); hideT = null; }
}

function hideTip(){
  if(!tipEl) return;
  tipEl.dataset.show = "0";
  activeEl = null;
}

// ===== PC: hover =====
document.addEventListener("mouseover", (e)=>{
  const el = e.target.closest("[data-tip],[title]");
  if(!el) return;
  showTipFor(el, e.clientX, e.clientY);
}, true);

document.addEventListener("mousemove", (e)=>{
  if(!activeEl) return;
  // если у элемента нет подсказки — скрываем
  const t = getTipText(activeEl);
  if(!t) return hideTip();
  positionTip(e.clientX, e.clientY);
}, true);

document.addEventListener("mouseout", (e)=>{
  const el = e.target.closest("[data-tip],[title]");
  if(!el) return;
  // плавно скрываем с маленькой задержкой (чтобы не мигало)
  hideT = setTimeout(hideTip, 80);
}, true);

// ===== Mobile: tap/hold =====
let holdTimer = null;

document.addEventListener("touchstart", (e)=>{
  const el = e.target.closest("[data-tip],[title]");
  if(!el) return;

  // long-press
  const t = e.changedTouches[0];
  holdTimer = setTimeout(()=>{
    showTipFor(el, t.clientX, t.clientY);
  }, 350);
}, {passive:true});

document.addEventListener("touchmove", ()=>{
  if(holdTimer){ clearTimeout(holdTimer); holdTimer = null; }
}, {passive:true});

document.addEventListener("touchend", ()=>{
  if(holdTimer){ clearTimeout(holdTimer); holdTimer = null; }
  // hide after tap end if it was shown
  if(activeEl){
    setTimeout(hideTip, 900);
  }
}, {passive:true});

// Hide on scroll / resize
window.addEventListener("scroll", hideTip, {passive:true});
window.addEventListener("resize", hideTip);