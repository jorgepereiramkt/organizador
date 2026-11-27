// Clientes → «🌳 Árbol»: tus tareas pendientes en una pizarra infinita, como un árbol en espejo.
// Cada cliente en el centro; a la IZQUIERDA lo de hoy (☀️ Hoy → urgencias → tareas) y a la DERECHA lo futuro.
// Los clientes van uno debajo de otro por importancia, dentro de su zona (Agencia, proyectos internos, Mis clientes).
// Solo salen las ramas con tareas; al arrastrar una tarea aparecen todas las de su cliente para soltarla donde quieras.
// ＋ junto a cada cliente (izquierda = para hoy, derecha = para más adelante) o el ＋ grande para añadir tareas.
(() => {
const O = window.__org, S = O.S, esc = O.esc;
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const plegados = new Set(lsGet('jp-arbol-pleg2', []));
let vista = null, mover = null;   // mover = id de la tarea que estás arrastrando
const UCOL = { super: '#FF3B30', alta: '#FF8A00', normal: '#F5B400', baja: '#34C759' };
const UCORTO = { super: 'Súper', alta: 'Urgente', normal: 'Media', baja: 'Baja' };
const HOYC = '#F5B400';
// posiciones (en espejo): tareas de hoy | urgencia | ☀️ Hoy | CLIENTE | 🗓 Futuras | urgencia | tareas futuras
const W = { t: 236, u: 108, r: 96, c: 168 };
const X = { tL: 0, uL: 262, rL: 396, c: 520, rR: 716, uR: 840, tR: 974 };
const ANCHO = X.tR + W.t, PAD = 40, FILA = 30;
const lineasTxt = (txt, ancho, px = 6.9) => Math.max(1, Math.ceil(String(txt || '').length * px / (ancho - 26)));
const altoT = t => 12 + lineasTxt(t, W.t) * 17;
const esHoy = t => t.today === O.today() || (S.slots && S.slots[t.id] && S.slots[t.id].day === O.today());

function grupos() {
  const T = O.visibleTasks().filter(t => !t.ia && t.status !== 'done');
  const out = [];
  for (const [g, nom] of [['agency', '🏢 Agencia'], ['mine', '🔒 Mis clientes']]) {
    if (S.group !== 'all' && S.group !== g) continue;
    const cs = S.clients.filter(c => c.group === g && !O.isApartado(c))
      .map(c => ({ c, ts: T.filter(t => O.cliEf(t) === c.id) })).filter(x => x.ts.length)
      .sort((a, b) => { const ia = g === 'agency' && O.esInterno(a.c) ? 1 : 0, ib = g === 'agency' && O.esInterno(b.c) ? 1 : 0; if (ia !== ib) return ia - ib;
        const ka = O.ordenFact(a.c), kb = O.ordenFact(b.c); return kb.v - ka.v || ka.k - kb.k || a.c.name.localeCompare(b.c.name, 'es'); });
    if (cs.length) out.push({ g, nom, cs, col: g === 'mine' ? O.GROUP.mine.color : O.GROUP.agency.color, n: cs.reduce((s, x) => s + x.ts.length, 0) });
  }
  return { out, total: T.length };
}
// Un lado del árbol de un cliente (hoy = izquierda, resto = derecha), en coordenadas propias
function lado(k, sub, todo, cc) {
  const izq = k === 'hoy', nodos = [], lin = [];
  const us = [];
  for (const [u, info] of Object.entries(O.URG)) {
    const tu = sub.filter(t => (O.URG[t.priority] ? t.priority : 'normal') === u).sort(O.byOrder);
    if (tu.length || todo) us.push({ u, info, tu });
  }
  if (!us.length) return null;
  let y = 0;
  for (const x of us) {
    const y0 = y; let yy = y; const ys = [];
    for (const t of x.tu) { const h = altoT(t.title); ys.push(yy + h / 2); yy += h + 5; }
    const usado = x.tu.length ? yy - y - 5 : FILA;
    x.y = y0 + usado / 2;
    x.tu.forEach((t, i) => {
      nodos.push({ tipo: 't', t, x: izq ? X.tL : X.tR, y: ys[i], col: UCOL[x.u], hoy: izq });
      lin.push(izq ? [X.uL, x.y, X.tL + W.t, ys[i], UCOL[x.u]] : [X.uR + W.u, x.y, X.tR, ys[i], UCOL[x.u]]);
    });
    nodos.push({ tipo: 'u', x: izq ? X.uL : X.uR, y: x.y, col: UCOL[x.u], txt: `${x.info.icon} ${UCORTO[x.u]}`, n: x.tu.length, drop: `${k}:${x.u}`, vacio: !x.tu.length });
    y += usado + 8;
  }
  const alto = y - 8, ry = (us[0].y + us[us.length - 1].y) / 2;
  nodos.push({ tipo: 'r', x: izq ? X.rL : X.rR, y: ry, col: izq ? HOYC : cc, txt: izq ? '☀️ Hoy' : '🗓 Futuras', n: sub.length, drop: k, vacio: !sub.length, hoy: izq });
  for (const x of us) lin.push(izq ? [X.rL, ry, X.uL + W.u, x.y, x.tu.length ? HOYC : 'rgba(128,128,128,.5)', !x.tu.length] : [X.rR + W.r, ry, X.uR, x.y, x.tu.length ? cc : 'rgba(128,128,128,.5)', !x.tu.length]);
  return { nodos, lin, alto, ry };
}
function bloque({ c, ts }) {
  const cc = O.clientColor(c), todo = !!(mover && ts.some(t => t.id === mover)), pleg = plegados.has('c:' + c.id) && !todo;
  const hc = 30 + lineasTxt(c.name, W.c, 7.4) * 17;
  const L = pleg ? null : lado('hoy', ts.filter(esHoy), todo, cc), R = pleg ? null : lado('resto', ts.filter(t => !esHoy(t)), todo, cc);
  const cy = Math.max(hc / 2, L ? L.ry : 0, R ? R.ry : 0);
  const nodos = [], lin = [];
  let alto = cy + hc / 2;
  for (const s of [L, R]) {
    if (!s) continue; const o = cy - s.ry;
    for (const n of s.nodos) nodos.push({ ...n, y: n.y + o });
    for (const l of s.lin) lin.push([l[0], l[1] + o, l[2], l[3] + o, l[4], l[5]]);
    alto = Math.max(alto, o + s.alto);
  }
  if (L) lin.push([X.c, cy, X.rL + W.r, cy, HOYC]);
  if (R) lin.push([X.c + W.c, cy, X.rR, cy, cc]);
  const nh = ts.filter(esHoy).length;
  nodos.push({ tipo: 'c', x: X.c, y: cy, col: cc, txt: (c.proyecto ? '📁 ' : '') + c.name, sub: `${nh ? '☀️ ' + nh + ' hoy · ' : ''}${ts.length - nh} futuras`, id: 'c:' + c.id, cid: c.id, pleg });
  return { nodos, lineas: lin, alto: Math.max(alto, hc), cid: c.id, todo };
}

function arbol() {
  O.setToolbar('Clientes', 'tus tareas en árbol', '', 'Izquierda: hoy · derecha: futuras · arrastra una tarea para moverla');
  const { out, total } = grupos();
  let html = '', lin = '', y = 70;
  const anchoT = ANCHO + PAD * 2;
  // títulos de las dos mitades
  html += `<div class="ar-mitad hoy" style="left:${PAD + X.tL}px;top:22px;width:${X.rL + W.r - X.tL}px">☀️ HOY</div>
    <div class="ar-mitad fut" style="left:${PAD + X.rR}px;top:22px;width:${X.tR + W.t - X.rR}px">🗓 FUTURAS</div>
    <div class="an an-0" style="left:${PAD + X.c}px;top:40px;width:${W.c}px"><b>🌳 Mis tareas</b><small>${total} pendientes</small></div>`;
  const zonas = [];
  const pinta = (bl, y0) => {
    let by = y0;
    for (const b of bl) {
      for (const [x1, y1, x2, y2, col, punt] of b.lineas) { const m = (x1 + x2) / 2;
        lin += `<path d="M${PAD + x1} ${by + y1} C${PAD + m} ${by + y1} ${PAD + m} ${by + y2} ${PAD + x2} ${by + y2}" stroke="${col}" ${punt ? 'stroke-dasharray="4 4"' : 'opacity=".8"'}/>`; }
      for (const n of b.nodos) {
        const L = PAD + n.x, T = by + n.y;
        if (n.tipo === 't') html += `<button type="button" class="an an-t${n.hoy ? ' hoy izq' : ''}${n.t.id === mover ? ' moviendo' : ''}" data-atask="${esc(n.t.id)}" style="left:${L}px;top:${T}px;width:${W.t}px;--c:${n.col}" title="${esc(n.t.title)}"><span>${n.hoy ? '☀️ ' : ''}${esc(n.t.title)}</span></button>`;
        else if (n.tipo === 'c') html += `<button type="button" class="an an-2${n.pleg ? ' pleg' : ''}" data-anodo="${esc(n.id)}" style="left:${L}px;top:${T}px;width:${W.c}px;--c:${n.col}"><b>${esc(n.txt)}</b><small>${esc(n.sub)}</small>${n.pleg ? '<i>＋</i>' : ''}</button>
          <button type="button" class="ar-mas izq" data-amas="${esc(n.cid)}|hoy" style="left:${L - 15}px;top:${T}px" title="Añadir tarea para hoy" aria-label="Añadir tarea para hoy">＋</button>
          <button type="button" class="ar-mas der" data-amas="${esc(n.cid)}|resto" style="left:${L + W.c - 15}px;top:${T}px" title="Añadir tarea para más adelante" aria-label="Añadir tarea para más adelante">＋</button>`;
        else html += `<div class="an an-${n.tipo === 'r' ? 3 : 4}${n.hoy ? ' hoy' : ''}${n.vacio ? ' vacio' : ''}${b.todo ? ' destino' : ''}" ${b.todo ? `data-adrop="${esc(b.cid)}|${n.drop}"` : ''} style="left:${L}px;top:${T}px;width:${n.tipo === 'r' ? W.r : W.u}px;--c:${n.col}"><b>${esc(n.txt)}</b><small>${n.n}</small></div>`;
      }
      by += b.alto + 26;
    }
    return by;
  };
  for (const g of out) {
    const gy = y + 30;
    const internos = g.g === 'agency' ? g.cs.filter(x => O.esInterno(x.c)) : [], clientes = g.cs.filter(x => !internos.includes(x));
    html += `<div class="an an-1" style="left:${PAD + X.c - 31}px;top:${gy}px;width:${W.c + 62}px;--c:${g.col}"><b>${g.nom}</b><small>${clientes.length} cliente${clientes.length === 1 ? '' : 's'}${internos.length ? ' · ' + internos.length + ' proyectos' : ''} · ${g.n} tareas</small></div>`;
    let fin = pinta(clientes.map(bloque), gy + 50);
    if (internos.length) {
      const iy = fin;
      html += `<div class="ar-subt" style="left:${PAD + X.c - 20}px;top:${iy + 18}px;--c:${g.col}">📁 Proyectos internos <span>menos prioridad</span></div>`;
      fin = pinta(internos.map(bloque), iy + 46);
      zonas.push({ cls: 'ar-zona-int', y: iy, fin, col: g.col });
    }
    zonas.push({ cls: 'ar-zona ' + (g.g === 'mine' ? 'z-mine' : 'z-ag'), y: y + 8, fin: fin + 4, col: g.col });
    y = fin + 34;
  }
  html = zonas.map(z => { const izq = z.cls.startsWith('ar-zona-int') ? 22 : 10; return `<div class="${z.cls}" style="left:${izq}px;top:${z.y}px;width:${anchoT - izq * 2}px;height:${z.fin - z.y}px;--c:${z.col}"></div>`; }).join('')
    + `<div class="ar-eje" style="left:${PAD + X.c + W.c / 2}px;top:60px;height:${y - 60}px"></div>` + html;
  const altoT2 = y + 20;
  return `<div class="arbol${mover ? ' arrastrando' : ''}" id="arbol"><div class="ar-lienzo" id="arLienzo" style="width:${anchoT}px;height:${altoT2}px">
      <svg class="ar-lineas" width="${anchoT}" height="${altoT2}" fill="none" stroke-width="2">${lin}</svg>${html}</div>
    ${mover ? '<div class="ar-aviso">Suéltala en una urgencia de «Hoy» o de «Futuras» de su cliente</div>' : ''}
    <div class="ar-ctrl"><button type="button" class="ar-nueva" data-amas="" aria-label="Añadir tarea" title="Añadir tarea">＋</button><button type="button" data-azoom="1.25" aria-label="Acercar">🔍</button><button type="button" data-azoom="0.8" aria-label="Alejar">－</button><button type="button" data-acentra aria-label="Ver todo">⤢</button>
      <button type="button" data-apleg="todo" title="Plegar todos los clientes">➖</button><button type="button" data-apleg="no" title="Desplegar todo">🌳</button></div>
    <div class="ar-form" id="arForm" hidden></div></div>`;
}

// ----- añadir tarea desde el árbol -----
let formCtx = null;
function abreForm(cid, k) {
  const f = document.getElementById('arForm'); if (!f) return;
  const cs = O.byClientOrder(S.clients.filter(c => !O.isApartado(c) && (S.group === 'all' || c.group === S.group)));
  formCtx = { cid: cid || (cs[0] || {}).id || '', k: k || 'hoy', u: 'normal' };
  const pinta = () => {
    f.innerHTML = `<form id="arF"><div class="arf-h"><b>Nueva tarea</b><button type="button" data-afcerrar aria-label="Cerrar">✕</button></div>
      <input id="arFt" placeholder="Qué hay que hacer… (entiende «mañana», «el viernes»…)" autocomplete="off">
      <select id="arFc">${cs.map(c => `<option value="${esc(c.id)}" ${c.id === formCtx.cid ? 'selected' : ''}>${c.group === 'mine' ? '🔒 ' : '🏢 '}${esc(c.name)}</option>`).join('')}</select>
      <div class="arf-chips">${[['hoy', '☀️ Hoy'], ['resto', '🗓 Más adelante']].map(([v, n]) => `<button type="button" class="${formCtx.k === v ? 'on' : ''}" data-afk="${v}">${n}</button>`).join('')}</div>
      <div class="arf-chips">${Object.entries(O.URG).map(([u, i]) => `<button type="button" class="${formCtx.u === u ? 'on' : ''}" data-afu="${u}" style="--c:${UCOL[u]}">${i.icon} ${UCORTO[u]}</button>`).join('')}</div>
      <button class="btn primary" type="submit">Añadir</button></form>`;
  };
  pinta(); f.hidden = false; f._pinta = pinta;
  setTimeout(() => document.getElementById('arFt')?.focus(), 30);
}
function creaTarea() {
  const txt = (document.getElementById('arFt')?.value || '').trim(); if (!txt) return document.getElementById('arFt')?.focus();
  const cid = document.getElementById('arFc').value || null;
  let o = O.maxOrder();
  const nuevas = O.parse(txt).map(p => ({ id: O.uid(), ...p, client: cid, status: 'todo', order: ++o, doneAt: null, priority: formCtx.u, today: formCtx.k === 'hoy' ? O.today() : (p.today && p.today !== O.today() ? p.today : null) }));
  if (!nuevas.length) return;
  S.tasks.push(...nuevas); O.save(); O.render();
  if (O.online()) nuevas.forEach(O.pushCreate);
  O.toast(`Añadida a ${O.client(cid)?.name || 'Sin cliente'} · ${formCtx.k === 'hoy' ? '☀️ hoy' : '🗓 más adelante'}`);
}
document.addEventListener('click', e => {
  const f = document.getElementById('arForm'); if (!f || f.hidden) return;
  if (e.target.closest('[data-afcerrar]')) { f.hidden = true; return; }
  const k = e.target.closest('[data-afk]'); if (k) { formCtx.k = k.dataset.afk; formCtx.cid = document.getElementById('arFc').value; const v = document.getElementById('arFt').value; f._pinta(); document.getElementById('arFt').value = v; return; }
  const u = e.target.closest('[data-afu]'); if (u) { formCtx.u = u.dataset.afu; formCtx.cid = document.getElementById('arFc').value; const v = document.getElementById('arFt').value; f._pinta(); document.getElementById('arFt').value = v; return; }
});
document.addEventListener('submit', e => { if (e.target.id !== 'arF') return; e.preventDefault(); creaTarea(); });

// ----- mover y hacer zoom -----
function aplica() { const l = document.getElementById('arLienzo'); if (l && vista) l.style.transform = `translate(${vista.x}px,${vista.y}px) scale(${vista.z})`; }
function centra() {
  const a = document.getElementById('arbol'), l = document.getElementById('arLienzo'); if (!a || !l) return;
  const Wd = a.clientWidth, w = l.offsetWidth, z = Math.max(0.45, Math.min(1, Wd / w));
  vista = { x: Math.max(4, (Wd - w * z) / 2), y: 4, z }; aplica();
}
function zoomEn(f, cx, cy) { const z = Math.max(0.2, Math.min(2.5, vista.z * f)), k = z / vista.z; vista = { x: cx - (cx - vista.x) * k, y: cy - (cy - vista.y) * k, z }; aplica(); }
let arr = null;   // arrastre de una tarea
function init() {
  const a = document.getElementById('arbol'); if (!a) return;
  if (!vista) centra(); else aplica();
  const ptrs = new Map(); let pin = null;
  a.addEventListener('pointerdown', e => {
    if (e.target.closest('.ar-ctrl, .ar-form, .ar-mas')) return;
    const t = e.target.closest('[data-atask]');
    if (t && e.isPrimary && !ptrs.size) { arr = { id: t.dataset.atask, x: e.clientX, y: e.clientY, on: false, txt: t.textContent.trim() }; return; }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); a._mov = false;
    if (ptrs.size === 2) { arr = null; const [p, q] = [...ptrs.values()]; pin = { d: Math.hypot(p.x - q.x, p.y - q.y), z: vista.z }; }
  });
  a.addEventListener('pointermove', e => {
    const prev = ptrs.get(e.pointerId); if (!prev || (arr && arr.on)) return;
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    if (ptrs.size === 1) { if (!a._mov && Math.hypot(dx, dy) < 4) return; a._mov = true; vista.x += dx; vista.y += dy; aplica(); }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2 && pin) { const [p, q] = [...ptrs.values()], d = Math.hypot(p.x - q.x, p.y - q.y), rc = a.getBoundingClientRect();
      a._mov = true; zoomEn(pin.z * d / pin.d / vista.z, (p.x + q.x) / 2 - rc.left, (p.y + q.y) / 2 - rc.top); }
  });
  const fin = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pin = null; };
  a.addEventListener('pointerup', fin); a.addEventListener('pointercancel', fin);
  a.addEventListener('click', e => { if (a._mov) { e.stopPropagation(); e.preventDefault(); a._mov = false; } }, true);
  a.addEventListener('wheel', e => { if (e.target.closest('.ar-form')) return; e.preventDefault(); const rc = a.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoomEn(e.deltaY < 0 ? 1.1 : 0.91, e.clientX - rc.left, e.clientY - rc.top);
    else { vista.x -= e.deltaX; vista.y -= e.deltaY; aplica(); } }, { passive: false });
  a.addEventListener('gesturestart', e => e.preventDefault());
}
// arrastrar una tarea: al moverla aparecen todas las ramas de su cliente
let fantasma = null, sobre = null;
document.addEventListener('pointermove', e => {
  if (!arr) return;
  if (!arr.on) { if (Math.hypot(e.clientX - arr.x, e.clientY - arr.y) < 8) return;
    arr.on = true; mover = arr.id; O.render();
    fantasma = document.createElement('div'); fantasma.className = 'ar-fantasma'; fantasma.textContent = arr.txt; document.body.appendChild(fantasma); }
  fantasma.style.transform = `translate(${e.clientX + 12}px,${e.clientY + 8}px)`;
  const el = document.elementFromPoint(e.clientX, e.clientY), d = el && el.closest('[data-adrop]');
  if (sobre !== d) { sobre && sobre.classList.remove('sobre'); sobre = d; sobre && sobre.classList.add('sobre'); }
}, { passive: true });
const sueltaFin = () => {
  if (!arr) return; const a = arr; arr = null;
  if (!a.on) return;   // fue un toque: lo abre el «click»
  fantasma && fantasma.remove(); fantasma = null;
  const d = sobre; sobre = null; mover = null; S._arSalto = true;
  if (d) suelta(a.id, d.dataset.adrop); else O.render();
  setTimeout(() => { S._arSalto = false; }, 120);
};
document.addEventListener('pointerup', sueltaFin); document.addEventListener('pointercancel', sueltaFin);
function suelta(id, destino) {
  const t = O.task(id); if (!t) return O.render();
  const [cid, resto] = destino.split('|'), [k, u] = (resto || '').split(':');
  if (cid !== O.cliEf(t)) { O.toast('Solo puedes moverla dentro de su cliente'); return O.render(); }
  const antes = O.snap(t), hoy = O.today();
  if (u && O.URG[u]) t.priority = u;
  if (k === 'hoy') t.today = hoy;
  if (k === 'resto') { if (t.today === hoy) t.today = null; if (S.slots[t.id] && S.slots[t.id].day === hoy) delete S.slots[t.id]; }
  O.save(); O.render(); O.afterChange(t, antes);
  O.toast(`${k === 'hoy' ? '☀️ Para hoy' : '🗓 Futuras'}${u && O.URG[u] ? ' · ' + O.URG[u].icon + ' ' + O.URG[u].label : ''}`);
}
document.addEventListener('click', e => {
  if (!document.getElementById('arbol') || S._arSalto) return;
  const mas = e.target.closest('[data-amas]'); if (mas) { const [cid, k] = mas.dataset.amas.split('|'); return abreForm(cid, k || 'hoy'); }
  if (e.target.closest('.ar-form')) return;
  const t = e.target.closest('[data-atask]'); if (t) { O.openEditor && O.openEditor(t.dataset.atask); return; }
  const n = e.target.closest('[data-anodo]'); if (n) { const id = n.dataset.anodo; plegados.has(id) ? plegados.delete(id) : plegados.add(id); lsSet('jp-arbol-pleg2', [...plegados]); return O.render(); }
  const zb = e.target.closest('[data-azoom]'); if (zb) { const a = document.getElementById('arbol'); return zoomEn(+zb.dataset.azoom, a.clientWidth / 2, a.clientHeight / 2); }
  if (e.target.closest('[data-acentra]')) return centra();
  const pl = e.target.closest('[data-apleg]');
  if (pl) { plegados.clear(); if (pl.dataset.apleg === 'todo') S.clients.forEach(c => plegados.add('c:' + c.id)); lsSet('jp-arbol-pleg2', [...plegados]); vista = null; O.render(); }
});

// Se engancha a la vista Clientes como un modo más
const antes = O.views.clientes, despues = antes.after;
O.views.clientes = function () { return S.clientMode === 'arbol' ? arbol() : antes(); };
O.views.clientes.after = function () { if (despues) despues(); if (S.clientMode === 'arbol') init(); };
})();
