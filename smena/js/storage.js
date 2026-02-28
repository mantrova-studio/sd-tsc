const LS = {
  token: "smena_gh_token",
  admin: "smena_admin_ok",
  repo: "smena_repo_fullname", // owner/repo
  templates: "smena_shift_templates"
};

export function getToken(){ return localStorage.getItem(LS.token) || ""; }
export function setToken(v){ localStorage.setItem(LS.token, v || ""); }
export function clearToken(){ localStorage.removeItem(LS.token); }

export function getRepo(){ return localStorage.getItem(LS.repo) || ""; }
export function setRepo(v){ localStorage.setItem(LS.repo, v || ""); }

export function isAdmin(){ return sessionStorage.getItem(LS.admin) === "1"; }
export function setAdmin(ok){ sessionStorage.setItem(LS.admin, ok ? "1" : "0"); }

// Templates (local on device)
export function getTemplates(){
  try{
    const raw = localStorage.getItem(LS.templates);
    if(!raw) return [];
    const x = JSON.parse(raw);
    return Array.isArray(x) ? x : [];
  }catch{
    return [];
  }
}
export function setTemplates(arr){
  localStorage.setItem(LS.templates, JSON.stringify(Array.isArray(arr) ? arr : []));
}