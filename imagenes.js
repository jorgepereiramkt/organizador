// Imágenes en las notas de una tarea: se pegan (⌘V) o se arrastran. Se reducen y se guardan en tu Google Drive
// (carpeta «Organizador · Imágenes», a través de tu Apps Script). En la app solo se guarda su id; en cada equipo
// se guarda una copia pequeña (IndexedDB) para no volver a descargarlas.
(() => {
  const O = window.__org, S = O.S, esc = O.esc;
  const lista = id => ((S.plan && S.plan.timgs) || {})[id] || [];
  const setLista = (id, arr) => { if (!S.plan) return; const m = S.plan.timgs = S.plan.timgs || {}; if (arr.length) m[id] = arr; else delete m[id]; O.save(); };
  const puente = () => S.plan && S.plan.bridge;

  /* ---------- Copia local (IndexedDB) ---------- */
  let dbP = null;
  const db = () => dbP || (dbP = new Promise((ok, ko) => { const r = indexedDB.open('jp-imagenes', 1); r.onupgradeneeded = () => r.result.createObjectStore('i'); r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); }));
  const tx = async (modo, fn) => { const d = await db(); return new Promise((ok, ko) => { const t = d.transaction('i', modo), r = fn(t.objectStore('i')); t.oncomplete = () => ok(r && r.result); t.onerror = () => ko(t.error); }); };
  const putL = (k, v) => tx('readwrite', s => s.put(v, k)).catch(() => {});
  const getL = k => tx('readonly', s => s.get(k)).catch(() => null);

  /* ---------- Reducir la imagen (máx. 1600 px, JPEG) ---------- */
  function reducir(file){
    return new Promise((ok, ko) => {
      const fr = new FileReader();
      fr.onerror = () => ko(new Error('no se pudo leer'));
      fr.onload = () => cargarImg(fr.result);
      fr.readAsDataURL(file);
      const cargarImg = url => { const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        ok({ data: c.toDataURL('image/jpeg', 0.82), w: c.width, h: c.height });
      };
      img.onerror = () => ko(new Error('no es una imagen'));
      img.src = url; };
    });
  }
  async function post(body){
    const r = await fetch(puente(), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) });
    const j = await r.json(); if (j.error) throw new Error(j.error); return j;
  }
  async function cargar(id){
    const loc = await getL(id); if (loc) return loc;
    const r = await fetch(puente() + '?a=img&id=' + encodeURIComponent(id)); const j = await r.json();
    if (j.error) throw new Error(j.error);
    const d = `data:${j.mime || 'image/jpeg'};base64,${j.data}`; putL(id, d); return d;
  }

  /* ---------- Subir ---------- */
  const subiendo = new Set();
  async function anadir(taskId, files){
    if (!puente()) return O.toast('Para guardar imágenes hace falta tu Apps Script conectado (Día → calendarios)');
    for (const f of files){
      const tmp = 'tmp' + Math.random().toString(36).slice(2, 8); subiendo.add(tmp); pintar(taskId);
      try {
        const r = await reducir(f), b64 = r.data.split(',')[1];
        const nombre = 'nota-' + new Date().toISOString().slice(0, 10) + '-' + tmp.slice(3) + '.jpg';
        const { id } = await post({ a: 'imgsave', data: b64, mime: 'image/jpeg', name: nombre });
        await putL(id, r.data);
        setLista(taskId, [...lista(taskId), { id, w: r.w, h: r.h, at: Date.now() }]);
      } catch (e) { O.toast('No se pudo guardar la imagen: ' + e.message); }
      subiendo.delete(tmp); pintar(taskId); O.render();
    }
  }

  /* ---------- En el editor ---------- */
  const ed = document.getElementById('ed'), notes = document.querySelector('#edForm [name=notes]');
  const caja = document.createElement('div'); caja.className = 'edimgs';
  notes.closest('label').after(caja);   // justo debajo de las notas
  let actual = null;
  function pintar(taskId){
    if (taskId !== actual) return;
    const im = lista(taskId);
    caja.innerHTML = im.map(x => `<span class="imth" data-imgid="${x.id}"><img alt="" data-imsrc="${x.id}"><button type="button" data-imgdel="${x.id}" aria-label="Quitar imagen">×</button></span>`).join('')
      + [...subiendo].map(() => '<span class="imth cargando">Subiendo…</span>').join('');
    caja.querySelectorAll('[data-imsrc]').forEach(async el => { try { el.src = await cargar(el.dataset.imsrc); } catch (e) { el.closest('.imth').classList.add('roto'); el.closest('.imth').title = 'No se pudo cargar: ' + e.message; } });
  }
  new MutationObserver(() => { if (ed.open){ const id = O.editingId && O.editingId(); if (id){ actual = id; pintar(id); } } else actual = null; })
    .observe(ed, { attributes: true, attributeFilter: ['open'] });
  notes.placeholder = 'Recursos, enlaces, lo que te han pasado para hacer esta tarea… (puedes pegar imágenes con ⌘V)';
  notes.addEventListener('paste', e => {
    const fs = [...(e.clipboardData && e.clipboardData.items || [])].filter(i => i.kind === 'file' && i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean);
    if (!fs.length || !actual) return;
    e.preventDefault(); anadir(actual, fs);
  });
  notes.addEventListener('dragover', e => { if ([...(e.dataTransfer.items || [])].some(i => i.type && i.type.startsWith('image/'))){ e.preventDefault(); e.stopPropagation(); notes.classList.add('over'); } });
  notes.addEventListener('dragleave', () => notes.classList.remove('over'));
  notes.addEventListener('drop', e => {
    const fs = [...(e.dataTransfer.files || [])].filter(f => f.type.startsWith('image/'));
    notes.classList.remove('over');
    if (!fs.length || !actual) return;
    e.preventDefault(); e.stopPropagation(); anadir(actual, fs);
  }, true);
  caja.addEventListener('click', async e => {
    const d = e.target.closest('[data-imgdel]');
    if (d){
      if (!confirm('¿Quitar esta imagen de la tarea? (se manda a la papelera de tu Drive)')) return;
      const id = d.dataset.imgdel; setLista(actual, lista(actual).filter(x => x.id !== id)); pintar(actual); O.render();
      post({ a: 'imgdel', id }).catch(() => {}); return;
    }
    const t = e.target.closest('[data-imgid]'); if (t) ver(t.dataset.imgid);
  });

  /* ---------- Ver en grande ---------- */
  const vis = document.createElement('dialog'); vis.id = 'imgVis'; vis.innerHTML = '<img alt="">'; document.body.appendChild(vis);
  vis.addEventListener('click', () => vis.close());
  async function ver(id){ try { vis.querySelector('img').src = await cargar(id); vis.showModal(); } catch (e) { O.toast('No se pudo abrir: ' + e.message); } }
  document.addEventListener('click', e => {
    const o = e.target.closest('[data-imgopen]'); if (!o) return;
    e.preventDefault(); e.stopPropagation();
    const im = lista(o.dataset.imgopen); if (im.length) ver(im[0].id);
  }, true);

  O.imgsOf = lista;
})();
