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
  if (S.clientMode === 'cartera') return cartera();
  if (S.clientMode !== 'fichas') return tareas();
  O.setToolbar('Clientes', 'servicios y cómo los resuelves', '', 'Toca una ficha para editarla');
  const grupos = [['mine', 'Mis clientes', '🔒 Solo en la app'], ['agency', 'Agencia', 'ClickUp']];
  let html = '', resto = [];
  for (const [g, titulo, sub] of grupos){
    let cs = O.byClientOrder(S.clients.filter(c => (g === 'mine') === (c.group === 'mine'))
      .filter(c => S.group === 'all' || S.group === g));
    if (!cs.length && S.group !== 'all' && S.group !== g) continue;
    resto.push(...cs.filter(c => estadoDe(c) !== 'actual'));
    cs = cs.filter(c => estadoDe(c) === 'actual');
    html += `<h3 class="rama">${titulo} <span>${cs.length} · ${sub} · arrastra una ficha abajo para apartarla</span></h3><div class="fichas" data-cestado="actual">`;
    html += cs.map(fichaCard).join('') || `<div class="empty">${g === 'mine' ? 'Crea tus clientes en ⚙ → «+ Cliente».' : 'Aparecen al conectar ClickUp.'}</div>`;
    html += '</div>';
  }
  // Pausados y antiguos (de cualquier grupo): no salen en Tareas, Día, Semana, Horas ni al añadir tareas
  html += `<h3 class="rama">Apartados <span>no aparecen en el resto de la app · arrástralos arriba para recuperarlos</span></h3><div class="apartados">${ESTADOS.slice(1).map(([k, t, s]) => { const xs = resto.filter(c => estadoDe(c) === k);
    return `<section class="apart" data-cestado="${k}"><h4>${t}<span>${xs.length}</span><small>${s}</small></h4>
      <div class="fichas mini">${xs.map(fichaCard).join('') || '<div class="empty">Arrastra aquí una ficha</div>'}</div></section>`; }).join('')}</div>`;
  return html;
};
O.views.clientes.after = () => {
  const tb = $('#toolbar');
  if (tb.querySelector('.modes')) return;
  const sw = document.createElement('div');
  sw.className = 'modes';
  sw.innerHTML = `<button class="chip" data-cmode="tareas" aria-pressed="${S.clientMode !== 'fichas'}">Tareas</button>
    <button class="chip" data-cmode="hoy" aria-pressed="${S.clientMode === 'hoy'}">Tareas hoy</button>
    <button class="chip" data-cmode="fichas" aria-pressed="${S.clientMode === 'fichas'}">Fichas</button>
    <button class="chip" data-cmode="cartera" aria-pressed="${S.clientMode === 'cartera'}">Cartera</button>`;
  tb.insertBefore(sw, tb.querySelector('.sp'));
};
$('#toolbar').addEventListener('click', e => {
  const b = e.target.closest('[data-cmode]'); if (!b) return;
  S.clientMode = b.dataset.cmode; O.render();
});

/* ---------- Cartera: tus clientes (los que te dan ingresos) por estado ---------- */
const ESTADOS = [['actual', '🟢 Actuales', 'Te pagan ahora'], ['pausa', '⏸️ Pausados', 'Parados por ahora'], ['antiguo', '🗄️ Antiguos', 'Ya no trabajáis juntos']];
const estadoDe = c => ESTADOS.some(([k]) => k === c.estado) ? c.estado : 'actual';
const eur = n => (Math.round(n) || 0).toLocaleString('es-ES') + ' €';
function cartera(){
  O.setToolbar('Clientes', 'tu cartera: arrastra cada cliente a su estado', '', 'Toca un cliente para editar ingresos y servicios');
  const mios = S.clients.filter(c => c.group === 'mine');
  const act = mios.filter(c => estadoDe(c) === 'actual'), mes = act.reduce((s, c) => s + (+c.fee || 0), 0);
  const pend = c => S.tasks.filter(t => t.client === c.id && t.status !== 'done' && !t.ia);
  const card = c => { const p = pend(c), urg = p.filter(t => t.priority === 'super' || t.priority === 'alta').length, sv = c.services || [];
    return `<article class="cart" draggable="true" data-cart="${c.id}" style="--c:${O.clientColor(c)}" tabindex="0">
      <header><span class="clp">${esc(c.name)}</span>${c.fee ? `<b class="fee">${eur(c.fee)}<small>/mes</small></b>` : '<b class="fee none">— €/mes</b>'}</header>
      ${sv.length ? `<div class="csv">${sv.map(s => `<span>${MODES[s.mode || 'manual'].icon} ${esc(s.name)}</span>`).join('')}</div>` : '<p class="vacio">Sin servicios</p>'}
      <footer><span>${p.length ? `${p.length} pendiente${p.length > 1 ? 's' : ''}${urg ? ` · <em>${urg} urgente${urg > 1 ? 's' : ''}</em>` : ''}` : 'Sin pendientes ✓'}</span>${c.since ? `<span>desde ${esc(c.since)}</span>` : ''}</footer>
      ${c.notes ? `<p class="cnote">${esc(c.notes.split('\n')[0])}</p>` : ''}</article>`; };
  return `<div class="cart-sum"><div><b>${eur(mes)}</b><small>al mes con ${act.length} cliente${act.length === 1 ? '' : 's'} actual${act.length === 1 ? '' : 'es'}</small></div>
      <div><b>${eur(mes * 12)}</b><small>al año a este ritmo</small></div>
      ${ESTADOS.slice(1).map(([k, t]) => `<div><b>${mios.filter(c => estadoDe(c) === k).length}</b><small>${t.slice(3).toLowerCase()}</small></div>`).join('')}</div>
    <div class="cart-board">${ESTADOS.map(([k, t, sub]) => { const cs = mios.filter(c => estadoDe(c) === k).sort((a, b) => (+b.fee || 0) - (+a.fee || 0) || a.name.localeCompare(b.name));
      const tot = cs.reduce((s, c) => s + (+c.fee || 0), 0);
      return `<section class="cart-col" data-cestado="${k}"><h3>${t}<span>${cs.length}${tot ? ` · ${eur(tot)}/mes` : ''}</span></h3><small class="sub">${sub}</small>
        <div class="cart-list">${cs.map(card).join('') || '<div class="empty">Arrastra aquí</div>'}</div></section>`; }).join('')}</div>`;
}
// arrastrar tarjetones entre columnas (ratón); en el móvil se cambia el estado en la ficha
let cartDrag = null;
document.addEventListener('dragstart', e => { const c = e.target.closest && e.target.closest('[data-cart],[data-fdrag]'); if (!c) return; cartDrag = c.dataset.cart || c.dataset.fdrag; e.dataTransfer.effectAllowed = 'move'; c.classList.add('dragging'); });
document.addEventListener('dragend', e => { const c = e.target.closest && e.target.closest('[data-cart],[data-fdrag]'); if (c) c.classList.remove('dragging'); document.querySelectorAll('[data-cestado].over').forEach(x => x.classList.remove('over')); });
document.addEventListener('dragover', e => { if (!cartDrag) return; const col = e.target.closest && e.target.closest('[data-cestado]'); if (!col) return; e.preventDefault();
  document.querySelectorAll('[data-cestado].over').forEach(x => x !== col && x.classList.remove('over')); col.classList.add('over'); });
document.addEventListener('drop', e => { if (!cartDrag) return; const col = e.target.closest && e.target.closest('[data-cestado]'); const id = cartDrag; cartDrag = null; if (!col) return; e.preventDefault();
  const c = O.client(id); if (!c) return;
  // soltar encima de otra ficha del mismo grupo: se coloca delante de ella (tu propio orden)
  const tgt = e.target.closest('[data-fdrag]'), other = tgt && tgt.dataset.fdrag !== id && O.client(tgt.dataset.fdrag);
  if (other && other.group === c.group){
    const fam = O.byClientOrder(S.clients.filter(x => x.group === c.group)).filter(x => x !== c);
    const r = tgt.getBoundingClientRect(), after = e.clientX > r.left + r.width / 2;
    fam.splice(fam.indexOf(other) + (after ? 1 : 0), 0, c);
    fam.forEach((x, k) => x.ord = k);
  }
  const antes = c.estado; c.estado = col.dataset.cestado;
  if (other && (antes || 'actual') === c.estado){ O.save(); O.render(); return; } O.save(); O.render();
  O.toast(`${c.name} → ${(ESTADOS.find(([k]) => k === c.estado) || [, ''])[1]}`); });
document.addEventListener('click', e => { const c = e.target.closest('[data-cart]'); if (c) openFicha(c.dataset.cart); });

function resumen(c){
  const sv = c.services || [];
  const n = k => sv.filter(s => s.mode === k).length;
  return {total: sv.length, auto: n('auto'), mixto: n('mixto'), manual: n('manual')};
}
function fichaCard(c){
  const sv = c.services || [];
  return `<article class="ficha" data-ficha="${c.id}" draggable="true" data-fdrag="${c.id}" style="--c:${O.clientColor(c)}" tabindex="0">
    <header><i></i><b>${esc(c.name)}</b>${c.hours ? `<span class="hrs">${c.hours} h/mes</span>` : ''}</header>
    ${sv.length ? `<ul>${sv.map(s => `<li>${esc(s.name)}</li>`).join('')}</ul>` : '<p class="vacio">Sin servicios todavía</p>'}
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
    ${ag ? `<label>Estado<select data-f="estado">${ESTADOS.map(([k, t]) => `<option value="${k}" ${estadoDe(c) === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>` : ''}
    ${!ag ? `<div class="row"><label>Estado<select data-f="estado">${ESTADOS.map(([k, t]) => `<option value="${k}" ${estadoDe(c) === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Ingresos al mes (€)<input type="number" min="0" step="10" data-f="fee" value="${c.fee || ''}" placeholder="0"></label>
      <label>Cliente desde<input type="month" data-f="since" value="${esc(c.since || '')}"></label></div>` : ''}
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
  if (t.dataset.f){ cur[t.dataset.f] = (t.dataset.f === 'hours' || t.dataset.f === 'fee') ? (parseFloat(t.value) || 0) : t.value; }
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
