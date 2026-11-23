// 📒 Diario de clientes (vista Día → «Clientes»): cada mañana revisas el día de ayer de cada cliente.
// Por cliente: sus apartados (facturación, ROAS de Meta, leads…) con 🟢 buena / 🟡 media / 🔴 mala, un valor opcional
// y una nota. Abajo, el resumen del mes o del año con puntos de colores.
// Se guarda en S.plan.diario = { cfg: {cid: [claves]}, log: {día: {cid: {m: {clave: 'g'|'y'|'r'}, v: {clave: texto}, n: nota}}} }
(() => {
  const O = window.__org, S = O.S, esc = O.esc;
  const CAT = { f: 'Facturación', rm: 'ROAS Meta', rg: 'ROAS Google', inv: 'Inversión', rent: 'Rentabilidad general', l: 'Leads', cpl: 'Coste por lead', p: 'Pedidos' };
  const NIV = [['g', '🟢', 'Buena'], ['y', '🟡', 'Media'], ['r', '🔴', 'Mala']];
  // la inversión no es buena ni mala: alta / media / baja (en azules)
  const NIV_INV = [['g', '⬆️', 'Alta'], ['y', '➖', 'Media'], ['r', '⬇️', 'Baja']];
  const esInv = k => k === 'inv' || k === 'g';
  const nivDe = k => esInv(k) ? NIV_INV : NIV;
  const nombre = k => CAT[k] || (k.startsWith('x:') ? k.slice(2) : k);
  const D = () => { S.plan.diario = S.plan.diario || { cfg: {}, log: {} }; const d = S.plan.diario; d.cfg = d.cfg || {}; d.log = d.log || {}; return d; };
  const cfgDe = c => D().cfg[c.id] || ['f', 'rm'];
  const entrada = (day, cid, crear) => { const L = D().log; if (!L[day]){ if (!crear) return null; L[day] = {}; } if (!L[day][cid]){ if (!crear) return null; L[day][cid] = {}; } return L[day][cid]; };
  const limpia = (day, cid) => { const L = D().log, e = L[day] && L[day][cid]; if (!e) return;
    if (e.m && !Object.keys(e.m).length) delete e.m; if (e.v && !Object.keys(e.v).length) delete e.v; if (!e.n) delete e.n;
    if (!Object.keys(e).length) delete L[day][cid]; if (!Object.keys(L[day]).length) delete L[day]; };
  const poda = () => { const lim = O.iso(O.addDays(new Date(), -450)); for (const d in D().log) if (d < lim) delete D().log[d]; };
  let saveT = null; const guarda = () => { clearTimeout(saveT); saveT = setTimeout(() => { poda(); O.save(); }, 400); };

  const clientes = () => O.byClientOrder(S.clients.filter(c => (S.group === 'all' || c.group === S.group) && !O.isApartado(c) && c.estado !== 'interno'));
  const ayer = () => O.iso(O.addDays(new Date(), -1));
  const dia = () => S.diarioDay || ayer();
  const revisado = (day, c) => { const e = entrada(day, c.id); return !!(e && e.m && Object.keys(e.m).length); };

  /* ---------- Tarjeta de cada cliente ---------- */
  function tarjeta(c, day){
    const e = entrada(day, c.id) || {}, m = e.m || {}, ks = cfgDe(c);
    const prev = Object.keys(D().log).filter(d => d < day && D().log[d][c.id] && D().log[d][c.id].n).sort().reverse().slice(0, 5);
    return `<article class="dcard${revisado(day, c) ? ' ok' : ''}" data-dcid="${c.id}" style="--c:${O.clientColor(c)}">
      <header><i></i><b>${esc(c.name)}</b>${revisado(day, c) ? '<span class="dok">✓ Revisado</span>' : ''}<span class="sp"></span><button type="button" class="dcfg-btn" data-dcfg="${c.id}" title="Elegir qué apartados revisas de este cliente">⚙︎</button></header>
      ${S.diarioCfg === c.id ? cfgPanel(c) : ''}
      ${ks.map(k => `<div class="dmet"><span class="dlab">${esc(nombre(k))}</span>
        <div class="dniv${esInv(k) ? ' inv' : ''}">${nivDe(k).map(([n, ic, t]) => `<button type="button" class="dbt n-${n}${m[k] === n ? ' on' : ''}" data-dset="${c.id}|${esc(k)}|${n}" title="${t}">${esInv(k) ? ic : ''}<span>${t}</span></button>`).join('')}</div></div>`).join('')}
      <textarea class="dnote" data-dnote="${c.id}" rows="1" placeholder="✍️ Nota del día (opcional)…">${esc(e.n || '')}</textarea>
      ${prev.length ? `<details class="dprev"><summary>Notas anteriores (${prev.length})</summary>${prev.map(d => `<p><b>${O.fromIso(d).getDate()} ${O.MESES[O.fromIso(d).getMonth()].slice(0, 3)}</b> ${esc(D().log[d][c.id].n)}</p>`).join('')}</details>` : ''}
    </article>`;
  }
  function cfgPanel(c){
    const ks = cfgDe(c), extras = ks.filter(k => !CAT[k]);
    return `<div class="dcfg"><p>Qué revisas de <b>${esc(c.name)}</b>:</p>
      <div class="dcfg-l">${Object.entries(CAT).map(([k, t]) => `<label><input type="checkbox" data-dck="${k}" ${ks.includes(k) ? 'checked' : ''}> ${t}</label>`).join('')}
      ${extras.map(k => `<label><input type="checkbox" data-dck="${esc(k)}" checked> ${esc(nombre(k))}</label>`).join('')}</div>
      <div class="dcfg-add"><input data-dcnew placeholder="Otro apartado (ej.: Stock, Reseñas, Email)…" autocomplete="off"><button type="button" class="btn" data-dcadd>Añadir</button><span class="sp"></span><button type="button" class="btn primary" data-dcok>Listo</button></div></div>`;
  }

  /* ---------- Resumen del mes / año ---------- */
  const SC = { g: 2, y: 1, r: 0 }, col = avg => avg == null ? 'none' : avg >= 1.5 ? 'g' : avg >= 0.75 ? 'y' : 'r';
  function resumen(cs, day){
    const anual = S.diarioRes === 'ano', d0 = O.fromIso(day), y = d0.getFullYear(), mo = d0.getMonth();
    const nDias = new Date(y, mo + 1, 0).getDate();
    const dias = [...Array(nDias)].map((_, i) => `${y}-${O.pad(mo + 1)}-${O.pad(i + 1)}`);
    const titulo = anual ? `Año ${y}` : `${O.MESES[mo].replace(/^./, x => x.toUpperCase())} ${y}`;
    const fila = c => cfgDe(c).map(k => {
      let puntos, cuenta = { g: 0, y: 0, r: 0 };
      if (anual){
        puntos = [...Array(12)].map((_, i) => {
          const pre = `${y}-${O.pad(i + 1)}-`, vals = Object.keys(D().log).filter(d => d.startsWith(pre)).map(d => (((D().log[d][c.id] || {}).m) || {})[k]).filter(Boolean);
          vals.forEach(x => cuenta[x]++);
          const a = vals.length ? vals.reduce((s, x) => s + SC[x], 0) / vals.length : null;
          const L = nivDe(k);
          return `<i class="dot n-${col(a)}" title="${O.MESES[i]}: ${vals.length ? L.map(([n, , t]) => `${t} ${vals.filter(x => x === n).length}`).join(' · ') : 'sin datos'}"></i>`;
        }).join('');
      } else {
        puntos = dias.map(d => {
          const e = (D().log[d] || {})[c.id] || {}, n = (e.m || {})[k]; if (n) cuenta[n]++;
          const tip = `${O.fromIso(d).getDate()} ${O.MESES[mo].slice(0, 3)}${n ? ' · ' + nivDe(k).find(x => x[0] === n)[2] : ''}${e.n ? ' · 📝 ' + e.n : ''}`;
          return `<i class="dot n-${n || 'none'}${d === day ? ' hoy' : ''}${e.n ? ' nota' : ''}" data-dgo="${d}" title="${esc(tip)}"></i>`;
        }).join('');
      }
      const cnt = esInv(k) ? `Alta ${cuenta.g} · Media ${cuenta.y} · Baja ${cuenta.r}` : `🟢 ${cuenta.g} · 🟡 ${cuenta.y} · 🔴 ${cuenta.r}`;
      return `<div class="drow${esInv(k) ? ' inv' : ''}"><span class="dlab2">${esc(nombre(k))}</span><span class="dots${anual ? ' ano' : ''}">${puntos}</span><span class="dcnt">${cnt}</span></div>`;
    }).join('');
    return `<section class="dres"><header><h3>📊 Resumen · ${titulo}</h3><span class="sp"></span>
      <div class="modes"><button class="chip" data-dres="mes" aria-pressed="${!anual}">Mes</button><button class="chip" data-dres="ano" aria-pressed="${anual}">Año</button></div></header>
      ${anual ? '<p class="iahint">Cada punto es un mes: el color es la media de lo que marcaste ese mes.</p>' : '<p class="iahint">Cada punto es un día (toca uno para ir a ese día). Con borde: tiene nota.</p>'}
      ${cs.map(c => `<div class="dresc" style="--c:${O.clientColor(c)}"><b><i></i>${esc(c.name)}</b>${fila(c)}</div>`).join('') || '<p class="empty">Sin clientes</p>'}</section>`;
  }

  /* ---------- Vista ---------- */
  O.diarioView = function(){
    const day = dia(), d = O.fromIso(day), cs = clientes(), hechos = cs.filter(c => revisado(day, c)).length;
    const etiqueta = day === ayer() ? 'Ayer' : day === O.today() ? 'Hoy' : '';
    O.setToolbar('Diario de clientes', `${etiqueta ? etiqueta + ' · ' : ''}${O.DIAS_L[d.getDay()]} ${d.getDate()} ${O.MESES[d.getMonth()]}`,
      `<button class="icon" data-dday="-1" aria-label="Día anterior"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></button>
       <button class="chip" data-dday="0">Ayer</button>
       <button class="icon" data-dday="1" aria-label="Día siguiente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg></button>
       <div class="modes"><button class="chip" data-dmode="dia" aria-pressed="false">Día</button><button class="chip" data-dmode="semana" aria-pressed="false">Semana</button><button class="chip" data-dmode="diario" aria-pressed="true">📒 Clientes</button></div>
       <span class="dprog${hechos === cs.length && cs.length ? ' full' : ''}">Revisados ${hechos}/${cs.length}</span>`,
      'Cada mañana: revisa cómo fue ayer cada cliente');
    return `<div class="dgrid">${cs.map(c => tarjeta(c, day)).join('') || '<p class="empty">No hay clientes activos con este filtro.</p>'}</div>${resumen(cs, day)}`;
  };
  O.diarioAfter = () => {};

  /* ---------- Acciones ---------- */
  // marcar sin redibujar todo (así no se pierde lo que estés escribiendo en otra nota)
  function pintaTarjeta(cid){
    const el = document.querySelector(`.dcard[data-dcid="${CSS.escape(cid)}"]`), c = O.client(cid); if (!el || !c) return;
    const t = document.createElement('div'); t.innerHTML = tarjeta(c, dia()); el.replaceWith(t.firstElementChild);
    const cs = clientes(), h = cs.filter(x => revisado(dia(), x)).length, p = document.querySelector('.dprog');
    if (p){ p.textContent = `Revisados ${h}/${cs.length}`; p.classList.toggle('full', h === cs.length); }
    const r = document.querySelector('.dres'); if (r){ const t2 = document.createElement('div'); t2.innerHTML = resumen(cs, dia()); r.replaceWith(t2.firstElementChild); }
  }
  document.addEventListener('click', e => {
    if (S.view !== 'dia' || S.diaMode !== 'diario') return;
    const dd = e.target.closest('[data-dday]');
    if (dd){ const n = +dd.dataset.dday; S.diarioDay = n === 0 ? ayer() : O.iso(O.addDays(O.fromIso(dia()), n)); return O.render(); }
    const go = e.target.closest('[data-dgo]'); if (go){ S.diarioDay = go.dataset.dgo; O.render(); return scrollTo({ top: 0, behavior: 'smooth' }); }
    const rs = e.target.closest('[data-dres]'); if (rs){ S.diarioRes = rs.dataset.dres; return O.render(); }
    const st = e.target.closest('[data-dset]');
    if (st){
      const [cid, k, n] = st.dataset.dset.split('|'), en = entrada(dia(), cid, true); en.m = en.m || {};
      if (en.m[k] === n) delete en.m[k]; else en.m[k] = n;
      limpia(dia(), cid); guarda(); return pintaTarjeta(cid);
    }
    const cf = e.target.closest('[data-dcfg]'); if (cf){ S.diarioCfg = S.diarioCfg === cf.dataset.dcfg ? null : cf.dataset.dcfg; return pintaTarjeta(cf.dataset.dcfg); }
    const card = e.target.closest('.dcard'); if (!card) return;
    const cid = card.dataset.dcid, c = O.client(cid);
    if (e.target.closest('[data-dcadd]')){
      const inp = card.querySelector('[data-dcnew]'), t = inp.value.trim().slice(0, 30); if (!t) return;
      D().cfg[cid] = [...cfgDe(c), 'x:' + t]; guarda(); return pintaTarjeta(cid);
    }
    if (e.target.closest('[data-dcok]')){ S.diarioCfg = null; return pintaTarjeta(cid); }
  });
  document.addEventListener('change', e => {
    const ck = e.target.closest && e.target.closest('[data-dck]'); if (!ck) return;
    const card = ck.closest('.dcard'), cid = card.dataset.dcid, c = O.client(cid);
    let ks = cfgDe(c).filter(k => k !== ck.dataset.dck); if (ck.checked) ks.push(ck.dataset.dck);
    const orden = [...Object.keys(CAT), ...ks.filter(k => !CAT[k])]; ks = orden.filter(k => ks.includes(k));
    D().cfg[cid] = ks; guarda(); pintaTarjeta(cid);
  });
  document.addEventListener('input', e => {
    const n = e.target.closest && e.target.closest('[data-dnote]');
    if (n){ const en = entrada(dia(), n.dataset.dnote, true); en.n = n.value.slice(0, 2000); limpia(dia(), n.dataset.dnote); return guarda(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-dcnew]')){ e.preventDefault(); e.target.closest('.dcard').querySelector('[data-dcadd]').click(); } });
})();
