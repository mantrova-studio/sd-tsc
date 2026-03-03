export const WEEKDAYS = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
export const MONTHS_RU = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];

export function pad2(n){ return String(n).padStart(2,"0"); }

export function toISODate(y, m0, d){
  return `${y}-${pad2(m0+1)}-${pad2(d)}`;
}

export function todayISO(){
  const d = new Date();
  return toISODate(d.getFullYear(), d.getMonth(), d.getDate());
}

export function formatDateLong(iso){
  const [y,m,d] = iso.split("-").map(Number);
  const dt = new Date(y, m-1, d);
  const wd = WEEKDAYS[(dt.getDay()+6)%7];
  return `${d} ${MONTHS_RU[m-1]} ${y} • ${wd}`;
}

export function sortShifts(arr){
  const a = (arr || []).slice();
  a.sort((x,y)=>{
    const ax = String(x.from||"");
    const ay = String(y.from||"");
    if(ax < ay) return -1;
    if(ax > ay) return 1;
    return 0;
  });
  return a;
}

export async function sha256Hex(text){
  const enc = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

export function normalizePhone(p){
  return String(p || "").replace(/[^\d+]/g, "");
}