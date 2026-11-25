// 🎨 Panel «pro» de la pizarra: pinceles con distintos trazos, colores rápidos, grosor, opacidad,
// fondos (blanco, papel, cuadrícula, puntos, rayado, oscuro) y puntero láser. Todo sobre Excalidraw, sin servicios externos.
(() => {
  const api = () => window.__pizApi;
  const LS = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
               set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };

  // Pinceles: en Excalidraw el trazo a mano mide ~4 × grosor. El color de cada pincel se recuerda por separado.
  const PINCELES = [
    { id: 'boli',   n: 'Bolígrafo',  e: '✒️', w: 0.5, o: 100, c: '#1e1e1e' },
    { id: 'lapiz',  n: 'Lápiz',      e: '✏️', w: 0.7, o: 60,  c: '#495057' },
    { id: 'rotu',   n: 'Rotulador',  e: '🖊️', w: 1.5, o: 100, c: '#1971c2' },
    { id: 'pincel', n: 'Pincel',     e: '🖌️', w: 3,   o: 100, c: '#e8590c' },
    { id: 'gordo',  n: 'Marcador',   e: '🖍️', w: 6,   o: 100, c: '#2f9e44' },
    { id: 'subra',  n: 'Subrayador', e: '🟨', w: 5,   o: 30,  c: '#fab005' },
    { id: 'tiza',   n: 'Tiza',       e: '🩶', w: 2,   o: 45,  c: '#868e96' },
    { id: 'laser',  n: 'Láser',      e: '🔴', tool: 'laser' },
    { id: 'goma',   n: 'Goma',       e: '🧽', tool: 'eraser' },
  ];
  const COLORES = ['#1e1e1e', '#868e96', '#e03131', '#e8590c', '#fab005', '#2f9e44', '#12b886', '#1971c2', '#7048e8', '#c2255c', '#ffffff'];
  const FONDOS = [
    { id: '',       n: 'Blanco',     bg: '#ffffff' },
    { id: 'papel',  n: 'Papel',      bg: '#fbf6ea' },
    { id: 'cuadri', n: 'Cuadrícula', bg: '#ffffff', patron: true },
    { id: 'puntos', n: 'Puntos',     bg: '#ffffff', patron: true },
    { id: 'rayas',  n: 'Rayado',     bg: '#fffdf6', patron: true },
    { id: 'oscuro', n: 'Oscuro',     tema: 'dark' },
  ];
  let ajustes = LS.get('jp-board-pinceles', {});   // {id: {c, w, o}} lo que has cambiado de cada pincel
  let activo = LS.get('jp-board-pincel', 'rotu');
  // ⭐ Favoritos: pinceles guardados (pincel base + color, grosor y opacidad) en la barra de la derecha
  const FAV0 = [
    { b: 'boli', c: '#1e1e1e', w: 0.5, o: 100 }, { b: 'rotu', c: '#1971c2', w: 1.5, o: 100 }, { b: 'rotu', c: '#e03131', w: 1.5, o: 100 },
    { b: 'pincel', c: '#e8590c', w: 3, o: 100 }, { b: 'subra', c: '#fab005', w: 5, o: 30 }, { b: 'lapiz', c: '#495057', w: 0.7, o: 60 }];
  let favs = LS.get('jp-board-favs', FAV0), favOn = LS.get('jp-board-fav', -1), editFav = -1;
  const pincel = id => { const p = PINCELES.find(x => x.id === id) || PINCELES[2]; return { ...p, ...(ajustes[p.id] || {}) }; };

  /* ---------- Estilos ---------- */
  const css = document.createElement('style');
  css.textContent = `
  #pro { position: fixed; z-index: 11; right: 14px; top: 50%; transform: translateY(-50%); display: flex; align-items: center; gap: 10px; font-family: -apple-system, system-ui, sans-serif; pointer-events: none; }
  #proCol, #pro.abierto #proPanel { pointer-events: auto; }
  #pro:not(.abierto) #proPanel { visibility: hidden; transition: opacity .18s ease, transform .18s ease, visibility 0s .18s; }
  #proTog { width: 48px; height: 48px; border-radius: 16px; border: 1px solid rgba(0,0,0,.08); background: rgba(255,255,255,.94); box-shadow: 0 8px 28px rgba(0,0,0,.16); font-size: 22px; cursor: pointer; display: grid; place-items: center; }
  #proTog .sw { position: absolute; right: 6px; bottom: 6px; width: 12px; height: 12px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.15); }
  #proTog { position: relative; }
  #proPanel { box-sizing: border-box; width: 264px; max-height: min(78vh, 640px); overflow: auto; background: rgba(255,255,255,.96); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px);
    border: 1px solid rgba(0,0,0,.08); border-radius: 20px; box-shadow: 0 16px 48px rgba(0,0,0,.18); padding: 14px; color: #1e1e24;
    transform-origin: right center; transition: opacity .18s ease, transform .18s ease; }
  #pro:not(.abierto) #proPanel { opacity: 0; transform: scale(.96) translateX(8px); pointer-events: none; }
  #proPanel h4 { margin: 12px 2px 8px; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #8a8a96; font-weight: 700; }
  #proPanel h4:first-child { margin-top: 0; }
  .pz-pin { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .pz-pin button { border: 1px solid transparent; background: #f4f4f7; border-radius: 12px; padding: 6px 4px 5px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 2px; font: 600 11px -apple-system, system-ui, sans-serif; color: #3a3a44; }
  .pz-pin button svg { width: 64px; height: 22px; }
  .pz-pin button.on { background: #fff1ea; border-color: #ff5a1f; color: #c2410c; }
  .pz-col { display: flex; flex-wrap: wrap; gap: 7px; }
  .pz-col button { width: 24px; height: 24px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.14); cursor: pointer; padding: 0; }
  .pz-col button.on { box-shadow: 0 0 0 2px #ff5a1f; }
  .pz-col label { width: 24px; height: 24px; border-radius: 50%; background: conic-gradient(red, orange, yellow, lime, cyan, blue, magenta, red); box-shadow: 0 0 0 1px rgba(0,0,0,.14); cursor: pointer; position: relative; overflow: hidden; }
  .pz-col input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .pz-rng { display: flex; align-items: center; gap: 10px; font-size: 12px; color: #6b6b76; }
  .pz-rng input { flex: 1; accent-color: #ff5a1f; }
  .pz-rng b { width: 34px; text-align: right; color: #1e1e24; font-variant-numeric: tabular-nums; }
  .pz-prev { height: 44px; border-radius: 12px; background: #f7f7f9; margin-top: 8px; display: grid; place-items: center; }
  .pz-prev svg { width: 220px; height: 40px; }
  .pz-fon { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .pz-fon button { height: 44px; border-radius: 12px; border: 1px solid rgba(0,0,0,.1); cursor: pointer; font: 600 11px -apple-system, system-ui, sans-serif; color: #3a3a44; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 4px; background-color: #fff; }
  .pz-fon button.on { outline: 2px solid #ff5a1f; outline-offset: 1px; }
  .pz-fon [data-f="papel"] { background: #fbf6ea; }
  .pz-fon [data-f="cuadri"] { background-image: linear-gradient(#e3e6ec 1px, transparent 1px), linear-gradient(90deg, #e3e6ec 1px, transparent 1px); background-size: 10px 10px; }
  .pz-fon [data-f="puntos"] { background-image: radial-gradient(#c3c8d0 1.2px, transparent 1.3px); background-size: 9px 9px; }
  .pz-fon [data-f="rayas"] { background: #fffdf6; background-image: linear-gradient(transparent 9px, #d6e4f5 9px, #d6e4f5 10px); background-size: 100% 10px; }
  .pz-fon [data-f="oscuro"] { background: #1e1e24; color: #eee; }
  .pz-tip { font-size: 11px; color: #8a8a96; margin: 10px 2px 0; line-height: 1.35; }
  body.oscuro #proTog, body.oscuro #proPanel { background: rgba(30,30,34,.95); border-color: rgba(255,255,255,.08); color: #eee; }
  body.oscuro .pz-pin button { background: #2a2a31; color: #ddd; }
  body.oscuro .pz-pin button.on { background: #3a2218; color: #ffb08a; }
  body.oscuro .pz-prev { background: #2a2a31; }
  body.oscuro .pz-rng b { color: #eee; }
  #proCol { display: flex; flex-direction: column; align-items: center; gap: 8px; }
  #favs { display: flex; flex-direction: column; gap: 6px; padding: 6px; background: rgba(255,255,255,.94); border: 1px solid rgba(0,0,0,.08); border-radius: 18px; box-shadow: 0 8px 28px rgba(0,0,0,.14); max-height: 58vh; overflow-y: auto; }
  #favs:empty { display: none; }
  #favs button { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; touch-action: manipulation; }
  #favs button.edit { background: #fff1ea; box-shadow: inset 0 0 0 2px #ff5a1f; animation: pzlatir 1s ease-in-out infinite; }
  @keyframes pzlatir { 50% { transform: scale(.92); } }
  .pz-edit { display: flex; align-items: center; gap: 8px; background: #fff1ea; color: #c2410c; border-radius: 12px; padding: 8px 10px; font-size: 12px; font-weight: 600; margin-bottom: 10px; }
  .pz-edit span { flex: 1; }
  .pz-edit button { border: 0; border-radius: 8px; padding: 5px 9px; font: 600 11px -apple-system, system-ui, sans-serif; cursor: pointer; background: #ff5a1f; color: #fff; }
  .pz-edit button.sec { background: #fff; color: #c2410c; }
  body.oscuro .pz-edit { background: #3a2218; color: #ffb08a; }
  @media (prefers-reduced-motion: reduce) { #favs button.edit { animation: none; } }
  #favs button { width: 40px; height: 40px; border-radius: 12px; border: 0; background: transparent; cursor: pointer; display: grid; place-items: center; padding: 0; position: relative; }
  #favs button:hover { background: #f1f1f4; }
  #favs button.on { background: #fff1ea; box-shadow: inset 0 0 0 2px #ff5a1f; }
  #favs button i { display: block; border-radius: 50%; }
  #favs button small { position: absolute; right: 1px; bottom: 0; font-size: 11px; line-height: 1; }
  body.oscuro #favs { background: rgba(30,30,34,.95); border-color: rgba(255,255,255,.08); }
  body.oscuro #favs button:hover { background: #2a2a31; }
  .pz-favs { display: flex; flex-wrap: wrap; gap: 6px; }
  .pz-favs span { display: inline-flex; align-items: center; gap: 6px; background: #f4f4f7; border-radius: 99px; padding: 4px 6px 4px 8px; font-size: 11px; }
  .pz-favs span i { width: 12px; height: 12px; border-radius: 50%; display: block; }
  .pz-favs button { border: 0; background: none; cursor: pointer; color: #8a8a96; font-size: 13px; padding: 0 2px; }
  .pz-save { width: 100%; margin-top: 8px; border: 0; border-radius: 12px; padding: 9px; background: #1e1e24; color: #fff; font: 600 12px -apple-system, system-ui, sans-serif; cursor: pointer; }
  body.oscuro .pz-favs span { background: #2a2a31; }
  @media (max-width: 730px) { #favs { max-height: 40vh; } }
  @media (max-width: 730px) { #pro { top: auto; bottom: calc(env(safe-area-inset-bottom) + 84px); transform: none; right: 10px; align-items: flex-end; } #proPanel { width: min(264px, calc(100vw - 80px)); max-height: 60vh; } }
  @media (prefers-reduced-motion: reduce) { #proPanel { transition: none; } }`;
  document.head.appendChild(css);

  // Muestra del trazo: línea ondulada con el grosor, color y opacidad del pincel
  const muestra = (p, ancho = 64, alto = 22) => {
    if (p.tool === 'laser') return `<svg viewBox="0 0 ${ancho} ${alto}"><path d="M4 ${alto - 6} Q ${ancho / 2} 2 ${ancho - 6} ${alto / 2}" fill="none" stroke="#ff3b30" stroke-width="2.5" stroke-linecap="round" opacity=".85"/><circle cx="${ancho - 6}" cy="${alto / 2}" r="4" fill="#ff3b30"/></svg>`;
    if (p.tool === 'eraser') return `<svg viewBox="0 0 ${ancho} ${alto}"><rect x="${ancho / 2 - 12}" y="4" width="24" height="14" rx="4" fill="#ffc9c9" stroke="#e03131"/></svg>`;
    const g = Math.max(1.2, Math.min(alto - 4, p.w * 4.2));
    return `<svg viewBox="0 0 ${ancho} ${alto}"><path d="M6 ${alto * .62} C ${ancho * .3} ${alto * .05}, ${ancho * .55} ${alto * 1.05}, ${ancho - 6} ${alto * .38}" fill="none" stroke="${p.c}" stroke-width="${g}" stroke-linecap="round" opacity="${p.o / 100}"/></svg>`;
  };

  /* ---------- Panel ---------- */
  const box = document.createElement('div');
  box.id = 'pro';
  box.innerHTML = `<div id="proPanel" role="dialog" aria-label="Pinceles y fondo"></div><div id="proCol"><div id="favs" role="toolbar" aria-label="Pinceles favoritos"></div><button id="proTog" type="button" title="Pinceles, colores y fondo" aria-label="Pinceles, colores y fondo">🎨<span class="sw"></span></button></div>`;
  document.body.appendChild(box);
  const panel = box.querySelector('#proPanel');

  function pinta(){
    const p = pincel(activo), trazo = !p.tool;
    const fondo = window.__pizFondo || '', tema = document.body.classList.contains('oscuro') ? 'oscuro' : '';
    if (editFav >= favs.length) editFav = -1;
    panel.innerHTML = `
      ${editFav >= 0 ? `<div class="pz-edit"><span>✏️ Editando el favorito ${editFav + 1}: los cambios se guardan solos</span><button type="button" class="sec" data-favdel>Quitar</button><button type="button" data-favok>Listo</button></div>` : ''}
      <h4>Pinceles</h4>
      <div class="pz-pin">${PINCELES.map(x => { const q = pincel(x.id); return `<button type="button" data-p="${x.id}" class="${x.id === activo ? 'on' : ''}" title="${q.n}">${muestra(q)}<span>${q.e} ${q.n}</span></button>`; }).join('')}</div>
      ${trazo ? `
      <h4>Color</h4>
      <div class="pz-col">${COLORES.map(c => `<button type="button" data-c="${c}" class="${c.toLowerCase() === String(p.c).toLowerCase() ? 'on' : ''}" style="background:${c}" aria-label="Color ${c}"></button>`).join('')}<label title="Otro color"><input type="color" data-cc value="${/^#[0-9a-f]{6}$/i.test(p.c) ? p.c : '#000000'}"></label></div>
      <h4>Grosor</h4>
      <div class="pz-rng"><input type="range" data-w min="0.3" max="12" step="0.1" value="${p.w}"><b>${(+p.w).toFixed(1)}</b></div>
      <h4>Opacidad</h4>
      <div class="pz-rng"><input type="range" data-o min="10" max="100" step="5" value="${p.o}"><b>${p.o}%</b></div>
      <div class="pz-prev">${muestra(p, 220, 40)}</div>
      <button type="button" class="pz-save" data-guardar>⭐ Guardar este pincel en la barra</button>` : `<p class="pz-tip">${p.tool === 'laser' ? 'El láser dibuja un trazo rojo que se borra solo: ideal para señalar en una llamada.' : 'Pasa la goma por encima de lo que quieras borrar.'}</p>`}
      ${favs.length ? `<h4>Favoritos de la barra</h4><div class="pz-favs">${favs.map((f, i) => `<span><i style="background:${f.c};opacity:${Math.max(.35, f.o / 100)}"></i>${pincel(f.b).n} ${(+f.w).toFixed(1)}<button type="button" data-quitar="${i}" title="Quitar de la barra">✕</button></span>`).join('')}</div>` : ''}
      <h4>Fondo</h4>
      <div class="pz-fon">${FONDOS.map(f => `<button type="button" data-f="${f.id || 'blanco'}" class="${(f.tema ? tema === 'oscuro' : tema !== 'oscuro' && f.id === fondo) ? 'on' : ''}">${f.n}</button>`).join('')}</div>
      <p class="pz-tip">Con el Apple Pencil el trazo sigue la presión. Atajos: <b>P</b> pincel · <b>E</b> goma · <b>K</b> láser.</p>`;
    pintaFavs();
    box.querySelector('.sw').style.background = p.tool ? (p.tool === 'laser' ? '#ff3b30' : '#ffc9c9') : p.c;
  }

  // Si estás editando un favorito, cada cambio del panel se copia a ese favorito
  function syncFav(){
    if (editFav < 0 || !favs[editFav]) return;
    const p = pincel(activo); if (p.tool) return;
    favs[editFav] = { b: activo, c: p.c, w: p.w, o: p.o }; LS.set('jp-board-favs', favs); favOn = editFav; LS.set('jp-board-fav', favOn);
  }
  function editaFav(i){ usaFav(i); editFav = i; box.classList.add('abierto'); pinta(); }
  function pintaFavs(){
    const el = box.querySelector('#favs');
    el.innerHTML = favs.map((f, i) => { const base = pincel(f.b), d = Math.max(6, Math.min(26, f.w * 4.2 + 4));
      return `<button type="button" data-fav="${i}" class="${i === editFav ? 'edit' : i === favOn ? 'on' : ''}" title="Mantén pulsado para editar · "${base.n} · grosor ${(+f.w).toFixed(1)}${f.o < 100 ? ' · ' + f.o + '%' : ''}"><i style="width:${d}px;height:${d}px;background:${f.c};opacity:${Math.max(.35, f.o / 100)}"></i><small>${base.e}</small></button>`; }).join('');
  }
  function usaFav(i){
    const f = favs[i], a = api(); if (!f || !a) return;
    favOn = i; LS.set('jp-board-fav', i);
    activo = f.b; LS.set('jp-board-pincel', f.b);
    ajustes[f.b] = { ...(ajustes[f.b] || {}), c: f.c, w: f.w, o: f.o }; LS.set('jp-board-pinceles', ajustes);
    a.updateScene({ appState: { currentItemStrokeWidth: f.w, currentItemOpacity: f.o, currentItemStrokeColor: f.c, currentItemRoughness: 0 } });
    a.setActiveTool({ type: 'freedraw' });
    pinta();
  }
  // Aplica el pincel a Excalidraw (lo siguiente que dibujes sale con este trazo)
  function usa(id, abrirHerramienta = true){
    const a = api(); if (!a) return;
    activo = id; LS.set('jp-board-pincel', id); if (abrirHerramienta && editFav < 0){ favOn = -1; LS.set('jp-board-fav', -1); }
    const p = pincel(id);
    if (p.tool) a.setActiveTool({ type: p.tool });
    else {
      if (abrirHerramienta) syncFav();
      a.updateScene({ appState: { currentItemStrokeWidth: p.w, currentItemOpacity: p.o, currentItemStrokeColor: p.c, currentItemRoughness: 0 } });
      if (abrirHerramienta) a.setActiveTool({ type: 'freedraw' });
    }
    pinta();
  }
  function ajusta(cambio){
    const p = pincel(activo); if (p.tool) return;
    ajustes[activo] = { ...(ajustes[activo] || {}), ...cambio }; LS.set('jp-board-pinceles', ajustes); if (editFav < 0){ favOn = -1; LS.set('jp-board-fav', -1); }
    usa(activo);
  }

  /* ---------- Fondos (los de dibujo se pintan detrás del lienzo y se mueven con él) ---------- */
  const app = () => document.getElementById('app');
  let ultPatron = '';
  function patron(){
    const a = api(), f = window.__pizFondo || '', el = app();
    if (!a || !el) return;
    const def = FONDOS.find(x => x.id === f);
    if (!def || !def.patron || document.body.classList.contains('oscuro')){ if (ultPatron){ el.style.backgroundImage = ''; el.style.backgroundSize = ''; el.style.backgroundPosition = ''; ultPatron = ''; } return; }
    const s = a.getAppState(), z = s.zoom.value, paso = 24 * z, x = (s.scrollX * z) % paso, y = (s.scrollY * z) % paso;
    const clave = f + paso.toFixed(2) + x.toFixed(1) + y.toFixed(1);
    if (clave === ultPatron) return; ultPatron = clave;
    el.style.backgroundColor = def.bg;
    if (f === 'cuadri'){ el.style.backgroundImage = 'linear-gradient(#e6e9ef 1px, transparent 1px), linear-gradient(90deg, #e6e9ef 1px, transparent 1px)'; el.style.backgroundSize = `${paso}px ${paso}px`; }
    if (f === 'puntos'){ el.style.backgroundImage = `radial-gradient(#c1c7d0 ${Math.max(1, 1.4 * z)}px, transparent ${Math.max(1.1, 1.5 * z)}px)`; el.style.backgroundSize = `${paso}px ${paso}px`; }
    if (f === 'rayas'){ const r = paso * 1.25; el.style.backgroundImage = `linear-gradient(transparent ${r - 1}px, #d6e4f5 ${r - 1}px, #d6e4f5 ${r}px)`; el.style.backgroundSize = `100% ${r}px`; el.style.backgroundPosition = `0 ${(s.scrollY * z) % r}px`; return; }
    el.style.backgroundPosition = `${x}px ${y}px`;
  }
  function fondo(id){
    const a = api(); if (!a) return;
    if (id === 'oscuro'){ tema('dark'); return; }
    tema('light');
    const def = FONDOS.find(x => x.id === (id === 'blanco' ? '' : id)) || FONDOS[0];
    window.__pizFondo = def.id;
    a.updateScene({ appState: { viewBackgroundColor: def.patron ? 'transparent' : def.bg } });
    app().style.backgroundColor = def.bg || '#fff';
    ultPatron = '*'; patron(); pinta();
    window.__pizGuardar && window.__pizGuardar();
  }
  function tema(t){
    const a = api(); if (!a) return;
    LS.set('jp-board-theme-x', 1); try { localStorage.setItem('jp-board-theme', t); } catch (e) {}
    document.body.classList.toggle('oscuro', t === 'dark');
    a.updateScene({ appState: { theme: t } });
    if (t === 'dark'){ a.updateScene({ appState: { viewBackgroundColor: '#ffffff' } }); app().style.backgroundColor = '#121214'; }
    ultPatron = '*'; patron(); pinta();
  }

  /* ---------- Eventos ---------- */
  box.querySelector('#proTog').addEventListener('click', () => { box.classList.toggle('abierto'); if (!box.classList.contains('abierto')) editFav = -1; pinta(); });
  panel.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.p) return usa(b.dataset.p);
    if (b.dataset.c) return ajusta({ c: b.dataset.c });
    if (b.dataset.f) return fondo(b.dataset.f);
    if (b.dataset.guardar !== undefined){ const p = pincel(activo); if (p.tool) return;
      favs.push({ b: activo, c: p.c, w: p.w, o: p.o }); LS.set('jp-board-favs', favs); favOn = favs.length - 1; LS.set('jp-board-fav', favOn); pinta(); return; }
    if (b.dataset.favok !== undefined){ editFav = -1; box.classList.remove('abierto'); pinta(); return; }
    if (b.dataset.favdel !== undefined){ const i = editFav; editFav = -1; favs.splice(i, 1); LS.set('jp-board-favs', favs); favOn = -1; LS.set('jp-board-fav', -1); pinta(); return; }
    if (b.dataset.quitar !== undefined){ const i = +b.dataset.quitar; favs.splice(i, 1); LS.set('jp-board-favs', favs); if (favOn === i) favOn = -1; else if (favOn > i) favOn--; LS.set('jp-board-fav', favOn); pinta(); }
  });
  // Toque: usa el favorito. Mantener pulsado (medio segundo): lo abre para editarlo (pincel, color, grosor, opacidad)
  let larga = null, fueLarga = false;
  const favsEl = box.querySelector('#favs');
  favsEl.addEventListener('pointerdown', e => { const b = e.target.closest('[data-fav]'); if (!b) return; fueLarga = false; clearTimeout(larga);
    larga = setTimeout(() => { fueLarga = true; try { navigator.vibrate && navigator.vibrate(15); } catch (er) {} editaFav(+b.dataset.fav); }, 480); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(n => favsEl.addEventListener(n, () => clearTimeout(larga)));
  favsEl.addEventListener('contextmenu', e => e.preventDefault());
  favsEl.addEventListener('click', e => { const b = e.target.closest('[data-fav]'); if (!b) return;
    if (fueLarga){ fueLarga = false; return; }
    if (editFav >= 0){ editaFav(+b.dataset.fav); return; }
    usaFav(+b.dataset.fav); box.classList.remove('abierto'); });
  panel.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.cc !== undefined) return ajusta({ c: t.value });
    if (t.dataset.w !== undefined){ t.nextElementSibling.textContent = (+t.value).toFixed(1); ajustes[activo] = { ...(ajustes[activo] || {}), w: +t.value }; }
    if (t.dataset.o !== undefined){ t.nextElementSibling.textContent = t.value + '%'; ajustes[activo] = { ...(ajustes[activo] || {}), o: +t.value }; }
    LS.set('jp-board-pinceles', ajustes); syncFav();
    if (editFav >= 0) pintaFavs();
    const a = api(), p = pincel(activo);
    if (a && !p.tool) a.updateScene({ appState: { currentItemStrokeWidth: p.w, currentItemOpacity: p.o } });
    const pv = panel.querySelector('.pz-prev'); if (pv) pv.innerHTML = muestra(p, 220, 40);
    const bt = panel.querySelector(`[data-p="${activo}"] svg`); if (bt) bt.outerHTML = muestra(p);
  });
  panel.addEventListener('change', e => { if (e.target.dataset.w !== undefined || e.target.dataset.o !== undefined) pinta(); });
  // Toca fuera del panel para cerrarlo (sin estorbar al dibujar)
  document.addEventListener('pointerdown', e => { if (box.classList.contains('abierto') && !box.contains(e.target)){ box.classList.remove('abierto'); if (editFav >= 0){ editFav = -1; pintaFavs(); } } }, true);
  // Si eliges el lápiz de Excalidraw, se usa tu pincel activo
  let ultTool = '';
  function vigila(){
    const a = api();
    if (a){
      const t = a.getAppState().activeTool.type;
      if (t !== ultTool){
        if (t === 'freedraw' && pincel(activo).tool) usa('rotu', false);
        else if (t === 'freedraw') usa(activo, false);
        ultTool = t;
      }
      patron();
    }
    requestAnimationFrame(vigila);
  }

  /* ---------- Imágenes editables con el dedo (iPad con Apple Pencil) ----------
     Con el Pencil, Excalidraw entra en «modo lápiz» y los dedos no hacen nada si hay un pincel activo.
     Aquí: si tocas con el dedo una imagen (o lo que ya tienes seleccionado), pasa a «seleccionar» para moverla,
     ampliarla/reducirla o borrarla. En cuanto vuelves a escribir con el Pencil, recupera tu pincel. */
  let toolAntes = null, reenviando = false;
  const DIBUJO = new Set(['freedraw', 'eraser', 'laser', 'rectangle', 'diamond', 'ellipse', 'arrow', 'line', 'text', 'hand']);
  function aEscena(e){
    const a = api(), st = a.getAppState(), r = document.getElementById('app').getBoundingClientRect(), z = st.zoom.value;
    return { x: (e.clientX - r.left - (st.offsetLeft || 0)) / z - st.scrollX, y: (e.clientY - r.top - (st.offsetTop || 0)) / z - st.scrollY, z };
  }
  function tocaEditable(e){
    const a = api(), p = aEscena(e), m = 18 / p.z, sel = a.getAppState().selectedElementIds || {};
    return a.getSceneElements().some(el => {
      if (el.isDeleted || el.locked) return false;
      const x1 = Math.min(el.x, el.x + el.width), x2 = Math.max(el.x, el.x + el.width), y1 = Math.min(el.y, el.y + el.height), y2 = Math.max(el.y, el.y + el.height);
      const extra = sel[el.id] ? m : 0;   // lo seleccionado: también sus tiradores para ampliar/reducir
      return (el.type === 'image' || sel[el.id]) && p.x >= x1 - extra && p.x <= x2 + extra && p.y >= y1 - extra && p.y <= y2 + extra;
    });
  }
  // Reenvía el mismo toque cuando Excalidraw ya ha cambiado de herramienta
  function reenvia(e){
    const c = new PointerEvent('pointerdown', { pointerId: e.pointerId, pointerType: e.pointerType, clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY,
      pressure: e.pressure, width: e.width, height: e.height, isPrimary: e.isPrimary, button: 0, buttons: 1, bubbles: true, cancelable: true, composed: true });
    const t = e.target;
    setTimeout(() => { reenviando = true; try { t.dispatchEvent(c); } finally { reenviando = false; } }, 0);
  }
  window.addEventListener('pointerdown', e => {
    const a = api(); if (!a || reenviando) return;
    if (!e.target.closest || !e.target.closest('canvas')) return;
    const st = a.getAppState(), t = st.activeTool.type;
    if (e.pointerType === 'touch' && e.isPrimary && DIBUJO.has(t) && tocaEditable(e)){
      e.stopImmediatePropagation(); e.preventDefault();
      toolAntes = t; a.setActiveTool({ type: 'selection' }); reenvia(e);
    } else if (e.pointerType === 'pen' && toolAntes && t === 'selection' && !tocaEditable(e)){
      e.stopImmediatePropagation(); e.preventDefault();
      const vuelve = toolAntes; toolAntes = null;
      a.updateScene({ appState: { selectedElementIds: {} } });
      a.setActiveTool({ type: vuelve }); reenvia(e);
    } else if (e.pointerType === 'touch' && toolAntes && t === 'selection' && !tocaEditable(e)){
      a.updateScene({ appState: { selectedElementIds: {} } });   // tocar fuera con el dedo: deselecciona
    }
  }, { capture: true, passive: false });

  // Arranque: espera a que Excalidraw esté listo y aplica el fondo guardado de esta pizarra
  const espera = setInterval(() => {
    const a = api(); if (!a) return;
    clearInterval(espera);
    window.__pizFondo = window.__pizFondoIni || '';
    const def = FONDOS.find(x => x.id === window.__pizFondo);
    if (document.body.classList.contains('oscuro')) app().style.backgroundColor = '#121214';
    else if (def){ app().style.backgroundColor = def.bg; if (def.patron) a.updateScene({ appState: { viewBackgroundColor: 'transparent' } }); }
    const p = pincel(activo);
    if (!p.tool) a.updateScene({ appState: { currentItemStrokeWidth: p.w, currentItemOpacity: p.o, currentItemStrokeColor: p.c, currentItemRoughness: 0 } });
    pinta(); requestAnimationFrame(vigila);
  }, 150);
})();
