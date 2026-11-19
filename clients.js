// Fichas de clientes: qué servicio le das a cada uno, si está automatizado o es manual y cómo lo resuelves.
// Dos ramas: «Mis clientes» (solo en la app) y «Agencia». Se ve en la pestaña Clientes → «Fichas».
(() => {
const O = window.__org, S = O.S, esc = O.esc, $ = s => document.querySelector(s);
const MODES = {
  auto:   {icon:'🤖', label:'Automatizado'},
  mixto:  {icon:'⚙️', label:'Mixto'},
  manual: {icon:'✋', label:'Manual'},
};
const SUGERIDOS = ['Meta Ads','Google Ads','TikTok Ads','Email marketing','CRO','Diseño','UGC','Reels','Informes','SEO','Web','Analítica'];
// Listas de ClickUp que no son servicios
const NO_SERVICIO = /onboarding|review|strategy|tarea principal|general|interno|^jorge\b/i;

/* ---------- Vista: Clientes → Tareas | Fichas ---------- */
const tareas = O.views.clientes;
O.views.clientes = function(){
  if (S.clientMode !== 'fichas') return tareas();
  O.setToolbar('Clientes', 'servicios y cómo los resuelves', '', 'Toca una ficha para editarla');
  const grupos = [['mine', 'Mis clientes', '🔒 Solo en la app'], ['agency', 'Agencia', 'ClickUp']];
  let html = '';
  for (const [g, titulo, sub] of grupos){
    const cs = S.clients.filter(c => (g === 'mine') === (c.group === 'mine'))
      .filter(c => S.group === 'all' || S.group === g);
    if (!cs.length && S.group !== 'all' && S.group !== g) continue;
    html += `<h3 class="rama">${titulo} <span>${cs.length} · ${sub}</span></h3><div class="fichas">`;
    html += cs.map(fichaCard).join('') || `<div class="empty">${g === 'mine' ? 'Crea tus clientes en ⚙ → «+ Cliente».' : 'Aparecen al conectar ClickUp.'}</div>`;
    html += '</div>';
  }
  return html;
};
O.views.clientes.after = () => {
  const tb = $('#toolbar');
  if (tb.querySelector('.modes')) return;
  const sw = document.createElement('div');
  sw.className = 'modes';
  sw.innerHTML = `<button class="chip" data-cmode="tareas" aria-pressed="${S.clientMode !== 'fichas'}">Tareas</button>
    <button class="chip" data-cmode="fichas" aria-pressed="${S.clientMode === 'fichas'}">Fichas</button>`;
  tb.insertBefore(sw, tb.querySelector('.sp'));
};
$('#toolbar').addEventListener('click', e => {
  const b = e.target.closest('[data-cmode]'); if (!b) return;
  S.clientMode = b.dataset.cmode; O.render();
});

function resumen(c){
  const sv = c.services || [];
  const n = k => sv.filter(s => s.mode === k).length;
  return {total: sv.length, auto: n('auto'), mixto: n('mixto'), manual: n('manual')};
}
function fichaCard(c){
  const r = resumen(c), sv = c.services || [];
  const pct = r.total ? Math.round((r.auto + r.mixto / 2) / r.total * 100) : 0;
  return `<article class="ficha" data-ficha="${c.id}" style="--c:${O.clientColor(c)}" tabindex="0">
    <header><i></i><b>${esc(c.name)}</b>${c.hours ? `<span class="hrs">${c.hours} h/mes</span>` : ''}</header>
    ${sv.length ? `<ul>${sv.map(s => `<li><span title="${MODES[s.mode || 'manual'].label}">${MODES[s.mode || 'manual'].icon}</span>${esc(s.name)}</li>`).join('')}</ul>
      <div class="bar" title="${pct}% automatizado"><span style="width:${pct}%"></span></div>
      <small>${r.auto} auto · ${r.mixto} mixto · ${r.manual} manual</small>`
      : '<p class="vacio">Sin servicios todavía</p>'}
  </article>`;
}
document.addEventListener('click', e => {
  const f = e.target.closest('[data-ficha]'); if (f) openFicha(f.dataset.ficha);
});
document.addEventListener('keydown', e => {
  const f = e.target.closest && e.target.closest('[data-ficha]'); if (f && e.key === 'Enter') openFicha(f.dataset.ficha);
});

/* ---------- Editor de ficha ---------- */
const dlg = document.createElement('dialog');
dlg.id = 'fichaDlg';
dlg.innerHTML = '<form method="dialog" class="sheet" id="fichaForm"></form>';
document.body.appendChild(dlg);
const form = dlg.querySelector('form');
let cur = null;

function openFicha(id){
  cur = O.client(id); if (!cur) return;
  cur.services = cur.services || [];
  draw(); dlg.showModal();
}
function draw(){
  const c = cur, ag = c.group !== 'mine';
  const limpio = n => n.trim().replace(/^servicio\s+/i, '').replace(/\s+/g, ' ');
  const desdeCU = ag && O.online() ? O.clientLists(c).map(l => limpio(l.name)).filter(n => n && !NO_SERVICIO.test(n)) : [];
  const vistos = new Set(c.services.map(s => s.name.trim().toLowerCase()));
  const sugeridos = [];
  for (const n of [...desdeCU, ...SUGERIDOS]){ const k = n.toLowerCase(); if (!vistos.has(k)){ vistos.add(k); sugeridos.push(n); } }
  sugeridos.splice(14);
  form.innerHTML = `
    <h2><span class="dot" style="background:${O.clientColor(c)}"></span> ${esc(c.name)} <span class="badge">${ag ? 'Agencia' : '🔒 Mío'}</span></h2>
    ${ag ? `<label>Horas al mes con este cliente<input type="number" min="0" step="0.5" data-f="hours" value="${c.hours || ''}" placeholder="normalmente entre 8 y 20"></label>` : ''}
    <label>Notas (contacto, objetivos, cosas a recordar)<textarea rows="2" data-f="notes">${esc(c.notes || '')}</textarea></label>
    <h3 class="h3">Servicios</h3>
    <div class="svs">${c.services.map((s, i) => `<div class="sv" data-i="${i}">
      <div class="sv-top"><input data-s="name" value="${esc(s.name)}" placeholder="Servicio">
        <select data-s="mode">${Object.entries(MODES).map(([k, m]) => `<option value="${k}" ${s.mode === k ? 'selected' : ''}>${m.icon} ${m.label}</option>`).join('')}</select>
        <button type="button" class="x" data-sdel aria-label="Quitar servicio">×</button></div>
      <textarea rows="2" data-s="how" placeholder="Cómo lo resuelvo: herramientas, proceso, qué está automatizado y qué no…">${esc(s.how || '')}</textarea>
    </div>`).join('') || '<p class="vacio">Añade los servicios que le das.</p>'}</div>
    <div class="sug">${sugeridos.map(n => `<button type="button" class="chip" data-sadd="${esc(n)}">+ ${esc(n)}</button>`).join('')}
      <button type="button" class="chip" data-sadd="">+ Otro</button></div>
    <div class="actions"><span class="sp"></span><button class="btn primary" value="ok">Listo</button></div>`;
}
form.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.f){ cur[t.dataset.f] = t.dataset.f === 'hours' ? (parseFloat(t.value) || 0) : t.value; }
  if (t.dataset.s){ cur.services[+t.closest('.sv').dataset.i][t.dataset.s] = t.value; }
  O.save();
});
form.addEventListener('click', e => {
  const add = e.target.closest('[data-sadd]');
  if (add){
    cur.services.push({id: Math.random().toString(36).slice(2, 8), name: add.dataset.sadd, mode: 'manual', how: ''});
    O.save(); draw();
    const ins = form.querySelectorAll('.sv [data-s=name]'); const last = ins[ins.length - 1];
    if (last){ last.focus(); if (!add.dataset.sadd) last.select(); }
    return;
  }
  if (e.target.closest('[data-sdel]')){
    const i = +e.target.closest('.sv').dataset.i, s = cur.services[i];
    if ((s.how || '').trim() && !confirm(`¿Quitar «${s.name}» y sus notas?`)) return;
    cur.services.splice(i, 1); O.save(); draw();
  }
});
dlg.addEventListener('close', () => { if (S.view === 'clientes') O.render(); });
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
})();
