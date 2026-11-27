// Clientes → «🌳 Árbol»: todas tus tareas pendientes como un árbol en una pizarra infinita.
// Tus tareas → Agencia / Mis clientes → cada cliente → Hoy / Resto → 4 urgencias → tareas.
// Arrastra el fondo para moverte, rueda o pellizco para el zoom, toca una rama para plegarla y una tarea para abrirla.
(() => {
const O = window.__org, S = O.S, esc = O.esc;
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
const plegados = new Set(lsGet('jp-arbol-pleg', []));
let vista = lsGet('jp-arbol-vista', null);   // {x, y, z}
const UCOL = { super: '#FF3B30', alta: '#FF8A00', normal: '#F5B400', baja: '#34C759' };
const COLX = [0, 210, 420, 650, 800, 960];   // columnas por nivel
const ANCHO = [170, 170, 190, 120, 130, 300];

function datos() {
  const hoy = O.today();
  const T = O.visibleTasks().filter(t => !t.ia && t.status !== 'done');
  const esHoy = t => t.today === hoy || (S.slots && S.slots[t.id] && S.slots[t.id].day === hoy);
  const raiz = { id: 'r', nivel: 0, t: '🌳 Mis tareas', sub: `${T.length} pendientes`, hijos: [] };
  for (const [g, nom] of [['agency', '🏢 Agencia'], ['mine', '🔒 Mis clientes']]) {
    if (S.group !== 'all' && S.group !== g) continue;
    const cs = O.byClientOrder(S.clients.filter(c => c.group === g && !O.isApartado(c)));
    const ng = { id: 'g:' + g, nivel: 1, t: nom, hijos: [], col: g === 'mine' ? O.GROUP.mine.color : O.GROUP.agency.color };
    let tot = 0;
    for (const c of cs) {
      const ts = T.filter(t => O.cliEf(t) === c.id); if (!ts.length) continue;
      tot += ts.length;
      const cc = O.clientColor(c), nh = ts.filter(esHoy).length;
      const nc = { id: 'c:' + c.id, nivel: 2, t: (c.proyecto ? '📁 ' : '') + c.name, sub: `${ts.length} pendiente${ts.length > 1 ? 's' : ''}${nh ? ` · ${nh} hoy` : ''}`, col: cc, hijos: [] };
      for (const [k, nom2, f] of [['hoy', '☀️ Para hoy', esHoy], ['resto', '🗂 Resto', t => !esHoy(t)]]) {
        const sub = ts.filter(f);
        const nk = { id: `c:${c.id}:${k}`, nivel: 3, t: nom2, sub: String(sub.length), col: cc, hijos: [], vacio: !sub.length };
        for (const [u, info] of Object.entries(O.URG)) {
          const tu = sub.filter(t => (O.URG[t.priority] ? t.priority : 'normal') === u).sort(O.byOrder);
          const nu = { id: `c:${c.id}:${k}:${u}`, nivel: 4, t: `${info.icon} ${info.label}`, sub: String(tu.length), col: UCOL[u], hijos: [], vacio: !tu.length };
          nu.hijos = tu.map(t => ({ id: 't:' + t.id, tid: t.id, nivel: 5, t: t.title, col: UCOL[u], hijos: [], tarea: true }));
          nk.hijos.push(nu);
        }
        nc.hijos.push(nk);
      }
      ng.hijos.push(nc);
    }
    ng.sub = `${ng.hijos.length} clientes · ${tot} tareas`;
    if (ng.hijos.length) raiz.hijos.push(ng);
  }
  return raiz;
}
// Coloca cada nodo: las hojas una debajo de otra y cada padre a media altura de sus hijos
function coloca(n, y0) {
  const ALTO = n.tarea ? 40 : n.nivel === 4 ? 40 : 50;
  const hijos = plegados.has(n.id) ? [] : n.hijos;
  n.x = COLX[n.nivel]; n.w = ANCHO[n.nivel];
  if (!hijos.length) { n.y = y0 + ALTO / 2; return y0 + ALTO + (n.nivel <= 2 ? 14 : 0); }
  let y = y0;
  for (const h of hijos) y = coloca(h, y);
  n.y = (hijos[0].y + hijos[hijos.length - 1].y) / 2;
  return y + (n.nivel <= 2 ? 18 : 4);
}
function recorre(n, f, p) { f(n, p); if (!plegados.has(n.id)) for (const h of n.hijos) recorre(h, f, n); }

function arbol() {
  O.setToolbar('Clientes', 'tus tareas en árbol', '', 'Arrastra para moverte · rueda o pellizco para el zoom');
  const r = datos(); const alto = coloca(r, 0);
  let lineas = '', nodos = '';
  recorre(r, (n, p) => {
    if (p) { const x1 = p.x + p.w, y1 = p.y, x2 = n.x, y2 = n.y, m = (x1 + x2) / 2;
      lineas += `<path d="M${x1} ${y1} C${m} ${y1} ${m} ${y2} ${x2} ${y2}" stroke="${n.col || '#8E8E93'}" ${n.vacio ? 'stroke-dasharray="4 4" opacity=".35"' : 'opacity=".75"'}/>`; }
    const pleg = plegados.has(n.id) && n.hijos.length;
    if (n.tarea) nodos += `<button type="button" class="an an-t" data-atask="${esc(n.tid)}" style="left:${n.x}px;top:${n.y}px;width:${n.w}px;--c:${n.col}" title="${esc(n.t)}"><span>${esc(n.t)}</span></button>`;
    else nodos += `<button type="button" class="an an-${n.nivel}${n.vacio ? ' vacio' : ''}${pleg ? ' pleg' : ''}" data-anodo="${esc(n.id)}" style="left:${n.x}px;top:${n.y}px;width:${n.w}px;--c:${n.col || 'var(--accent)'}"${n.hijos.length ? '' : ' disabled'}>
      <b>${esc(n.t)}</b>${n.sub ? `<small>${esc(n.sub)}</small>` : ''}${pleg ? '<i>＋</i>' : ''}</button>`;
  });
  const anchoT = COLX[5] + ANCHO[5] + 40;
  return `<div class="arbol" id="arbol"><div class="ar-lienzo" id="arLienzo" style="width:${anchoT}px;height:${alto + 40}px">
      <svg class="ar-lineas" width="${anchoT}" height="${alto + 40}" fill="none" stroke-width="2">${lineas}</svg>${nodos}</div>
    <div class="ar-ctrl"><button type="button" data-azoom="1.25" aria-label="Acercar">＋</button><button type="button" data-azoom="0.8" aria-label="Alejar">－</button><button type="button" data-acentra aria-label="Ver todo">⤢</button>
      <button type="button" data-apleg="hoy" title="Plegar el «Resto» y ver solo lo de hoy">☀️</button><button type="button" data-apleg="no" title="Desplegar todo">🌳</button></div></div>`;
}

// ----- mover y hacer zoom -----
function aplica() { const l = document.getElementById('arLienzo'); if (l && vista) l.style.transform = `translate(${vista.x}px,${vista.y}px) scale(${vista.z})`; }
function guarda() { lsSet('jp-arbol-vista', vista); }
function centra() {
  const a = document.getElementById('arbol'), l = document.getElementById('arLienzo'); if (!a || !l) return;
  const W = a.clientWidth, H = a.clientHeight, w = l.offsetWidth, h = l.offsetHeight, z = Math.max(0.65, Math.min(1, W / w));   // que se lea: como mucho se aleja hasta 65 %
  vista = { x: Math.max(12, (W - w * z) / 2), y: h * z < H ? (H - h * z) / 2 : 12, z }; aplica(); guarda();
}
function zoomEn(f, cx, cy) {
  const z = Math.max(0.2, Math.min(2.5, vista.z * f)), k = z / vista.z;
  vista = { x: cx - (cx - vista.x) * k, y: cy - (cy - vista.y) * k, z }; aplica(); guarda();
}
function init() {
  const a = document.getElementById('arbol'); if (!a) return;
  if (!vista || !init.hecho) { init.hecho = true; centra(); } else aplica();
  const ptrs = new Map(); let pin = null, mov = false;
  a.addEventListener('pointerdown', e => {
    if (e.target.closest('.ar-ctrl')) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); mov = false;
    if (ptrs.size === 2) { const [p, q] = [...ptrs.values()]; pin = { d: Math.hypot(p.x - q.x, p.y - q.y), z: vista.z }; }
  });
  a.addEventListener('pointermove', e => {
    const prev = ptrs.get(e.pointerId); if (!prev) return;
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    if (ptrs.size === 1) { if (!mov && Math.hypot(dx, dy) < 4) return; mov = true; a.setPointerCapture?.(e.pointerId); vista.x += dx; vista.y += dy; aplica(); }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2 && pin) { const [p, q] = [...ptrs.values()], d = Math.hypot(p.x - q.x, p.y - q.y), rc = a.getBoundingClientRect();
      mov = true; zoomEn(pin.z * d / pin.d / vista.z, (p.x + q.x) / 2 - rc.left, (p.y + q.y) / 2 - rc.top); }
  });
  const fin = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pin = null; if (!ptrs.size) guarda(); };
  a.addEventListener('pointerup', fin); a.addEventListener('pointercancel', fin);
  a.addEventListener('click', e => { if (mov) { e.stopPropagation(); e.preventDefault(); mov = false; } }, true);   // al arrastrar no se abre nada
  a.addEventListener('wheel', e => { e.preventDefault(); const rc = a.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX) && !e.shiftKey && e.deltaMode === 0 && Math.abs(e.deltaY) >= 40) zoomEn(e.deltaY < 0 ? 1.12 : 0.89, e.clientX - rc.left, e.clientY - rc.top);
    else { vista.x -= e.deltaX; vista.y -= e.deltaY; aplica(); guarda(); } }, { passive: false });
  a.addEventListener('gesturestart', e => e.preventDefault());
}
document.addEventListener('click', e => {
  if (!document.getElementById('arbol')) return;
  const t = e.target.closest('[data-atask]'); if (t) { O.openEditor && O.openEditor(t.dataset.atask); return; }
  const n = e.target.closest('[data-anodo]'); if (n && !n.disabled) { const id = n.dataset.anodo; plegados.has(id) ? plegados.delete(id) : plegados.add(id); lsSet('jp-arbol-pleg', [...plegados]); return O.render(); }
  const zb = e.target.closest('[data-azoom]'); if (zb) { const a = document.getElementById('arbol'); return zoomEn(+zb.dataset.azoom, a.clientWidth / 2, a.clientHeight / 2); }
  if (e.target.closest('[data-acentra]')) return centra();
  const pl = e.target.closest('[data-apleg]');
  if (pl) { plegados.clear(); if (pl.dataset.apleg === 'hoy') S.clients.forEach(c => plegados.add(`c:${c.id}:resto`)); lsSet('jp-arbol-pleg', [...plegados]); O.render(); setTimeout(centra, 0); }
});

// Se engancha a la vista Clientes como un modo más
const antes = O.views.clientes, despues = antes.after;
O.views.clientes = function () { return S.clientMode === 'arbol' ? arbol() : antes(); };
O.views.clientes.after = function () { if (despues) despues(); if (S.clientMode === 'arbol') init(); };
})();
