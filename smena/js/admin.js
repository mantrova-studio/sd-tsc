import { WEEKDAYS, MONTHS_RU, toISODate, todayISO, formatDateLong, sortShifts, sha256Hex } from "./util.js";
import { qs, qsa, toast, openModal, closeModal, bindModalClose } from "./ui.js";
import { getToken, setToken, getRepo, setRepo, isAdmin, setAdmin, getTemplates, setTemplates } from "./storage.js";
import { ghGetJsonFile, ghPutJsonFile } from "./github.js";

const FILE_PATH = "smena/data/shifts.json";

const ADMIN_PASSWORD_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"; // пустой пароль

const ADMIN_DEPTS = [
  { id: "all", label: "Все" },
  { id: "delivery", label: "Доставка" },
  { id: "kitchen", label: "Кухня" },
  { id: "call", label: "Колл-центр" }
];

const EMP_DEPTS = ADMIN_DEPTS; // те же варианты

const state = {
  // фильтр для смен/календаря
  dept: "all",

  // фильтр для сотрудников (в модалке и в селектах)
  empDept: "all",

  viewY: new Date().getFullYear(),
  viewM0: new Date().getMonth(),
  selectedISO: null,

  data: null,
  fileSha: null,

  repoFull: getRepo() || "mantrova-studio/sd-tsc",
  token: getToken(),

  templates: getTemplates(),

  edit: {
    dayISO: null,
    shifts: [],        // показываемые/редактируемые смены (по dept фильтру)
    otherShifts: [],   // смены других отделов (сохраняем)
    filterDept: "all"
  }
};

function monthTitle(y, m0){ return `${MONTHS_RU[m0]} ${y}`; }
function mondayFirstIndex(jsDay){ return (jsDay + 6) % 7; }
function genId(prefix="id"){
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`;
}
function norm(s){ return String(s||"").trim(); }

/* ---------------- Pills builders ---------------- */

function buildDeptPills(){
  const row = qs("#deptRow");
  if(!row) return;

  row.innerHTML = "";
  for(const d of ADMIN_DEPTS){
    const b = document.createElement("button");
    b.className = "pill";
    b.type = "button";
    b.dataset.dept = d.id;
    b.innerHTML = `<span class="v">${d.label}</span>`;
    row.appendChild(b);
  }

  const setActive = ()=>{
    qsa(".pill", row).forEach(p => p.dataset.active = (p.dataset.dept === state.dept ? "1" : "0"));
  };

  row.addEventListener("click", (e)=>{
    const btn = e.target.closest(".pill");
    if(!btn) return;
    state.dept = btn.dataset.dept;
    setActive();
    renderCalendar();

    if(qs("#editModal")?.getAttribute("data-open")==="1"){
      toast("warn","Фильтр смен изменён","Закрой и открой день заново, чтобы увидеть смены по новому фильтру.");
    }
  });

  setActive();
}

function buildEmpDeptPills(){
  const rows = [qs("#empDeptRow"), qs("#empDeptRow2")].filter(Boolean);
  if(rows.length === 0) return;

  for(const row of rows){
    row.innerHTML = "";
    for(const d of EMP_DEPTS){
      const b = document.createElement("button");
      b.className = "pill";
      b.type = "button";
      b.dataset.empdept = d.id;
      b.innerHTML = `<span class="v">${d.label}</span>`;
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
  for(const row of rows){
    qsa(".pill", row).forEach(p => p.dataset.active = (p.dataset.empdept === state.empDept ? "1" : "0"));
  }
}

/* ---------------- Calendar ---------------- */

function renderWeekdays(){
  const wrap = qs("#weekdays");
  wrap.innerHTML = "";
  for(const w of WEEKDAYS){
    const d = document.createElement("div");
    d.textContent = w;
    wrap.appendChild(d);
  }
}

function renderHeader(){
  qs("#monthLabel").textContent = monthTitle(state.viewY, state.viewM0);
  qs("#repoValue").textContent = state.repoFull || "—";
  qs("#tokenState").textContent = state.token ? "Token: OK" : "Token: нет";
}

function getDayAllShifts(iso){
  return sortShifts(state.data?.days?.[iso] || []);
}

function hasAnyShifts(iso){
  const arr = getDayAllShifts(iso);
  if(state.dept === "all") return arr.length > 0;
  return arr.some(s => s.dept === state.dept);
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

function bindMonthNav(){
  qs("#prevMonth").addEventListener("click", ()=>moveMonth(-1));
  qs("#nextMonth").addEventListener("click", ()=>moveMonth(1));
  qs("#todayBtn").addEventListener("click", ()=>{
    const d = new Date();
    state.viewY = d.getFullYear();
    state.viewM0 = d.getMonth();
    state.selectedISO = todayISO();
    renderCalendar();
    openEditor(state.selectedISO);
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
    openEditor(state.selectedISO);
  });
}

/* ---------------- Employees helpers ---------------- */

function ensureEmployees(){
  if(!state.data.employees) state.data.employees = [];
}

function getEmployeesFiltered(){
  ensureEmployees();
  const emps = (state.data.employees || []).slice();
  const filtered = (state.empDept === "all")
    ? emps
    : emps.filter(e => e.dept === state.empDept);

  return filtered.sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""), "ru"));
}

/**
 * options for selects:
 * - filter by state.empDept
 * - BUT keep current selected employeeId even if outside filter (pinned option)
 */
function employeeOptionsHTML(includeEmployeeId=null){
  const all = (state.data?.employees || []);
  const filtered = getEmployeesFiltered();

  let pinned = null;
  if(includeEmployeeId){
    pinned = all.find(e => e.id === includeEmployeeId) || null;
  }

  const opts = [];

  if(pinned && !filtered.some(e => e.id === pinned.id)){
    opts.push(`<option value="${pinned.id}">${pinned.name} — ${pinned.role || pinned.dept} (вне фильтра)</option>`);
  }

  for(const e of filtered){
    opts.push(`<option value="${e.id}">${e.name} — ${e.role || e.dept}</option>`);
  }

  return opts.join("");
}

function refreshAllEmployeeSelects(){
  // quick select
  const quick = qs("#quickEmp");
  if(quick){
    const cur = quick.value || "";
    quick.innerHTML = employeeOptionsHTML(cur) || `<option value="">(нет сотрудников)</option>`;
    if(cur) quick.value = cur;
  }

  // selects inside editor list
  qsa(`#editList select[data-k="employeeId"]`).forEach(sel=>{
    const cur = sel.value || sel.getAttribute("value") || "";
    sel.innerHTML = employeeOptionsHTML(cur) || `<option value="">(нет сотрудников)</option>`;
    if(cur) sel.value = cur;
  });

  // re-render list header counts/text
  if(qs("#editModal")?.getAttribute("data-open")==="1"){
    renderEditorList();
  }
}

/* ---------------- Editor (shifts) ---------------- */

function renderQuickSelectors(){
  const empSel = qs("#quickEmp");
  const tplSel = qs("#quickTpl");

  if(empSel){
    const cur = empSel.value || "";
    empSel.innerHTML = employeeOptionsHTML(cur) || `<option value="">(нет сотрудников)</option>`;
    if(cur) empSel.value = cur;
  }

  const tpls = state.templates || [];
  if(tplSel){
    if(tpls.length === 0){
      tplSel.innerHTML = `<option value="">(нет шаблонов)</option>`;
    } else {
      tplSel.innerHTML = tpls
        .slice()
        .sort((a,b)=>String(a.label||"").localeCompare(String(b.label||""), "ru"))
        .map(t => `<option value="${t.id}">${t.label} • ${t.from||"—"}–${t.to||"—"} • ${t.dept||"—"}</option>`)
        .join("");
    }
  }
}

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

  qs("#editTitle").textContent = formatDateLong(iso);
  qs("#editSub").textContent = (filterDept === "all")
    ? `Смен: ${state.edit.shifts.length}`
    : `Отдел: ${filterDept} • Смен: ${state.edit.shifts.length}`;

  renderQuickSelectors();
  renderEditorList();
  openModal(qs("#editModal"));
}

function renderEditorList(){
  const list = qs("#editList");
  list.innerHTML = "";

  if(state.edit.shifts.length === 0){
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent =
      (state.edit.filterDept && state.edit.filterDept !== "all")
        ? "По выбранному отделу смен нет. Добавь смену."
        : "Смен нет. Нажми “Добавить пустую” или “Быстро добавить”.";
    list.appendChild(empty);
  } else {
    state.edit.shifts.forEach((s, idx)=>{
      const emp = (state.data?.employees || []).find(e => e.id === s.employeeId);
      const name = emp?.name || s.employeeId || "Сотрудник";

      const row = document.createElement("div");
      row.className = "shiftRow";

      row.innerHTML = `
        <div style="flex:1">
          <div class="shiftMain">
            <div class="name">${name}</div>
            <div class="meta">${(s.from||"—") + "–" + (s.to||"—")} • ${s.role || s.dept}${s.note ? " • " + s.note : ""}</div>
          </div>
          <div class="hr"></div>
          <div class="formGrid">
            <div class="field">
              <div class="label">Сотрудник (фильтр: ${state.empDept})</div>
              <select class="select" data-k="employeeId" data-i="${idx}">
                ${employeeOptionsHTML(s.employeeId)}
              </select>
            </div>

            <div class="row2">
              <div class="field">
                <div class="label">С (время)</div>
                <input class="input" placeholder="10:00" value="${s.from || ""}" data-k="from" data-i="${idx}" />
              </div>
              <div class="field">
                <div class="label">По (время)</div>
                <input class="input" placeholder="18:00" value="${s.to || ""}" data-k="to" data-i="${idx}" />
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
                <div class="label">Должность (текст)</div>
                <input class="input" placeholder="Курьер / Повар / Оператор" value="${s.role || ""}" data-k="role" data-i="${idx}" />
              </div>
            </div>

            <div class="field">
              <div class="label">Заметка</div>
              <input class="input" placeholder="Замена / Подмена / и т.д." value="${s.note || ""}" data-k="note" data-i="${idx}" />
            </div>

            <div style="display:flex; gap:10px; justify-content:flex-end">
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

  qs("#editSub").textContent = (state.edit.filterDept === "all")
    ? `Смен: ${state.edit.shifts.length}`
    : `Отдел: ${state.edit.filterDept} • Смен: ${state.edit.shifts.length}`;
}

function bindEditorEvents(){
  const modal = qs("#editModal");

  modal.addEventListener("input", (e)=>{
    const el = e.target;
    const idx = Number(el.dataset.i);
    const k = el.dataset.k;
    if(Number.isNaN(idx) || !k) return;

    const s = state.edit.shifts[idx];
    if(!s) return;
    s[k] = el.value;

    if(k === "employeeId"){
      const emp = (state.data?.employees || []).find(x => x.id === s.employeeId);
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
      return;
    }
  });

  qs("#addShiftBtn").addEventListener("click", ()=>{
    const emps = state.data?.employees || [];
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

  qs("#quickAddBtn").addEventListener("click", ()=>{
    const empId = qs("#quickEmp").value;
    const tplId = qs("#quickTpl").value;
    const emp = (state.data?.employees || []).find(e => e.id === empId);
    const tpl = (state.templates || []).find(t => t.id === tplId);

    if(!empId || !emp){
      toast("bad","Не выбран сотрудник","Выбери сотрудника для быстрого добавления.");
      return;
    }
    if(!tplId || !tpl){
      toast("bad","Не выбран шаблон","Сначала создай/выбери шаблон смены.");
      return;
    }

    const deptFinal =
      (state.edit.filterDept && state.edit.filterDept !== "all")
        ? state.edit.filterDept
        : (tpl.dept || emp.dept || "delivery");

    state.edit.shifts.push({
      employeeId: emp.id,
      dept: deptFinal,
      role: tpl.role || emp.role || "",
      from: tpl.from || "",
      to: tpl.to || "",
      note: tpl.note || ""
    });

    renderEditorList();
  });

  qs("#applyDayBtn").addEventListener("click", ()=>{
    applyEditorToData();
    closeModal(modal);
    renderCalendar();
    toast("good", "Готово", "День обновлён локально. Нажми “Сохранить в GitHub”, чтобы записать в репозиторий.");
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
    result = [...clean, ...(state.edit.otherShifts || [])];
    result = sortShifts(result);
  }

  if(!state.data.days) state.data.days = {};
  if(result.length === 0) delete state.data.days[iso];
  else state.data.days[iso] = result;

  state.data.meta = state.data.meta || {};
  state.data.meta.updatedAt = new Date().toISOString();
}

/* ---------------- Employees CRUD ---------------- */

function employeeUsed(employeeId){
  const days = state.data?.days || {};
  for(const iso of Object.keys(days)){
    const arr = days[iso] || [];
    if(arr.some(s => s.employeeId === employeeId)) return true;
  }
  return false;
}

function renderEmployeesList(){
  const modalOpen = qs("#employeesModal")?.getAttribute("data-open")==="1";
  if(!modalOpen) return;

  ensureEmployees();
  const q = norm(qs("#empSearch").value).toLowerCase();
  const list = qs("#empList");
  list.innerHTML = "";

  const base = getEmployeesFiltered();
  const filtered = q
    ? base.filter(e =>
        String(e.name||"").toLowerCase().includes(q) ||
        String(e.role||"").toLowerCase().includes(q) ||
        String(e.dept||"").toLowerCase().includes(q)
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
    const used = employeeUsed(e.id);

    const row = document.createElement("div");
    row.className = "shiftRow";
    row.innerHTML = `
      <div style="flex:1">
        <div class="shiftMain">
          <div class="name">${e.name || "Без имени"}</div>
          <div class="meta">${e.dept || "—"} • ${e.role || "—"} • id: ${e.id}</div>
        </div>
        <div class="hr"></div>
        <div class="row2">
          <div class="field">
            <div class="label">Имя</div>
            <input class="input" data-empk="name" data-empid="${e.id}" value="${e.name || ""}" />
          </div>
          <div class="field">
            <div class="label">Отдел</div>
            <select class="select" data-empk="dept" data-empid="${e.id}">
              <option value="delivery">delivery</option>
              <option value="kitchen">kitchen</option>
              <option value="call">call</option>
            </select>
          </div>
        </div>

        <div class="field">
          <div class="label">Роль</div>
          <input class="input" data-empk="role" data-empid="${e.id}" value="${e.role || ""}" placeholder="Курьер / Повар / Оператор" />
        </div>

        <div style="display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap">
          <span class="badge ${used ? "warn" : "good"}">${used ? "используется" : "свободен"}</span>
          <button class="btn danger small" type="button" data-empaction="del" data-empid="${e.id}">Удалить</button>
        </div>
      </div>
      <div class="badge accent">${e.dept || "—"}</div>
    `;
    list.appendChild(row);

    const deptSel = row.querySelector(`select[data-empk="dept"][data-empid="${e.id}"]`);
    if(deptSel) deptSel.value = e.dept || "delivery";
  }
}

function bindEmployees(){
  const modal = qs("#employeesModal");
  bindModalClose(modal);

  qs("#employeesBtn").addEventListener("click", ()=>{
    if(!isAdmin()){
      toast("warn","Нет доступа","Сначала войди в админку.");
      openModal(qs("#authModal"));
      return;
    }
    qs("#empSearch").value = "";
    syncEmpDeptPills();
    openModal(modal);
    renderEmployeesList();
  });

  qs("#empSearch").addEventListener("input", renderEmployeesList);

  qs("#addEmpBtn").addEventListener("click", ()=>{
    ensureEmployees();
    const id = genId("e");
    const deptDefault = (state.empDept !== "all") ? state.empDept : "delivery";
    state.data.employees.push({ id, name:"", dept:deptDefault, role:"" });
    renderEmployeesList();
    refreshAllEmployeeSelects();
    toast("good","Сотрудник добавлен","Заполни имя/отдел/роль.");
  });

  modal.addEventListener("input", (e)=>{
    const el = e.target;
    const empId = el.dataset.empid;
    const k = el.dataset.empk;
    if(!empId || !k) return;

    const emp = (state.data?.employees || []).find(x => x.id === empId);
    if(!emp) return;

    emp[k] = el.value;

    // если поменяли dept сотрудника — обновим список и селекты
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
      if(!empId) return;

      if(employeeUsed(empId)){
        toast("warn","Нельзя удалить","Этот сотрудник уже стоит в сменах.");
        return;
      }

      state.data.employees = (state.data.employees || []).filter(x => x.id !== empId);
      renderEmployeesList();
      refreshAllEmployeeSelects();
      toast("good","Удалено","Сотрудник удалён из списка.");
    }
  });
}

/* ---------------- Templates ---------------- */

function ensureDefaultTemplates(){
  if(Array.isArray(state.templates) && state.templates.length) return;
  state.templates = [
    { id: genId("tpl"), label:"День 10–18", dept:"delivery", role:"", from:"10:00", to:"18:00", note:"" },
    { id: genId("tpl"), label:"День 12–20", dept:"kitchen", role:"", from:"12:00", to:"20:00", note:"" },
    { id: genId("tpl"), label:"Офис 09–17", dept:"call", role:"", from:"09:00", to:"17:00", note:"" }
  ];
  setTemplates(state.templates);
}

function renderTemplatesList(){
  const list = qs("#tplList");
  list.innerHTML = "";

  const tpls = (state.templates || [])
    .slice()
    .sort((a,b)=>String(a.label||"").localeCompare(String(b.label||""), "ru"));

  if(tpls.length === 0){
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Шаблонов нет. Нажми “Новый шаблон”.";
    list.appendChild(empty);
    renderQuickSelectors();
    return;
  }

  for(const t of tpls){
    const row = document.createElement("div");
    row.className = "shiftRow";
    row.innerHTML = `
      <div style="flex:1">
        <div class="shiftMain">
          <div class="name">${t.label || "Без названия"}</div>
          <div class="meta">${t.from || "—"}–${t.to || "—"} • ${t.dept || "—"} • ${t.role || "роль не указана"}${t.note ? " • " + t.note : ""}</div>
        </div>
        <div class="hr"></div>
        <div class="formGrid">
          <div class="field">
            <div class="label">Название</div>
            <input class="input" data-tplk="label" data-tplid="${t.id}" value="${t.label || ""}" />
          </div>

          <div class="row2">
            <div class="field">
              <div class="label">С</div>
              <input class="input" data-tplk="from" data-tplid="${t.id}" value="${t.from || ""}" placeholder="10:00" />
            </div>
            <div class="field">
              <div class="label">По</div>
              <input class="input" data-tplk="to" data-tplid="${t.id}" value="${t.to || ""}" placeholder="18:00" />
            </div>
          </div>

          <div class="row2">
            <div class="field">
              <div class="label">Отдел</div>
              <select class="select" data-tplk="dept" data-tplid="${t.id}">
                <option value="delivery">delivery</option>
                <option value="kitchen">kitchen</option>
                <option value="call">call</option>
              </select>
            </div>
            <div class="field">
              <div class="label">Роль (текст)</div>
              <input class="input" data-tplk="role" data-tplid="${t.id}" value="${t.role || ""}" placeholder="Курьер / Повар / Оператор" />
            </div>
          </div>

          <div class="field">
            <div class="label">Заметка</div>
            <input class="input" data-tplk="note" data-tplid="${t.id}" value="${t.note || ""}" placeholder="Замена / Подмена…" />
          </div>

          <div style="display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap">
            <button class="btn danger small" type="button" data-tplaction="del" data-tplid="${t.id}">Удалить</button>
          </div>
        </div>
      </div>
      <div class="badge accent">tpl</div>
    `;
    list.appendChild(row);

    const deptSel = row.querySelector(`select[data-tplk="dept"][data-tplid="${t.id}"]`);
    if(deptSel) deptSel.value = t.dept || "delivery";
  }

  renderQuickSelectors();
}

function bindTemplates(){
  const modal = qs("#templatesModal");
  bindModalClose(modal);

  qs("#templatesBtn").addEventListener("click", ()=>{
    if(!isAdmin()){
      toast("warn","Нет доступа","Сначала войди в админку.");
      openModal(qs("#authModal"));
      return;
    }

    ensureDefaultTemplates();
    state.templates = getTemplates();
    renderTemplatesList();
    openModal(modal);
  });

  qs("#addTplBtn").addEventListener("click", ()=>{
    ensureDefaultTemplates();
    state.templates = getTemplates();

    state.templates.push({
      id: genId("tpl"),
      label: "Новый шаблон",
      dept: "delivery",
      role: "",
      from: "",
      to: "",
      note: ""
    });

    setTemplates(state.templates);
    renderTemplatesList();
    toast("good","Шаблон добавлен","Отредактируй поля.");
  });

  modal.addEventListener("input", (e)=>{
    const el = e.target;
    const tplId = el.dataset.tplid;
    const k = el.dataset.tplk;
    if(!tplId || !k) return;

    const t = (state.templates || []).find(x => x.id === tplId);
    if(!t) return;

    t[k] = el.value;
    setTemplates(state.templates);
    renderQuickSelectors();
  });

  modal.addEventListener("click", (e)=>{
    const btn = e.target.closest("button");
    if(!btn) return;

    if(btn.dataset.tplaction === "del"){
      const tplId = btn.dataset.tplid;
      state.templates = (state.templates || []).filter(x => x.id !== tplId);
      setTemplates(state.templates);
      renderTemplatesList();
      toast("good","Удалено","Шаблон удалён.");
    }
  });
}

/* ---------------- Search ---------------- */

function buildSearchIndex(){
  const res = [];
  const emps = state.data?.employees || [];
  const days = state.data?.days || {};
  for(const iso of Object.keys(days)){
    for(const sh of (days[iso] || [])){
      const emp = emps.find(e => e.id === sh.employeeId);
      res.push({
        iso,
        shift: sh,
        empName: emp?.name || sh.employeeId || ""
      });
    }
  }
  return res;
}

function renderSearchResults(){
  const q = norm(qs("#shiftSearch").value).toLowerCase();
  const wrap = qs("#searchResults");
  wrap.innerHTML = "";

  if(!q){
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Введи запрос для поиска.";
    wrap.appendChild(empty);
    return;
  }

  const idx = buildSearchIndex();
  const hits = idx.filter(x => {
    const hay =
      `${x.empName} ${x.shift.role||""} ${x.shift.dept||""} ${x.shift.from||""} ${x.shift.to||""} ${x.shift.note||""}`
        .toLowerCase();
    return hay.includes(q);
  }).slice(0, 60);

  if(hits.length === 0){
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Совпадений нет.";
    wrap.appendChild(empty);
    return;
  }

  for(const h of hits){
    const time = `${h.shift.from||"—"}–${h.shift.to||"—"}`;
    const row = document.createElement("div");
    row.className = "shiftRow";
    row.style.cursor = "pointer";
    row.innerHTML = `
      <div class="shiftMain">
        <div class="name">${h.empName}</div>
        <div class="meta">${formatDateLong(h.iso)} • ${time} • ${h.shift.dept}${h.shift.note ? " • " + h.shift.note : ""}</div>
      </div>
      <div class="badge accent">Открыть</div>
    `;
    row.addEventListener("click", ()=>{
      closeModal(qs("#searchModal"));
      const [yy,mm] = h.iso.split("-").map(Number);
      state.viewY = yy;
      state.viewM0 = mm - 1;
      state.selectedISO = h.iso;
      renderCalendar();
      openEditor(h.iso);
    });
    wrap.appendChild(row);
  }
}

function bindSearch(){
  const modal = qs("#searchModal");
  bindModalClose(modal);

  qs("#searchBtn").addEventListener("click", ()=>{
    if(!isAdmin()){
      toast("warn","Нет доступа","Сначала войди в админку.");
      openModal(qs("#authModal"));
      return;
    }
    qs("#shiftSearch").value = "";
    renderSearchResults();
    openModal(modal);
    qs("#shiftSearch").focus();
  });

  qs("#shiftSearch").addEventListener("input", renderSearchResults);
}

/* ---------------- GitHub load/save ---------------- */

async function loadFromGitHubOrLocal(){
  if(state.repoFull && state.token){
    const r = await ghGetJsonFile({ token: state.token, repoFull: state.repoFull, path: FILE_PATH });
    if(r.ok && r.json){
      state.data = r.json;
      state.fileSha = r.sha;
      toast("good", "Данные загружены", "shifts.json загружен через GitHub API.");
      return;
    }
    toast("warn", "GitHub недоступен", "Не удалось загрузить через API. Пробую локально (read-only).");
  }

  const res = await fetch(`./data/shifts.json?ts=${Date.now()}`);
  if(!res.ok) throw new Error("Не удалось загрузить локальный shifts.json");
  state.data = await res.json();
  state.fileSha = null;
}

async function saveToGitHub(){
  if(!state.token){
    toast("bad", "Нет токена", "Введи GitHub token в настройках.");
    return;
  }
  if(!state.repoFull){
    toast("bad", "Нет репозитория", "Укажи owner/repo в настройках.");
    return;
  }

  const cur = await ghGetJsonFile({ token: state.token, repoFull: state.repoFull, path: FILE_PATH });
  if(cur.ok){
    if(state.fileSha && cur.sha && state.fileSha !== cur.sha){
      toast("warn", "Файл обновился", "shifts.json изменился на сервере. Нажми “Обновить” и проверь правки, чтобы не затереть чужие.");
      return;
    }
    state.fileSha = cur.sha;
  } else {
    if(cur.status !== 404){
      toast("bad", "Ошибка GitHub", `Не могу проверить файл: ${cur.status}`);
      return;
    }
  }

  const msg = `smena: update shifts (${new Date().toISOString()})`;
  const put = await ghPutJsonFile({
    token: state.token,
    repoFull: state.repoFull,
    path: FILE_PATH,
    json: state.data,
    message: msg,
    sha: state.fileSha || undefined
  });

  if(!put.ok){
    toast("bad", "Сохранение не удалось", `GitHub: ${put.status}. Проверь токен/права/sha.`);
    console.error(put.error);
    return;
  }

  const newSha = put.data?.content?.sha || null;
  if(newSha) state.fileSha = newSha;

  toast("good", "Сохранено", "Изменения записаны в репозиторий.");
}

/* ---------------- Settings & Auth ---------------- */

function bindSettings(){
  bindModalClose(qs("#settingsModal"));

  qs("#settingsBtn").addEventListener("click", ()=>{
    qs("#repoInput").value = state.repoFull || "";
    qs("#tokenInput").value = state.token || "";
    openModal(qs("#settingsModal"));
  });

  qs("#saveSettingsBtn").addEventListener("click", ()=>{
    state.repoFull = qs("#repoInput").value.trim();
    state.token = qs("#tokenInput").value.trim();
    setRepo(state.repoFull);
    setToken(state.token);
    closeModal(qs("#settingsModal"));
    renderHeader();
    toast("good", "Настройки сохранены", "Репозиторий/токен сохранены на этом устройстве.");
  });

  qs("#reloadBtn").addEventListener("click", async ()=>{
    try{
      await loadFromGitHubOrLocal();
      renderCalendar();
      toast("good", "Перезагружено", "Данные обновлены.");
    }catch(e){
      toast("bad", "Ошибка", String(e.message || e));
    }
  });

  qs("#saveBtn").addEventListener("click", ()=>saveToGitHub());
}

function bindAuth(){
  const modal = qs("#authModal");
  bindModalClose(modal);

  qs("#authBtn").addEventListener("click", ()=>{
    openModal(modal);
    qs("#passInput").focus();
  });

  qs("#loginBtn").addEventListener("click", async ()=>{
    const pass = qs("#passInput").value || "";
    const hex = await sha256Hex(pass);

    if(hex === ADMIN_PASSWORD_SHA256){
      setAdmin(true);
      closeModal(modal);
      toast("good", "Вход выполнен", "Доступ к админке открыт.");
      qs("#lockedState").textContent = "Доступ: ОК";
    } else {
      toast("bad", "Неверный пароль", "Проверь пароль администратора.");
    }
  });

  if(isAdmin()){
    qs("#lockedState").textContent = "Доступ: ОК";
  } else {
    qs("#lockedState").textContent = "Доступ: закрыт";
    openModal(modal);
  }

  window.__printHash = async (p)=>console.log("SHA-256 HEX:", await sha256Hex(p));
}

/* ---------------- Init ---------------- */

async function init(){
  bindAuth();
  bindSettings();
  bindMonthNav();
  bindCalendarClicks();

  bindEmployees();
  bindTemplates();
  bindSearch();

  bindModalClose(qs("#editModal"));
  bindEditorEvents();
  renderWeekdays();

  buildDeptPills();
  buildEmpDeptPills();

  await loadFromGitHubOrLocal();

  if(!Array.isArray(state.templates) || !state.templates.length){
    state.templates = [
      { id: genId("tpl"), label:"День 10–18", dept:"delivery", role:"", from:"10:00", to:"18:00", note:"" },
      { id: genId("tpl"), label:"День 12–20", dept:"kitchen", role:"", from:"12:00", to:"20:00", note:"" },
      { id: genId("tpl"), label:"Офис 09–17", dept:"call", role:"", from:"09:00", to:"17:00", note:"" }
    ];
    setTemplates(state.templates);
  } else {
    state.templates = getTemplates();
  }

  state.selectedISO = todayISO();
  renderCalendar();
}

init().catch(err=>{
  console.error(err);
  toast("bad", "Критическая ошибка", String(err.message || err));
});