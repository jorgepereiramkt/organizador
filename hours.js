// Horas por cliente de la agencia.
// - Por cada mes y cliente: horas ESTIMADAS (las del contrato) y horas REALES (las que de verdad le dedicas). Se editan en Clientes → Horas.
// - Lo REGISTRADO se lee de ClickUp: el tiempo apuntado este mes en la «⭐ Tarea Principal ⭐» de cada cliente.
// - Cada día laborable, la app reparte lo que falta para llegar a lo real entre los días que quedan (máx. 1 h 30 por cliente y día)
//   y, a partir de las 19:00, lo registra en ClickUp (si está activado). Se puede revisar y deshacer.
(() => {
const O = window.__org, S = O.S, esc = O.esc, $ = s => document.querySelector(s);
const H = () => {
  S.hours = S.hours || {};
  const h = S.hours;
  h.months = h.months || {}; h.log = h.log || {}; h.cu = h.cu || {}; h.reg = h.reg || {};
  if (h.auto === undefined) h.auto = true;
  return h;
};
const iso = O.iso, fromIso = O.fromIso;
const MAX_DIA = 90;   // nunca más de 1 h 30 a un cliente en un día
const r5 = m => Math.max(0, Math.round(m / 5) * 5);
const fmt = m => { m = Math.round(m || 0); const h = Math.floor(m / 60), mm = m % 60; return h ? `${h} h${mm ? ' ' + mm : ''}` : `${mm} min`; };
const monthOf = day => day.slice(0, 7);
const isWork = d => d.getDay() !== 0 && d.getDay() !== 6;
let viewMonth = monthOf(O.today());

function workDays(month){
  const [y, m] = month.split('-').map(Number), out = [];
  for (let d = new Date(y, m - 1, 1); d.getMonth() === m - 1; d.setDate(d.getDate() + 1)) if (isWork(d)) out.push(iso(d));
  return out;
}
const agencyClients = () => S.clients.filter(c => c.group !== 'mine' && !O.isApartado(c));
const mdata = (month, c) => { const r = (H().months[month] || {})[c.id] || {}; return {est: r.est ?? (c.hours || 0), real: r.real ?? r.est ?? (c.hours || 0)}; };
const conHoras = (month = monthOf(O.today())) => agencyClients().filter(c => mdata(month, c).real > 0 || mdata(month, c).est > 0);
const regTasks = c => S.tasks.filter(t => t.client === c.id && O.isRegTask(t));
function taskFor(c){ const rs = regTasks(c); return (c.timeTask && rs.find(t => t.id === c.timeTask)) || rs[0] || null; }
const teamOf = c => { const l = O.clientLists(c)[0]; return l && l.team; };

/* ---------- Lo registrado en ClickUp este mes ---------- */
let loadingReg = false;
async function loadRegistered(month = viewMonth){
  if (!O.online() || loadingReg) return;
  loadingReg = true;
  try {
    const [y, m] = month.split('-').map(Number);
    const start = new Date(y, m - 1, 1).getTime(), end = new Date(y, m, 1).getTime() - 1;
    const out = {}, byDay = {};
    for (const c of agencyClients()){
      const tk = taskFor(c), team = teamOf(c);
      if (!tk || !team) continue;
      const r = await O.cu(`/team/${team}/time_entries?start_date=${start}&end_date=${end}&task_id=${tk.id}&assignee=${S.cu.me}`);
      const dd = byDay[c.id] = {};
      for (const e of r.data || []){ const m = +e.duration > 0 ? +e.duration / 60000 : 0; if (!m) continue; const d = iso(new Date(+e.start)); dd[d] = (dd[d] || 0) + m; }
      for (const d in dd) dd[d] = Math.round(dd[d]);
      out[c.id] = Object.values(dd).reduce((a, b) => a + b, 0);
    }
    H().reg[month] = {at: Date.now(), byClient: out, byDay}; O.save();
  } catch(e){ O.toast('No pude leer las horas de ClickUp: ' + e.message); }
  loadingReg = false;
  if (S.view === 'clientes' && S.clientMode === 'horas') O.render();
}
const registered = (month, cid) => ((H().reg[month] || {}).byClient || {})[cid];
const regDay = (month, cid, day) => (((H().reg[month] || {}).byDay || {})[cid] || {})[day] || 0;
// Margen: cada mes y cliente se pasa entre un 10 y un 20% del presupuesto (al azar, para que no parezca automático)
function factor(month, c){
  const h = H(), f = (h.fac = h.fac || {}), m = (f[month] = f[month] || {});
  if (!m[c.id]) { m[c.id] = Math.round((1.10 + Math.random() * 0.10) * 100) / 100; setTimeout(O.save, 0); }
  return m[c.id];
}
const base = (month, c) => { const {est, real} = mdata(month, c); return est || real || 0; };   // presupuesto del mes
// variación del mes en horas (+/-): la que pongas tú; si no pones nada, el margen al azar del 10-20 %
const varH = (month, c) => { const v = ((H().months[month] || {})[c.id] || {}).var; return v !== undefined && v !== null && v !== '' ? +v : Math.round(base(month, c) * (factor(month, c) - 1) * 4) / 4; };
const varManual = (month, c) => { const v = ((H().months[month] || {})[c.id] || {}).var; return v !== undefined && v !== null && v !== ''; };
const target = (month, c) => base(month, c) ? Math.max(0, base(month, c) + varH(month, c)) : 0;   // horas a registrar en el mes
// lo que deberías llevar registrado hasta un día (incluido), repartido por días laborables
const expectedTo = (month, c, day) => { const wd = workDays(month); return wd.length ? target(month, c) * 60 * wd.filter(d => d <= day).length / wd.length : 0; };

/* ---------- Rellenar hasta hoy: reparte lo que falta en los días sin registrar (máx. 1 h 30 por día) ---------- */
function fillPlan(month){
  const hoy = O.today(), plan = {}, resumen = [];
  const dias = workDays(month).filter(d => d <= hoy);
  for (const c of agencyClients()){
    const tk = taskFor(c); if (!tk || !target(month, c)) continue;
    const reg = registered(month, c.id) || 0, falta = Math.round(expectedTo(month, c, hoy) - reg);
    const vacios = dias.filter(d => !regDay(month, c.id, d)); if (falta < 15 || !vacios.length) continue;
    let resto = falta; const por = Math.min(MAX_DIA, Math.max(15, r5(falta / vacios.length)));
    for (const d of vacios){ if (resto < 5) break; const m = Math.min(por, r5(resto)); if (!m) break; (plan[d] = plan[d] || {})[c.id] = m; resto -= m; }
    resumen.push({c, falta, dias: vacios.filter(d => plan[d] && plan[d][c.id]).length, total: falta - Math.max(0, resto)});
  }
  return {plan, resumen};
}
async function fillToToday(month){
  if (!O.online()) return O.toast('Conecta ClickUp primero');
  await loadRegistered(month);
  const {plan, resumen} = fillPlan(month);
  if (!resumen.length) return O.toast('Nada que rellenar: vas al día ✓');
  const txt = resumen.map(r => `• ${r.c.name}: ${fmt(r.total)} en ${r.dias} día${r.dias > 1 ? 's' : ''}`).join('\n');
  if (!confirm(`Voy a registrar en ClickUp (en la «⭐ Tarea Principal ⭐» de cada cliente) lo que falta hasta hoy, en los días que no tienen nada (máx. 1 h 30 por cliente y día):\n\n${txt}\n\n¿Lo registro?`)) return;
  let n = 0;
  for (const d of Object.keys(plan).sort()){ await pushDay(d, plan[d], true); n++; }
  O.toast(`⏱ Rellenado: ${n} día${n > 1 ? 's' : ''} registrados en ClickUp`);
  H().reg[month] = null; await loadRegistered(month);
}

/* ---------- Reparto del día ---------- */
// Lo que toca hoy a cada cliente para llegar a lo real: lo que falta / días laborables que quedan (máx. 1 h 30)
function proposal(day){
  const month = monthOf(day), out = {};
  const left = Math.max(1, workDays(month).filter(d => d >= day).length);
  const todayLogged = H().log[day] || {};
  for (const c of conHoras(month)){
    const reg = registered(month, c.id);
    // si hoy ya se registró algo, no contarlo dos veces
    const yaHoy = H().cu[day] && H().cu[day][c.id] ? (todayLogged[c.id] || 0) : 0;
    const base = reg !== undefined ? reg - yaHoy : sumLog(c.id, month, day);
    const falta = target(month, c) * 60 - base;
    out[c.id] = falta <= 0 ? 0 : Math.min(MAX_DIA, r5(Math.max(15, falta / left)), r5(falta));
  }
  return out;
}
function sumLog(cid, month, beforeDay){ let t = 0; for (const [d, row] of Object.entries(H().log)) if (monthOf(d) === month && d < beforeDay) t += row[cid] || 0; return t; }
O.hoursProposal = proposal;

/* ---------- Objetivos de hoy en la vista Día ---------- */
const diaAfter = O.views.dia.after;
O.views.dia.after = () => {
  diaAfter && diaAfter();
  const day = O.planDay(), tb = $('#toolbar');
  if (conHoras().length && !tb.querySelector('[data-close-day]')){
    const done = !!H().log[day];
    const b = document.createElement('button');
    b.className = 'chip' + (done ? ' on' : ' warn'); b.dataset.closeDay = day;
    b.textContent = done ? '✓ Horas de hoy registradas' : '⏱ Horas de hoy';
    tb.insertBefore(b, tb.querySelector('.sp'));
  }
  if (!conHoras().length || $('#main .objetivos')) return;
  const p = H().log[day] || proposal(day);
  const chips = conHoras().filter(c => p[c.id] > 0).map(c =>
    `<span class="tag" style="--c:${O.clientColor(c)}"><i></i>${esc(c.name)} · ${fmt(p[c.id])}</span>`).join('');
  if (!chips) return;
  const div = document.createElement('div');
  div.className = 'objetivos';
  div.innerHTML = `<span class="lbl">${H().log[day] ? '⏱ Registrado hoy' : `⏱ Horas de hoy${H().auto ? ' (se registran a las 19:00)' : ''}`}</span>${chips}`;
  $('#main').prepend(div);
};

/* ---------- Clientes → Horas ---------- */
const clientesView = O.views.clientes, clientesAfter = O.views.clientes.after;
O.views.clientes = function(){
  if (S.clientMode !== 'horas') return clientesView();
  const month = viewMonth, d0 = fromIso(month + '-01'), isCur = month === monthOf(O.today());
  const wd = workDays(month), quedan = isCur ? wd.filter(d => d >= O.today()).length : (month > monthOf(O.today()) ? wd.length : 0);
  O.setToolbar('Horas', `${O.MESES[d0.getMonth()]} ${d0.getFullYear()} · ${quedan} de ${wd.length} días laborables por delante`,
    `<button class="icon" data-hm="-1" aria-label="Mes anterior"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></button>
     <button class="chip" data-hm="0">Este mes</button>
     <button class="icon" data-hm="1" aria-label="Mes siguiente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg></button>`, '');
  const reg = H().reg[month];
  if (O.online() && (!reg || !reg.byDay || Date.now() - reg.at > 10 * 60e3)) setTimeout(() => loadRegistered(month), 50);
  const hoyD = O.today(), hoyP = isCur ? (H().log[hoyD] || proposal(hoyD)) : {};
  const cs = agencyClients(), refDay = isCur ? hoyD : (month < monthOf(hoyD) ? wd[wd.length - 1] : wd[0]);
  let tP = 0, tG = 0, tX = 0;
  const cards = cs.map(c => {
    const {est, real} = mdata(month, c), g = registered(month, c.id) || 0, obj = target(month, c) * 60, exp = Math.round(expectedTo(month, c, refDay)), tk = taskFor(c);
    tP += obj; tG += g; tX += exp;
    const pct = obj ? Math.min(100, Math.round(g / obj * 100)) : 0, pexp = obj ? Math.min(100, Math.round(exp / obj * 100)) : 0, dif = g - exp;
    return `<div class="hcard" style="--c:${O.clientColor(c)}">
      <header><b><i></i>${esc(c.name)}</b>${tk ? `<a href="${esc(tk.url || '#')}" target="_blank" rel="noopener" title="${esc(tk.title)}">⏱</a>` : '<span title="Sin «⭐ Tarea Principal ⭐» asignada a ti">⚠️</span>'}</header>
      <div class="hnums"><label>Presupuesto<input type="number" min="0" step="0.5" value="${est || ''}" data-hmk="est" data-cid="${c.id}" placeholder="0"><small>h</small></label>
        <label title="Horas de más (+) o de menos (−) este mes. Si lo dejas vacío, se usa un margen al azar del 10-20 %">Variación<input type="number" step="0.5" value="${varManual(month, c) ? varH(month, c) : ''}" data-hmk="var" data-cid="${c.id}" placeholder="${base(month, c) ? (varH(month, c) >= 0 ? '+' : '') + varH(month, c) : '±0'}"><small>h</small></label></div>
      ${base(month, c) ? `<small class="hobj">Objetivo del mes: <b>${fmt(obj)}</b> (${est || real} h ${varH(month, c) >= 0 ? '+' : '−'} ${String(Math.abs(varH(month, c))).replace('.', ',')} h${varManual(month, c) ? '' : ', al azar'})</small>` : ''}
      <div class="hbar"><span style="width:${pct}%"></span><i style="left:${pexp}%" title="Lo que deberías llevar a ${isCur ? 'hoy' : 'final de mes'}"></i></div>
      <div class="hstat"><span><b>${fmt(g)}</b> de ${fmt(obj)}</span>${obj ? `<span class="${dif < -30 ? 'bad' : dif > 30 ? 'ok' : ''}">${Math.abs(dif) < 15 ? 'al día ✓' : dif < 0 ? `faltan ${fmt(-dif)} a ${isCur ? 'hoy' : 'fin de mes'}` : `${fmt(dif)} por delante`}</span>` : '<span>sin presupuesto</span>'}</div>
      ${isCur && hoyP[c.id] ? `<small class="hhoy">hoy: ${fmt(hoyP[c.id])}</small>` : ''}</div>`;
  }).join('');
  // calendario del mes: un cuadro por día laborable con lo registrado de cada cliente
  const semanas = []; let sem = [];
  for (const d of wd){ const dw = fromIso(d).getDay(); if (sem.length && dw === 1){ semanas.push(sem); sem = []; } sem.push(d); }
  if (sem.length) semanas.push(sem);
  const DN = ['', 'L', 'M', 'X', 'J', 'V'];
  const cal = semanas.map(w => `<div class="hweek">${[1, 2, 3, 4, 5].map(k => { const d = w.find(x => fromIso(x).getDay() === k);
      if (!d) return '<div class="hday empty"></div>';
      const rows = cs.map(c => ({c, m: regDay(month, c.id, d)})).filter(r => r.m), tot = rows.reduce((a, r) => a + r.m, 0);
      const fut = d > hoyD, isHoy = d === hoyD;
      return `<div class="hday${fut ? ' fut' : ''}${isHoy ? ' hoy' : ''}${!fut && !tot ? ' vacio' : ''}"><header><b>${DN[k]} ${+d.slice(8)}</b>${tot ? `<span>${fmt(tot)}</span>` : ''}</header>
        ${rows.map(r => `<div class="hent" style="--c:${O.clientColor(r.c)}"><i></i><span>${esc(r.c.name)}</span><b>${fmt(r.m)}</b></div>`).join('') || (fut ? '' : '<small>sin registrar</small>')}</div>`; }).join('')}</div>`).join('');
  const atrasado = isCur && cs.some(c => target(month, c) && expectedTo(month, c, hoyD) - (registered(month, c.id) || 0) >= 15);
  return `<div class="hbox hbox2">
    <div class="hhead">
      <div class="htot"><span><b>${fmt(tG)}</b><small>registrado</small></span><span><b>${fmt(tX)}</b><small>deberías llevar a ${isCur ? 'hoy' : 'fin de mes'}</small></span><span><b>${fmt(tP)}</b><small>presupuesto del mes</small></span></div>
      <span class="sp"></span>
      ${isCur ? `<button class="btn primary${atrasado ? '' : ' muted'}" data-hfill>⏩ Rellenar hasta hoy</button>` : ''}
      <button class="btn" data-hreload>↻ Leer ClickUp</button></div>
    ${(() => { const cl = H().cloud || {};
      return cl.on ? `<div class="hcloud on">☁️ <b>Registro automático activo</b> · cada día laborable a las 19:05 tu Apps Script registra lo que toca, aunque no abras la app${cl.trigger ? '' : ' · <em>falta crear el aviso diario en el script</em>'} · plan enviado ${cl.at ? new Date(cl.at).toTimeString().slice(0, 5) : ''}<button class="btn" data-hcloud>Desactivar</button></div>`
        : `<div class="hcloud">☁️ Registra solo cada día a las 19:05 <b>aunque no abras la app</b><button class="btn primary" data-hcloud>Activar</button></div>
           <label class="check hauto"><input type="checkbox" id="hAuto" ${H().auto ? 'checked' : ''}> Mientras tanto: registrar desde la app a partir de las 19:00 si está abierta (máx. 1 h 30 por cliente)</label>`; })()}
    ${isCur && H().log[hoyD] && H().log[hoyD]._auto ? `<div class="note">⏱ Hoy se registró automáticamente. <button class="btn" data-hundo>Deshacer lo de hoy</button></div>` : ''}
    <div class="hcards">${cards || '<div class="empty">Conecta ClickUp para ver los clientes de la agencia.</div>'}</div>
    <h3 class="h3">📅 ${O.MESES[d0.getMonth()]} día a día</h3>
    <div class="hcal">${cal}</div>
    <p class="iahint">«Presupuesto» son las horas del contrato. Si le dedicas otras de verdad, ponlas en «A registrar». La línea fina de cada barra marca lo que deberías llevar a hoy. «Rellenar hasta hoy» reparte lo que falta en los días que están vacíos (máx. 1 h 30 por cliente y día) y lo registra en la «⭐ Tarea Principal ⭐» de cada cliente.</p>
  </div>`;
};
O.views.clientes.after = () => {
  clientesAfter && clientesAfter();
  const sw = $('#toolbar .modes');
  if (sw && !sw.querySelector('[data-cmode=horas]')){
    const b = document.createElement('button');
    b.className = 'chip'; b.dataset.cmode = 'horas'; b.textContent = 'Horas';
    sw.appendChild(b);
  }
  sw && sw.querySelectorAll('[data-cmode]').forEach(b => b.setAttribute('aria-pressed', (S.clientMode || 'tareas') === b.dataset.cmode));
};
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'hAuto'){ H().auto = t.checked; O.save(); O.render(); }
  if (t.dataset.hmk){
    const mo = (H().months[viewMonth] = H().months[viewMonth] || {}), row = (mo[t.dataset.cid] = mo[t.dataset.cid] || {});
    if (t.dataset.hmk === 'var'){ if (t.value === '') delete row.var; else row.var = parseFloat(t.value) || 0; }
    else row[t.dataset.hmk] = Math.max(0, parseFloat(t.value) || 0);
    if (t.dataset.hmk === 'est') delete row.real;   // ya no se usa «A registrar»: manda el presupuesto
    const hc = H().cloud; if (hc && hc.on) { hc.at = 0; setTimeout(() => cloudSync(), 500); }   // el script recibe el cambio al momento
    O.save(); O.render();
  }
});
document.addEventListener('click', e => {
  const m = e.target.closest('[data-hm]');
  if (m){ const n = +m.dataset.hm; if (n === 0) viewMonth = monthOf(O.today()); else { const d = fromIso(viewMonth + '-01'); d.setMonth(d.getMonth() + n); viewMonth = monthOf(iso(d)); } O.render(); return; }
  if (e.target.closest('[data-hfill]')){ fillToToday(viewMonth); return; }
  if (e.target.closest('[data-hreload]')){ H().reg[viewMonth] = null; loadRegistered(viewMonth); return; }
  if (e.target.closest('[data-hundo]')){ undoDay(O.today()); return; }
  const b = e.target.closest('[data-close-day]'); if (b) openClose(b.dataset.closeDay);
});

/* ---------- Horas de hoy (revisar / cambiar a mano) ---------- */
const dlg = document.createElement('dialog');
dlg.id = 'closeDlg';
dlg.innerHTML = '<form method="dialog" class="sheet" id="closeForm"></form>';
document.body.appendChild(dlg);
const form = dlg.querySelector('form');
let draft = null, dDay = null;
function openClose(day){
  dDay = day;
  const prev = H().log[day];
  draft = {...(prev || proposal(day))};
  for (const k of Object.keys(draft)) if (k.startsWith('_')) delete draft[k];
  draw(!!prev); dlg.showModal();
}
function draw(ya){
  const d = fromIso(dDay), total = Object.values(draft).reduce((a, b) => a + b, 0);
  form.innerHTML = `<h2>Horas de hoy · ${O.DIAS_L[d.getDay()]} ${d.getDate()}</h2>
    <div class="note">Reparto para llegar a tus horas reales del mes (máx. 1 h 30 por cliente). Cámbialo si quieres y guarda: se registra en la «⭐ Tarea Principal ⭐» de cada cliente.</div>
    <div class="crows">${conHoras(monthOf(dDay)).map(c => {
      const t = taskFor(c), m = draft[c.id] || 0;
      return `<div class="crow" data-cid="${c.id}" style="--c:${O.clientColor(c)}">
        <b><i></i>${esc(c.name)}</b>
        <div class="stepper"><button type="button" data-step="-15">−</button><input type="number" min="0" max="${MAX_DIA}" step="5" value="${m}" data-min> <span>min</span><button type="button" data-step="15">+</button></div>
        <span class="lock">${t ? '⏱ ' + esc(t.title) : '⚠️ sin «⭐ Tarea Principal ⭐»: no se registrará'}</span>
      </div>`; }).join('')}</div>
    <div class="ctot">Total: <b>${fmt(total)}</b></div>
    <div class="actions"><button class="btn" value="cancel" formnovalidate>Cancelar</button>${ya ? '<button class="btn danger" value="undo">Deshacer</button>' : ''}<span class="sp"></span><button class="btn primary" value="ok">${ya ? 'Guardar cambios' : 'Registrar'}</button></div>`;
}
form.addEventListener('click', e => {
  const st = e.target.closest('[data-step]'); if (!st) return;
  const cid = st.closest('.crow').dataset.cid;
  draft[cid] = Math.min(MAX_DIA, Math.max(0, (draft[cid] || 0) + +st.dataset.step)); draw(!!H().log[dDay]);
});
form.addEventListener('input', e => { if (e.target.dataset.min !== undefined) draft[e.target.closest('.crow').dataset.cid] = Math.min(MAX_DIA, Math.max(0, r5(+e.target.value || 0))); });
form.addEventListener('change', e => { if (e.target.dataset.min !== undefined) draw(!!H().log[dDay]); });
dlg.addEventListener('close', async () => {
  if (dlg.returnValue === 'undo') return undoDay(dDay);
  if (dlg.returnValue !== 'ok') return;
  const row = {}; for (const [k, v] of Object.entries(draft)) if (v > 0) row[k] = v;
  await logDay(dDay, row, false);
});

async function logDay(day, row, auto){
  const h = H();
  h.log[day] = {...row, ...(auto ? {_auto: true} : {})}; O.save(); O.render();
  if (O.online()) await pushDay(day, row);
  H().reg[monthOf(day)] = null; loadRegistered(monthOf(day));
}
async function undoDay(day){
  const h = H(), ids = h.cu[day] || {};
  for (const c of agencyClients()) if (ids[c.id]){ const team = teamOf(c); if (team) await O.cu(`/team/${team}/time_entries/${ids[c.id]}`, {method:'DELETE'}).catch(() => {}); }
  delete h.log[day]; delete h.cu[day]; O.save();
  H().reg[monthOf(day)] = null; loadRegistered(monthOf(day));
  O.render(); O.toast('Horas de hoy deshechas');
}
// Una entrada de tiempo por cliente, seguidas desde la hora de inicio del día
async function pushDay(day, row, añadir){
  const h = H(); const prev = añadir ? {} : (h.cu[day] || {}), ids = añadir ? {...(h.cu[day] || {})} : {};
  const start0 = fromIso(day); const [hh, mm] = ((S.plan && S.plan.workStart) || '09:00').split(':').map(Number);
  start0.setHours(hh, mm, 0, 0);
  let t = start0.getTime(), ok = 0, fail = 0;
  for (const c of agencyClients()){
    const team = teamOf(c); if (!team) continue;
    try {
      if (prev[c.id]) await O.cu(`/team/${team}/time_entries/${prev[c.id]}`, {method:'DELETE'}).catch(() => {});
      const m = Math.min(MAX_DIA, row[c.id] || 0), tk = taskFor(c);
      if (m > 0 && tk){
        const r = await O.cu(`/team/${team}/time_entries`, {method:'POST', body: {start: t, duration: m * 60000, description: 'Organizador', tid: tk.id}});
        ids[c.id] = r && r.data && r.data.id; t += m * 60000; ok++;
      }
    } catch(e){ fail++; }
  }
  h.cu[day] = ids; if (añadir) h.log[day] = {...(h.log[day] || {}), ...row}; O.save();
  if (añadir) return;
  O.toast(fail ? `ClickUp: ${ok} registradas, ${fail} con error` : `⏱ Registradas en ClickUp las horas de hoy (${ok} clientes)`);
}

/* ---------- Automático en la nube: tu Apps Script registra a las 19:05 aunque no abras la app ---------- */
// La app le manda el plan (minutos por día y cliente) y tu token de ClickUp. El aviso diario lo crea «instalarAutomatico» en el script.
function cloudPlan(){
  const hoy = O.today(), mes = monthOf(hoy), sig = fromIso(mes + '-01'); sig.setMonth(sig.getMonth() + 1);
  const months = {};
  for (const mo of [mes, monthOf(iso(sig))]){
    months[mo] = agencyClients().map(c => { const tk = taskFor(c), team = teamOf(c), b = base(mo, c);
      return tk && team && b ? {tid: tk.id, team, name: c.name, budget: Math.round(target(mo, c) * 60), factor: 1} : null; }).filter(Boolean);
  }
  return months;
}
async function sendCloud(conToken){
  const url = S.plan && S.plan.bridge; if (!url) throw new Error('conecta antes el Puente de Google (⚙)');
  const body = {a: 'hoursplan', me: S.cu.me, start: (S.plan && S.plan.workStart) || '09:00', months: cloudPlan()};
  if (conToken) body.token = S.cu.token;
  const r = await fetch(url, {method: 'POST', body: JSON.stringify(body), headers: {'Content-Type': 'text/plain;charset=utf-8'}, redirect: 'follow'});
  const j = await r.json(); if (j.error) throw new Error(j.error);
  const h = H(); h.cloud = {...(h.cloud || {}), on: true, at: Date.now(), trigger: !!j.trigger}; O.save();
  return j;
}
let cloudBusy = false;
async function cloudSync(){   // mantiene el plan al día (como mucho cada 30 min)
  const h = H(); if (!h.cloud || !h.cloud.on || cloudBusy || !O.online()) return;
  if (h.cloud.at && Date.now() - h.cloud.at < 30 * 60e3) return;
  cloudBusy = true; try { await loadRegistered(monthOf(O.today())); await sendCloud(false); } catch(e){} cloudBusy = false;
}
setTimeout(cloudSync, 15000); setInterval(cloudSync, 10 * 60e3);
document.addEventListener('click', async e => {
  if (e.target.closest('[data-hcloud]')){
    const h = H();
    if (h.cloud && h.cloud.on){
      if (!confirm('¿Desactivar el registro automático en la nube? (deja de registrar a las 19:05)')) return;
      try { await fetch(S.plan.bridge, {method: 'POST', body: JSON.stringify({a: 'hoursoff'}), headers: {'Content-Type': 'text/plain;charset=utf-8'}}); } catch(err){}
      h.cloud.on = false; O.save(); O.render(); return O.toast('Registro automático desactivado');
    }
    if (!confirm('Para registrar tus horas cada día laborable a las 19:05 aunque no abras la app, la app enviará a tu Apps Script «Puente Organizador» (privado, solo tuyo) tu token de ClickUp y el reparto de minutos de cada cliente. ¿Lo activo?')) return;
    try { await loadRegistered(monthOf(O.today())); const j = await sendCloud(true); O.render(); O.toast(j.trigger ? '☁️ Automático activado' : '☁️ Plan enviado. Falta crear el aviso diario en el Apps Script'); }
    catch(err){ O.toast('No se pudo activar: ' + err.message); }
  }
});

/* ---------- Automático a las 19:00 ---------- */
// Sin servidor: se hace cuando la app está abierta a partir de las 19:00 (o la primera vez que la abras después).
async function autoCheck(){
  const h = H(), now = new Date(), day = O.today();
  if (h.cloud && h.cloud.on) return;   // ya lo hace tu Apps Script
  if (!h.auto || !O.online() || !isWork(now) || now.getHours() < 19 || h.log[day] || !conHoras().length) return;
  const month = monthOf(day);
  if (!h.reg[month] || Date.now() - h.reg[month].at > 30 * 60e3){ await loadRegistered(month); }
  if (!H().reg[month] || H().log[day]) return;
  const row = proposal(day);
  for (const k of Object.keys(row)) if (!row[k]) delete row[k];
  if (!Object.keys(row).length){ h.log[day] = {_auto: true}; O.save(); return; }
  await logDay(day, row, true);
}
setTimeout(autoCheck, 8000);
setInterval(autoCheck, 5 * 60e3);
})();
