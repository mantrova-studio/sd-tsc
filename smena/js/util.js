export const DEPTS = [
  { id: "all", label: "Все", hint: "Все смены" },
  { id: "delivery", label: "Доставка", hint: "Курьеры" },
  { id: "kitchen", label: "Кухня", hint: "Повара" },
  { id: "call", label: "Колл-центр", hint: "Операторы" }
];

export const WEEKDAYS = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
export const MONTHS_RU = [
  "Январь","Февраль","Март","Апрель","Май","Июнь",
  "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"
];

export function pad2(n){ return String(n).padStart(2, "0"); }

export function toISODate(y, m0, d){
  // m0: 0-11
  return `${y}-${pad2(m0+1)}-${pad2(d)}`;
}

export function parseISODate(iso){
  const [y,m,d] = iso.split("-").map(Number);
  return { y, m0: m-1, d };
}

export function todayISO(){
  const dt = new Date();
  const y = dt.getFullYear();
  const m0 = dt.getMonth();
  const d = dt.getDate();
  return toISODate(y, m0, d);
}

export function sameDayISO(a, b){ return a === b; }

export function formatDateLong(iso){
  const { y, m0, d } = parseISODate(iso);
  return `${d} ${MONTHS_RU[m0]} ${y}`;
}

export function sortShifts(shifts){
  // by time from
  return [...shifts].sort((a,b) => (a.from || "").localeCompare(b.from || ""));
}

export function deptLabel(dept){
  const x = DEPTS.find(d => d.id === dept);
  return x ? x.label : dept;
}

export function roleOrDept(shift){
  return shift.role || deptLabel(shift.dept);
}

export function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

export function safeJsonParse(text, fallback){
  try { return JSON.parse(text); } catch { return fallback; }
}

export function sha256Hex(str){
  // browser crypto
  const enc = new TextEncoder().encode(str);
  return crypto.subtle.digest("SHA-256", enc).then(buf => {
    const arr = Array.from(new Uint8Array(buf));
    return arr.map(b => b.toString(16).padStart(2,"0")).join("");
  });
}