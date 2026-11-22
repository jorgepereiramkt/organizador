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
    const agTot = g !== 'mine' ? cs.reduce((s, c) => { const m = agPago(c); return m ? [s[0] + m.a, s[1] + m.b] : s; }, [0, 0]) : null;
    html += `<h3 class="rama">${titulo} <span>${cs.length} · ${sub}${agTot && agTot[1] ? ` · <b>${rng(agTot[0], agTot[1])}/mes</b> a la agencia entre todos` : ''} · arrastra una ficha abajo para apartarla</span></h3>`;
    if (g === 'mine'){
      // tus clientes en dos secciones: ingresos fijos y variables (arrastra para cambiar)
      for (const [k, t, s] of [['fijo', '💶 Ingresos fijos', 'cuota estable cada mes'], ['mixto', '💶➕📈 Fijo + variable', 'una cuota más una parte variable'], ['variable', '📈 Ingresos variables', 'cambia según el mes, el proyecto o un %']]){
        const xs = cs.filter(c => ingresoDe(c) === k);
        html += `<div class="ingh">${t}<span>${xs.length} · ${sumTxt(xs)}/mes · ${s}</span></div><div class="fichas" data-cestado="actual" data-ingreso="${k}">`;
        html += xs.map(fichaCard).join('') || '<div class="empty">Arrastra aquí una ficha</div>';
        html += '</div>';
      }
    } else {
      html += '<div class="fichas" data-cestado="actual">' + (cs.map(fichaCard).join('') || '<div class="empty">Aparecen al conectar ClickUp.</div>') + '</div>';
    }
  }
  // Pausados y antiguos (de cualquier grupo): no salen en Tareas, Día, Semana, Horas ni al añadir tareas
  html += `<h3 class="rama">Apartados <span>no aparecen en el resto de la app · arrástralos arriba para recuperarlos</span></h3><div class="apartados">${ESTADOS.slice(1).map(([k, t, s]) => { const xs = resto.filter(c => estadoDe(c) === k);
    return `<section class="apart" data-cestado="${k}"><h4>${t}<span>${xs.length}</span><small>${s}</small></h4>
      <div class="fichas mini">${xs.map(fichaCard).join('') || '<div class="empty">Arrastra aquí una ficha</div>'}</div></section>`; }).join('')}</div>`;
  return html + leadsSection();
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
const TIERS = {S: 'Tier S · top', A: 'Tier A', B: 'Tier B', C: 'Tier C'};
const tierBadge = c => c.tier && TIERS[c.tier] ? `<span class="tier t-${c.tier}" title="${TIERS[c.tier]}">${c.tier}</span>` : '';
// facturación: puede ser una cifra o un rango «650-1300» (según el mes)
const fmin = c => +(c.feeMin ?? c.fee) || 0, fmax = c => +(c.feeMax ?? c.fee) || 0;
const eurN = n => (Math.round(n) || 0).toLocaleString('es-ES');
const rng = (a, b) => a === b ? `${eurN(b)} €` : `${eurN(a)}–${eurN(b)} €`;
// lee «900», «650-1300» o «10%» → {pct} o {a, b}
function parseMoney(txt){
  const t = String(txt || '').trim(); if (!t) return null;
  if (/gratis|free|sin coste|0\s*€?$/i.test(t) && !/[1-9]/.test(t)) return {a: 0, b: 0, free: true};
  if (/%/.test(t)){ const n = parseFloat(t.replace(',', '.').match(/\d+(\.\d+)?/)?.[0]); return isNaN(n) ? null : {pct: n}; }
  const v = (t.replace(/\./g, '').replace(',', '.').match(/\d+(\.\d+)?/g) || []).map(Number).slice(0, 2).sort((x, y) => x - y);
  return v.length ? {a: v[0], b: v[v.length - 1]} : null;
}
const varPart = c => { const v = parseMoney(c.varTxt); if (!v) return null;
  if (v.pct === undefined) return {a: v.a, b: v.b, txt: rng(v.a, v.b)};
  const base = parseMoney(c.varBase), on = (c.varOn || '').trim();
  const lbl = `${String(v.pct).replace('.', ',')}%${on ? ' de ' + on : ''}`;
  return base && base.a !== undefined ? {a: base.a * v.pct / 100, b: base.b * v.pct / 100, txt: lbl, pct: true} : {a: 0, b: 0, txt: lbl, pct: true}; };
// recalcula la facturación total estimada (para sumar y ordenar) a partir de lo que pones en la ficha
function recalcFee(c){
  const tipo = ingresoDe(c), f = parseMoney(c.fixTxt), fx = f && f.a !== undefined ? f : {a: 0, b: 0}, v = varPart(c) || {a: 0, b: 0};
  const a = (tipo !== 'variable' ? fx.a : 0) + (tipo !== 'fijo' ? v.a : 0), b = (tipo !== 'variable' ? fx.b : 0) + (tipo !== 'fijo' ? v.b : 0);
  if (!a && !b){ delete c.feeMin; delete c.feeMax; c.fee = 0; } else { c.feeMin = a; c.feeMax = b; c.fee = (a + b) / 2; }
}
const agPago = c => { const m = parseMoney(c.agFeeTxt); return m && m.a !== undefined ? m : null; };
const agMedia = c => { const m = agPago(c); return m ? (m.a + m.b) / 2 : 0; };
const agPeso = c => { const tot = S.clients.filter(x => x.group !== 'mine' && estadoDe(x) === 'actual').reduce((s, x) => s + agMedia(x), 0); return tot ? Math.round(agMedia(c) / tot * 100) : 0; };
const esGratis = c => { const f = parseMoney(c.fixTxt), v = parseMoney(c.varTxt); return !!((f && f.free) || (v && v.free)) && !fmax(c); };
const feeTxt = c => {
  if (esGratis(c)) return 'Gratis';
  const tipo = ingresoDe(c), v = varPart(c), f = parseMoney(c.fixTxt);
  if (!c.fixTxt && !c.varTxt) return !fmax(c) ? '' : rng(fmin(c), fmax(c));   // datos antiguos
  const fijo = f && f.a !== undefined ? rng(f.a, f.b) : '';
  const vtx = v ? (v.pct ? v.txt + (v.b ? ` (≈${rng(v.a, v.b)})` : '') : v.txt) : '';
  if (tipo === 'fijo') return fijo;
  if (tipo === 'variable') return vtx;
  return [fijo, vtx].filter(Boolean).join(' + ');
};
const sumTxt = cs => { const a = cs.reduce((s, c) => s + fmin(c), 0), b = cs.reduce((s, c) => s + fmax(c), 0); return !b ? '0 €' : a === b ? `${eurN(b)} €` : `${eurN(a)}–${eurN(b)} €`; };
function setFee(c, txt){
  const ns = String(txt).replace(/\./g, '').replace(',', '.').match(/\d+(\.\d+)?/g) || [];
  const v = ns.map(Number).filter(n => !isNaN(n)).slice(0, 2).sort((a, b) => a - b);
  if (!v.length){ delete c.feeMin; delete c.feeMax; c.fee = 0; return; }
  c.feeMin = v[0]; c.feeMax = v[v.length - 1]; c.fee = (c.feeMin + c.feeMax) / 2;   // «fee» = la media, para ordenar
}
// tipo de ingreso: fijo (cuota) o variable (cambia cada mes); si no lo eliges, un rango cuenta como variable
const ingresoDe = c => ['fijo', 'variable', 'mixto'].includes(c.ingreso) ? c.ingreso : (fmin(c) !== fmax(c) ? 'variable' : 'fijo');
const eur = n => (Math.round(n) || 0).toLocaleString('es-ES') + ' €';
function cartera(){
  O.setToolbar('Clientes', 'tu cartera: arrastra cada cliente a su estado', '', 'Toca un cliente para editar ingresos y servicios');
  const mios = S.clients.filter(c => c.group === 'mine');
  const act = mios.filter(c => estadoDe(c) === 'actual');
  const anyo = cs => { const a = cs.reduce((s, c) => s + fmin(c), 0) * 12, b = cs.reduce((s, c) => s + fmax(c), 0) * 12; return a === b ? `${eurN(b)} €` : `${eurN(a)}–${eurN(b)} €`; };
  const pend = c => S.tasks.filter(t => t.client === c.id && t.status !== 'done' && !t.ia);
  const card = c => { const p = pend(c), urg = p.filter(t => t.priority === 'super' || t.priority === 'alta').length, sv = c.services || [];
    return `<article class="cart" draggable="true" data-cart="${c.id}" style="--c:${O.clientColor(c)}" tabindex="0">
      <header><span class="clp">${esc(c.name)}</span>${tierBadge(c)}${esGratis(c) ? '<b class="fee">🎁 Gratis</b>' : fmax(c) ? `<b class="fee">${feeTxt(c)}<small>/mes s/IVA</small></b>` : '<b class="fee none">— €/mes</b>'}</header>
      ${sv.length ? `<div class="csv">${sv.map(s => `<span>${MODES[s.mode || 'manual'].icon} ${esc(s.name)}</span>`).join('')}</div>` : '<p class="vacio">Sin servicios</p>'}
      <footer><span>${p.length ? `${p.length} pendiente${p.length > 1 ? 's' : ''}${urg ? ` · <em>${urg} urgente${urg > 1 ? 's' : ''}</em>` : ''}` : 'Sin pendientes ✓'}</span>${c.since ? `<span>desde ${esc(c.since)}</span>` : ''}</footer>
      ${c.notes ? `<p class="cnote">${esc(c.notes.split('\n')[0])}</p>` : ''}</article>`; };
  const fij = act.filter(c => ingresoDe(c) === 'fijo'), mix = act.filter(c => ingresoDe(c) === 'mixto'), vari = act.filter(c => ingresoDe(c) === 'variable');
  return `<div class="cart-sum"><div><b>${sumTxt(fij)}</b><small>💶 fijos al mes (${fij.length})</small></div><div><b>${sumTxt(mix)}</b><small>💶➕📈 fijo + variable (${mix.length})</small></div><div><b>${sumTxt(vari)}</b><small>📈 variables al mes (${vari.length})</small></div><div><b>${sumTxt(act)}</b><small>al mes sin IVA con ${act.length} cliente${act.length === 1 ? '' : 's'} actual${act.length === 1 ? '' : 'es'}</small></div>
      <div><b>${anyo(act)}</b><small>al año a este ritmo</small></div>
      ${ESTADOS.slice(1).map(([k, t]) => `<div><b>${mios.filter(c => estadoDe(c) === k).length}</b><small>${t.slice(3).toLowerCase()}</small></div>`).join('')}</div>
    <div class="cart-board">${ESTADOS.map(([k, t, sub]) => { const cs = mios.filter(c => estadoDe(c) === k).sort((a, b) => (+b.fee || 0) - (+a.fee || 0) || a.name.localeCompare(b.name));
      const tot = cs.reduce((s, c) => s + fmax(c), 0);
      return `<section class="cart-col" data-cestado="${k}"><h3>${t}<span>${cs.length}${tot ? ` · ${sumTxt(cs)}/mes` : ''}</span></h3><small class="sub">${sub}</small>
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
  const antes = c.estado, antesIng = ingresoDe(c); c.estado = col.dataset.cestado;
  if (col.dataset.ingreso && c.group === 'mine') c.ingreso = col.dataset.ingreso;
  if (col.dataset.ingreso && antesIng !== col.dataset.ingreso && (antes || 'actual') === 'actual'){ recalcFee(c); O.save(); O.render(); return O.toast(`${c.name} → ${({fijo: 'ingresos fijos', variable: 'ingresos variables', mixto: 'fijo + variable'})[col.dataset.ingreso]}`); }
  if (other && (antes || 'actual') === c.estado){ O.save(); O.render(); return; } O.save(); O.render();
  O.toast(`${c.name} → ${(ESTADOS.find(([k]) => k === c.estado) || [, ''])[1]}`); });
document.addEventListener('click', e => { const c = e.target.closest('[data-cart]'); if (c) openFicha(c.dataset.cart); });

/* ---------- Posibles clientes: lo que te va saliendo, para hacerle seguimiento ---------- */
const LEAD_ST = {idea: '💡 Idea', contacto: '📨 Contactado', reunion: '📞 Reunión', propuesta: '📄 Propuesta enviada', negocia: '🤝 Negociando', perdido: '✖️ Descartado'};
const LEADS = () => { const p = S.plan || (S.plan = {}); return (p.leads = p.leads || []); };
const leadUid = () => Math.random().toString(36).slice(2, 9);
function leadsSection(){
  const hoy = O.today(), ls = LEADS().slice().sort((a, b) => (a.status === 'perdido') - (b.status === 'perdido') || (a.next || '9999') .localeCompare(b.next || '9999'));
  const vivos = ls.filter(l => l.status !== 'perdido'), pot = vivos.reduce((s, l) => s + (+l.fee || 0), 0), toca = vivos.filter(l => l.next && l.next <= hoy).length;
  const card = l => { const tarde = l.status !== 'perdido' && l.next && l.next <= hoy, ult = (l.log || [])[0];
    return `<article class="lead${l.status === 'perdido' ? ' lost' : ''}" data-lead="${l.id}" tabindex="0">
      <header><b>${esc(l.name || 'Sin nombre')}</b>${l.fee ? `<span class="lfee">${eur(l.fee)}<small>/mes</small></span>` : ''}</header>
      <span class="lst s-${l.status}">${LEAD_ST[l.status] || LEAD_ST.idea}</span>
      ${l.what ? `<p>${esc(l.what)}</p>` : ''}
      ${ult ? `<p class="llog">🕓 ${esc(ult.d.slice(8, 10) + '/' + ult.d.slice(5, 7))} · ${esc(ult.t)}</p>` : ''}
      <footer>${l.next ? `<span class="${tarde ? 'late' : ''}">${tarde ? '⏰ Toca seguimiento' : '📅 Seguimiento'} ${esc(O.dayLabel ? O.dayLabel(l.next) : l.next)}</span>` : '<span class="none">Sin fecha de seguimiento</span>'}${l.source ? `<span>vía ${esc(l.source)}</span>` : ''}</footer></article>`; };
  return `<h3 class="rama leads-h">🌱 Posibles clientes <span>${vivos.length} en seguimiento${pot ? ` · ${eur(pot)}/mes si salen todos` : ''}${toca ? ` · <em>${toca} para hacer seguimiento</em>` : ''}</span>
      <button type="button" class="btn" data-leadnew>+ Posible cliente</button></h3>
    <div class="leads">${ls.map(card).join('') || '<div class="empty">Apunta aquí cada oportunidad que te salga (un contacto, una recomendación, alguien que te escribe…) para no perderle la pista.</div>'}</div>`;
}
const ldlg = document.createElement('dialog'); ldlg.id = 'leadDlg';
ldlg.innerHTML = '<form method="dialog" class="sheet" id="leadForm"></form>'; document.body.appendChild(ldlg);
const lform = ldlg.querySelector('form'); let leadId = null;
const curLead = () => LEADS().find(l => l.id === leadId);
function openLead(id){ leadId = id; if (!curLead()) return; ldraw(); ldlg.showModal(); }
function ldraw(){
  const l = curLead();
  lform.innerHTML = `<h2>${esc(l.name || 'Posible cliente')}</h2>
    <div class="row"><label>Nombre / empresa<input data-l="name" value="${esc(l.name || '')}" placeholder="Ej.: Tienda de zapatos de Ana" autocomplete="off"></label>
      <label>Estado<select data-l="status">${Object.entries(LEAD_ST).map(([k, t]) => `<option value="${k}" ${l.status === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
    <div class="row"><label>Qué necesita / servicio<input data-l="what" value="${esc(l.what || '')}" placeholder="Meta Ads, web, emails…"></label>
      <label>Facturación estimada sin IVA (€/mes)<input type="number" min="0" step="10" data-l="fee" value="${l.fee || ''}"></label></div>
    <div class="row"><label>Contacto<input data-l="contact" value="${esc(l.contact || '')}" placeholder="Teléfono, email, Instagram…"></label>
      <label>Cómo llegó<input data-l="source" value="${esc(l.source || '')}" placeholder="Recomendación, Instagram, evento…"></label>
      <label>Próximo seguimiento<input type="date" data-l="next" value="${esc(l.next || '')}"></label></div>
    <label>Notas<textarea rows="3" data-l="notes" placeholder="Lo que sabes de él, presupuesto, objeciones…">${esc(l.notes || '')}</textarea></label>
    <h3 class="h3">Seguimiento</h3>
    <div class="qrow"><input id="leadLogNew" placeholder="Qué has hecho hoy con él… (Intro)" autocomplete="off"></div>
    <div class="llogs">${(l.log || []).map((g, i) => `<div class="llg"><span>${esc(g.d.slice(8, 10) + '/' + g.d.slice(5, 7))}</span><p>${esc(g.t)}</p><button type="button" class="x" data-lgdel="${i}" aria-label="Borrar">×</button></div>`).join('') || '<p class="vacio">Aún no hay seguimientos.</p>'}</div>
    <div class="actions"><button type="button" class="btn danger" data-leaddel>Borrar</button><span class="sp"></span><button type="button" class="btn" data-leadwin>🎉 Pasar a cliente</button><button class="btn primary" value="ok">Listo</button></div>`;
}
lform.addEventListener('input', e => { const k = e.target.dataset.l, l = curLead(); if (!k || !l) return; l[k] = k === 'fee' ? (parseFloat(e.target.value) || 0) : e.target.value; O.save(); });
lform.addEventListener('keydown', e => {
  if (e.target.id !== 'leadLogNew' || e.key !== 'Enter') return; e.preventDefault();
  const v = e.target.value.trim(), l = curLead(); if (!v || !l) return;
  (l.log = l.log || []).unshift({d: O.today(), t: v}); O.save(); ldraw(); lform.querySelector('#leadLogNew').focus();
});
lform.addEventListener('click', e => {
  const l = curLead(); if (!l) return;
  const g = e.target.closest('[data-lgdel]'); if (g){ l.log.splice(+g.dataset.lgdel, 1); O.save(); ldraw(); return; }
  if (e.target.closest('[data-leaddel]') && confirm(`¿Borrar «${l.name || 'este posible cliente'}»?`)){ S.plan.leads = LEADS().filter(x => x.id !== leadId); O.save(); ldlg.close('del'); return; }
  if (e.target.closest('[data-leadwin]')){
    if (!(l.name || '').trim()) return O.toast('Ponle nombre primero');
    if (!confirm(`¿Crear «${l.name}» como cliente tuyo (actual)?`)) return;
    const notas = [l.contact && 'Contacto: ' + l.contact, l.source && 'Vino por: ' + l.source, l.notes].filter(Boolean).join('\n');
    S.clients.push({id: O.uid(), name: l.name.trim(), group: 'mine', keywords: '', estado: 'actual', fee: +l.fee || 0, since: O.today().slice(0, 7), notes: notas, services: l.what ? [{id: leadUid(), name: l.what, mode: 'manual', how: ''}] : []});
    S.plan.leads = LEADS().filter(x => x.id !== leadId); O.save(); ldlg.close('ok'); O.toast(`🎉 ${l.name} ya es cliente`);
  }
});
ldlg.addEventListener('close', () => { if (S.view === 'clientes') O.render(); });
ldlg.addEventListener('click', e => { if (e.target === ldlg) ldlg.close(); });
document.addEventListener('click', e => {
  if (e.target.closest('[data-leadnew]')){ const l = {id: leadUid(), name: '', status: 'idea', at: Date.now(), log: []}; LEADS().unshift(l); O.save(); openLead(l.id); setTimeout(() => lform.querySelector('[data-l=name]').focus(), 50); return; }
  const c = e.target.closest('[data-lead]'); if (c) openLead(c.dataset.lead);
});

function resumen(c){
  const sv = c.services || [];
  const n = k => sv.filter(s => s.mode === k).length;
  return {total: sv.length, auto: n('auto'), mixto: n('mixto'), manual: n('manual')};
}
function fichaCard(c){
  const sv = c.services || [];
  return `<article class="ficha" data-ficha="${c.id}" draggable="true" data-fdrag="${c.id}" style="--c:${O.clientColor(c)}" tabindex="0">
    <header><i></i><b>${esc(c.name)}</b>${tierBadge(c)}${c.hours ? `<span class="hrs">${c.hours} h/mes</span>` : ''}</header>
    ${c.group !== 'mine' && agPago(c) ? `<div class="ffee">${rng(agPago(c).a, agPago(c).b)}<small>/mes a la agencia</small></div>
      ${estadoDe(c) === 'actual' ? `<div class="peso" title="Peso en lo que facturan tus clientes de agencia"><span style="width:${agPeso(c)}%"></span><b>${agPeso(c)}%</b></div>` : ''}` : ''}
    ${c.group === 'mine' && feeTxt(c) ? `<div class="ffee">${esGratis(c) ? '🎁 Gratis' : `${feeTxt(c)}<small>/mes sin IVA</small>`}</div>` : ''}
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
// campos de facturación según el tipo (todo sin IVA, €/mes)
function moneyFields(c){
  const tipo = ingresoDe(c), old = fmax(c) ? (fmin(c) === fmax(c) ? String(fmax(c)) : fmin(c) + '-' + fmax(c)) : '';
  const fix = c.fixTxt ?? (tipo === 'fijo' ? old : ''), vr = c.varTxt ?? (tipo === 'variable' ? old : '');
  const esPct = /%/.test(vr);
  return `<div class="money">
    ${tipo !== 'variable' ? `<label>${tipo === 'mixto' ? 'Parte fija' : 'Cuota fija'} (€/mes sin IVA)<input type="text" inputmode="decimal" data-m="fixTxt" value="${esc(fix)}" placeholder="Ej.: 900, 650-1300 o gratis"></label>` : ''}
    ${tipo !== 'fijo' ? `<label>${tipo === 'mixto' ? 'Parte variable' : 'Variable'} · en € o en %<input type="text" data-m="varTxt" value="${esc(vr)}" placeholder="Ej.: 200-600 o 10%"></label>
      ${esPct ? `<label>% sobre qué<input data-m="varOn" value="${esc(c.varOn || '')}" placeholder="ventas, inversión en anuncios…"></label>
      <label>Base estimada (€/mes)<input type="text" inputmode="decimal" data-m="varBase" value="${esc(c.varBase || '')}" placeholder="Ej.: 5000 o 3000-8000"></label>` : ''}` : ''}
    <p class="iahint">Total estimado: <b data-feetot>${feeTxt(c) || '—'}</b>${fmax(c) ? ` · cuenta como ${rng(fmin(c), fmax(c))}/mes` : ''}</p></div>`;
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
    ${ag ? `<label>Cuánto paga a la agencia (€/mes sin IVA) · una cifra o un rango<input type="text" inputmode="decimal" data-ag value="${esc(c.agFeeTxt || '')}" placeholder="Ej.: 2500 o 2000-3000"></label>` : ''}
    ${ag ? `<label>Horas al mes con este cliente<input type="number" min="0" step="0.5" data-f="hours" value="${c.hours || ''}" placeholder="normalmente entre 8 y 20"></label>` : ''}
    ${ag ? `<div class="row"><label>Estado<select data-f="estado">${ESTADOS.map(([k, t]) => `<option value="${k}" ${estadoDe(c) === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Tier<select data-f="tier"><option value="">—</option>${Object.entries(TIERS).map(([k, t]) => `<option value="${k}" ${c.tier === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>` : ''}
    ${!ag ? `<div class="row"><label>Estado<select data-f="estado">${ESTADOS.map(([k, t]) => `<option value="${k}" ${estadoDe(c) === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Tier<select data-f="tier"><option value="">—</option>${Object.entries(TIERS).map(([k, t]) => `<option value="${k}" ${c.tier === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
      <div class="row"><label>Tipo de ingreso<select data-f="ingreso">${[['fijo', '💶 Fijo'], ['mixto', '💶➕📈 Fijo + variable'], ['variable', '📈 Variable']].map(([k, t]) => `<option value="${k}" ${ingresoDe(c) === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Cliente desde<input type="month" data-f="since" value="${esc(c.since || '')}"></label></div>
      ${moneyFields(c)}` : ''}
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
// al pasar de los datos antiguos (una sola cifra) a los campos nuevos, se conserva la cifra
const fix0 = c => { if (c.fixTxt === undefined && c.varTxt === undefined && fmax(c)){ const old = fmin(c) === fmax(c) ? String(fmax(c)) : fmin(c) + '-' + fmax(c); if (ingresoDe(c) === 'variable') c.varTxt = old; else c.fixTxt = old; } return false; };
form.addEventListener('change', e => { if (e.target.dataset.f === 'ingreso'){ fix0(cur); recalcFee(cur); O.save(); draw(); } });
form.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.ag !== undefined) cur.agFeeTxt = t.value;
  if (t.dataset.m){ if (fix0(cur)) {} cur[t.dataset.m] = t.value; recalcFee(cur);
    const tot = form.querySelector('[data-feetot]'); if (tot) tot.textContent = feeTxt(cur) || '—';
    const pctAhora = /%/.test(cur.varTxt || ''); if (t.dataset.m === 'varTxt' && pctAhora !== !!form.querySelector('[data-m=varOn]')) { O.save(); const pos = t.selectionStart; draw(); const n = form.querySelector('[data-m=varTxt]'); n.focus(); n.setSelectionRange(pos, pos); return; } }
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
