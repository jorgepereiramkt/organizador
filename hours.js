// Plan de horas por cliente y «Cerrar el día».
// - Cada cliente tiene sus horas al mes (en su ficha). La app reparte lo que falta entre los días laborables que quedan,
//   con un objetivo diario que varía (según reuniones y tareas de ese cliente).
// - Al final del día, «Cerrar el día» PROPONE un reparto; Jorge lo revisa, lo ajusta y lo confirma.
//   Solo lo que él confirma se registra (en la app y, si quiere, en ClickUp como tiempo de ese día).
(() => {
const O = window.__org, S = O.S, esc = O.esc, $ = s => document.querySelector(s);
const H = () => (S.hours = S.hours || {margin: 10, log: {}});   // log: {día: {clienteId: minutos}}, cu: {día: {clienteId: idEntrada}}
const pad = O.pad, iso = O.iso, fromIso = O.fromIso;
const r5 = m => Math.max(0, Math.round(m / 5) * 5);
const fmt = m => { m = Math.round(m); const h = Math.floor(m / 60), mm = m % 60; return h ? `${h} h${mm ? ' ' + mm : ''}` : `${mm} min`; };
const monthOf = day => day.slice(0, 7);
const isWork = d => d.getDay() !== 0 && d.getDay() !== 6;

function workDays(month){
  const [y, m] = month.split('-').map(Number), out = [];
  for (let d = new Date(y, m - 1, 1); d.getMonth() === m - 1; d.setDate(d.getDate() + 1)) if (isWork(d)) out.push(iso(d));
  return out;
}
const conHoras = () => S.clients.filter(c => c.group !== 'mine' && (c.hours || 0) > 0);
function logged(cid, month, beforeDay){
  let t = 0;
  for (const [day, row] of Object.entries(H().log)) if (monthOf(day) === month && (!beforeDay || day < beforeDay)) t += row[cid] || 0;
  return t;
}
const goal = c => c.hours * 60 * (1 + (H().margin || 0) / 100);
// Variación estable por día y cliente (no cambia cada vez que se pinta)
function vari(day, cid){
  let h = 2166136261; for (const ch of day + cid){ h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return 0.6 + ((h >>> 0) % 1000) / 1000 * 0.8;    // 0,6 – 1,4
}
function hasMeeting(c, day){
  const ev = O.planEvents && O.planEvents.day === day ? O.planEvents.events : [];
  const words = O.norm(c.name).split(/\s+/).filter(w => w.length >= 4);
  return ev.some(e => { const t = O.norm(e.title); return words.some(w => t.includes(w)); });
}
function hasActivity(c, day){
  return S.tasks.some(t => t.client === c.id && (t.doneAt === day || (S.slots[t.id] && S.slots[t.id].day === day)));
}
// Objetivo del día para cada cliente
function proposal(day){
  const month = monthOf(day), days = workDays(month).filter(d => d >= day), n = Math.max(1, days.length);
  const out = {};
  for (const c of conHoras()){
    const falta = goal(c) - logged(c.id, month, day);
    if (falta <= 0){ out[c.id] = 0; continue; }
    let m = falta / n * vari(day, c.id);
    if (hasMeeting(c, day)) m *= 1.3;
    if (hasActivity(c, day)) m *= 1.15;
    out[c.id] = Math.min(r5(Math.max(15, m)), r5(falta));
  }
  return out;
}
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
    b.textContent = done ? '✓ Día cerrado' : '⏱ Cerrar el día';
    tb.insertBefore(b, tb.querySelector('.sp'));
  }
  if (!conHoras().length || $('#main .objetivos')) return;
  const p = H().log[day] || proposal(day);
  const chips = conHoras().filter(c => p[c.id] > 0).map(c =>
    `<span class="tag" style="--c:${O.clientColor(c)}"><i></i>${esc(c.name)} · ${fmt(p[c.id])}</span>`).join('');
  if (!chips) return;
  const div = document.createElement('div');
  div.className = 'objetivos';
  div.innerHTML = `<span class="lbl">${H().log[day] ? 'Registrado hoy' : 'Objetivo de hoy'}</span>${chips}`;
  $('#main').prepend(div);
};

/* ---------- Clientes → Horas ---------- */
const clientesView = O.views.clientes, clientesAfter = O.views.clientes.after;
O.views.clientes = function(){
  if (S.clientMode !== 'horas') return clientesView();
  const month = monthOf(O.today()), d0 = fromIso(month + '-01');
  const wd = workDays(month), quedan = wd.filter(d => d >= O.today()).length;
  O.setToolbar('Horas', `${O.MESES[d0.getMonth()]} ${d0.getFullYear()} · ${quedan} de ${wd.length} días laborables por delante`, '', 'Las horas se ponen en la ficha de cada cliente');
  const cs = S.clients.filter(c => c.group !== 'mine');
  const hoy = H().log[O.today()] || proposal(O.today());
  let totG = 0, totL = 0;
  const rows = cs.map(c => {
    const g = c.hours ? goal(c) : 0, l = logged(c.id, month), pct = g ? Math.min(100, Math.round(l / g * 100)) : 0;
    totG += g; totL += l;
    return `<div class="hrow" data-ficha="${c.id}" style="--c:${O.clientColor(c)}">
      <b><i></i>${esc(c.name)}</b>
      <span>${c.hours ? `${c.hours} h/mes` : '<em>sin horas</em>'}</span>
      <div class="bar"><span style="width:${pct}%"></span></div>
      <span class="num">${fmt(l)} / ${g ? fmt(g) : '—'}</span>
      <span class="num hoy">${hoy[c.id] ? 'hoy ' + fmt(hoy[c.id]) : ''}</span>
      <span class="reg">${(t => t ? `⏱ <a href="${esc(t.url || '#')}" target="_blank" rel="noopener">${esc(t.title)}</a>` : (O.online() ? '⚠️ sin «⭐ Tarea Principal ⭐»' : ''))(taskFor(c))}</span></div>`;
  }).join('');
  return `<div class="hbox">
    <div class="hhead"><label>Margen de planificación <input type="number" id="hMargin" min="0" max="50" value="${H().margin}"> %</label>
      <span>Mes: <b>${fmt(totL)}</b> de ${fmt(totG)}</span></div>
    ${rows ? '<h3 class="rama">Registro de horas <span>las «⭐ Tarea Principal ⭐» de cada cliente: aquí se apunta el tiempo, no salen en los paneles de tareas</span></h3>' + rows : '<div class="empty">Conecta ClickUp para ver los clientes de la agencia.</div>'}
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
  if (e.target.id === 'hMargin'){ H().margin = Math.max(0, Math.min(50, +e.target.value || 0)); O.save(); O.render(); }
});

/* ---------- Cerrar el día ---------- */
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
const regTasks = c => S.tasks.filter(t => t.client === c.id && O.isRegTask(t));
function taskFor(c){
  const rs = regTasks(c);
  return (c.timeTask && rs.find(t => t.id === c.timeTask)) || rs[0] || null;
}
function draw(ya){
  const d = fromIso(dDay), total = Object.values(draft).reduce((a, b) => a + b, 0);
  const cs = conHoras();
  form.innerHTML = `<h2>${ya ? 'Día cerrado' : 'Cerrar el día'} · ${O.DIAS_L[d.getDay()]} ${d.getDate()}</h2>
    <div class="note">Esto es una <b>propuesta</b> según las horas del mes, tus reuniones y tus tareas de hoy. Ajústala a lo que crees que le has dedicado a cada cliente y confirma. Solo se registra lo que confirmes.</div>
    <div class="crows">${cs.map(c => {
      const t = taskFor(c), m = draft[c.id] || 0;
      return `<div class="crow" data-cid="${c.id}" style="--c:${O.clientColor(c)}">
        <b><i></i>${esc(c.name)}</b>
        <div class="stepper"><button type="button" data-step="-15">−</button><input type="number" min="0" step="5" value="${m}" data-min> <span>min</span><button type="button" data-step="15">+</button></div>
        ${!O.online() ? '' : regTasks(c).length > 1
          ? `<select data-task title="Tarea de ClickUp donde se registra">${regTasks(c).map(x => `<option value="${x.id}" ${t && t.id === x.id ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</select>`
          : `<span class="lock">${t ? '⏱ se registra en ' + esc(t.title) : '⚠️ No encuentro su «⭐ Tarea Principal ⭐» asignada a ti: no se registrará en ClickUp'}</span>`}
      </div>`; }).join('')}</div>
    <div class="ctot">Total: <b>${fmt(total)}</b></div>
    ${O.online() ? `<label class="check"><input type="checkbox" id="toCU" checked> Registrar también en ClickUp (clientes de la agencia)</label>` : ''}
    <div class="actions"><button class="btn" value="cancel" formnovalidate>Cancelar</button><span class="sp"></span><button class="btn primary" value="ok">${ya ? 'Guardar cambios' : 'Confirmar'}</button></div>`;
}
form.addEventListener('click', e => {
  const st = e.target.closest('[data-step]'); if (!st) return;
  const cid = st.closest('.crow').dataset.cid;
  draft[cid] = Math.max(0, (draft[cid] || 0) + +st.dataset.step); draw(!!H().log[dDay]);
});
form.addEventListener('input', e => {
  if (e.target.dataset.min !== undefined){ draft[e.target.closest('.crow').dataset.cid] = Math.max(0, r5(+e.target.value || 0)); }
  if (e.target.dataset.task !== undefined){ const c = O.client(e.target.closest('.crow').dataset.cid); c.timeTask = e.target.value; O.save(); }
});
form.addEventListener('change', e => { if (e.target.dataset.min !== undefined) draw(!!H().log[dDay]); });
dlg.addEventListener('close', async () => {
  if (dlg.returnValue !== 'ok') return;
  const toCU = $('#toCU') ? $('#toCU').checked : false;
  const h = H(), day = dDay, row = {};
  for (const [k, v] of Object.entries(draft)) if (v > 0) row[k] = v;
  h.log[day] = row; O.save(); O.render();
  O.toast('Día cerrado: ' + fmt(Object.values(row).reduce((a, b) => a + b, 0)));
  if (toCU) await pushDay(day, row);
});

// Registra en ClickUp el día confirmado: una entrada de tiempo por cliente, una detrás de otra desde la hora de inicio
async function pushDay(day, row){
  const h = H(); h.cu = h.cu || {}; const prev = h.cu[day] || {}, ids = {};
  const start0 = fromIso(day); const [hh, mm] = ((S.plan && S.plan.workStart) || '09:00').split(':').map(Number);
  start0.setHours(hh, mm, 0, 0);
  let t = start0.getTime(), ok = 0, fail = 0;
  for (const c of conHoras().filter(c => c.group !== 'mine')){
    const lists = O.clientLists(c); const team = lists[0] && lists[0].team;
    if (!team) continue;
    try {
      if (prev[c.id]) await O.cu(`/team/${team}/time_entries/${prev[c.id]}`, {method:'DELETE'}).catch(() => {});
      const m = row[c.id] || 0;
      if (m > 0){
        const tk = taskFor(c);
        const body = {start: t, duration: m * 60000, description: 'Organizador'};
        if (tk) body.tid = tk.id;
        const r = await O.cu(`/team/${team}/time_entries`, {method:'POST', body});
        ids[c.id] = r && r.data && r.data.id; t += m * 60000; ok++;
      }
    } catch(e){ fail++; }
  }
  h.cu[day] = ids; O.save();
  O.toast(fail ? `ClickUp: ${ok} registrados, ${fail} con error` : `Registrado en ClickUp (${ok})`);
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-close-day]'); if (b) openClose(b.dataset.closeDay);
});
})();
