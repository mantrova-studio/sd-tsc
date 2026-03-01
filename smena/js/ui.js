export function qs(sel, root=document){ return root.querySelector(sel); }
export function qsa(sel, root=document){ return [...root.querySelectorAll(sel)]; }

export function ensureToastWrap(){
  let w = document.querySelector(".toastWrap");
  if(!w){
    w = document.createElement("div");
    w.className = "toastWrap";
    document.body.appendChild(w);
  }
  return w;
}

export function toast(type, title, msg){
  const wrap = ensureToastWrap();
  const el = document.createElement("div");
  el.className = `toast ${type || ""}`.trim();
  el.innerHTML = `<div class="t"></div><div class="s"></div>`;
  el.querySelector(".t").textContent = title || "Сообщение";
  el.querySelector(".s").textContent = msg || "";
  wrap.appendChild(el);
  setTimeout(()=>{ el.style.opacity = "0"; el.style.transform = "translateY(6px)"; }, 3400);
  setTimeout(()=>{ el.remove(); }, 4200);
}

export function openModal(modalEl){
  modalEl.setAttribute("data-open","1");
  document.body.classList.add("modalOpen");
}

export function closeModal(modalEl){
  modalEl.setAttribute("data-open","0");
  document.body.classList.remove("modalOpen");
}

export function bindModalClose(modalEl, closeBtnSel=".modalClose"){
  modalEl.addEventListener("click", (e)=>{
    if(e.target === modalEl) closeModal(modalEl);
  });
  const btn = modalEl.querySelector(closeBtnSel);
  if(btn) btn.addEventListener("click", ()=>closeModal(modalEl));
  window.addEventListener("keydown", (e)=>{
    if(e.key === "Escape" && modalEl.getAttribute("data-open")==="1") closeModal(modalEl);
  });
}