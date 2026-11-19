// Proyectos IA: sección independiente para organizar automatizaciones y desarrollos con IA.
// Dos grupos (Agencia / Mío). Cada proyecto tiene estado, descripción e ideas que vas apuntando.
(() => {
const O = window.__org, S = O.S, esc = O.esc, $ = s => document.querySelector(s);
const A = () => (S.ai = S.ai || {projects: []});
const ST = {idea:'Idea', curso:'En curso', pausa:'En pausa', hecho:'Hecho'};
const COLORS = {agency:['#3B82F6','#06B6D4','#6366F1','#38BDF8','#0EA5E9','#818CF8'], mine:['#22C55E','#FACC15','#F97316','#14B8A6','#FB7185','#A3E635']};
const uid = () => Math.random().toString(36).slice(2, 10);

// Enlaces cortos: en vez de la URL entera, «🔗 miro.com»
const URL_RE = /https?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)\]]/g;
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch(e){ return 'enlace'; } };
const PATH_RE = /(?:^|(?<=\s))(?:\/Users|~)\/\S+/g;
const shortPaths = h => h.replace(PATH_RE, p => `<span class="apath" title="${p}">📁 ${p.split('/').filter(Boolean).pop()}</span>`);
const linky = t => { t = String(t || ''); let o = '', i = 0; for (const m of t.matchAll(URL_RE)){ o += shortPaths(esc(t.slice(i, m.index))) + `<a class="ilink" href="${esc(m[0])}" target="_blank" rel="noopener" title="${esc(m[0])}">🔗 ${esc(host(m[0]))}</a>`; i = m.index + m[0].length; } return o + shortPaths(esc(t.slice(i))); };

/* ---------- Dos apartados: En mente | Implementadas ---------- */
S.iaMode = S.iaMode || 'mente';
O.views.ia = function(){
  if (S.iaMode === 'hechas') return autosView();
  O.setToolbar('Proyectos IA', 'en mente: ideas y proyectos que se te ocurren', '', 'Toca un proyecto para ver y apuntar ideas');
  const ps = A().projects;
  const sec = (g, title, cls) => {
    const list = ps.filter(p => p.group === g).sort((a, b) => (a.status === 'hecho') - (b.status === 'hecho') || (b.at || 0) - (a.at || 0));
    return `<section class="ia-sec ${cls}"><h3>${title}<span>${list.length} proyecto${list.length === 1 ? '' : 's'}</span>
      <button class="btn" data-pnew="${g}">+ Proyecto</button></h3>
      <div class="ia-grid">${list.map(card).join('') || '<div class="empty">Aún no hay proyectos. Pulsa «+ Proyecto».</div>'}</div></section>`;
  };
  return `<div class="ia-wrap">${sec('agency', '🏢 Agencia', 'ia-ag')}${sec('mine', '🔒 Mío', 'ia-mine')}</div>`;
};
O.views.ia.after = () => {
  const tb = $('#toolbar'); if (tb.querySelector('.modes')) return;
  const sw = document.createElement('div'); sw.className = 'modes';
  sw.innerHTML = `<button class="chip" data-iamode="mente" aria-pressed="${S.iaMode !== 'hechas'}">💭 En mente</button>
    <button class="chip" data-iamode="hechas" aria-pressed="${S.iaMode === 'hechas'}">⚙️ Implementadas</button>`;
  tb.insertBefore(sw, tb.querySelector('.sp'));
};
document.addEventListener('click', e => { const b = e.target.closest('[data-iamode]'); if (!b) return; S.iaMode = b.dataset.iamode; O.render(); });

/* ---------- Implementadas: qué automatizaciones tiene cada cliente, de qué servicio y dónde están ---------- */
const AU = () => (A().autos = A().autos || []);
const AST = {activa:{l:'Activa', c:'#30A46C'}, pausa:{l:'En pausa', c:'#F5A524'}, rota:{l:'Rota / revisar', c:'#E5484D'}};
const TOOLS = ['Make','n8n','Zapier','Apps Script','Claude (rutina)','Claude (proyecto)','ChatGPT','ClickUp','Airtable','Klaviyo','Meta Ads','Google Ads (script)','Shopify','Looker Studio','Otra'];
function autoRow(a){
  const st = AST[a.status] || AST.activa;
  const where = a.where ? (/^https?:/.test(a.where) ? `<a class="ilink" href="${esc(a.where)}" target="_blank" rel="noopener" title="${esc(a.where)}">🔗 ${esc(host(a.where))}</a>` : `<span class="apath" title="${esc(a.where)}">📁 ${esc(a.where.split('/').filter(Boolean).pop() || a.where)}</span>`) : '';
  return `<div class="auto" data-auto="${a.id}"><i class="adot" style="background:${st.c}" title="${st.l}"></i>
    <div class="abody"><b>${esc(a.name || 'Sin nombre')}</b>${a.what ? `<small>${esc(a.what)}</small>` : ''}</div>
    <div class="ameta">${a.tool ? `<span class="atool">${esc(a.tool)}</span>` : ''}${where}</div></div>`;
}
function autoCard(c){
  const mine = AU().filter(a => a.client === c.id), sv = c.services || [];
  const svNames = new Set(sv.map(s => s.name));
  const bloques = sv.map(s => {
    const as = mine.filter(a => a.service === s.name);
    const falta = !as.length && (s.mode === 'auto' || s.mode === 'mixto');
    return `<div class="asv"><h5>${esc(s.name)}<button type="button" class="aadd" data-anew="${c.id}" data-asv="${esc(s.name)}" title="Añadir automatización a ${esc(s.name)}">＋</button></h5>
      ${as.map(autoRow).join('') || `<p class="${falta ? 'afalta' : 'avacio'}">${falta ? 'Marcado como automatizado pero sin apuntar dónde' : 'Sin automatizaciones'}</p>`}</div>`;
  }).join('');
  const sueltas = mine.filter(a => !svNames.has(a.service));
  return `<article class="acard" style="--c:${O.clientColor(c)}">
    <header><i></i><b>${esc(c.name)}</b><span>${mine.length} automatizaci${mine.length === 1 ? 'ón' : 'ones'}</span>
      <button type="button" class="btn" data-anew="${c.id}">+ Automatización</button></header>
    ${bloques}${sueltas.length ? `<div class="asv"><h5>General</h5>${sueltas.map(autoRow).join('')}</div>` : ''}
    ${!sv.length && !mine.length ? '<p class="avacio">Sin servicios ni automatizaciones. Añade los servicios en Clientes → Fichas.</p>' : ''}</article>`;
}
function autosView(){
  O.setToolbar('Proyectos IA', 'implementadas: qué automatizaciones tiene cada cliente y dónde están', '', 'Toca una automatización para editarla');
  const total = AU().length;
  let html = '';
  for (const [g, title, cls] of [['agency', '🏢 Agencia', 'ia-ag'], ['mine', '🔒 Mío', 'ia-mine']]){
    if (S.group !== 'all' && S.group !== g) continue;
    const cs = S.clients.filter(c => (g === 'mine') === (c.group === 'mine'));
    const n = c => AU().filter(a => a.client === c.id).length;
    const con = cs.filter(c => n(c) || (c.services || []).length).sort((a, b) => n(b) - n(a) || a.name.localeCompare(b.name));
    const sin = cs.filter(c => !con.includes(c));
    html += `<section class="ia-sec ${cls}"><h3>${title}<span>${cs.reduce((s, c) => s + n(c), 0)} automatizaciones</span></h3>
      <div class="agrid">${con.map(autoCard).join('') || '<div class="empty">Aún no hay nada apuntado.</div>'}</div>
      ${sin.length ? `<div class="asin">Sin servicios todavía: ${sin.map(c => `<button type="button" class="chip" data-anew="${c.id}">+ ${esc(c.name)}</button>`).join('')}</div>` : ''}</section>`;
  }
  return `<div class="ia-wrap">${!total ? '<div class="note">Apunta aquí cada automatización que ya funciona: de qué cliente y servicio es, con qué herramienta y dónde está (enlace o ruta). Pulsa ＋ junto a un servicio.</div>' : ''}${html}</div>`;
}
document.addEventListener('click', e => {
  const nb = e.target.closest('[data-anew]');
  if (nb){ const a = {id: uid(), name: '', client: nb.dataset.anew, service: nb.dataset.asv || '', tool: '', where: '', what: '', status: 'activa', at: Date.now()}; AU().push(a); openAuto(a.id, true); return; }
  if (e.target.closest('.auto a')) return;
  const r = e.target.closest('[data-auto]'); if (r) openAuto(r.dataset.auto);
});
const adlg = document.createElement('dialog'); adlg.id = 'autoDlg';
adlg.innerHTML = '<form method="dialog" class="sheet" id="autoForm"></form>'; document.body.appendChild(adlg);
const aform = adlg.querySelector('form'); let acurId = null, anew = false;
const AC = () => AU().find(a => a.id === acurId);
function openAuto(id, isNew){ acurId = id; if (!AC()) return; anew = !!isNew; adraw(); adlg.showModal(); if (anew) aform.querySelector('[data-af=name]').focus(); }
function adraw(){
  const a = AC() || {}, c = O.client(a.client), sv = c ? (c.services || []) : [];
  const opts = (g, l) => `<optgroup label="${l}">` + S.clients.filter(x => (g === 'mine') === (x.group === 'mine')).map(x => `<option value="${x.id}" ${x.id === a.client ? 'selected' : ''}>${esc(x.name)}</option>`).join('') + '</optgroup>';
  aform.innerHTML = `<h2>${anew ? 'Nueva automatización' : esc(a.name || 'Automatización')}</h2>
    <label>Nombre<input data-af="name" value="${esc(a.name)}" placeholder="Ej.: Informe semanal de Meta a Slack"></label>
    <div class="row"><label>Cliente<select data-af="client">${opts('mine', 'Mis clientes')}${opts('agency', 'Agencia')}</select></label>
      <label>Servicio<select data-af="service"><option value="">General</option>${sv.map(s => `<option ${s.name === a.service ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label></div>
    <div class="row"><label>Herramienta<input data-af="tool" list="toolList" value="${esc(a.tool)}" placeholder="Make, n8n, Apps Script…"></label>
      <label>Estado<select data-af="status">${Object.entries(AST).map(([k, v]) => `<option value="${k}" ${a.status === k ? 'selected' : ''}>${v.l}</option>`).join('')}</select></label></div>
    <datalist id="toolList">${TOOLS.map(t => `<option value="${esc(t)}">`).join('')}</datalist>
    <label>Dónde está (enlace o ruta)<input data-af="where" value="${esc(a.where)}" placeholder="https://… o /Users/…/carpeta"></label>
    ${/^https?:/.test(a.where || '') ? `<div class="edlinks"><a href="${esc(a.where)}" target="_blank" rel="noopener">🔗 Abrir ${esc(host(a.where))}</a></div>` : ''}
    <label>Qué hace y cómo funciona<textarea rows="4" data-af="what" placeholder="Qué dispara, qué hace, a quién avisa, qué revisar si falla…">${esc(a.what)}</textarea></label>
    <div class="actions"><button type="button" class="btn danger" data-adel>Borrar</button><span class="sp"></span><button class="btn primary" value="ok">Listo</button></div>`;
}
aform.addEventListener('input', e => { const k = e.target.dataset.af, a = AC(); if (!k || !a) return; a[k] = e.target.value; a.at = Date.now(); O.save(); });
aform.addEventListener('change', e => { if (e.target.dataset.af === 'client' && AC()){ AC().service = ''; adraw(); } if (e.target.dataset.af === 'where') adraw(); });
aform.addEventListener('click', e => { if (e.target.closest('[data-adel]') && confirm('¿Borrar esta automatización?')){ A().autos = AU().filter(a => a.id !== acurId); O.save(); adlg.close('del'); } });
adlg.addEventListener('close', () => {
  // una automatización nueva sin nombre ni nada se descarta
  // y de paso se limpian las vacías que hayan quedado
  A().autos = AU().filter(a => (a.name || '').trim() || a.where || a.what);
  O.save(); if (S.view === 'ia') O.render();
});
adlg.addEventListener('click', e => { if (e.target === adlg) adlg.close(); });
function card(p){
  const ideas = p.ideas || [], open = ideas.filter(i => !i.done);
  return `<article class="proj" data-proj="${p.id}" style="--c:${p.color}">
    <header><b>${esc(p.name)}</b><span class="pst s-${p.status}">${ST[p.status] || 'Idea'}</span></header>
    ${p.desc ? `<p>${linky(p.desc)}</p>` : ''}
    ${ideas.length ? `<ul>${ideas.slice(0, 4).map(i => `<li class="${i.done ? 'done' : ''}">💡 ${linky(i.text)}</li>`).join('')}</ul>` : ''}
    ${ideas.length > 4 ? `<span class="more">+${ideas.length - 4} ideas más</span>` : ''}
    <form class="qidea" data-qidea="${p.id}"><input placeholder="+ Apuntar idea (Intro)" autocomplete="off"></form>
    <span class="more">${open.length} idea${open.length === 1 ? '' : 's'} pendiente${open.length === 1 ? '' : 's'} · ${ideas.length - open.length} hecha${ideas.length - open.length === 1 ? '' : 's'}</span>
  </article>`;
}

// Nuevo proyecto
document.addEventListener('click', e => {
  const n = e.target.closest('[data-pnew]'); if (!n) return;
  const g = n.dataset.pnew, name = prompt('Nombre del proyecto:'); if (!name || !name.trim()) return;
  const same = A().projects.filter(p => p.group === g).length;
  const p = {id: uid(), name: name.trim(), group: g, status: 'idea', desc: '', ideas: [], color: COLORS[g][same % COLORS[g].length], at: Date.now()};
  A().projects.push(p); O.save(); O.render(); openProj(p.id);
});
// Idea rápida desde la tarjeta
document.addEventListener('submit', e => {
  const f = e.target.closest('[data-qidea]'); if (!f) return;
  e.preventDefault();
  const p = A().projects.find(x => x.id === f.dataset.qidea), txt = f.querySelector('input').value.trim(); if (!p || !txt) return;
  p.ideas = p.ideas || []; p.ideas.unshift({id: uid(), text: txt, done: false, at: Date.now()}); p.at = Date.now();
  O.save(); O.render();
  const again = document.querySelector(`[data-qidea="${p.id}"] input`); if (again) again.focus();
  O.toast('Idea apuntada 💡');
});
document.addEventListener('click', e => {
  if (e.target.closest('.qidea') || e.target.closest('.proj a')) return;
  const c = e.target.closest('[data-proj]'); if (c) openProj(c.dataset.proj);
});

/* ---------- Ficha del proyecto ---------- */
const dlg = document.createElement('dialog');
dlg.id = 'projDlg';
dlg.innerHTML = '<form method="dialog" class="sheet" id="projForm"></form>';
document.body.appendChild(dlg);
const form = dlg.querySelector('form');
let curId = null;
const curP = () => A().projects.find(p => p.id === curId);
function openProj(id){ curId = id; if (!curP()) return; draw(); dlg.showModal(); }
function draw(){
  const p = curP(); if (!p) return;
  form.innerHTML = `<h2>${esc(p.name)}</h2>
    <div class="row"><label>Nombre<input data-pf="name" value="${esc(p.name)}"></label>
      <label>Estado<select data-pf="status">${Object.entries(ST).map(([k, v]) => `<option value="${k}" ${p.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Grupo<select data-pf="group"><option value="agency" ${p.group === 'agency' ? 'selected' : ''}>Agencia</option><option value="mine" ${p.group === 'mine' ? 'selected' : ''}>Mío</option></select></label></div>
    <label>De qué va (objetivo, qué se automatiza, herramientas…)<textarea rows="3" data-pf="desc">${esc(p.desc || '')}</textarea></label>
    <h3 class="h3">Ideas y notas</h3>
    <div class="qrow"><input id="ideaNew" placeholder="Nueva idea… (Intro)" autocomplete="off"></div>
    <div class="ideas">${(p.ideas || []).map((i, k) => `<div class="idea" data-i="${k}">
      <button type="button" class="mchk${i.done ? ' on' : ''}" data-idone>${i.done ? '✓' : ''}</button>
      <textarea rows="1" data-itext>${esc(i.text)}</textarea>
      <button type="button" class="x" data-idel aria-label="Borrar idea">×</button></div>`).join('') || '<p class="vacio">Aún no hay ideas.</p>'}</div>
    <div class="actions"><button type="button" class="btn danger" data-pdel>Borrar proyecto</button><span class="sp"></span><button type="button" class="btn" data-pimpl>⚙️ Ya está implementada</button><button class="btn primary" value="ok">Listo</button></div>`;
}
form.addEventListener('input', e => {
  const t = e.target, cur = curP(); if (!cur) return;
  if (t.dataset.pf){ cur[t.dataset.pf] = t.value; cur.at = Date.now(); O.save(); }
  if (t.dataset.itext !== undefined){ cur.ideas[+t.closest('.idea').dataset.i].text = t.value; O.save(); }
});
form.addEventListener('keydown', e => {
  const cur = curP(); if (!cur) return;
  if (e.target.id === 'ideaNew' && e.key === 'Enter'){
    e.preventDefault(); const v = e.target.value.trim(); if (!v) return;
    cur.ideas = cur.ideas || []; cur.ideas.unshift({id: uid(), text: v, done: false, at: Date.now()}); cur.at = Date.now();
    O.save(); draw(); $('#ideaNew').focus();
  }
});
form.addEventListener('click', e => {
  const row = e.target.closest('.idea'), cur = curP(); if (!cur) return;
  if (e.target.closest('[data-idone]')){ const i = cur.ideas[+row.dataset.i]; i.done = !i.done; O.save(); draw(); }
  if (e.target.closest('[data-idel]')){ cur.ideas.splice(+row.dataset.i, 1); O.save(); draw(); }
  if (e.target.closest('[data-pimpl]')){
    const c0 = S.clients.find(c => (cur.group === 'mine') === (c.group === 'mine'));
    if (!c0){ O.toast('Crea antes un cliente'); return; }
    const a = {id: uid(), name: cur.name, client: c0.id, service: '', tool: '', where: ((cur.desc || '') + ' ' + (cur.ideas || []).map(i => i.text).join(' ')).match(URL_RE)?.[0] || '', what: cur.desc || '', status: 'activa', at: Date.now()};
    AU().push(a); cur.status = 'hecho'; O.save(); dlg.close('ok'); S.iaMode = 'hechas'; O.render(); openAuto(a.id, true); return;
  }
  if (e.target.closest('[data-pdel]') && confirm(`¿Borrar el proyecto «${cur.name}» y sus ideas?`)){
    A().projects = A().projects.filter(p => p.id !== curId); O.save(); dlg.close('del');
  }
});
dlg.addEventListener('close', () => { if (S.view === 'ia') O.render(); });
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
})();
