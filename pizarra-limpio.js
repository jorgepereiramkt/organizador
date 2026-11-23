// «✨ Pasar a limpio»: convierte lo dibujado a mano con el lápiz en elementos editables.
//   letra a mano → texto (reconocedor de escritura de Google, gratis, sin clave)
//   cuadros y círculos → rectángulos y elipses · líneas con punta → flechas (enganchadas a los cuadros que tocan)
// Se usa desde pizarra.js: window.pasarALimpio(api) → { textos, formas, flechas, lineas } o lanza un error.
(() => {
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const pathLen = (p, i = 0, j = p.length - 1) => { let s = 0; for (let k = i + 1; k <= j; k++) s += dist(p[k - 1], p[k]); return s; };
  const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

  function info(e){
    const pts = e.points.map(p => [e.x + p[0], e.y + p[1]]);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts){ if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    const w = x1 - x0, h = y1 - y0, len = pathLen(pts);
    return { e, pts, x0, y0, x1, y1, w, h, len, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }

  // ¿Es un cuadro o un círculo cerrado y grande?
  function shapeOf(s){
    if (Math.min(s.w, s.h) < 45 || Math.max(s.w, s.h) < 70 || s.pts.length < 8) return null;
    const cierre = dist(s.pts[0], s.pts[s.pts.length - 1]);
    if (cierre > Math.max(25, 0.22 * Math.max(s.w, s.h)) || s.len < 1.6 * (s.w + s.h) * 0.8) return null;
    const a = s.w / 2, b = s.h / 2, r = 0.2 * Math.min(s.w, s.h);
    const esquinas = [[s.x0, s.y0], [s.x1, s.y0], [s.x0, s.y1], [s.x1, s.y1]].filter(c => s.pts.some(p => dist(p, c) < r)).length;
    let errE = 0; for (const [x, y] of s.pts) errE += Math.abs(Math.hypot((x - s.cx) / a, (y - s.cy) / b) - 1);
    errE /= s.pts.length;
    if (esquinas >= 3) return 'rectangle';
    if (errE < 0.22) return 'ellipse';
    return esquinas >= 2 ? 'rectangle' : 'ellipse';
  }

  // ¿Es una línea recta (con o sin punta de flecha dibujada en el mismo trazo)?
  function lineOf(s, medH){
    if (s.len < Math.max(60, 2.5 * medH)) return null;
    const p = s.pts, st = p[0];
    let tipI = 0, best = 0; p.forEach((q, i) => { const d = dist(st, q); if (d > best){ best = d; tipI = i; } });
    const tramo = pathLen(p, 0, tipI), cola = pathLen(p, tipI);
    if (tramo < 50 || best / tramo < 0.86) return null;
    const punta = cola > 8 && cola < 0.45 * tramo;          // volvió hacia atrás al final: punta dibujada de un tirón
    if (!punta && cola > 8) return null;
    return { a: st, b: p[tipI], headEnd: punta, headStart: false };
  }

  async function reconocer(grupo){
    const x0 = Math.min(...grupo.map(s => s.x0)), y0 = Math.min(...grupo.map(s => s.y0));
    const x1 = Math.max(...grupo.map(s => s.x1)), y1 = Math.max(...grupo.map(s => s.y1));
    let t = 0;
    const ink = [...grupo].sort((a, b) => a.x0 - b.x0).map(s => {
      const step = Math.max(1, Math.floor(s.pts.length / 150)), pts = s.pts.filter((_, i) => i % step === 0);
      const xs = [], ys = [], ts = []; pts.forEach(([x, y]) => { xs.push(Math.round(x - x0)); ys.push(Math.round(y - y0)); ts.push(t += 12); }); t += 200;
      return [xs, ys, ts];
    });
    const r = await fetch('https://inputtools.google.com/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ options: 'enable_pre_space', requests: [{ writing_guide: { writing_area_width: Math.round(x1 - x0) + 10, writing_area_height: Math.round(y1 - y0) + 10 }, ink, language: 'es' }] })
    });
    const j = await r.json();
    if (j[0] !== 'SUCCESS') throw new Error('el reconocedor no respondió');
    const txt = ((j[1] && j[1][0] && j[1][0][1]) || [])[0] || '';
    return { text: txt, x0, y0, x1, y1, color: grupo[0].e.strokeColor };
  }

  // Junta los trazos de letra en renglones (palabras cercanas en la misma altura)
  function renglones(ss, H){
    const par = ss.map((_, i) => i), find = i => par[i] === i ? i : (par[i] = find(par[i]));
    for (let i = 0; i < ss.length; i++) for (let j = i + 1; j < ss.length; j++){
      const a = ss[i], b = ss[j];
      const gx = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1)), gy = Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1));
      if (gx < 1.1 * H && gy < 0.45 * H) par[find(i)] = find(j);
    }
    const m = new Map(); ss.forEach((s, i) => { const r = find(i); if (!m.has(r)) m.set(r, []); m.get(r).push(s); });
    return [...m.values()];
  }

  window.pasarALimpio = async api => {
    const { convertToExcalidrawElements } = window.ExcalidrawLib;
    const sel = api.getAppState().selectedElementIds || {};
    const escena = api.getSceneElementsIncludingDeleted();
    const aMano = escena.filter(e => !e.isDeleted && e.type === 'freedraw' && e.points.length > 1);
    const haySel = aMano.some(e => sel[e.id]);          // si has seleccionado trazos, solo esos; si no, todos
    const trazos = aMano.filter(e => !haySel || sel[e.id]).map(info);
    if (!trazos.length) throw new Error(haySel ? 'en lo que has seleccionado no hay trazos a mano' : 'no hay nada dibujado a mano con el lápiz');

    const medH = median(trazos.filter(s => s.h < 150).map(s => s.h)) || 30, H = Math.max(medH, 18);
    const usados = new Set(), formas = [], flechas = [], textos = [];

    for (const s of trazos){ const t = shapeOf(s); if (t){ formas.push({ s, type: t, id: 'f' + formas.length }); usados.add(s); } }
    for (const s of trazos){
      if (usados.has(s)) continue;
      const l = lineOf(s, medH); if (!l) continue;
      flechas.push({ s, ...l }); usados.add(s);
    }
    // puntas de flecha dibujadas aparte (un trazo pequeño junto a un extremo)
    for (const f of flechas){
      for (const s of trazos){
        if (usados.has(s) || Math.max(s.w, s.h) > Math.max(60, 0.45 * dist(f.a, f.b))) continue;
        const c = [s.cx, s.cy], r = Math.max(30, Math.max(s.w, s.h));
        if (dist(c, f.b) < r){ f.headEnd = true; usados.add(s); }
        else if (dist(c, f.a) < r){ f.headStart = true; usados.add(s); }
      }
    }
    const letra = trazos.filter(s => !usados.has(s) && s.h <= Math.max(90, 2.6 * medH));
    const grupos = renglones(letra, H);
    const leidos = await Promise.all(grupos.map(g => reconocer(g).then(r => ({ ...r, g })).catch(() => null)));
    if (grupos.length && leidos.every(x => !x)) throw new Error('no he podido leer la letra (¿sin conexión?)');

    const dentro = (r, f) => { const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2; return cx > f.s.x0 && cx < f.s.x1 && cy > f.s.y0 && cy < f.s.y1; };
    const etiquetas = new Map();
    for (const r of leidos){
      if (!r || !r.text.trim()) continue;
      r.g.forEach(s => usados.add(s));
      const f = formas.find(f => dentro(r, f));
      if (f){ if (!etiquetas.has(f)) etiquetas.set(f, []); etiquetas.get(f).push(r); }
      else textos.push(r);
    }

    const sk = [];
    for (const f of formas){
      const lab = (etiquetas.get(f) || []).sort((a, b) => a.y0 - b.y0).map(r => r.text).join('\n');
      sk.push({ id: f.id, type: f.type, x: f.s.x0, y: f.s.y0, width: f.s.w, height: f.s.h, strokeColor: f.s.e.strokeColor, strokeWidth: 2, roughness: 0,
        ...(lab ? { label: { text: lab, fontSize: Math.min(36, Math.max(16, Math.round(H * 0.6))), fontFamily: 2 } } : {}) });
    }
    const pega = p => formas.find(f => p[0] > f.s.x0 - 30 && p[0] < f.s.x1 + 30 && p[1] > f.s.y0 - 30 && p[1] < f.s.y1 + 30);
    let nFlechas = 0, nLineas = 0;
    for (const f of flechas){
      const sf = pega(f.a), ef = pega(f.b), esFlecha = f.headEnd || f.headStart || (sf && ef && sf !== ef);
      esFlecha ? nFlechas++ : nLineas++;
      sk.push({ type: 'arrow', x: f.a[0], y: f.a[1], points: [[0, 0], [f.b[0] - f.a[0], f.b[1] - f.a[1]]], strokeColor: f.s.e.strokeColor, strokeWidth: 2, roughness: 0,
        endArrowhead: esFlecha && (f.headEnd || !f.headStart) ? 'arrow' : null, startArrowhead: f.headStart ? 'arrow' : null,
        ...(sf && sf !== ef ? { start: { id: sf.id } } : {}), ...(ef && sf !== ef ? { end: { id: ef.id } } : {}) });
    }
    for (const r of textos){
      const fs = Math.min(72, Math.max(14, Math.round((r.y1 - r.y0) * 0.7)));
      sk.push({ type: 'text', x: r.x0, y: r.y0 + Math.max(0, (r.y1 - r.y0 - fs * 1.25) / 2), text: r.text, fontSize: fs, fontFamily: 2, strokeColor: r.color });
    }
    if (!sk.length) throw new Error('no he reconocido nada que convertir');

    const nuevos = convertToExcalidrawElements(sk);
    const ids = new Set([...usados].map(s => s.e.id)), now = Date.now();
    const quitados = escena.filter(e => ids.has(e.id)).map(e => ({ ...e, isDeleted: true, version: e.version + 1, versionNonce: Math.floor(Math.random() * 2 ** 31), updated: now }));
    const resto = escena.filter(e => !ids.has(e.id));
    api.updateScene({
      elements: [...resto, ...quitados, ...nuevos],
      appState: { selectedElementIds: Object.fromEntries(nuevos.filter(e => !e.containerId).map(e => [e.id, true])) },
      commitToHistory: true
    });
    return { textos: textos.length + [...etiquetas.values()].reduce((a, x) => a + x.length, 0), formas: formas.length, flechas: nFlechas, lineas: nLineas, sinTocar: trazos.length - usados.size };
  };
})();
