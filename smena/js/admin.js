import { WEEKDAYS, MONTHS_RU, toISODate, todayISO, formatDateLong, sortShifts } from "./util.js";
import { qs, qsa, toast, openModal, closeModal, bindModalClose } from "./ui.js";
import { getToken, setToken, isAdmin, setAdmin } from "./storage.js";
import { ghGetJsonFile, ghPutJsonFile } from "./github.js";

const FILE_PATH = "smena/data/shifts.json";
const REPO_FULL = "mantrova-studio/sd-tsc";

/* ==========================
   ✅ Обычный пароль (как просил)
========================== */
const ADMIN_PASSWORD = "2468"; // <-- поставь свой пароль

const DEPTS = [
  { id: "all", label: "Все" },
  { id: "delivery", label: "Доставка" },
  { id: "kitchen", label: "Кухня" },
  { id: "call", label: "Колл-центр" }
];

const state = {
  dept: "all",
  empDept: "all",
  viewY: new Date().getFullYear(),
  viewM0: new Date().getMonth(),
  selectedISO: null,

  data: null,
  fileSha: null,
  token: getToken(),

  edit: { dayISO:null, shifts:[], otherShifts:[], filterDept:"all" }
};

function monthTitle(y, m0){ return `${MONTHS_RU[m0]} ${y}`; }
function mondayFirstIndex(jsDay){ return (jsDay + 6) % 7; }
function genId(prefix="id"){
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;
}
function norm(s){ return String(s||"").trim(); }

/* ========= SAFE DOM HELPERS (чтобы можно было комментировать кнопки/модалки) ========= */
function el(id){ return qs(id); }
function on(id, evt, fn, opts){
  const node = qs(id);
  if(!node) return null;
  node.addEventListener(evt, fn, opts);
  return node;
}
function safeBindModalClose(id){
  const m = qs(id);
  if(m) bindModalClose(m);
  return m;
}
/* ================================================================================ */

function ensureDataShape(){
  if(!state.data.meta) state.data.meta = {};
  if(!state.data.days) state.data.days = {};
  if(!Array.isArray(state.data.employees)) state.data.employees = [];
  if(!Array.isArray(state.data.templates)) state.data.templates = [];
  state.data.employees.forEach(e=>{ if(typeof e.phone === "undefined") e.phone = ""; });
}

/* ==========================
   🔒 LOCK SCREEN (админка скрыта до пароля)
========================== */
let __lockOverlay = null;

function setLockedStateText(){
  const ls = qs("#lockedState");
  if(!ls) return;
  ls.textContent = isAdmin() ? "Доступ: ОК" : "Доступ: закрыт";
}

function ensureAuthButtonMode(){
  const btn = qs("#authBtn");
  if(!btn) return;

  if(isAdmin()){
    // превращаем кнопку входа в "Выйти"
    btn.style.display = "";
    btn.textContent = "Выйти";
    btn.title = "Выйти из админки";
  } else {
    // пока не вошли — можно скрыть, т.к. всё равно будет lock-screen
    btn.style.display = "none";
  }
}

function showLockScreen(){
  if(__lockOverlay) return;

  // блокируем клики по сайту
  document.documentElement.style.overflow = "hidden";
  document.body.style.pointerEvents = "none";

  __lockOverlay = document.createElement("div");
  __lockOverlay.style.cssText = `
    position:fixed; inset:0; z-index:9999999;
    display:flex; align-items:center; justify-content:center;
    padding:18px;
    background:
      radial-gradient(1200px 900px at 15% 10%, rgba(124,92,255,.22), transparent 55%),
      radial-gradient(1200px 900px at 85% 20%, rgba(255,77,109,.12), transparent 60%),
      radial-gradient(900px 700px at 55% 85%, rgba(167,139,250,.14), transparent 55%),
      linear-gradient(180deg, #070812, #0a0c1a);
    color: rgba(255,255,255,.92);
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
  `;

  __lockOverlay.innerHTML = `
    <div style="
      width:min(520px,100%);
      border-radius:22px;
      border:1px solid rgba(255,255,255,.12);
      background:rgba(255,255,255,.05);
      backdrop-filter: blur(16px);
      box-shadow: 0 18px 60px rgba(0,0,0,.55);
      padding:16px;
    ">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <div style="font-weight:900;letter-spacing:.02em;font-size:16px;">Вход в админку</div>
        <div style="font-size:12px;opacity:.65;">График смен</div>
      </div>

      <div style="height:1px;background:rgba(255,255,255,.10);margin:12px 0;"></div>

      <div style="font-size:12px;opacity:.70;margin-bottom:8px;">Пароль</div>

      <input id="__lockPass" type="password" autocomplete="off" placeholder="Введите пароль"
        style="
          width:100%;
          display:block;
          border-radius:16px;
          border:1px solid rgba(255,255,255,.12);
          background: rgba(0,0,0,.18);
          color: rgba(255,255,255,.92);
          padding:14px 14px;
          outline:none;
          font-size:14px;
        " />

      <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap;justify-content:flex-end;">
        <button id="__lockLogin"
          style="
            border-radius:14px;
            border:1px solid rgba(124,92,255,.45);
            background: linear-gradient(180deg, rgba(124,92,255,.28), rgba(124,92,255,.12));
            color: rgba(255,255,255,.92);
            padding:12px 14px;
            cursor:pointer;
            font-weight:800;
          "
        >Войти</button>
      </div>

      <div id="__lockErr" style="margin-top:10px;font-size:12px;opacity:.75;white-space:pre-wrap;"></div>
    </div>
  `;

  document.body.appendChild(__lockOverlay);
  __lockOverlay.style.pointerEvents = "auto";

  const inp = document.getElementById("__lockPass");
  const btn = document.getElementById("__lockLogin");
  const err = document.getElementById("__lockErr");

  const tryLogin = ()=>{
    const pass = (inp?.value || "").trim();
    if(pass !== ADMIN_PASSWORD){
      if(err) err.textContent = "Неверный пароль.";
      return;
    }
    if(err) err.textContent = "";

    // запоминаем вход на устройстве (storage.js)
    setAdmin(true);

    hideLockScreen();

    // обновим UI состояния
    setLockedStateText();
    ensureAuthButtonMode();

    toast("good","Вход выполнен","OK");
  };

  btn?.addEventListener("click", tryLogin);
  inp?.addEventListener("keydown", (e)=>{ if(e.key === "Enter") tryLogin(); });

  setTimeout(()=>{ try{ inp?.focus(); }catch{} }, 30);
}

function hideLockScreen(){
  if(!__lockOverlay) return;

  __lockOverlay.remove();
  __lockOverlay = null;

  document.body.style.pointerEvents = "";
  document.documentElement.style.overflow = "";
}

function guardAdmin(){
  // если не админ — блокируем всё и показываем вход
  if(!isAdmin()){
    setLockedStateText();
    ensureAuthButtonMode();
    showLockScreen();
    return false;
  }
  // если админ — снимаем блок, продолжаем
  hideLockScreen();
  setLockedStateText();
  ensureAuthButtonMode();
  return true;
}

function bindLogoutButton(){
  // #authBtn теперь "Выйти"
  const btn = qs("#authBtn");
  if(!btn) return;

  btn.addEventListener("click", ()=>{
    if(!isAdmin()) return; // на всякий
    setAdmin(false);
    // чтобы гарантированно всё закрылось/обновилось:
    location.reload();
  });
}

/* -------- Pills -------- */

function buildDeptPills(){
  const row = qs("#deptRow");
  if(!row) return; // ✅ можно скрыть блок pills

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

function buildEmpDeptPills(){
  const rows = [qs("#empDeptRow"), qs("#empDeptRow2")].filter(Boolean);
  if(rows.length === 0) return; // ✅ можно скрыть оба блока

  for(const row of rows){
    row.innerHTML = "";
    for(const d of DEPTS){
      const b = document.createElement("button");
      b.className = "pill";
      b.type = "button";
      b.dataset.empdept = d.id;
      b.textContent = d.label;
      row.appendChild(b);
    }
    row.addEventListener("click", (e)=>{
      const btn = e.target.closest(".pill");
      if(!btn) return;
      state.empDept = btn.dataset.empdept;
      syncEmpDeptPills();
      renderEmployeesList();
      refreshAllEmployeeSelects();
    });
  }
  syncEmpDeptPills();
}

function syncEmpDeptPills(){
  const rows = [qs("#empDeptRow"), qs("#empDeptRow2")].filter(Boolean);
  rows.forEach(row=>{
    qsa(".pill", row).forEach(p => p.dataset.active = (p.dataset.empdept === state.empDept ? "1" : "0"));
  });
}

/* -------- Calendar -------- */

function renderWeekdays(){
  const wrap = qs("#weekdays");
  if(!wrap) return; // ✅ можно скрыть шапку дней недели

  wrap.innerHTML = "";
  for(const w of WEEKDAYS){
    const d = document.createElement("div");
    d.textContent = w;
    wrap.appendChild(d);
  }
}

function renderHeader(){
  const ml = qs("#monthLabel");
  if(ml) ml.textContent = monthTitle(state.viewY, state.viewM0);

  const top = qs("#tokenStateTop");
  if(top) top.textContent = state.token ? "Token: OK" : "Token: нет";
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

function getEmployeeName(employeeId){
  const emp = (state.data?.employees || []).find(e => e.id === employeeId);
  return emp?.name || employeeId || "Сотрудник";
}

function buildNamesHTML(iso){
  const shifts = getDayShiftsFiltered(iso);
  if(shifts.length === 0){
    return `<div class="dayNames"><div class="dayName muted">—</div></div>`;
  }
  const names = [];
  const seen = new Set();
  for(const s of shifts){
    const n = getEmployeeName(s.employeeId);
    if(seen.has(n)) continue;
    seen.add(n);
    names.push(n);
  }
  const items = names.map(n => `<div class="dayName">${escapeHtml(n)}</div>`).join("");
  return `<div class="dayNames">${items}</div>`;
}

function renderCalendar(){
  renderHeader();

  const daysWrap = qs("#days");
  if(!daysWrap) return; // ✅ если календарь скрыт — просто не рендерим

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

    el.innerHTML = `
      <div class="dayTop">
        <div class="dayNum">${cD}</div>
        <div class="dot"></div>
      </div>
      ${buildNamesHTML(iso)}
    `;

    daysWrap.appendChild(el);
  }
}

function moveMonth(delta){
  const d = new Date(state.viewY, state.viewM0 + delta, 1);
  state.viewY = d.getFullYear();
  state.viewM0 = d.getMonth();
  renderCalendar();
}

function bindMonthNav(){
  on("#prevMonth", "click", ()=>moveMonth(-1));
  on("#nextMonth", "click", ()=>moveMonth(1));
  on("#todayBtn", "click", ()=>{
    const d = new Date();
    state.viewY = d.getFullYear();
    state.viewM0 = d.getMonth();
    state.selectedISO = todayISO();
    renderCalendar();
    openEditor(state.selectedISO);
  });

  // swipe on card (если calendarCard скрыт — просто не вешаем)
  const area = qs("#calendarCard");
  if(!area) return;

  let sx=0, sy=0, st=0;
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
  const wrap = qs("#days");
  if(!wrap) return;

  wrap.addEventListener("click", (e)=>{
    const btn = e.target.closest(".day");
    if(!btn) return;
    state.selectedISO = btn.dataset.iso;
    renderCalendar();
    openEditor(state.selectedISO);
  });
}

/* -------- Employees selects (filtered) -------- */

function getEmployeesFiltered(){
  const emps = (state.data.employees || []).slice();
  const filtered = (state.empDept === "all") ? emps : emps.filter(e => e.dept === state.empDept);
  return filtered.sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""), "ru"));
}

function employeeOptionsHTML(includeEmployeeId=null){
  const all = (state.data.employees || []);
  const filtered = getEmployeesFiltered();

  let pinned = null;
  if(includeEmployeeId){
    pinned = all.find(e => e.id === includeEmployeeId) || null;
  }

  const opts = [];
  if(pinned && !filtered.some(e => e.id === pinned.id)){
    opts.push(`<option value="${pinned.id}">${escapeHtml(pinned.name || pinned.id)} (вне фильтра)</option>`);
  }
  for(const e of filtered){
    opts.push(`<option value="${e.id}">${escapeHtml(e.name || e.id)}</option>`);
  }
  return opts.join("");
}

function refreshAllEmployeeSelects(){
  const quick = qs("#quickEmp");
  if(quick){
    const cur = quick.value || "";
    quick.innerHTML = employeeOptionsHTML(cur) || `<option value="">(нет сотрудников)</option>`;
    if(cur) quick.value = cur;
  }

  qsa(`#editList select[data-k="employeeId"]`).forEach(sel=>{
    const cur = sel.value || "";
    sel.innerHTML = employeeOptionsHTML(cur) || `<option value="">(нет сотрудников)</option>`;
    if(cur) sel.value = cur;
  });
}

/* -------- Templates -------- */

function templatesOptionsHTML(){
  const tpls = (state.data.templates || []).slice().sort((a,b)=>String(a.label||"").localeCompare(String(b.label||""), "ru"));
  if(tpls.length === 0) return `<option value="">(нет шаблонов)</option>`;
  return tpls.map(t => `<option value="${t.id}">${escapeHtml(t.label || "Шаблон")} • ${escapeHtml(t.from||"—")}–${escapeHtml(t.to||"—")}</option>`).join("");
}
function refreshTemplateSelect(){
  const tplSel = qs("#quickTpl");
  if(tplSel) tplSel.innerHTML = templatesOptionsHTML();
}

/* -------- Editor -------- */

function openEditor(iso){
  const all = getDayAllShifts(iso);
  const filterDept = state.dept;

  state.edit.dayISO = iso;
  state.edit.filterDept = filterDept;

  if(filterDept === "all"){
    state.edit.shifts = all.map(x => ({...x}));
    state.edit.otherShifts = [];
  } else {
    state.edit.shifts = all.filter(s => s.dept === filterDept).map(x => ({...x}));
    state.edit.otherShifts = all.filter(s => s.dept !== filterDept).map(x => ({...x}));
  }

  const t = qs("#editTitle");
  if(t) t.textContent = formatDateLong(iso);

  const sub = qs("#editSub");
  if(sub){
    sub.textContent = (filterDept === "all")
      ? `Смен: ${state.edit.shifts.length}`
      : `Отдел: ${filterDept} • Смен: ${state.edit.shifts.length}`;
  }

  refreshAllEmployeeSelects();
  refreshTemplateSelect();
  renderEditorList();

  const modal = qs("#editModal");
  if(modal) openModal(modal);
}

function renderEditorList(){
  const list = qs("#editList");
  if(!list) return;

  list.innerHTML = "";

  if(state.edit.shifts.length === 0){
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent =
      (state.edit.filterDept && state.edit.filterDept !== "all")
        ? "По выбранному отделу смен нет. Добавь смену."
        : "Смен нет. Нажми “Добавить пустую” или “Быстро добавить”.";
    list.appendChild(empty);
    return;
  }

  state.edit.shifts.forEach((s, idx)=>{
    const emp = (state.data.employees || []).find(e => e.id === s.employeeId);
    const name = emp?.name || s.employeeId || "Сотрудник";
    const row = document.createElement("div");
    row.className = "shiftRow";

    row.innerHTML = `
      <div style="flex:1">
        <div class="shiftMain">
          <div class="name">${escapeHtml(name)}</div>
          <div class="meta">${escapeHtml((s.from||"—") + "–" + (s.to||"—"))} • ${escapeHtml(s.role || s.dept)}${s.note ? " • " + escapeHtml(s.note) : ""}</div>
        </div>

        <div class="hr"></div>

        <div class="formGrid">
          <div class="field">
            <div class="label">Сотрудник (фильтр: ${escapeHtml(state.empDept)})</div>
            <select class="select" data-k="employeeId" data-i="${idx}">
              ${employeeOptionsHTML(s.employeeId)}
            </select>
          </div>

          <div class="row2">
            <div class="field">
              <div class="label">С</div>
              <input class="input" placeholder="10:00" value="${escapeAttr(s.from || "")}" data-k="from" data-i="${idx}" />
            </div>
            <div class="field">
              <div class="label">По</div>
              <input class="input" placeholder="18:00" value="${escapeAttr(s.to || "")}" data-k="to" data-i="${idx}" />
            </div>
          </div>

          <div class="row2">
            <div class="field">
              <div class="label">Отдел</div>
              <select class="select" data-k="dept" data-i="${idx}">
                <option value="delivery">delivery</option>
                <option value="kitchen">kitchen</option>
                <option value="call">call</option>
              </select>
            </div>
            <div class="field">
              <div class="label">Должность</div>
              <input class="input" placeholder="Курьер / Повар / Оператор" value="${escapeAttr(s.role || "")}" data-k="role" data-i="${idx}" />
            </div>
          </div>

          <div class="field">
            <div class="label">Заметка</div>
            <input class="input" placeholder="Замена / Подмена…" value="${escapeAttr(s.note || "")}" data-k="note" data-i="${idx}" />
          </div>

          <div class="rightActions">
            <button class="btn danger small" type="button" data-action="delShift" data-i="${idx}">Удалить</button>
          </div>
        </div>
      </div>
      <div class="badge accent">#${idx+1}</div>
    `;

    list.appendChild(row);

    const empSel = row.querySelector(`select[data-k="employeeId"][data-i="${idx}"]`);
    if(empSel) empSel.value = s.employeeId || "";

    const deptSel = row.querySelector(`select[data-k="dept"][data-i="${idx}"]`);
    if(deptSel) deptSel.value = s.dept || "delivery";
  });
}

function bindEditorEvents(){
  const modal = qs("#editModal");
  if(!modal) return; // ✅ можно скрыть модалку редактора целиком

  modal.addEventListener("input", (e)=>{
    const el = e.target;
    const idx = Number(el.dataset.i);
    const k = el.dataset.k;
    if(Number.isNaN(idx) || !k) return;

    const s = state.edit.shifts[idx];
    if(!s) return;
    s[k] = el.value;

    if(k === "employeeId"){
      const emp = (state.data.employees || []).find(x => x.id === s.employeeId);
      if(emp){
        s.dept = emp.dept || s.dept;
        if(!s.role) s.role = emp.role || s.role;
        renderEditorList();
      }
    }
  });

  modal.addEventListener("click", (e)=>{
    const btn = e.target.closest("button");
    if(!btn) return;

    if(btn.dataset.action === "delShift"){
      const idx = Number(btn.dataset.i);
      state.edit.shifts.splice(idx, 1);
      renderEditorList();
    }
  });

  on("#addShiftBtn", "click", ()=>{
    const emps = state.data.employees || [];
    const emp = emps[0];

    const deptDefault =
      (state.edit.filterDept && state.edit.filterDept !== "all")
        ? state.edit.filterDept
        : (emp?.dept || "delivery");

    state.edit.shifts.push({
      employeeId: emp?.id || "",
      dept: deptDefault,
      role: emp?.role || "",
      from: "",
      to: "",
      note: ""
    });

    renderEditorList();
  });

  on("#quickAddBtn", "click", ()=>{
    const qEmp = qs("#quickEmp");
    const qTpl = qs("#quickTpl");
    const empId = qEmp ? qEmp.value : "";
    const tplId = qTpl ? qTpl.value : "";

    const emp = (state.data.employees || []).find(e => e.id === empId);
    const tpl = (state.data.templates || []).find(t => t.id === tplId);

    if(!empId || !emp){
      toast("bad","Не выбран сотрудник","Выбери сотрудника.");
      return;
    }
    if(!tplId || !tpl){
      toast("bad","Не выбран шаблон","Создай/выбери шаблон времени.");
      return;
    }

    const deptFinal =
      (state.edit.filterDept && state.edit.filterDept !== "all")
        ? state.edit.filterDept
        : (emp.dept || "delivery");

    state.edit.shifts.push({
      employeeId: emp.id,
      dept: deptFinal,
      role: emp.role || "",
      from: tpl.from || "",
      to: tpl.to || "",
      note: ""
    });

    renderEditorList();
  });

  on("#applyDayBtn", "click", ()=>{
    applyEditorToData();
    closeModal(modal);
    renderCalendar();
    toast("good", "День применён", "Теперь нажми “Сохранить в GitHub”.");
  });
}

function applyEditorToData(){
  const iso = state.edit.dayISO;
  if(!iso) return;

  const clean = state.edit.shifts
    .filter(s => s.employeeId)
    .map(s => ({
      employeeId: String(s.employeeId),
      dept: String(s.dept || "delivery"),
      role: String(s.role || ""),
      from: String(s.from || ""),
      to: String(s.to || ""),
      note: String(s.note || "")
    }));

  let result = clean;
  if(state.edit.filterDept && state.edit.filterDept !== "all"){
    result = sortShifts([...clean, ...(state.edit.otherShifts || [])]);
  }

  if(result.length === 0) delete state.data.days[iso];
  else state.data.days[iso] = result;

  state.data.meta.updatedAt = new Date().toISOString();
}

/* -------- Employees -------- */

function renderEmployeesList(){
  const modalOpen = qs("#employeesModal")?.dataset.open === "1";
  if(!modalOpen) return;

  const search = qs("#empSearch");
  const q = norm(search ? search.value : "").toLowerCase();

  const list = qs("#empList");
  if(!list) return;
  list.innerHTML = "";

  const base = getEmployeesFiltered();
  const filtered = q
    ? base.filter(e =>
        String(e.name||"").toLowerCase().includes(q) ||
        String(e.role||"").toLowerCase().includes(q) ||
        String(e.dept||"").toLowerCase().includes(q) ||
        String(e.phone||"").toLowerCase().includes(q)
      )
    : base;

  if(filtered.length === 0){
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Ничего не найдено.";
    list.appendChild(empty);
    return;
  }

  for(const e of filtered){
    const row = document.createElement("div");
    row.className = "shiftRow";
    row.innerHTML = `
      <div style="flex:1">
        <div class="shiftMain">
          <div class="name">${escapeHtml(e.name || "Без имени")}</div>
          <div class="meta">${escapeHtml(e.dept || "—")} • ${escapeHtml(e.role || "—")} • id: ${escapeHtml(e.id)}</div>
        </div>

        <div class="hr"></div>

        <div class="row2">
          <div class="field">
            <div class="label">Имя</div>
            <input class="input" data-empk="name" data-empid="${escapeAttr(e.id)}" value="${escapeAttr(e.name || "")}" />
          </div>
          <div class="field">
            <div class="label">Отдел</div>
            <select class="select" data-empk="dept" data-empid="${escapeAttr(e.id)}">
              <option value="delivery">delivery</option>
              <option value="kitchen">kitchen</option>
              <option value="call">call</option>
            </select>
          </div>
        </div>

        <div class="field">
          <div class="label">Роль</div>
          <input class="input" data-empk="role" data-empid="${escapeAttr(e.id)}" value="${escapeAttr(e.role || "")}" placeholder="Курьер / Повар / Оператор" />
        </div>

        <div class="field">
          <div class="label">Телефон</div>
          <input class="input" data-empk="phone" data-empid="${escapeAttr(e.id)}" value="${escapeAttr(e.phone || "")}" placeholder="+7 900 000-00-00" />
        </div>

        <div class="rightActions">
          <button class="btn danger small" type="button" data-empaction="del" data-empid="${escapeAttr(e.id)}">Удалить</button>
        </div>
      </div>
      <div class="badge accent">${escapeHtml(e.dept || "—")}</div>
    `;
    list.appendChild(row);

    const deptSel = row.querySelector(`select[data-empk="dept"][data-empid="${CSS.escape(e.id)}"]`);
    if(deptSel) deptSel.value = e.dept || "delivery";
  }
}

function bindEmployees(){
  const modal = safeBindModalClose("#employeesModal");

  on("#employeesBtn", "click", ()=>{
    if(!modal) return; // ✅ если модалки нет — просто ничего не делаем
    if(!isAdmin()){
      toast("warn","Нет доступа","Сначала войди в админку.");
      return;
    }
    const s = qs("#empSearch");
    if(s) s.value = "";
    syncEmpDeptPills();
    openModal(modal);
    renderEmployeesList();
  });

  on("#empSearch", "input", renderEmployeesList);

  on("#addEmpBtn", "click", ()=>{
    if(!modal) return;
    const id = genId("e");
    const deptDefault = (state.empDept !== "all") ? state.empDept : "delivery";
    state.data.employees.push({ id, name:"", dept:deptDefault, role:"", phone:"" });
    renderEmployeesList();
    refreshAllEmployeeSelects();
    toast("good","Добавлено","Нажми “Применить”, затем “Сохранить в GitHub”.");
  });

  if(modal){
    modal.addEventListener("input", (e)=>{
      const el = e.target;
      const empId = el.dataset.empid;
      const k = el.dataset.empk;
      if(!empId || !k) return;

      const emp = (state.data.employees || []).find(x => x.id === empId);
      if(!emp) return;
      emp[k] = el.value;

      if(k === "dept"){
        renderEmployeesList();
        refreshAllEmployeeSelects();
      }
    });

    modal.addEventListener("click", (e)=>{
      const btn = e.target.closest("button");
      if(!btn) return;

      if(btn.dataset.empaction === "del"){
        const empId = btn.dataset.empid;
        state.data.employees = (state.data.employees || []).filter(x => x.id !== empId);
        renderEmployeesList();
        refreshAllEmployeeSelects();
        toast("good","Удалено","Из списка удалён. В старых сменах останется employeeId.");
      }
    });
  }

  on("#applyEmpBtn", "click", ()=>{
    if(!modal) return;
    state.data.meta.updatedAt = new Date().toISOString();
    toast("good","Сотрудники применены","Теперь нажми “Сохранить в GitHub”.");
    closeModal(modal);
  });
}

/* -------- Templates -------- */

function renderTemplatesList(){
  const modalOpen = qs("#templatesModal")?.dataset.open === "1";
  if(!modalOpen) return;

  const list = qs("#tplList");
  if(!list) return;
  list.innerHTML = "";

  const tpls = (state.data.templates || [])
    .slice()
    .sort((a,b)=>String(a.label||"").localeCompare(String(b.label||""), "ru"));

  if(tpls.length === 0){
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Шаблонов нет. Нажми “+ Новый”.";
    list.appendChild(empty);
    refreshTemplateSelect();
    return;
  }

  for(const t of tpls){
    const row = document.createElement("div");
    row.className = "shiftRow";
    row.innerHTML = `
      <div style="flex:1">
        <div class="shiftMain">
          <div class="name">${escapeHtml(t.label || "Шаблон")}</div>
          <div class="meta">${escapeHtml(t.from || "—")}–${escapeHtml(t.to || "—")}</div>
        </div>

        <div class="hr"></div>

        <div class="formGrid">
          <div class="field">
            <div class="label">Название</div>
            <input class="input" data-tplk="label" data-tplid="${escapeAttr(t.id)}" value="${escapeAttr(t.label || "")}" />
          </div>

          <div class="row2">
            <div class="field">
              <div class="label">С</div>
              <input class="input" data-tplk="from" data-tplid="${escapeAttr(t.id)}" value="${escapeAttr(t.from || "")}" placeholder="10:00" />
            </div>
            <div class="field">
              <div class="label">По</div>
              <input class="input" data-tplk="to" data-tplid="${escapeAttr(t.id)}" value="${escapeAttr(t.to || "")}" placeholder="18:00" />
            </div>
          </div>

          <div class="rightActions">
            <button class="btn danger small" type="button" data-tplaction="del" data-tplid="${escapeAttr(t.id)}">Удалить</button>
          </div>
        </div>
      </div>
      <div class="badge accent">tpl</div>
    `;
    list.appendChild(row);
  }

  refreshTemplateSelect();
}

function bindTemplates(){
  const modal = safeBindModalClose("#templatesModal");

  on("#templatesBtn", "click", ()=>{
    if(!modal) return;
    if(!isAdmin()){
      toast("warn","Нет доступа","Сначала войди в админку.");
      return;
    }
    openModal(modal);
    renderTemplatesList();
  });

  on("#addTplBtn", "click", ()=>{
    if(!modal) return;
    state.data.templates.push({ id: genId("tpl"), label: "Новый шаблон", from: "", to: "" });
    renderTemplatesList();
    toast("good","Шаблон добавлен","Отредактируй и нажми “Применить”.");
  });

  if(modal){
    modal.addEventListener("input", (e)=>{
      const el = e.target;
      const tplId = el.dataset.tplid;
      const k = el.dataset.tplk;
      if(!tplId || !k) return;

      const t = (state.data.templates || []).find(x => x.id === tplId);
      if(!t) return;

      t[k] = el.value;
      refreshTemplateSelect();
    });

    modal.addEventListener("click", (e)=>{
      const btn = e.target.closest("button");
      if(!btn) return;

      if(btn.dataset.tplaction === "del"){
        const tplId = btn.dataset.tplid;
        state.data.templates = (state.data.templates || []).filter(x => x.id !== tplId);
        renderTemplatesList();
        toast("good","Удалено","Шаблон удалён.");
      }
    });
  }

  on("#applyTplBtn", "click", ()=>{
    if(!modal) return;
    state.data.meta.updatedAt = new Date().toISOString();
    refreshTemplateSelect();
    toast("good","Шаблоны применены","Теперь нажми “Сохранить в GitHub”.");
    closeModal(modal);
  });
}

/* -------- Search / Settings / GitHub -------- */

async function loadFromGitHubOrLocal(){
  if(state.token){
    const r = await ghGetJsonFile({ token: state.token, repoFull: REPO_FULL, path: FILE_PATH });
    if(r.ok && r.json){
      state.data = r.json;
      state.fileSha = r.sha;
      toast("good","Загружено","Данные получены через GitHub API.");
      return;
    }
  }
  const res = await fetch(`./data/shifts.json?ts=${Date.now()}`);
  if(!res.ok) throw new Error("Не удалось загрузить shifts.json");
  state.data = await res.json();
  state.fileSha = null;
  toast("warn","Read-only режим","Token не задан или GitHub недоступен. Редактирование сохранится только после токена.");
}

async function saveToGitHub(){
  if(!state.token){
    toast("bad","Нет токена","Введи token в настройках.");
    const s = qs("#settingsModal");
    if(s) openModal(s);
    return;
  }

  const cur = await ghGetJsonFile({ token: state.token, repoFull: REPO_FULL, path: FILE_PATH });
  if(cur.ok){
    if(state.fileSha && cur.sha && state.fileSha !== cur.sha){
      toast("warn","Файл обновился","Нажми “Обновить”, чтобы не затереть чужие изменения.");
      return;
    }
    state.fileSha = cur.sha;
  }

  const msg = `smena: update (${new Date().toISOString()})`;
  const put = await ghPutJsonFile({
    token: state.token,
    repoFull: REPO_FULL,
    path: FILE_PATH,
    json: state.data,
    message: msg,
    sha: state.fileSha || undefined
  });

  if(!put.ok){
    toast("bad","Сохранение не удалось",`GitHub: ${put.status}`);
    console.error(put.error);
    return;
  }

  const newSha = put.data?.content?.sha || null;
  if(newSha) state.fileSha = newSha;

  toast("good","Сохранено","Изменения записаны в репозиторий.");
}

function bindSettings(){
  const modal = safeBindModalClose("#settingsModal");

  on("#settingsBtn", "click", ()=>{
    if(!modal) return;
    const ti = qs("#tokenInput");
    if(ti) ti.value = state.token || "";
    openModal(modal);
  });

  on("#saveSettingsBtn", "click", ()=>{
    if(!modal) return;
    const ti = qs("#tokenInput");
    state.token = ti ? ti.value.trim() : "";
    setToken(state.token);
    closeModal(modal);
    renderHeader();
    toast("good","Token сохранён","OK");
  });

  on("#clearTokenBtn", "click", ()=>{
    if(!modal) return;
    setToken("");
    state.token = "";
    renderHeader();
    toast("warn","Token очищен","На этом устройстве token удалён.");
    closeModal(modal);
  });

  on("#reloadBtn", "click", async ()=>{
    try{
      await loadFromGitHubOrLocal();
      ensureDataShape();
      renderCalendar();
      toast("good","Обновлено","Данные перезагружены.");
    }catch(e){
      toast("bad","Ошибка", String(e.message || e));
    }
  });

  on("#saveBtn", "click", ()=>saveToGitHub());
}

function bindSearch(){
  const modal = safeBindModalClose("#searchModal");

  on("#searchBtn", "click", ()=>{
    if(!modal) return;
    if(!isAdmin()){
      toast("warn","Нет доступа","Сначала войди в админку.");
      return;
    }
    const inp = qs("#shiftSearch");
    if(inp) inp.value = "";
    const out = qs("#searchResults");
    if(out) out.innerHTML = `<div class="empty">Введи запрос для поиска.</div>`;
    openModal(modal);
    if(inp) inp.focus();
  });

  on("#shiftSearch", "input", ()=>{
    // (упрощённо, без переписывания — можно вернуть поиск позже)
  });
}

/* ==========================
   INIT
========================== */
async function init(){
  // ✅ безопасно закрываем модалки (если ты их закомментировал — ошибок не будет)
  safeBindModalClose("#editModal");
  safeBindModalClose("#employeesModal");
  safeBindModalClose("#templatesModal");
  safeBindModalClose("#searchModal");
  // authModal больше не нужен — можно оставить в HTML или удалить

  // кнопка "Выйти"
  bindLogoutButton();

  // если не админ — блокируем до ввода пароля
  guardAdmin();

  bindSettings();
  bindMonthNav();
  bindCalendarClicks();

  bindEmployees();
  bindTemplates();
  bindSearch();
  bindEditorEvents();

  renderWeekdays();
  buildDeptPills();
  buildEmpDeptPills();

  await loadFromGitHubOrLocal();
  ensureDataShape();

  if(state.data.templates.length === 0){
    state.data.templates = [
      { id: genId("tpl"), label:"День 10–18", from:"10:00", to:"18:00" },
      { id: genId("tpl"), label:"День 12–20", from:"12:00", to:"20:00" },
      { id: genId("tpl"), label:"Офис 09–17", from:"09:00", to:"17:00" }
    ];
  }

  state.selectedISO = todayISO();
  renderCalendar();
  refreshAllEmployeeSelects();
  refreshTemplateSelect();

  // обновим статус и кнопку
  setLockedStateText();
  ensureAuthButtonMode();
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}
function escapeAttr(s){ return String(s).replace(/"/g, "&quot;"); }

init().catch(err=>{
  console.error(err);
  toast("bad","Критическая ошибка", String(err.message || err));
});