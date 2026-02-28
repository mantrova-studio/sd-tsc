import { DEPTS, WEEKDAYS, MONTHS_RU, toISODate, todayISO, formatDateLong, sortShifts, roleOrDept } from "./util.js";
import { qs, qsa } from "./ui.js";
import { openModal, bindModalClose } from "./ui.js";

const state = {
  dept: "delivery",
  viewY: new Date().getFullYear(),
  viewM0: new Date().getMonth(),
  selectedISO: null,
  data: null
};

function buildDeptPills(){
  const row = qs("#deptRow");
  row.innerHTML = "";

  const pills = DEPTS.filter(d => d.id !== "all"); // на главной: 3 кнопки
  for(const d of pills){
    const b = document.createElement("button");
    b.className = "pill";
    b.type = "button";
    b.dataset.dept = d.id;
    b.innerHTML = `<span class="v">${d.label}</span><span class="k">${d.hint}</span>`;
    row.appendChild(b);
  }

  row.addEventListener("click", (e)=>{
    const btn = e.target.closest(".pill");
    if(!btn) return;
    setDept(btn.dataset.dept);
  });

  setDept(state.dept);
}

function setDept(dept){
  state.dept = dept;
  qsa(".pill").forEach(p => p.dataset.active = (p.dataset.dept === dept ? "1" : "0"));
  renderCalendar();
}

function monthTitle(y, m0){ return `${MONTHS_RU[m0]} ${y}`; }

function renderHeader(){
  qs("#monthLabel").textContent = monthTitle(state.viewY, state.viewM0);

  // подсказка: активный отдел
  const deptObj = DEPTS.find(d => d.id === state.dept);
  qs("#monthSub").textContent = deptObj ? deptObj.hint : "";
}

function mondayFirstIndex(jsDay){
  // JS: 0=Sun..6=Sat -> return 0..6 where 0=Mon
  return (jsDay + 6) % 7;
}

function getDayShifts(iso){
  const days = state.data?.days || {};
  const all = days[iso] || [];
  const filtered = all.filter(s => (state.dept ? s.dept === state.dept : true));
  return sortShifts(filtered);
}

function hasShiftsInDept(iso){
  return getDayShifts(iso).length > 0;
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

function renderCalendar(){
  renderHeader();

  const daysWrap = qs("#days");
  daysWrap.innerHTML = "";

  const y = state.viewY;
  const m0 = state.viewM0;
  const first = new Date(y, m0, 1);
  const startOffset = mondayFirstIndex(first.getDay()); // 0..6
  const daysInMonth = new Date(y, m0+1, 0).getDate();

  // 42 cells
  const today = todayISO();
  const selected = state.selectedISO;

  for(let cell=0; cell<42; cell++){
    const dayNum = cell - startOffset + 1;

    let cY=y, cM0=m0, cD=dayNum;
    let out = 0;

    if(dayNum < 1){
      // previous month
      const prev = new Date(y, m0, 0);
      const prevDays = prev.getDate();
      cY = prev.getFullYear();
      cM0 = prev.getMonth();
      cD = prevDays + dayNum;
      out = 1;
    } else if(dayNum > daysInMonth){
      // next month
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
    el.dataset.has = hasShiftsInDept(iso) ? "1" : "0";

    el.innerHTML = `<div class="dayNum">${cD}</div><div class="dot"></div>`;
    daysWrap.appendChild(el);
  }
}

function openDayModal(iso){
  state.selectedISO = iso;
  renderCalendar();

  const shifts = getDayShifts(iso);

  qs("#modalTitle").textContent = formatDateLong(iso);
  qs("#modalSub").textContent = `Смены: ${shifts.length}`;

  const list = qs("#shiftList");
  list.innerHTML = "";

  if(shifts.length === 0){
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "На этот день смен по выбранной должности нет.";
    list.appendChild(empty);
  } else {
    for(const s of shifts){
      const emp = (state.data?.employees || []).find(e => e.id === s.employeeId);
      const name = emp?.name || s.employeeId || "Сотрудник";
      const time = `${s.from || "—"}–${s.to || "—"}`;
      const meta = `${time} • ${roleOrDept(s)}${s.note ? ` • ${s.note}` : ""}`;

      const row = document.createElement("div");
      row.className = "shiftRow";
      row.innerHTML = `
        <div class="shiftMain">
          <div class="name">${name}</div>
          <div class="meta">${meta}</div>
        </div>
        <div class="badge accent">${s.dept}</div>
      `;
      list.appendChild(row);
    }
  }

  openModal(qs("#dayModal"));
}

function bindCalendarClicks(){
  qs("#days").addEventListener("click", (e)=>{
    const btn = e.target.closest(".day");
    if(!btn) return;
    openDayModal(btn.dataset.iso);
  });
}

function bindMonthNav(){
  qs("#prevMonth").addEventListener("click", ()=>moveMonth(-1));
  qs("#nextMonth").addEventListener("click", ()=>moveMonth(1));
  qs("#todayBtn").addEventListener("click", ()=>{
    const d = new Date();
    state.viewY = d.getFullYear();
    state.viewM0 = d.getMonth();
    state.selectedISO = todayISO();
    renderCalendar();
    openDayModal(state.selectedISO);
  });

  // swipe
  let sx=0, sy=0, st=0;
  const area = qs("#calendarCard");
  area.addEventListener("touchstart", (e)=>{
    const t = e.changedTouches[0];
    sx = t.clientX; sy = t.clientY; st = Date.now();
  }, { passive:true });

  area.addEventListener("touchend", (e)=>{
    const t = e.changedTouches[0];
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    const dt = Date.now() - st;

    if(dt > 600) return;
    if(Math.abs(dx) < 50) return;
    if(Math.abs(dx) < Math.abs(dy)*1.3) return;

    moveMonth(dx < 0 ? 1 : -1);
  }, { passive:true });
}

function moveMonth(delta){
  const d = new Date(state.viewY, state.viewM0 + delta, 1);
  state.viewY = d.getFullYear();
  state.viewM0 = d.getMonth();
  renderCalendar();
}

async function loadData(){
  const res = await fetch(`./data/shifts.json?ts=${Date.now()}`);
  if(!res.ok) throw new Error("Не удалось загрузить shifts.json");
  state.data = await res.json();
}

async function init(){
  buildDeptPills();
  renderWeekdays();
  bindCalendarClicks();
  bindMonthNav();
  bindModalClose(qs("#dayModal"));

  await loadData();
  renderCalendar();

  // выделим сегодня
  state.selectedISO = todayISO();
  renderCalendar();
}

init().catch(err=>{
  console.error(err);
  const msg = document.createElement("div");
  msg.className = "container";
  msg.innerHTML = `<div class="card"><div class="calendar"><div class="empty">Ошибка загрузки данных: ${String(err.message || err)}</div></div></div>`;
  document.body.appendChild(msg);
});