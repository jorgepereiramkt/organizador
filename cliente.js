// Vista de un cliente (al tocar su ficha): reuniones (calendario + las de Fathom que convirtió en tareas la IA),
// tareas pendientes y hechas, su diario y accesos a la pizarra y a editar la ficha.
(() => {
  const O = window.__org, S = O.S, esc = O.esc;
  const dlg = document.createElement('dialog'); dlg.id = 'cliView';
  dlg.innerHTML = '<div class="cv" id="cvBody"></div>'; document.body.appendChild(dlg);
  const body = dlg.querySelector('#cvBody');
  let cur = null, reus = null, cargando = false;
  // Reuniones grabadas (Fathom): archivos «📞 AAAA-MM-DD HH:MM · título · cliente · id X» que deja la rutina en tu Drive
  let grab = null, grabAt = 0;
  async function cargarGrabadas(){
    const br = S.plan && S.plan.bridge; if (!br) return [];
    if (grab && grab.length && Date.now() - grabAt < 60e3) return grab;   // una lista vacía no se guarda: se vuelve a mirar
    const r = await fetch(br + '?a=reuniones'); const j = await r.json(); if (j.error) throw new Error(j.error);
    grab = (j.reuniones || []).map(f => { const n = f.name.replace(/^📞\s*/, '').split(' · ');
      const [fecha, hora] = (n[0] || '').split(' ');
      return { id: f.id, fecha, hora: hora || '', titulo: n[1] || '', cliente: (n.length > 3 ? n[2] : '') || '', rid: (n[n.length - 1] || '').replace(/^id\s*/, '') }; })
      .sort((a, b) => (b.fecha + b.hora).localeCompare(a.fecha + a.hora));
    grabAt = Date.now(); return grab;
  }
  const deCliente = (c, g) => O.norm(g.cliente) === O.norm(c.name) || (!g.cliente && palabras(c).some(w => O.norm(g.titulo).includes(w)));
  const grabDe = (c, r) => (grab || []).find(g => g.fecha === r.day && (deCliente(c, g) || palabras(c).some(w => O.norm(g.titulo).includes(w))) && (!g.hora || g.hora === '00:00' || Math.abs(toMin(g.hora) - r.start) <= 45));
  const toMin = h => { const [a, b] = String(h || '0:0').split(':').map(Number); return (a || 0) * 60 + (b || 0); };
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
    const reuRow = r => { const g = grabDe(c, r);
      return `<li class="${r.day >= hoy ? 'fut' : ''}"><span class="cvd">${fechaTxt(r.day)} · ${hm(r.start)}–${hm(r.end)}</span><b>${esc(r.title)}</b>${r.cal ? `<small>${esc(r.cal)}</small>` : ''}${g ? `<span class="cvbtns"><button type="button" class="chip" data-rver="${g.id}|r">📝 Resumen</button><button type="button" class="chip" data-rver="${g.id}|t">💬 Transcripción</button></span>` : ''}</li>`; };
    const usadas = new Set((reus || []).map(r => grabDe(c, r)).filter(Boolean).map(g => g.id));
    const solas = (grab || []).filter(g => deCliente(c, g) && !usadas.has(g.id));
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
          ${solas.length ? `<h4>🎙️ Grabadas en Fathom</h4><ul class="cvl">${solas.map(g => `<li><span class="cvd">${fechaTxt(g.fecha)}${g.hora && g.hora !== '00:00' ? ' · ' + g.hora : ''}</span><b>${esc(g.titulo)}</b><span class="cvbtns"><button type="button" class="chip" data-rver="${g.id}|r">📝 Resumen</button><button type="button" class="chip" data-rver="${g.id}|t">💬 Transcripción</button></span></li>`).join('')}</ul>` : ''}
          ${grab === null ? '' : !grab.length ? '<p class="iahint">🎙️ Los resúmenes y transcripciones de Fathom aparecerán aquí cuando la rutina los guarde (cada día laborable a las 14:00 y 20:00).</p>' : ''}
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

  const vis = document.createElement('dialog'); vis.id = 'reuVis';
  vis.innerHTML = '<div class="rv"><header><div><h2 id="rvTit"></h2><p id="rvSub"></p></div><span class="sp"></span><button type="button" class="btn primary" data-rvclose>Cerrar</button></header><div class="modes rvtabs"><button class="chip" data-rvtab="r">📝 Resumen</button><button class="chip" data-rvtab="t">💬 Transcripción</button></div><input id="rvBus" class="rvbus" placeholder="Buscar en la transcripción…" hidden><div id="rvBody" class="rvbody"></div></div>';
  document.body.appendChild(vis);
  const textos = {}; let rvCur = null, rvTab = 'r';
  const secc = (txt, n) => { const m = txt.split(/^=== (.+?) ===\s*$/m); for (let i = 1; i < m.length; i += 2) if (O.norm(m[i]).startsWith(n)) return m[i + 1].trim(); return ''; };
  function pintaVis(){
    const t = textos[rvCur] || '', cab = t.split(/^=== /m)[0], val = k => ((cab.match(new RegExp('^' + k + ':\\s*(.*)$', 'm')) || [])[1] || '').trim();
    vis.querySelector('#rvTit').textContent = val('titulo') || 'Reunión';
    vis.querySelector('#rvSub').innerHTML = [val('fecha') && fechaTxt(val('fecha')), val('hora') !== '00:00' && val('hora'), val('duracion_min') && val('duracion_min') + ' min', val('asistentes')].filter(Boolean).map(esc).join(' · ') + (val('enlace') ? ` · <a href="${esc(val('enlace'))}" target="_blank" rel="noopener">Ver en Fathom ↗</a>` : '');
    vis.querySelectorAll('[data-rvtab]').forEach(b => b.setAttribute('aria-pressed', b.dataset.rvtab === rvTab));
    const bus = vis.querySelector('#rvBus'); bus.hidden = rvTab !== 't';
    const body = vis.querySelector('#rvBody');
    if (!t){ body.innerHTML = '<p class="iahint">Cargando…</p>'; return; }
    if (rvTab === 'r'){
      const res = secc(t, 'resumen'), acc = secc(t, 'puntos');
      const md = t => esc(t).replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '$1').replace(/^#+\s*(.+)$/gm, '<h5>$1</h5>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\\#/g, '#').replace(/^\s*[-*]\s+/gm, '• ').replace(/\n/g, '<br>').replace(/<\/h5><br>/g, '</h5>');
      body.innerHTML = `<div class="rvres">${md(res || '(sin resumen)')}</div>${acc ? `<h4>✅ Puntos de acción</h4><div class="rvres">${md(acc)}</div>` : ''}`;
    } else {
      const q = O.norm(bus.value.trim()), lineas = secc(t, 'transcrip').split('\n').filter(l => l.trim());
      body.innerHTML = `<div class="rvtr">${lineas.filter(l => !q || O.norm(l).includes(q)).map(l => { const m = l.match(/^(\d[\d:]*)\s+([^:]{1,40}):\s*(.*)$/); return m ? `<p><span class="rvt">${esc(m[1])}</span><b>${esc(m[2])}</b> ${esc(m[3])}</p>` : `<p>${esc(l)}</p>`; }).join('') || '<p class="iahint">Nada.</p>'}</div>`;
    }
  }
  async function verReunion(id, tab){
    rvCur = id; rvTab = tab; pintaVis(); if (!vis.open) vis.showModal();
    if (!textos[id]){ try { const r = await fetch(S.plan.bridge + '?a=reunion&id=' + encodeURIComponent(id)); const j = await r.json(); if (j.error) throw new Error(j.error); textos[id] = j.text || ' '; } catch (e) { textos[id] = ''; vis.querySelector('#rvBody').innerHTML = `<p class="iahint">No se pudo abrir: ${esc(e.message)}</p>`; return; } }
    if (rvCur === id) pintaVis();
  }
  vis.addEventListener('click', e => {
    if (e.target === vis || e.target.closest('[data-rvclose]')) return vis.close();
    const t = e.target.closest('[data-rvtab]'); if (t){ rvTab = t.dataset.rvtab; pintaVis(); }
  });
  vis.querySelector('#rvBus').addEventListener('input', () => pintaVis());
  O.openCliente = async id => {
    cur = id; reus = null; pinta(); if (!dlg.open) dlg.showModal();
    const c = O.client(id); if (cargando) return; cargando = true;
    cargarGrabadas().then(() => { if (cur === id) pinta(); }).catch(() => { grab = grab || []; if (cur === id) pinta(); });
    try { const r = await cargarReuniones(c); if (cur === id){ reus = r; pinta(); } } finally { cargando = false; }
  };
  // las tarjetas de tareas funcionan igual que en el tablero (completar, abrir, para hoy…)
  body.addEventListener('click', e => { if (e.target.closest('.card') && window.__cardClick) window.__cardClick(e); });
  dlg.addEventListener('click', e => {
    if (e.target === dlg || e.target.closest('[data-cvclose]')) return dlg.close();
    const rv = e.target.closest('[data-rver]'); if (rv){ const [id, tab] = rv.dataset.rver.split('|'); return verReunion(id, tab); }
    if (e.target.closest('[data-cvedit]')){ dlg.close(); return O.openFicha(cur); }
    if (e.target.closest('[data-cvdiario]')){ dlg.close(); S.view = 'dia'; S.diaMode = 'diario'; O.render(); return scrollTo(0, 0); }
    if (e.target.closest('[data-cvpiz]')){ const b = document.createElement('button'); b.dataset.pizarra = cur; b.hidden = true; document.body.appendChild(b); dlg.close(); b.click(); b.remove(); }
  });
  // si cambian las tareas mientras está abierta (marcar hecha, etc.), se actualiza
  const r0 = O.render; O.render = (...a) => { const x = r0(...a); if (dlg.open) pinta(); return x; };
})();
