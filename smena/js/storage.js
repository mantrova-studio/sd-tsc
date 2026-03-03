const KEY_TOKEN = "smena_gh_token";
const KEY_ADMIN = "smena_admin_ok";

export function getToken(){ return localStorage.getItem(KEY_TOKEN) || ""; }
export function setToken(t){ localStorage.setItem(KEY_TOKEN, t || ""); }

export function isAdmin(){ return localStorage.getItem(KEY_ADMIN) === "1"; }
export function setAdmin(v){ localStorage.setItem(KEY_ADMIN, v ? "1" : "0"); }