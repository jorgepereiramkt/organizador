// Vista de un cliente (al tocar su ficha): reuniones (calendario + las de Fathom que convirtió en tareas la IA),
// tareas pendientes y hechas, su diario y accesos a la pizarra y a editar la ficha.
(() => {
  const O = window.__org, S = O.S, esc = O.esc;
  const dlg = document.createElement('dialog'); dlg.id = 'cliView';
  dlg.innerHTML = '<div class="cv" id="cvBody"></div>'; document.body.appendChild(dlg);
  const body = dlg.querySelector('#cvBody');
  let cur = null, reus = null, cargando = false;
  const DIAS_ATRAS = 45, DIAS_ADELANTE = 14;

  const palabras = c => [...O.norm(c.name).split(/\s+/), ...String(c.keywords || '').split(',').map(w => O.norm(w.trim()))]
    .filter(w => w.length >= 4 && !/^(jorge|brand|retroaging|agency|media|marketing|personal|wear|motor|reformas)$/.test(w));
  const fechaTxt = d => { const x = O.fromIso(d); return `${O.DIAS_L[x.getDay()].slice(0, 3)} ${x.getDate()} ${O.MESES[x.getMonth()].slice(0, 3)}`; };
  const hm = m => `${O.pad(Math.floor(m / 60))}:${O.pad(m % 60)}`;

  // Reuniones del calendario: se miran los días de las últimas semanas y las próximas (con lo que la app puede leer)
  async function cargarReuniones(c){
    const ws = palabras(c); if (!ws.length || !O.fetchEvents) return [];
    const hoy = new Date(), dias = [];
    for (let i = -DIAS_ATRAS; i <= DIAS_ADELANTE; i++) dias.push(O.iso(O.addDays(hoy, i)));
    const out = [], seen = new Set();
    let k = 0;
    const worker = async () => { while (k < dias.length){ const d = dias[k++];
      let evs = []; try { evs = await O.fetchEvents(d); } catch (e) {}
      for (const e of evs){ if (e.allDay) continue; const t = O.norm(e.title || ''); if (!ws.some(w => t.includes(w))) continue;
        const key = d + '|' + e.title + '|' + e.start; if (seen.has(key)) continue; seen.add(key);
        out.push({ day: d, title: e.title, start: e.start, end: e.end, cal: e.cal || '', desc: e.desc || '' }); } } };
    await Promise.all([...Array(6)].map(worker));
    return out.sort((a, b) => (b.day + hm(b.start)).localeCompare(a.day + hm(a.start)));
  }

  function pinta(){
    const c = O.client(cur); if (!c) return;
    const info = O.fichaInfo ? O.fichaInfo(c) : {}, hoy = O.today();
    const ts = S.tasks.filter(t => t.client === c.id);
    const pend = ts.filter(t => t.status !== 'done').sort(O.byOrder), hechas = ts.filter(t => t.status === 'done' && t.doneAt && t.doneAt >= O.iso(O.addDays(new Date(), -21))).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
    // reuniones analizadas por la IA (Fathom → tareas): se agrupan por reunión
    const ia = {}; ts.filter(t => t.meeting).forEach(t => { (ia[t.meeting] = ia[t.meeting] || []).push(t); });
    const ahora = new Date().getHours() * 60 + new Date().getMinutes(), esFut = r => r.day > hoy || (r.day === hoy && r.end > ahora);
    const fut = (reus || []).filter(esFut), pas = (reus || []).filter(r => !esFut(r));
    const reuRow = r => `<li class="${r.day >= hoy ? 'fut' : ''}"><span class="cvd">${fechaTxt(r.day)} · ${hm(r.start)}–${hm(r.end)}</span><b>${esc(r.title)}</b>${r.cal ? `<small>${esc(r.cal)}</small>` : ''}</li>`;
    const D = (S.plan && S.plan.diario && S.plan.diario.log) || {};
    const dias = [...Array(14)].map((_, i) => O.iso(O.addDays(new Date(), -14 + i)));
    const notas = Object.keys(D).filter(d => D[d][c.id] && D[d][c.id].n).sort().reverse().slice(0, 6);
    const nivel = d => { const m = ((D[d] || {})[c.id] || {}).m || {}, v = Object.values(m); if (!v.length) return 'none'; const a = v.reduce((s, x) => s + ({ g: 2, y: 1, r: 0 })[x], 0) / v.length; return a >= 1.5 ? 'g' : a >= .75 ? 'y' : 'r'; };
    body.innerHTML = `
      <header class="cvh" style="--c:${O.clientColor(c)}">
        <div><h2>${esc(c.name)} ${c.tier ? `<span class="tier t-${c.tier}">${c.tier}</span>` : ''}</h2>
          <p>${c.group === 'mine' ? '🔒 Cliente propio' : '🏢 Agencia'}${info.fee ? ' · ' + esc(info.fee) + (c.group === 'mine' ? '/mes' : '') : ''}${(c.services || []).length ? ' · ' + c.services.map(s => esc(s.name)).join(', ') : ''}</p></div>
        <span class="sp"></span>
        <button type="button" class="btn" data-cvpiz>🖊️ Pizarra</button><button type="button" class="btn" data-cvedit>✏️ Editar ficha</button><button type="button" class="btn primary" data-cvclose>Cerrar</button>
      </header>
      <div class="cvgrid">
        <section class="cvs"><h3>📅 Reuniones <small>calendario · últimas ${DIAS_ATRAS / 7 | 0} semanas y próximas 2</small></h3>
          ${reus === null ? '<p class="iahint">Buscando en tus calendarios…</p>' : !reus.length ? `<p class="iahint">No encuentro reuniones con «${esc(palabras(c).join('», «') || c.name)}» en el título. Puedes añadir palabras clave en ✏️ Editar ficha.</p>` : ''}
          ${fut.length ? `<h4>Próximas</h4><ul class="cvl">${fut.slice().reverse().map(reuRow).join('')}</ul>` : ''}
          ${pas.length ? `<h4>Pasadas</h4><ul class="cvl">${pas.map(reuRow).join('')}</ul>` : ''}
          ${Object.keys(ia).length ? `<h4>🤖 Analizadas por la IA (Fathom)</h4>${Object.entries(ia).map(([m, l]) => `<div class="cvia"><b>📞 ${esc(m)}</b><ul>${l.map(t => `<li class="${t.status === 'done' ? 'done' : ''}">${t.status === 'done' ? '✓' : '○'} ${esc(t.title)}${t.iaNote ? `<small>${esc(t.iaNote)}</small>` : ''}</li>`).join('')}</ul></div>`).join('')}` : ''}
        </section>
        <section class="cvs"><h3>✅ Tareas <small>${pend.length} pendientes</small></h3>
          <div class="cvt">${pend.map(t => O.card(t, { client: true })).join('') || '<p class="iahint">Nada pendiente 👌</p>'}</div>
          ${hechas.length ? `<h4>Hechas (últimas 3 semanas)</h4><ul class="cvl done">${hechas.slice(0, 12).map(t => `<li><span class="cvd">${fechaTxt(t.doneAt)}</span>${esc(t.title)}</li>`).join('')}</ul>` : ''}
        </section>
        <section class="cvs"><h3>📒 Diario <small>últimas 2 semanas</small></h3>
          <div class="dots">${dias.map(d => `<i class="dot n-${nivel(d)}${D[d] && D[d][c.id] && D[d][c.id].n ? ' nota' : ''}" title="${fechaTxt(d)}${D[d] && D[d][c.id] && D[d][c.id].n ? ' · 📝 ' + esc(D[d][c.id].n) : ''}"></i>`).join('')}</div>
          ${notas.length ? `<ul class="cvl">${notas.map(d => `<li><span class="cvd">${fechaTxt(d)}</span>${esc(D[d][c.id].n)}</li>`).join('')}</ul>` : '<p class="iahint">Sin notas todavía. Se escriben en Día → 📒 Clientes.</p>'}
          <button type="button" class="btn" data-cvdiario>📒 Abrir el diario</button>
        </section>
      </div>`;
  }

  O.openCliente = async id => {
    cur = id; reus = null; pinta(); if (!dlg.open) dlg.showModal();
    const c = O.client(id); if (cargando) return; cargando = true;
    try { const r = await cargarReuniones(c); if (cur === id){ reus = r; pinta(); } } finally { cargando = false; }
  };
  // las tarjetas de tareas funcionan igual que en el tablero (completar, abrir, para hoy…)
  body.addEventListener('click', e => { if (e.target.closest('.card') && window.__cardClick) window.__cardClick(e); });
  dlg.addEventListener('click', e => {
    if (e.target === dlg || e.target.closest('[data-cvclose]')) return dlg.close();
    if (e.target.closest('[data-cvedit]')){ dlg.close(); return O.openFicha(cur); }
    if (e.target.closest('[data-cvdiario]')){ dlg.close(); S.view = 'dia'; S.diaMode = 'diario'; O.render(); return scrollTo(0, 0); }
    if (e.target.closest('[data-cvpiz]')){ const b = document.createElement('button'); b.dataset.pizarra = cur; b.hidden = true; document.body.appendChild(b); dlg.close(); b.click(); b.remove(); }
  });
  // si cambian las tareas mientras está abierta (marcar hecha, etc.), se actualiza
  const r0 = O.render; O.render = (...a) => { const x = r0(...a); if (dlg.open) pinta(); return x; };
})();
