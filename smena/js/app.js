import { WEEKDAYS, MONTHS_RU, toISODate, todayISO, formatDateLong, sortShifts, normalizePhone } from "./util.js";
import { qs, qsa, toast, openModal, closeModal, bindModalClose } from "./ui.js";

const FILE_LOCAL = "./data/shifts.json";

const DEPTS = [
  { id:"all", label:"Все" },
  { id:"delivery", label:"Доставка" },
  { id:"kitchen", label:"Кухня" },
  { id:"call", label:"Колл-центр" },
];

const state = {
  dept: "all",
  viewY: new Date().getFullYear(),
  viewM0: new Date().getMonth(),
  selectedISO: null,
  data: null
};

function monthTitle(y, m0){ return `${MONTHS_RU[m0]} ${y}`; }
function mondayFirstIndex(jsDay){ return (jsDay + 6) % 7; }

function buildDeptPills(){
  const row = qs("#deptRowMain");
  row.innerHTML = "";
  for(const d of DEPTS){
    const b = document.createElement("button");
    b.className = "pill";
    b.type = "button";
    b.dataset.dept = d.id;
    b.textContent = d.label;
    row.appendChild(b);
  }
  const sync = ()=> qsa(".pill", row).forEach(p => p.dataset.active = (p.dataset.dept === state.dept ? "1" : "0"));
  row.addEventListener("click", (e)=>{
    const btn = e.target.closest(".pill");
    if(!btn) return;
    state.dept = btn.dataset.dept;
    sync();
    renderCalendar();
  });
  sync();
}

function renderWeekdays(){
  const wrap = qs("#weekdays");
  wrap.innerHTML = "";
  for(const w of WEEKDAYS){
    const d = document.createElement("div");
    d.textContent = w;
    wrap.appendChild(d);
  }
}

function getDayAllShifts(iso){
  return sortShifts(state.data?.days?.[iso] || []);
}

function getDayShiftsFiltered(iso){
  const all = getDayAllShifts(iso);
  if(state.dept === "all") return all;
  return all.filter(s => s.dept === state.dept);
}

function hasAnyShifts(iso){
  return getDayShiftsFiltered(iso).length > 0;
}

function renderHeader(){
  qs("#monthLabel").textContent = monthTitle(state.viewY, state.viewM0);
}

function renderCalendar(){
  renderHeader();

  const daysWrap = qs("#days");
  daysWrap.innerHTML = "";

  const y = state.viewY;
  const m0 = state.viewM0;
  const first = new Date(y, m0, 1);
  const startOffset = mondayFirstIndex(first.getDay());
  const daysInMonth = new Date(y, m0+1, 0).getDate();

  const today = todayISO();
  const selected = state.selectedISO;

  for(let cell=0; cell<42; cell++){
    const dayNum = cell - startOffset + 1;

    let cY=y, cM0=m0, cD=dayNum;
    let out = 0;

    if(dayNum < 1){
      const prev = new Date(y, m0, 0);
      const prevDays = prev.getDate();
      cY = prev.getFullYear();
      cM0 = prev.getMonth();
      cD = prevDays + dayNum;
      out = 1;
    } else if(dayNum > daysInMonth){
      const next = new Date(y, m0+1, dayNum - daysInMonth);
      cY = next.getFullYear();
      cM0 = next.getMonth();
      cD = next.getDate();
      out = 1;
    }

    const iso = toISODate(cY, cM0, cD);

    const el = document.createElement("button");
    el.className = "day";
    el.type = "button";
    el.dataset.iso = iso;
    el.dataset.out = out ? "1" : "0";
    el.dataset.today = (iso === today ? "1" : "0");
    el.dataset.selected = (selected && iso === selected ? "1" : "0");
    el.dataset.has = hasAnyShifts(iso) ? "1" : "0";
    el.innerHTML = `<div class="dayNum">${cD}</div><div class="dot"></div>`;
    daysWrap.appendChild(el);
  }
}

function moveMonth(delta){
  const d = new Date(state.viewY, state.viewM0 + delta, 1);
  state.viewY = d.getFullYear();
  state.viewM0 = d.getMonth();
  renderCalendar();
}

function bindNav(){
  qs("#prevMonth").addEventListener("click", ()=>moveMonth(-1));
  qs("#nextMonth").addEventListener("click", ()=>moveMonth(1));
  qs("#todayBtn").addEventListener("click", ()=>{
    const d = new Date();
    state.viewY = d.getFullYear();
    state.viewM0 = d.getMonth();
    state.selectedISO = todayISO();
    renderCalendar();
    openDay(state.selectedISO);
  });

  // swipe on card
  let sx=0, sy=0, st=0;
  const area = qs("#calendarCard");
  area.addEventListener("touchstart", (e)=>{
    const t = e.changedTouches[0];
    sx=t.clientX; sy=t.clientY; st=Date.now();
  }, { passive:true });

  area.addEventListener("touchend", (e)=>{
    const t = e.changedTouches[0];
    const dx=t.clientX-sx;
    const dy=t.clientY-sy;
    const dt=Date.now()-st;
    if(dt>600) return;
    if(Math.abs(dx)<50) return;
    if(Math.abs(dx)<Math.abs(dy)*1.3) return;
    moveMonth(dx<0?1:-1);
  }, { passive:true });
}

function bindCalendarClicks(){
  qs("#days").addEventListener("click", (e)=>{
    const btn = e.target.closest(".day");
    if(!btn) return;
    state.selectedISO = btn.dataset.iso;
    renderCalendar();
    openDay(state.selectedISO);
  });
}

function openDay(iso){
  qs("#dayTitle").textContent = formatDateLong(iso);

  const list = qs("#dayList");
  list.innerHTML = "";

  const shifts = getDayShiftsFiltered(iso);
  const deptLabel = DEPTS.find(x => x.id === state.dept)?.label || "Все";
  qs("#daySub").textContent = `Отдел: ${deptLabel} • Смен: ${shifts.length}`;

  if(shifts.length === 0){
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Смен нет.";
    list.appendChild(empty);
    openModal(qs("#dayModal"));
    return;
  }

  const employees = state.data?.employees || [];

  for(const s of shifts){
    const emp = employees.find(e => e.id === s.employeeId);
    const name = emp?.name || s.employeeId || "Сотрудник";
    const role = s.role || emp?.role || s.dept || "";
    const time = `${s.from || "—"}–${s.to || "—"}`;
    const phone = normalizePhone(emp?.phone);

    const row = document.createElement("div");
    row.className = "shiftRow";
    row.innerHTML = `
      <div style="flex:1">
        <div class="shiftMain">
          <div class="name">${name}</div>
          <div class="meta">${time}${role ? " • " + role : ""}${s.note ? " • " + s.note : ""}</div>
        </div>
      </div>

      ${phone ? `
        <button class="phoneBtn" type="button" data-phone="${phone}" title="Позвонить">
          <img src="./assets/icons/phone.svg" alt="">
        </button>
      ` : ""}
    `;
    list.appendChild(row);
  }

  openModal(qs("#dayModal"));
}

function bindPhoneClicks(){
  document.addEventListener("click", (e)=>{
    const b = e.target.closest(".phoneBtn");
    if(!b) return;
    const phone = b.dataset.phone;
    if(!phone) return;

    const pass = prompt("Введите пароль для звонка:");
    if(pass !== "123"){
      toast("bad","Неверный пароль","Звонок отменён.");
      return;
    }
    window.location.href = `tel:${phone}`;
  });
}

async function loadData(){
  const res = await fetch(`${FILE_LOCAL}?ts=${Date.now()}`);
  if(!res.ok) throw new Error("Не удалось загрузить shifts.json");
  return await res.json();
}

async function init(){
  bindModalClose(qs("#dayModal"));
  buildDeptPills();
  renderWeekdays();
  bindNav();
  bindCalendarClicks();
  bindPhoneClicks();

  state.data = await loadData();
  state.selectedISO = todayISO();
  renderCalendar();
}

init().catch(err=>{
  console.error(err);
  toast("bad","Ошибка", String(err.message || err));
});