// ===== GitHub Token Modal (TSC) =====

const TOKEN_SESSION_KEY = "tsc_tc_token_session_v1";
const TOKEN_LOCAL_KEY   = "tsc_tc_token_local_v1";

function qs(sel){ return document.querySelector(sel); }

export function getSavedToken(){
  return sessionStorage.getItem(TOKEN_SESSION_KEY)
    || localStorage.getItem(TOKEN_LOCAL_KEY)
    || "";
}

export function clearSavedToken(){
  sessionStorage.removeItem(TOKEN_SESSION_KEY);
  localStorage.removeItem(TOKEN_LOCAL_KEY);
}

export function toast(title, text, ms = 3000){
  const el = qs("#toast");
  if(!el) return;

  el.innerHTML = `
    <div class="tTitle">${escapeHtml(title)}</div>
    <div class="tText">${escapeHtml(text)}</div>
  `;

  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(()=> el.classList.remove("show"), ms);
}

function escapeHtml(s){
  return (s ?? "").toString()
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

export function openTokenModal(){
  const wrap = qs("#tokenWrap");
  const input = qs("#tokenInput");
  const remember = qs("#tokenRemember");
  const err = qs("#tokenError");

  wrap.classList.add("open");
  err.style.display = "none";
  input.value = getSavedToken();
  remember.checked = !!localStorage.getItem(TOKEN_LOCAL_KEY);
  setTimeout(()=>input.focus(), 50);

  return new Promise((resolve)=>{

    const close = ()=>{
      wrap.classList.remove("open");
      cleanup();
    };

    const showError = (msg)=>{
      err.textContent = msg;
      err.style.display = "block";
    };

    const saveToken = (token)=>{
      if(remember.checked){
        localStorage.setItem(TOKEN_LOCAL_KEY, token);
        sessionStorage.removeItem(TOKEN_SESSION_KEY);
      }else{
        sessionStorage.setItem(TOKEN_SESSION_KEY, token);
        localStorage.removeItem(TOKEN_LOCAL_KEY);
      }
    };

    const onCancel = ()=> resolve(null);

    const onOk = ()=>{
      const token = (input.value || "").trim();
      if(!token) return showError("Вставь токен.");
      saveToken(token);
      close();
      resolve(token);
    };

    const cleanup = ()=>{
      qs("#tokenClose").removeEventListener("click", onCancel);
      qs("#tokenCancel").removeEventListener("click", onCancel);
      qs("#tokenOk").removeEventListener("click", onOk);
      wrap.removeEventListener("click", backdrop);
    };

    const backdrop = (e)=>{
      if(e.target === wrap) onCancel();
    };

    qs("#tokenClose").addEventListener("click", onCancel);
    qs("#tokenCancel").addEventListener("click", onCancel);
    qs("#tokenOk").addEventListener("click", onOk);
    wrap.addEventListener("click", backdrop);
  });
}