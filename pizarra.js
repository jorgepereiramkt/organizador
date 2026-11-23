// Pizarra infinita de cada cliente (Excalidraw). Se guarda como archivo en tu Google Drive a través de tu Apps Script.
(() => {
  const $ = s => document.querySelector(s);
  const q = new URLSearchParams(location.search), ID = q.get('c') || '';
  let st = {};
  try { st = JSON.parse(localStorage.getItem('jp-organizador-v1')) || {}; } catch (e) {}
  const BRIDGE = (st.plan && st.plan.bridge) || '';
  const cli = (st.clients || []).find(c => c.id === ID);
  const msg = t => { $('#msg').hidden = !t; $('#msg').textContent = t || ''; };
  const setSt = t => { $('#st').textContent = t; };
  const inFrame = window.parent !== window;

  if (!ID || !cli) return msg('No encuentro este cliente. Ábrela desde su ficha en el Organizador.');
  if (!BRIDGE) return msg('Falta conectar tu Apps Script (en Día → calendarios) para guardar las pizarras en tu Drive.');
  document.title = 'Pizarra · ' + cli.name;
  $('#nm').textContent = cli.name;
  $('#dot').style.background = cli.ccustom || cli.color || '#ff5a1f';

  /* ---------- Guardar / cargar en Drive (por el puente) ---------- */
  const LKEY = 'jp-board-' + ID, VKEY = 'jp-boardview-' + ID;
  let api = null, lastAt = 0, lastSig = '', saving = false, again = false, timer = null, drawing = false;

  const getBoard = async since => {
    const r = await fetch(BRIDGE + '?a=board&id=' + encodeURIComponent(ID) + (since ? '&since=' + since : ''));
    const j = await r.json(); if (j.error) throw new Error(j.error); return j;
  };
  const postBoard = async body => {
    const r = await fetch(BRIDGE, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) });
    const j = await r.json(); if (j.error) throw new Error(j.error); return j;
  };
  const parse = s => { try { const d = JSON.parse(s || '{}'); return { elements: d.elements || [], files: d.files || {}, bg: d.bg }; } catch (e) { return { elements: [], files: {} }; } };

  // Une dos versiones: de cada elemento se queda la más reciente (así no se pisa lo dibujado en otro dispositivo)
  function merge(a, b){
    const m = new Map(a.map(e => [e.id, e]));
    for (const e of b){ const x = m.get(e.id); if (!x || e.version > x.version || (e.version === x.version && e.versionNonce < x.versionNonce)) m.set(e.id, e); }
    return [...m.values()];
  }
  const r1 = n => Math.round(n * 10) / 10;
  function snapshot(){
    const semana = Date.now() - 7 * 864e5;
    const els = api.getSceneElementsIncludingDeleted()
      .filter(e => !(e.isDeleted && (e.updated || 0) < semana))
      .map(e => e.type === 'freedraw' ? { ...e, points: e.points.map(p => [r1(p[0]), r1(p[1])]), pressures: (e.pressures || []).map(r1) } : e);
    const used = new Set(els.filter(e => e.type === 'image' && !e.isDeleted).map(e => e.fileId)), all = api.getFiles(), files = {};
    used.forEach(id => { if (all[id]) files[id] = all[id]; });
    return { v: 1, elements: els, files, bg: api.getAppState().viewBackgroundColor };
  }
  const sig = els => els.reduce((a, e) => a + e.version * 31 + (e.isDeleted ? 7 : 0), els.length);

  async function save(){
    if (!api) return;
    if (saving){ again = true; return; }
    const els = api.getSceneElementsIncludingDeleted(), s = sig(els) + ':' + Object.keys(api.getFiles()).length;
    if (s === lastSig) return;
    saving = true; setSt('Guardando…');
    try {
      const data = snapshot(), txt = JSON.stringify(data);
      try { localStorage.setItem(LKEY, txt); } catch (e) {}
      let r = await postBoard({ a: 'boardsave', id: ID, base: lastAt, data: txt });
      if (r.conflict){                       // otro dispositivo guardó antes: se mezcla y se vuelve a guardar
        const rem = parse(r.data);
        applyRemote(rem);
        const d2 = JSON.stringify(snapshot());
        r = await postBoard({ a: 'boardsave', id: ID, base: r.at, data: d2 });
      }
      if (r.ok){ lastAt = r.at; lastSig = s; setSt('Guardado ✓'); }
    } catch (e) { setSt('Sin conexión: se guardará al volver'); }
    saving = false;
    if (again){ again = false; schedule(); }
  }
  const schedule = (ms = 1500) => { clearTimeout(timer); timer = setTimeout(save, ms); };

  function applyRemote(rem){
    if (!api) return;
    if (rem.files && Object.keys(rem.files).length) api.addFiles(Object.values(rem.files));
    const mixed = merge(api.getSceneElementsIncludingDeleted(), rem.elements);
    api.updateScene({ elements: mixed });
  }
  // Mira si hay cambios de otro dispositivo (al volver a la pestaña y cada 20 s si no estás dibujando)
  async function pull(){
    if (!api || saving || drawing || document.hidden) return;
    try {
      const r = await getBoard(lastAt);
      if (r.same || !r.data) return;
      applyRemote(parse(r.data)); lastAt = r.at;
      lastSig = sig(api.getSceneElementsIncludingDeleted()) + ':' + Object.keys(api.getFiles()).length;
      setSt('Actualizada ✓');
    } catch (e) {}
  }

  /* ---------- Arranque ---------- */
  async function start(){
    let data = { elements: [], files: {} };
    try {
      const r = await getBoard(0);
      data = parse(r.data); lastAt = r.at || 0;
    } catch (e) {
      const loc = localStorage.getItem(LKEY);
      if (!loc) return msg('No puedo abrir la pizarra: ' + e.message + '. Comprueba la conexión.');
      data = parse(loc); setSt('Sin conexión (copia de este dispositivo)');
    }
    let view = {};
    try { view = JSON.parse(localStorage.getItem(VKEY) || '{}'); } catch (e) {}
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    const { Excalidraw } = window.ExcalidrawLib;
    const el = React.createElement(Excalidraw, {
      excalidrawAPI: a => { api = a; },
      langCode: 'es-ES',
      theme: dark ? 'dark' : 'light',
      initialData: {
        elements: data.elements, files: data.files, scrollToContent: !view.zoom,
        appState: { viewBackgroundColor: data.bg || (dark ? '#121214' : '#ffffff'), currentItemFontFamily: 1,
          ...(view.zoom ? { scrollX: view.scrollX, scrollY: view.scrollY, zoom: { value: view.zoom } } : {}) }
      },
      UIOptions: { canvasActions: { loadScene: false, saveToActiveFile: false, export: { saveFileToDisk: true } } },
      onChange: (els, app) => {
        drawing = !!(app.draggingElement || app.editingElement || app.resizingElement);
        try { localStorage.setItem(VKEY, JSON.stringify({ scrollX: app.scrollX, scrollY: app.scrollY, zoom: app.zoom.value })); } catch (e) {}
        const s = sig(els);
        if (lastSig && s + ':' + Object.keys(api ? api.getFiles() : {}).length === lastSig) return;
        if (!drawing) schedule();
      }
    });
    ReactDOM.createRoot($('#app')).render(el);
    msg('');
    $('#bar').hidden = false;
    if (!$('#st').textContent || $('#st').textContent === '…') setSt('Guardado ✓');
    const waitApi = setInterval(() => { if (api){ clearInterval(waitApi); lastSig = sig(api.getSceneElementsIncludingDeleted()) + ':' + Object.keys(api.getFiles()).length; } }, 100);
    setInterval(pull, 20000);
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else pull(); });
  }

  async function cerrar(){
    clearTimeout(timer); await save();
    if (inFrame) window.parent.postMessage({ pizarra: 'close' }, location.origin);
    else if (history.length > 1) history.back(); else location.href = './';
  }
  $('#close').addEventListener('click', cerrar);
  window.addEventListener('pagehide', () => { clearTimeout(timer); save(); });
  start();
})();
