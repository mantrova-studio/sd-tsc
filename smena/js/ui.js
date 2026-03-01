export function qs(sel, root=document){ return root.querySelector(sel); }
export function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

export function openModal(el){
  if(!el) return;
  el.dataset.open = "1";
}
export function closeModal(el){
  if(!el) return;
  el.dataset.open = "0";
}
export function bindModalClose(modal){
  if(!modal) return;
  modal.addEventListener("click", (e)=>{
    if(e.target === modal) closeModal(modal);
    const c = e.target.closest(".modalClose");
    if(c) closeModal(modal);
  });
}

export function toast(type, title, sub=""){
  const wrap = document.getElementById("toasts");
  if(!wrap) return;

  const el = document.createElement("div");
  el.className = `toast ${type || ""}`.trim();
  el.innerHTML = `
    <div class="tt">${escapeHtml(title || "")}</div>
    ${sub ? `<div class="ts">${escapeHtml(sub)}</div>` : ""}
  `;
  wrap.appendChild(el);

  setTimeout(()=>{ el.style.opacity = "0"; el.style.transform = "translateY(6px)"; }, 2600);
  setTimeout(()=>{ el.remove(); }, 3200);
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}