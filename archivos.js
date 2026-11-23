// Archivos y carpetas de tu ordenador vinculados a una tarea. NO se suben: la app guarda solo el nombre (sincronizado)
// y, en este equipo, un «acceso» del navegador (IndexedDB) para abrirlos. Funciona en Chrome/Edge de ordenador.
(() => {
  const O = window.__org, S = O.S, esc = O.esc;
  const puede = 'showOpenFilePicker' in window;
  const lista = id => ((S.plan && S.plan.tfiles) || {})[id] || [];
  const setLista = (id, arr) => { if (!S.plan) return; const m = S.plan.tfiles = S.plan.tfiles || {}; if (arr.length) m[id] = arr; else delete m[id]; O.save(); };

  /* ---------- Accesos guardados en este equipo (IndexedDB) ---------- */
  let dbP = null;
  const db = () => dbP || (dbP = new Promise((ok, ko) => { const r = indexedDB.open('jp-archivos', 1); r.onupgradeneeded = () => r.result.createObjectStore('h'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); }));
  const tx = async (modo, fn) => { const d = await db(); return new Promise((ok, ko) => { const t = d.transaction('h', modo), st = t.objectStore('h'), r = fn(st); t.oncomplete = () => ok(r && r.result); t.onerror = () => ko(t.error); }); };
  const putH = (k, h) => tx('readwrite', st => st.put(h, k));
  const getH = k => tx('readonly', st => st.get(k));
  const delH = k => tx('readwrite', st => st.delete(k));

  async function permiso(h){
    try { if ((await h.queryPermission({ mode: 'read' })) === 'granted') return true; return (await h.requestPermission({ mode: 'read' })) === 'granted'; }
    catch (e) { return false; }
  }
  const nuevoId = () => Math.random().toString(36).slice(2, 10);
  async function vincular(taskId, handles){
    const arr = [...lista(taskId)];
    for (const h of handles){
      if (arr.some(x => x.name === h.name && x.kind === h.kind)) continue;
      const id = nuevoId(); await putH(id, h);
      arr.push({ id, name: h.name, kind: h.kind === 'directory' ? 'dir' : 'file', at: Date.now() });
    }
    setLista(taskId, arr); pintar(taskId); O.render();
  }

  /* ---------- Abrir ---------- */
  const VISIBLE = /\.(pdf|png|jpe?g|gif|webp|svg|mp4|mov|webm|mp3|m4a|wav|txt|md|csv|json|html?)$/i;
  async function abrirArchivo(fh){
    const f = await fh.getFile(), url = URL.createObjectURL(f);
    if (VISIBLE.test(f.name)) window.open(url, '_blank');
    else { const a = document.createElement('a'); a.href = url; a.download = f.name; a.click(); O.toast('Este tipo no se ve en el navegador: se ha guardado una copia en Descargas'); }
    setTimeout(() => URL.revokeObjectURL(url), 60e3);
  }
  async function abrir(taskId, fileId){
    const it = lista(taskId).find(x => x.id === fileId); if (!it) return;
    if (!puede) return O.toast('Los archivos de tu ordenador solo se abren desde Chrome en el Mac');
    const h = await getH(fileId).catch(() => null);
    if (!h) return O.toast(`«${it.name}» está vinculado en otro equipo: vincúlalo también aquí`);
    if (!(await permiso(h))) return O.toast('Sin permiso para abrirlo');
    try { if (h.kind === 'directory') verCarpeta(h, [h]); else await abrirArchivo(h); }
    catch (e) { O.toast(`No encuentro «${it.name}»: ¿lo has movido o borrado? Vuelve a vincularlo`); }
  }

  /* ---------- Ver una carpeta ---------- */
  const dlg = document.createElement('dialog'); dlg.id = 'carpetaDlg';
  dlg.innerHTML = '<form method="dialog" class="sheet"><h2 id="cdTit"></h2><div class="cdlist" id="cdList"></div><div class="actions"><span class="sp"></span><button type="button" class="btn primary" data-cdclose>Cerrar</button></div></form>';
  document.body.appendChild(dlg);
  let ruta = [], entradas = [];
  async function verCarpeta(h, r){
    ruta = r; entradas = [];
    for await (const e of h.values()) entradas.push(e);
    entradas.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'es') : a.kind === 'directory' ? -1 : 1));
    dlg.querySelector('#cdTit').textContent = '📁 ' + ruta.map(x => x.name).join(' / ');
    dlg.querySelector('#cdList').innerHTML = (ruta.length > 1 ? '<button type="button" class="cdrow" data-cdup>⬆︎ Subir</button>' : '')
      + (entradas.filter(e => !e.name.startsWith('.')).map(e => `<button type="button" class="cdrow" data-cdi="${entradas.indexOf(e)}">${e.kind === 'directory' ? '📁' : '📄'} ${esc(e.name)}</button>`).join('') || '<p class="iahint">Carpeta vacía</p>');
    if (!dlg.open) dlg.showModal();
  }
  dlg.addEventListener('click', async e => {
    if (e.target === dlg || e.target.closest('[data-cdclose]')) return dlg.close();
    if (e.target.closest('[data-cdup]')) return verCarpeta(ruta[ruta.length - 2], ruta.slice(0, -1));
    const b = e.target.closest('[data-cdi]'); if (!b) return;
    const en = entradas[+b.dataset.cdi];
    try { if (en.kind === 'directory') await verCarpeta(en, [...ruta, en]); else await abrirArchivo(en); } catch (err) { O.toast('No se pudo abrir: ' + err.message); }
  });

  /* ---------- En el editor de la tarea ---------- */
  const edLinks = document.getElementById('edLinks');
  const caja = document.createElement('div'); caja.className = 'edfiles';
  edLinks.after(caja);
  let actual = null;
  function pintar(taskId){
    if (taskId !== actual) return;
    const fs = lista(taskId);
    caja.innerHTML = `<div class="fchips">${fs.map(f => `<span class="fchip"><a href="#" data-fopen="${esc(taskId)}|${f.id}" title="Abrir">${f.kind === 'dir' ? '📁' : '📎'} ${esc(f.name)}</a><button type="button" data-fdel="${f.id}" aria-label="Quitar">×</button></span>`).join('')}</div>
      <div class="fbtns"><button type="button" class="btn" data-fadd="file">📎 Vincular archivo</button><button type="button" class="btn" data-fadd="dir">📁 Vincular carpeta</button>
      <small>${puede ? 'No se sube nada: solo se abre desde este ordenador. También puedes arrastrarlos aquí.' : 'Vincular archivos del ordenador solo funciona en Chrome en el Mac.'}</small></div>`;
  }
  // se engancha al abrir el editor: el título del editor no cambia, así que se mira qué tarea es al mostrarse
  new MutationObserver(() => { const ed = document.getElementById('ed'); if (ed.open){ const id = O.editingId && O.editingId(); if (id && id !== actual){ actual = id; pintar(id); } } else actual = null; })
    .observe(document.getElementById('ed'), { attributes: true, attributeFilter: ['open'] });
  caja.addEventListener('click', async e => {
    const a = e.target.closest('[data-fadd]');
    if (a){
      if (!puede) return O.toast('Esto solo funciona en Chrome en el Mac');
      try {
        const hs = a.dataset.fadd === 'dir' ? [await window.showDirectoryPicker({ mode: 'read' })] : await window.showOpenFilePicker({ multiple: true });
        await vincular(actual, hs);
      } catch (err) { if (err.name !== 'AbortError') O.toast('No se pudo vincular: ' + err.message); }
      return;
    }
    const d = e.target.closest('[data-fdel]');
    if (d){ setLista(actual, lista(actual).filter(x => x.id !== d.dataset.fdel)); delH(d.dataset.fdel).catch(() => {}); pintar(actual); O.render(); }
  });
  // arrastrar archivos o carpetas desde el Finder al editor
  const edEl = document.getElementById('ed');
  edEl.addEventListener('dragover', e => { if (actual && [...(e.dataTransfer.types || [])].includes('Files')){ e.preventDefault(); caja.classList.add('over'); } });
  edEl.addEventListener('dragleave', e => { if (!edEl.contains(e.relatedTarget)) caja.classList.remove('over'); });
  edEl.addEventListener('drop', async e => {
    if (!actual || ![...(e.dataTransfer.types || [])].includes('Files')) return;
    e.preventDefault(); caja.classList.remove('over');
    const items = [...e.dataTransfer.items].filter(i => i.kind === 'file' && i.getAsFileSystemHandle);
    if (!items.length) return O.toast('Arrastrar archivos solo funciona en Chrome en el Mac');
    const hs = (await Promise.all(items.map(i => i.getAsFileSystemHandle()))).filter(Boolean);
    await vincular(actual, hs);
  });

  // abrir desde cualquier sitio (editor, tarjetas en Día, Semana…)
  document.addEventListener('click', e => {
    const o = e.target.closest('[data-fopen]'); if (!o) return;
    e.preventDefault(); e.stopPropagation();
    const [t, f] = o.dataset.fopen.split('|'); abrir(t, f);
  }, true);

  O.filesOf = lista; O.filesVincular = vincular; O.filesPuede = puede;
})();
