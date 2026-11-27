// Clientes → «🌳 Árbol»: tus tareas pendientes como un árbol en una pizarra infinita, en horizontal y compacto.
// Mis tareas → Agencia / Mis clientes → cada cliente → Para hoy / Resto → urgencias → tareas.
// Solo salen las ramas con tareas; al arrastrar una tarea aparecen todas las de su cliente para soltarla donde quieras.
// Arrastra el fondo para moverte, rueda o pellizco para el zoom, toca una rama para plegarla y una tarea para abrirla.
(() => {
const O = window.__org, S = O.S, esc = O.esc;
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const plegados = new Set(lsGet('jp-arbol-pleg2', []));
let vista = null, mover = null;   // mover = id de la tarea que estás arrastrando
const UCOL = { super: '#FF3B30', alta: '#FF8A00', normal: '#F5B400', baja: '#34C759' };
// columnas dentro de cada cliente: cliente → hoy/resto → urgencia → tareas
const CX = [0, 148, 236, 334], CW = [130, 72, 82, 210], COLW = 575, FILA = 30;
const UCORTO = { super: 'Súper', alta: 'Urgente', normal: 'Media', baja: 'Baja' };
const esHoy = t => t.today === O.today() || (S.slots && S.slots[t.id] && S.slots[t.id].day === O.today());

function grupos() {
  const T = O.visibleTasks().filter(t => !t.ia && t.status !== 'done');
  const out = [];
  for (const [g, nom] of [['agency', '🏢 Agencia'], ['mine', '🔒 Mis clientes']]) {
    if (S.group !== 'all' && S.group !== g) continue;
    const cs = O.byClientOrder(S.clients.filter(c => c.group === g && !O.isApartado(c)))
      .map(c => ({ c, ts: T.filter(t => O.cliEf(t) === c.id) })).filter(x => x.ts.length);
    if (cs.length) out.push({ g, nom, cs, col: g === 'mine' ? O.GROUP.mine.color : O.GROUP.agency.color, n: cs.reduce((s, x) => s + x.ts.length, 0) });
  }
  return { out, total: T.length };
}
// Un cliente: sus ramas en coordenadas propias (0,0 = esquina de su bloque)
function bloque({ c, ts }) {
  const cc = O.clientColor(c), todo = mover && ts.some(t => t.id === mover), pleg = plegados.has('c:' + c.id) && !todo;
  const nodos = [], lineas = [], ramas = [];
  let y = 0;
  for (const [k, nom, f] of [['hoy', '☀️ Hoy', esHoy], ['resto', '🗂 Resto', t => !esHoy(t)]]) {
    const sub = ts.filter(f); if (!sub.length && !todo) continue;
    const us = [];
    for (const [u, info] of Object.entries(O.URG)) {
      const tu = sub.filter(t => (O.URG[t.priority] ? t.priority : 'normal') === u).sort(O.byOrder);
      if (tu.length || todo) us.push({ u, info, tu });
    }
    ramas.push({ k, nom, sub, us });
  }
  if (!pleg) for (const r of ramas) {
    const y0 = y;
    for (const x of r.us) {
      const uy0 = y, filas = Math.max(1, x.tu.length);
      x.y = uy0 + filas * FILA / 2;
      x.tu.forEach((t, i) => { const ty = y + i * FILA + FILA / 2; nodos.push({ tipo: 't', t, x: CX[3], y: ty, col: UCOL[x.u] }); lineas.push([CX[2] + CW[2], x.y, CX[3], ty, UCOL[x.u]]); });
      y += filas * FILA + 6;
      nodos.push({ tipo: 'u', x: CX[2], y: x.y, col: UCOL[x.u], txt: `${x.info.icon} ${UCORTO[x.u] || x.info.label}`, n: x.tu.length, drop: `${r.k}:${x.u}`, vacio: !x.tu.length });
    }
    r.y = (y0 + y - 6) / 2;
    nodos.push({ tipo: 'r', x: CX[1], y: r.y, col: cc, txt: r.nom, n: r.sub.length, drop: r.k, vacio: !r.sub.length });
    for (const x of r.us) lineas.push([CX[1] + CW[1], r.y, CX[2], x.y, x.tu.length ? cc : 'rgba(128,128,128,.5)', !x.tu.length]);
    y += 10;
  }
  const alto = Math.max(FILA + 14, y);
  const cy = pleg || !ramas.length ? Math.min(alto, FILA + 14) / 2 : (ramas[0].y + ramas[ramas.length - 1].y) / 2;
  const nh = ts.filter(esHoy).length;
  nodos.push({ tipo: 'c', x: 0, y: cy, col: cc, txt: (c.proyecto ? '📁 ' : '') + c.name, sub: `${ts.length} pend.${nh ? ' · ' + nh + ' hoy' : ''}`, id: 'c:' + c.id, pleg });
  if (!pleg) for (const r of ramas) lineas.push([CW[0], cy, CX[1], r.y, r.sub.length ? cc : 'rgba(128,128,128,.5)', !r.sub.length]);
  return { nodos, lineas, alto: pleg ? FILA + 14 : alto, cid: c.id };
}

function arbol() {
  O.setToolbar('Clientes', 'tus tareas en árbol', '', 'Arrastra una tarea para cambiarle la urgencia o el «hoy»');
  const { out, total } = grupos();
  const W = (document.getElementById('main') || {}).clientWidth || 1000;
  const cols = Math.max(1, Math.min(3, Math.floor((W - 40) / (COLW * 0.7))));
  let html = '', lin = '', y = 70, anchoT = 760;
  const ROOT = { x: 16, y: 30 };
  html += `<div class="an an-0" style="left:${ROOT.x}px;top:${ROOT.y}px;width:170px"><b>🌳 Mis tareas</b><small>${total} pendientes</small></div>`;
  for (const g of out) {
    const gx = 40, gy = y + 26;
    lin += `<path d="M${ROOT.x + 24} ${ROOT.y + 20} V${gy} H${gx}" stroke="${g.col}" opacity=".6"/>`;
    html += `<div class="an an-1" style="left:${gx}px;top:${gy}px;width:190px;--c:${g.col}"><b>${g.nom}</b><small>${g.cs.length} clientes · ${g.n} tareas</small></div>`;
    // reparte los clientes en columnas (cada uno va a la columna que menos ocupa)
    const bl = g.cs.map(bloque), x0 = 70, busY = gy + 34, alt = Array(cols).fill(gy + 50);
    for (const b of bl) {
      const k = alt.indexOf(Math.min(...alt)), bx = x0 + k * COLW, by = alt[k];
      alt[k] += b.alto + 22;
      const cn = b.nodos.find(n => n.tipo === 'c');
      lin += `<path d="M${bx - 18} ${busY} V${by + cn.y} H${bx}" stroke="${g.col}" opacity=".35"/>`;
      for (const [x1, y1, x2, y2, col, punt] of b.lineas) { const m = (x1 + x2) / 2;
        lin += `<path d="M${bx + x1} ${by + y1} C${bx + m} ${by + y1} ${bx + m} ${by + y2} ${bx + x2} ${by + y2}" stroke="${col}" ${punt ? 'stroke-dasharray="4 4"' : 'opacity=".8"'}/>`; }
      for (const n of b.nodos) {
        const L = bx + n.x, T = by + n.y;
        if (n.tipo === 't') html += `<button type="button" class="an an-t${n.t.id === mover ? ' moviendo' : ''}" data-atask="${esc(n.t.id)}" style="left:${L}px;top:${T}px;width:${CW[3]}px;--c:${n.col}" title="${esc(n.t.title)}"><span>${esc(n.t.title)}</span></button>`;
        else if (n.tipo === 'c') html += `<button type="button" class="an an-2${n.pleg ? ' pleg' : ''}" data-anodo="${esc(n.id)}" style="left:${L}px;top:${T}px;width:${CW[0]}px;--c:${n.col}"><b>${esc(n.txt)}</b><small>${esc(n.sub)}</small>${n.pleg ? '<i>＋</i>' : ''}</button>`;
        else html += `<div class="an an-${n.tipo === 'r' ? 3 : 4}${n.vacio ? ' vacio' : ''}${mover ? ' destino' : ''}" ${mover ? `data-adrop="${esc(b.cid)}|${n.drop}"` : ''} style="left:${L}px;top:${T}px;width:${CW[n.tipo === 'r' ? 1 : 2]}px;--c:${n.col}"><b>${esc(n.txt)}</b><small>${n.n}</small></div>`;
      }
    }
    lin += `<path d="M${x0 - 18} ${busY} H${x0 - 18 + (Math.min(cols, bl.length) - 1) * COLW}" stroke="${g.col}" opacity=".35"/>`;
    anchoT = Math.max(anchoT, x0 + Math.min(cols, bl.length) * COLW);
    y = Math.max(...alt) + 20;
  }
  const altoT = y + 20;
  return `<div class="arbol${mover ? ' arrastrando' : ''}" id="arbol"><div class="ar-lienzo" id="arLienzo" style="width:${anchoT}px;height:${altoT}px">
      <svg class="ar-lineas" width="${anchoT}" height="${altoT}" fill="none" stroke-width="2">${lin}</svg>${html}</div>
    ${mover ? '<div class="ar-aviso">Suéltala en una urgencia o en «Hoy / Resto» de su cliente</div>' : ''}
    <div class="ar-ctrl"><button type="button" data-azoom="1.25" aria-label="Acercar">＋</button><button type="button" data-azoom="0.8" aria-label="Alejar">－</button><button type="button" data-acentra aria-label="Ver todo">⤢</button>
      <button type="button" data-apleg="todo" title="Plegar todos los clientes">➖</button><button type="button" data-apleg="no" title="Desplegar todo">🌳</button></div></div>`;
}

// ----- mover y hacer zoom -----
function aplica() { const l = document.getElementById('arLienzo'); if (l && vista) l.style.transform = `translate(${vista.x}px,${vista.y}px) scale(${vista.z})`; }
function centra() {
  const a = document.getElementById('arbol'), l = document.getElementById('arLienzo'); if (!a || !l) return;
  const W = a.clientWidth, H = a.clientHeight, w = l.offsetWidth, h = l.offsetHeight, z = Math.max(0.6, Math.min(1, W / w, Math.max(H / h, 0.75)));
  vista = { x: Math.max(8, (W - w * z) / 2), y: h * z < H ? (H - h * z) / 2 : 8, z }; aplica();
}
function zoomEn(f, cx, cy) { const z = Math.max(0.2, Math.min(2.5, vista.z * f)), k = z / vista.z; vista = { x: cx - (cx - vista.x) * k, y: cy - (cy - vista.y) * k, z }; aplica(); }
let arr = null;   // arrastre de una tarea
function init() {
  const a = document.getElementById('arbol'); if (!a) return;
  if (!vista) centra(); else aplica();
  const ptrs = new Map(); let pin = null;
  a.addEventListener('pointerdown', e => {
    if (e.target.closest('.ar-ctrl')) return;
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
  a.addEventListener('wheel', e => { e.preventDefault(); const rc = a.getBoundingClientRect();
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
  O.toast(`${k === 'hoy' ? '☀️ Para hoy' : '🗂 Resto'}${u && O.URG[u] ? ' · ' + O.URG[u].icon + ' ' + O.URG[u].label : ''}`);
}
document.addEventListener('click', e => {
  if (!document.getElementById('arbol') || S._arSalto) return;
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
