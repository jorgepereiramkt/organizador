// 🎵 Música para el modo Foco: un reproductor de Spotify (el reproductor insertable oficial, gratis, sin claves).
// Vive fuera de la vista para que la música no se corte cuando el Foco se redibuja cada minuto.
// En Foco se ve entero; fuera de Foco, si suena algo, queda una pastilla pequeña abajo.
// Al acabar el bloque de trabajo, la pausa sola (se puede desactivar).
// Se guarda en S.plan.musica = { sel: clave, custom: [{k, n, uri}], parar: true }
(() => {
  const O = window.__org, S = O.S, esc = O.esc;
  const ESTILOS = [
    { k: 'focus', i: '🎧', n: 'Concentración', uri: 'spotify:playlist:37i9dQZF1DWZeKCadgRdKQ' },   // Deep Focus
    { k: 'lofi', i: '☕', n: 'Lo-fi', uri: 'spotify:playlist:37i9dQZF1DWWQRwui0ExPn' },             // lofi beats
    { k: 'regg', i: '🔥', n: 'Reggaetón actual', uri: 'spotify:playlist:37i9dQZF1DWY7IeIP1cdjF' },  // Baila Reggaeton
    { k: 'night', i: '🌃', n: 'Drive Night', uri: 'spotify:playlist:37i9dQZF1DX6GJXiuZRisr' },      // Night Rider
    { k: 'retro', i: '🌆', n: 'Retrowave', uri: 'spotify:playlist:37i9dQZF1DXdLEN7aqioXM' }         // Retrowave // Outrun
  ];
  const M = () => { S.plan = S.plan || {}; const m = S.plan.musica = S.plan.musica || {}; m.custom = m.custom || []; if (m.parar == null) m.parar = true; return m; };
  const todos = () => ESTILOS.concat(M().custom.map(c => ({ ...c, i: '⭐', mia: true })));
  const enFoco = () => S.view === 'dia' && S.diaMode === 'foco';
  const webDe = uri => 'https://open.spotify.com/' + uri.split(':').slice(1).join('/');
  // enlace de Spotify (o uri) → spotify:tipo:id
  const aUri = s => { s = String(s || '').trim();
    let m = s.match(/^spotify:(playlist|album|artist|track|show|episode):([A-Za-z0-9]+)$/); if (m) return `spotify:${m[1]}:${m[2]}`;
    m = s.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(playlist|album|artist|track|show|episode)\/([A-Za-z0-9]+)/); return m ? `spotify:${m[1]}:${m[2]}` : ''; };

  let ctrl = null, apiCargando = false, cargado = '', sonando = false, abierto = true, anadiendo = false, finBloque = null;
  const dock = document.createElement('div'); dock.id = 'musica'; dock.hidden = true;
  dock.innerHTML = '<div class="mu-cab"></div><div class="mu-player"><div id="muFrame"></div></div><div class="mu-pie"></div>';
  document.body.appendChild(dock);

  function pinta(){
    const m = M(), foco = enFoco();
    dock.hidden = !foco && !cargado;
    dock.classList.toggle('mini', !foco || !abierto);
    const sel = todos().find(e => e.k === m.sel);
    dock.querySelector('.mu-cab').innerHTML = `<button type="button" class="mu-tit" data-mu="abre" title="${abierto ? 'Plegar' : 'Desplegar'}">🎵 ${cargado && sel ? `${sel.i} ${esc(sel.n)}${sonando ? ' <i class="mu-eq"><b></b><b></b><b></b></i>' : ' · en pausa'}` : 'Música para el foco'}</button>
      ${cargado ? `<button type="button" class="mu-x" data-mu="pp" title="${sonando ? 'Pausar' : 'Reproducir'}">${sonando ? '⏸' : '▶'}</button><button type="button" class="mu-x" data-mu="quita" title="Quitar la música">✕</button>` : ''}`;
    dock.querySelector('.mu-pie').innerHTML = `<div class="mu-estilos">${todos().map(e => `<button type="button" class="chip${e.k === m.sel && cargado ? ' on' : ''}" data-mu-est="${esc(e.k)}">${e.i} ${esc(e.n)}${e.mia ? ` <span class="mu-del" data-mu-del="${esc(e.k)}" title="Quitar de la lista">×</span>` : ''}</button>`).join('')}
      <button type="button" class="chip mu-mas" data-mu="mas">＋ Tu playlist</button></div>
      ${anadiendo ? `<form class="mu-form" data-mu-form><input name="url" placeholder="Pega el enlace de Spotify (Compartir → Copiar enlace)" required><input name="n" placeholder="Nombre (p. ej. Mi Drive Night)" maxlength="30"><button class="btn">Guardar</button></form>` : ''}
      <label class="mu-op"><input type="checkbox" data-mu-parar ${m.parar ? 'checked' : ''}> Pausar al acabar el bloque</label>
      ${cargado && sel ? `<a class="mu-op" href="${webDe(sel.uri)}" target="_blank" rel="noopener">Abrir en la app de Spotify ↗</a>` : ''}`;
  }

  function api(cb){
    if (window.__spotifyApi) return cb(window.__spotifyApi);
    window.__spotifyEspera = (window.__spotifyEspera || []).concat(cb);
    if (apiCargando) return; apiCargando = true;
    window.onSpotifyIframeApiReady = A => { window.__spotifyApi = A; (window.__spotifyEspera || []).forEach(f => f(A)); window.__spotifyEspera = []; };
    const s = document.createElement('script'); s.src = 'https://open.spotify.com/embed/iframe-api/v1'; s.async = true;
    s.onerror = () => { apiCargando = false; O.toast('No he podido cargar Spotify. ¿Hay conexión?'); };
    document.head.appendChild(s);
  }
  function pon(e){
    const m = M(); m.sel = e.k; O.save(); abierto = true;
    if (ctrl){ ctrl.loadUri(e.uri); ctrl.play(); cargado = e.uri; return pinta(); }
    cargado = e.uri; pinta();
    api(A => A.createController(document.getElementById('muFrame'), { uri: e.uri, width: '100%', height: 152, theme: 'dark' }, c => {
      ctrl = c;
      c.addListener('ready', () => c.play());
      c.addListener('playback_update', ev => { const s = !ev.data.isPaused; if (s !== sonando){ sonando = s; pinta(); } });
      if (cargado !== e.uri) c.loadUri(cargado);
    }));
  }
  function quita(){
    if (ctrl){ try { ctrl.destroy(); } catch (e) {} ctrl = null; }
    cargado = ''; sonando = false;
    const p = dock.querySelector('.mu-player'); p.innerHTML = '<div id="muFrame"></div>';
    pinta();
  }

  dock.addEventListener('click', ev => {
    const del = ev.target.closest('[data-mu-del]');
    if (del){ ev.stopPropagation(); const m = M(), k = del.dataset.muDel; m.custom = m.custom.filter(c => c.k !== k); if (m.sel === k){ m.sel = ''; quita(); } O.save(); return pinta(); }
    const est = ev.target.closest('[data-mu-est]');
    if (est){ const e = todos().find(x => x.k === est.dataset.muEst); if (e) pon(e); return; }
    const b = ev.target.closest('[data-mu]'); if (!b) return;
    const a = b.dataset.mu;
    if (a === 'abre'){ if (!enFoco()){ S.view = 'dia'; S.diaMode = 'foco'; O.render(); } else abierto = !abierto; }
    if (a === 'pp' && ctrl) ctrl.togglePlay();
    if (a === 'quita') quita();
    if (a === 'mas') anadiendo = !anadiendo;
    pinta();
  });
  dock.addEventListener('submit', ev => {
    ev.preventDefault();
    const f = ev.target, uri = aUri(f.url.value);
    if (!uri) return O.toast('Ese enlace no parece de Spotify. En Spotify: ··· → Compartir → Copiar enlace');
    const e = { k: 'c' + Date.now().toString(36), n: f.n.value.trim() || 'Mi playlist', uri };
    M().custom.push(e); anadiendo = false; O.save(); pon(e);
  });
  dock.addEventListener('change', ev => { if (ev.target.matches('[data-mu-parar]')){ M().parar = ev.target.checked; O.save(); } });

  // cada segundo: mostrar/ocultar según la vista y pausar cuando acaba el bloque del Foco
  let antes = '';
  setInterval(() => {
    const est = enFoco() + '|' + !!cargado;
    if (est !== antes){ antes = est; pinta(); }
    const r = document.getElementById('foReloj');
    if (enFoco()) finBloque = r ? +r.dataset.fin : null;   // solo cuenta el bloque que tienes en marcha
    if (finBloque == null) return;
    const d = new Date(), now = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
    if (now < finBloque) return;
    finBloque = null;
    if (sonando && ctrl && M().parar){ ctrl.pause(); O.toast('⏹ Bloque terminado: música en pausa. ¡Buen trabajo!'); }
  }, 1000);
  pinta();
})();
