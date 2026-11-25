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
  const pincel = id => { const p = PINCELES.find(x => x.id === id) || PINCELES[2]; return { ...p, ...(ajustes[p.id] || {}) }; };

  /* ---------- Estilos ---------- */
  const css = document.createElement('style');
  css.textContent = `
  #pro { position: fixed; z-index: 11; right: 14px; top: 50%; transform: translateY(-50%); display: flex; align-items: center; gap: 10px; font-family: -apple-system, system-ui, sans-serif; }
  #proTog { width: 48px; height: 48px; border-radius: 16px; border: 1px solid rgba(0,0,0,.08); background: rgba(255,255,255,.94); box-shadow: 0 8px 28px rgba(0,0,0,.16); font-size: 22px; cursor: pointer; display: grid; place-items: center; }
  #proTog .sw { position: absolute; right: 6px; bottom: 6px; width: 12px; height: 12px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.15); }
  #proTog { position: relative; }
  #proPanel { width: 264px; max-height: min(78vh, 640px); overflow: auto; background: rgba(255,255,255,.96); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px);
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
  box.innerHTML = `<div id="proPanel" role="dialog" aria-label="Pinceles y fondo"></div><button id="proTog" type="button" title="Pinceles, colores y fondo" aria-label="Pinceles, colores y fondo">🎨<span class="sw"></span></button>`;
  document.body.appendChild(box);
  const panel = box.querySelector('#proPanel');

  function pinta(){
    const p = pincel(activo), trazo = !p.tool;
    const fondo = window.__pizFondo || '', tema = document.body.classList.contains('oscuro') ? 'oscuro' : '';
    panel.innerHTML = `
      <h4>Pinceles</h4>
      <div class="pz-pin">${PINCELES.map(x => { const q = pincel(x.id); return `<button type="button" data-p="${x.id}" class="${x.id === activo ? 'on' : ''}" title="${q.n}">${muestra(q)}<span>${q.e} ${q.n}</span></button>`; }).join('')}</div>
      ${trazo ? `
      <h4>Color</h4>
      <div class="pz-col">${COLORES.map(c => `<button type="button" data-c="${c}" class="${c.toLowerCase() === String(p.c).toLowerCase() ? 'on' : ''}" style="background:${c}" aria-label="Color ${c}"></button>`).join('')}<label title="Otro color"><input type="color" data-cc value="${/^#[0-9a-f]{6}$/i.test(p.c) ? p.c : '#000000'}"></label></div>
      <h4>Grosor</h4>
      <div class="pz-rng"><input type="range" data-w min="0.3" max="12" step="0.1" value="${p.w}"><b>${(+p.w).toFixed(1)}</b></div>
      <h4>Opacidad</h4>
      <div class="pz-rng"><input type="range" data-o min="10" max="100" step="5" value="${p.o}"><b>${p.o}%</b></div>
      <div class="pz-prev">${muestra(p, 220, 40)}</div>` : `<p class="pz-tip">${p.tool === 'laser' ? 'El láser dibuja un trazo rojo que se borra solo: ideal para señalar en una llamada.' : 'Pasa la goma por encima de lo que quieras borrar.'}</p>`}
      <h4>Fondo</h4>
      <div class="pz-fon">${FONDOS.map(f => `<button type="button" data-f="${f.id || 'blanco'}" class="${(f.tema ? tema === 'oscuro' : tema !== 'oscuro' && f.id === fondo) ? 'on' : ''}">${f.n}</button>`).join('')}</div>
      <p class="pz-tip">Con el Apple Pencil el trazo sigue la presión. Atajos: <b>P</b> pincel · <b>E</b> goma · <b>K</b> láser.</p>`;
    box.querySelector('.sw').style.background = p.tool ? (p.tool === 'laser' ? '#ff3b30' : '#ffc9c9') : p.c;
  }

  // Aplica el pincel a Excalidraw (lo siguiente que dibujes sale con este trazo)
  function usa(id, abrirHerramienta = true){
    const a = api(); if (!a) return;
    activo = id; LS.set('jp-board-pincel', id);
    const p = pincel(id);
    if (p.tool) a.setActiveTool({ type: p.tool });
    else {
      a.updateScene({ appState: { currentItemStrokeWidth: p.w, currentItemOpacity: p.o, currentItemStrokeColor: p.c, currentItemRoughness: 0 } });
      if (abrirHerramienta) a.setActiveTool({ type: 'freedraw' });
    }
    pinta();
  }
  function ajusta(cambio){
    const p = pincel(activo); if (p.tool) return;
    ajustes[activo] = { ...(ajustes[activo] || {}), ...cambio }; LS.set('jp-board-pinceles', ajustes);
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
  box.querySelector('#proTog').addEventListener('click', () => { box.classList.toggle('abierto'); pinta(); });
  panel.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.p) return usa(b.dataset.p);
    if (b.dataset.c) return ajusta({ c: b.dataset.c });
    if (b.dataset.f) return fondo(b.dataset.f);
  });
  panel.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.cc !== undefined) return ajusta({ c: t.value });
    if (t.dataset.w !== undefined){ t.nextElementSibling.textContent = (+t.value).toFixed(1); ajustes[activo] = { ...(ajustes[activo] || {}), w: +t.value }; }
    if (t.dataset.o !== undefined){ t.nextElementSibling.textContent = t.value + '%'; ajustes[activo] = { ...(ajustes[activo] || {}), o: +t.value }; }
    LS.set('jp-board-pinceles', ajustes);
    const a = api(), p = pincel(activo);
    if (a && !p.tool) a.updateScene({ appState: { currentItemStrokeWidth: p.w, currentItemOpacity: p.o } });
    const pv = panel.querySelector('.pz-prev'); if (pv) pv.innerHTML = muestra(p, 220, 40);
    const bt = panel.querySelector(`[data-p="${activo}"] svg`); if (bt) bt.outerHTML = muestra(p);
  });
  panel.addEventListener('change', e => { if (e.target.dataset.w !== undefined || e.target.dataset.o !== undefined) pinta(); });
  // Toca fuera del panel para cerrarlo (sin estorbar al dibujar)
  document.addEventListener('pointerdown', e => { if (box.classList.contains('abierto') && !box.contains(e.target)) box.classList.remove('abierto'); }, true);
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
