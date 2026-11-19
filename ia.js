// Proyectos IA: sección independiente para organizar automatizaciones y desarrollos con IA.
// Dos grupos (Agencia / Mío). Cada proyecto tiene estado, descripción e ideas que vas apuntando.
(() => {
const O = window.__org, S = O.S, esc = O.esc, $ = s => document.querySelector(s);
const A = () => (S.ai = S.ai || {projects: []});
const ST = {idea:'Idea', curso:'En curso', pausa:'En pausa', hecho:'Hecho'};
const COLORS = {agency:['#3B82F6','#06B6D4','#6366F1','#38BDF8','#0EA5E9','#818CF8'], mine:['#22C55E','#FACC15','#F97316','#14B8A6','#FB7185','#A3E635']};
const uid = () => Math.random().toString(36).slice(2, 10);

O.views.ia = function(){
  O.setToolbar('Proyectos IA', 'ideas y automatizaciones que quieres montar', '', 'Toca un proyecto para ver y apuntar ideas');
  const ps = A().projects;
  const sec = (g, title, cls) => {
    const list = ps.filter(p => p.group === g).sort((a, b) => (a.status === 'hecho') - (b.status === 'hecho') || (b.at || 0) - (a.at || 0));
    return `<section class="ia-sec ${cls}"><h3>${title}<span>${list.length} proyecto${list.length === 1 ? '' : 's'}</span>
      <button class="btn" data-pnew="${g}">+ Proyecto</button></h3>
      <div class="ia-grid">${list.map(card).join('') || '<div class="empty">Aún no hay proyectos. Pulsa «+ Proyecto».</div>'}</div></section>`;
  };
  return `<div class="ia-wrap">${sec('agency', '🏢 Agencia', 'ia-ag')}${sec('mine', '🔒 Mío', 'ia-mine')}</div>`;
};
function card(p){
  const ideas = p.ideas || [], open = ideas.filter(i => !i.done);
  return `<article class="proj" data-proj="${p.id}" style="--c:${p.color}">
    <header><b>${esc(p.name)}</b><span class="pst s-${p.status}">${ST[p.status] || 'Idea'}</span></header>
    ${p.desc ? `<p>${esc(p.desc)}</p>` : ''}
    ${ideas.length ? `<ul>${ideas.slice(0, 4).map(i => `<li class="${i.done ? 'done' : ''}">💡 ${esc(i.text)}</li>`).join('')}</ul>` : ''}
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
  if (e.target.closest('.qidea')) return;
  const c = e.target.closest('[data-proj]'); if (c) openProj(c.dataset.proj);
});

/* ---------- Ficha del proyecto ---------- */
const dlg = document.createElement('dialog');
dlg.id = 'projDlg';
dlg.innerHTML = '<form method="dialog" class="sheet" id="projForm"></form>';
document.body.appendChild(dlg);
const form = dlg.querySelector('form');
let cur = null;
function openProj(id){ cur = A().projects.find(p => p.id === id); if (!cur) return; draw(); dlg.showModal(); }
function draw(){
  const p = cur;
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
    <div class="actions"><button type="button" class="btn danger" data-pdel>Borrar proyecto</button><span class="sp"></span><button class="btn primary" value="ok">Listo</button></div>`;
}
form.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.pf){ cur[t.dataset.pf] = t.value; cur.at = Date.now(); O.save(); }
  if (t.dataset.itext !== undefined){ cur.ideas[+t.closest('.idea').dataset.i].text = t.value; O.save(); }
});
form.addEventListener('keydown', e => {
  if (e.target.id === 'ideaNew' && e.key === 'Enter'){
    e.preventDefault(); const v = e.target.value.trim(); if (!v) return;
    cur.ideas = cur.ideas || []; cur.ideas.unshift({id: uid(), text: v, done: false, at: Date.now()}); cur.at = Date.now();
    O.save(); draw(); $('#ideaNew').focus();
  }
});
form.addEventListener('click', e => {
  const row = e.target.closest('.idea');
  if (e.target.closest('[data-idone]')){ const i = cur.ideas[+row.dataset.i]; i.done = !i.done; O.save(); draw(); }
  if (e.target.closest('[data-idel]')){ cur.ideas.splice(+row.dataset.i, 1); O.save(); draw(); }
  if (e.target.closest('[data-pdel]') && confirm(`¿Borrar el proyecto «${cur.name}» y sus ideas?`)){
    A().projects = A().projects.filter(p => p !== cur); O.save(); dlg.close('del');
  }
});
dlg.addEventListener('close', () => { if (S.view === 'ia') O.render(); });
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
})();
