// 🎵 Música para el modo Foco: el reproductor insertable oficial de Spotify (gratis, sin claves).
// Vive fuera de la vista para que la música no se corte cuando el Foco se redibuja cada minuto.
// En Foco se ve entero; fuera de Foco, si suena algo, queda una pastilla pequeña abajo.
// Al acabar el bloque de trabajo, la pausa sola (se puede desactivar).
// Modo «App de Spotify»: abre la playlist en tu app. Si conectas tu cuenta (Spotify para desarrolladores, gratis, con tu
// propio Client ID), el Organizador le da al play y la pausa solo (API oficial, inicio de sesión PKCE: sin clave secreta).
// Se guarda en S.plan.musica = { sel: clave, custom: [{k, n, uri}], parar: true, modo: 'app'|'web', clientId }
// El permiso de Spotify (token) se queda solo en cada dispositivo (localStorage «jp-spotify»).
(() => {
  const O = window.__org, S = O.S, esc = O.esc;
  const ESTILOS = [
    { k: 'focus', i: '🎧', n: 'Concentración', uri: 'spotify:playlist:37i9dQZF1DWZeKCadgRdKQ' },   // Deep Focus
    { k: 'lofi', i: '☕', n: 'Lo-fi', uri: 'spotify:playlist:37i9dQZF1DWWQRwui0ExPn' },             // lofi beats
    { k: 'regg', i: '🔥', n: 'Reggaetón actual', uri: 'spotify:playlist:37i9dQZF1DWY7IeIP1cdjF' },  // Baila Reggaeton
    { k: 'night', i: '🌃', n: 'Drive Night', uri: 'spotify:playlist:37i9dQZF1DX6GJXiuZRisr' },      // Night Rider
    { k: 'retro', i: '🌆', n: 'Retrowave', uri: 'spotify:playlist:37i9dQZF1DXdLEN7aqioXM' }         // Retrowave // Outrun
  ];
  const M = () => { S.plan = S.plan || {}; const m = S.plan.musica = S.plan.musica || {}; m.custom = m.custom || []; if (m.parar == null) m.parar = true; if (!m.modo) m.modo = 'app'; return m; };
  const todos = () => ESTILOS.concat(M().custom.map(c => ({ ...c, i: '⭐', mia: true })));
  const enFoco = () => S.view === 'dia' && S.diaMode === 'foco';
  const webDe = uri => 'https://open.spotify.com/' + uri.split(':').slice(1).join('/');
  // enlace de Spotify (o uri) → spotify:tipo:id
  const aUri = s => { s = String(s || '').trim();
    let m = s.match(/^spotify:(playlist|album|artist|track|show|episode):([A-Za-z0-9]+)$/); if (m) return `spotify:${m[1]}:${m[2]}`;
    m = s.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(playlist|album|artist|track|show|episode)\/([A-Za-z0-9]+)/); return m ? `spotify:${m[1]}:${m[2]}` : ''; };

  let enApp = '', pideId = false, dev = '', muestras = false, cargado = '', sonando = false, abierto = true, anadiendo = false, finBloque = null;
  const dock = document.createElement('div'); dock.id = 'musica'; dock.hidden = true;
  dock.innerHTML = '<div class="mu-cab"></div><div class="mu-player"></div><div class="mu-pie"></div>';
  document.body.appendChild(dock);

  function pinta(){
    const m = M(), foco = enFoco();
    dock.hidden = !foco && !cargado && !enApp;
    dock.classList.toggle('mini', !foco || !abierto);
    const sel = todos().find(e => e.k === m.sel);
    if (enApp && SP.ok()) dock.querySelector('.mu-cab').innerHTML = `<button type="button" class="mu-tit" data-mu="abre">🎵 ${sel ? `${sel.i} ${esc(sel.n)}` : 'Spotify'}${sonando ? ' <i class="mu-eq"><b></b><b></b><b></b></i>' : ' · en pausa'}${dev ? ` · ${esc(dev)}` : ''}</button>
      <button type="button" class="mu-x" data-mu="pp" title="${sonando ? 'Pausar' : 'Reproducir'}">${sonando ? '⏸' : '▶'}</button><button type="button" class="mu-x" data-mu="quita" title="Pausar y quitar">✕</button>`;
    else if (enApp) dock.querySelector('.mu-cab').innerHTML = `<button type="button" class="mu-tit" data-mu="abre">🎵 ${sel ? `${sel.i} ${esc(sel.n)}` : 'Música'} · en tu app de Spotify</button><button type="button" class="mu-x" data-mu="quita" title="Dejar de vigilar">✕</button>`;
    else dock.querySelector('.mu-cab').innerHTML = `<button type="button" class="mu-tit" data-mu="abre" title="${abierto ? 'Plegar' : 'Desplegar'}">🎵 ${cargado && sel ? `${sel.i} ${esc(sel.n)}${sonando ? ' <i class="mu-eq"><b></b><b></b><b></b></i>' : ' · en pausa'}` : 'Música para el foco'}</button>
      ${cargado ? `<button type="button" class="mu-x" data-mu="pp" title="${sonando ? 'Pausar' : 'Reproducir'}">${sonando ? '⏸' : '▶'}</button><button type="button" class="mu-x" data-mu="quita" title="Quitar la música">✕</button>` : ''}`;
    const app = m.modo === 'app';
    dock.querySelector('.mu-pie').innerHTML = `<div class="mu-modo"><span>Suena en:</span><button type="button" class="chip${app ? ' on' : ''}" data-mu-modo="app">🟢 App de Spotify</button><button type="button" class="chip${app ? '' : ' on'}" data-mu-modo="web">🌐 Aquí</button></div>
      <div class="mu-estilos">${todos().map(e => `<button type="button" class="chip${e.k === m.sel && (cargado || enApp) ? ' on' : ''}" data-mu-est="${esc(e.k)}">${e.i} ${esc(e.n)}${e.mia ? ` <span class="mu-del" data-mu-del="${esc(e.k)}" title="Quitar de la lista">×</span>` : ''}</button>`).join('')}
      <button type="button" class="chip mu-mas" data-mu="mas">＋ Tu playlist</button></div>
      ${anadiendo ? `<form class="mu-form" data-mu-form><input name="url" placeholder="Pega el enlace de Spotify (Compartir → Copiar enlace)" required><input name="n" placeholder="Nombre (p. ej. Mi Drive Night)" maxlength="30"><button class="btn">Guardar</button></form>` : ''}
      ${cargado && muestras ? `<div class="mu-aviso">Estás oyendo <b>muestras de 30 s</b>. Para tu Premium: <a href="https://accounts.spotify.com/login?continue=https%3A%2F%2Fopen.spotify.com%2F" target="_blank" rel="noopener">inicia sesión en Spotify</a> en este navegador y vuelve a darle al estilo.</div>` : ''}
      ${app ? (SP.ok() ? `<div class="mu-op">✅ Conectado a tu Spotify: suena en tu app con tu Premium. <button type="button" class="mu-lnk" data-mu="desco">Desconectar</button></div>`
        : `<div class="mu-op">Se abre la playlist en tu app de Spotify: dale a ▶ allí. Al acabar el bloque te aviso para pausarla.</div>
        <div class="mu-aviso">⚡ Para que el play y la pausa vayan solos: <button type="button" class="mu-lnk" data-mu="conecta">Conectar con Spotify</button>
        ${pideId ? `<ol class="mu-pasos"><li>Entra en <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener">developer.spotify.com/dashboard</a> con tu cuenta de Spotify y pulsa <b>Create app</b>.</li>
          <li>Nombre: <b>Organizador JP</b> (descripción, la que quieras). En <b>Redirect URIs</b> pega <code>${esc(REDIR)}</code> y pulsa Add. Marca <b>Web API</b>, acepta y guarda.</li>
          <li>Copia el <b>Client ID</b> y pégalo aquí:</li></ol>
          <form class="mu-form" data-mu-cid><input name="cid" placeholder="Client ID (32 letras y números)" required autocomplete="off"><button class="btn">Conectar</button></form>` : ''}</div>`) : ''}
      ${!app || SP.ok() ? `<label class="mu-op"><input type="checkbox" data-mu-parar ${m.parar ? 'checked' : ''}> Pausar al acabar el bloque</label>` : ''}
      ${!app && cargado && sel ? `<a class="mu-op" href="${webDe(sel.uri)}" target="_blank" rel="noopener">Abrir en la app de Spotify ↗</a>` : ''}`;
  }

  // reproductor insertable normal de Spotify (sin su script: pedía «eval», que la app no permite) y control por mensajes
  const manda = cmd => { const f = dock.querySelector('.mu-player iframe'); if (f && f.contentWindow) f.contentWindow.postMessage({ command: cmd }, '*'); };
  const ctrl = { pause: () => manda('pause'), play: () => manda('resume'), togglePlay: () => manda('toggle') };
  let listo = false;
  window.addEventListener('message', ev => {
    const f = dock.querySelector('.mu-player iframe');
    if (ev.origin !== 'https://open.spotify.com' || !f || ev.source !== f.contentWindow) return;
    const d = ev.data || {};
    if (d.type === 'ready'){ listo = true; if (porSonar){ porSonar = false; manda('play'); } }
    if (d.type === 'playback_update' && d.payload){
      const s = !d.payload.isPaused, mu = d.payload.duration > 0 && d.payload.duration <= 31000;   // sin sesión, Spotify solo da 30 s
      if (s !== sonando || mu !== muestras){ sonando = s; muestras = mu; pinta(); } }
  });
  let porSonar = false;
  function pon(e){
    const m = M(); m.sel = e.k; O.save(); abierto = true; cargado = e.uri; sonando = false; listo = false; porSonar = true;
    const p = dock.querySelector('.mu-player');
    p.innerHTML = `<iframe src="https://open.spotify.com/embed/${e.uri.split(':').slice(1).join('/')}?utm_source=iframe-api&theme=0" width="100%" height="152" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="eager" title="Spotify"></iframe>`;
    pinta();
  }
  /* ---------- Spotify (API oficial con tu cuenta) ---------- */
  const REDIR = location.origin + location.pathname.replace(/index\.html$/, '');
  const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const SP = {
    t: (() => { try { return JSON.parse(localStorage.getItem('jp-spotify')) || null; } catch (e) { return null; } })(),
    ok(){ return !!(this.t && this.t.r); },
    guarda(t){ this.t = t; try { t ? localStorage.setItem('jp-spotify', JSON.stringify(t)) : localStorage.removeItem('jp-spotify'); } catch (e) {} },
    async conecta(cid){
      const ver = b64u(crypto.getRandomValues(new Uint8Array(48))), st = b64u(crypto.getRandomValues(new Uint8Array(12)));
      const ch = b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ver)));
      try { sessionStorage.setItem('mu-sp', JSON.stringify({ ver, st, cid })); } catch (e) {}
      location.href = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({ response_type: 'code', client_id: cid, redirect_uri: REDIR,
        scope: 'user-read-playback-state user-modify-playback-state', code_challenge_method: 'S256', code_challenge: ch, state: st });
    },
    async pidetoken(body){
      const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.access_token) throw new Error(j.error_description || j.error || 'token');
      return j;
    },
    async vuelta(){   // al volver de Spotify con ?code=…
      const q = new URLSearchParams(location.search), code = q.get('code'), err = q.get('error');
      if (!code && !err) return;
      let g = null; try { g = JSON.parse(sessionStorage.getItem('mu-sp')); sessionStorage.removeItem('mu-sp'); } catch (e) {}
      if (!g || q.get('state') !== g.st) return;
      history.replaceState(null, '', REDIR);
      if (err) return O.toast('Spotify: no se ha conectado (' + err + ')');
      try {
        const j = await this.pidetoken({ grant_type: 'authorization_code', code, redirect_uri: REDIR, client_id: g.cid, code_verifier: g.ver });
        this.guarda({ a: j.access_token, r: j.refresh_token, exp: Date.now() + j.expires_in * 1000, cid: g.cid });
        M().modo = 'app'; S.view = 'dia'; S.diaMode = 'foco'; O.render(); pinta();
        O.toast('✅ Spotify conectado: elige un estilo y suena en tu app');
      } catch (e) { O.toast('Spotify: no se ha podido conectar (' + e.message + ')'); }
    },
    async token(){
      if (!this.ok()) throw new Error('sin conectar');
      if (this.t.exp - 60000 > Date.now()) return this.t.a;
      try {
        const j = await this.pidetoken({ grant_type: 'refresh_token', refresh_token: this.t.r, client_id: this.t.cid });
        this.guarda({ ...this.t, a: j.access_token, r: j.refresh_token || this.t.r, exp: Date.now() + j.expires_in * 1000 });
        return this.t.a;
      } catch (e) { this.guarda(null); pinta(); O.toast('Spotify se ha desconectado: vuelve a conectarlo en el Foco'); throw e; }
    },
    async api(method, path, body){
      const a = await this.token();
      return fetch('https://api.spotify.com/v1' + path, { method, headers: { Authorization: 'Bearer ' + a, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    },
    async estado(){
      if (!this.ok()) return;
      try {
        const r = await this.api('GET', '/me/player');
        if (r.status === 204){ if (sonando){ sonando = false; pinta(); } return; }
        if (!r.ok) return;
        const j = await r.json(), s = !!j.is_playing, d = (j.device && j.device.name) || '';
        if (s !== sonando || d !== dev){ sonando = s; dev = d; pinta(); }
      } catch (e) {}
    },
    async play(e){
      let r = await this.api('PUT', '/me/player/play', { context_uri: e.uri });
      if (r.status === 404){   // ningún dispositivo activo: busca tu app (el ordenador primero)
        const j = await (await this.api('GET', '/me/player/devices')).json().catch(() => ({}));
        const ds = j.devices || [], d = ds.find(x => x.is_active) || ds.find(x => x.type === 'Computer') || ds[0];
        if (!d){ abreUri(e.uri); O.toast('Abre la app de Spotify y vuelve a pulsar el estilo'); return false; }
        r = await this.api('PUT', '/me/player/play?device_id=' + d.id, { context_uri: e.uri });
      }
      if (r.status === 403){ O.toast('Spotify no deja controlarla (hace falta Premium en la cuenta conectada)'); return false; }
      if (!r.ok && r.status !== 202){ O.toast('Spotify no ha respondido bien (' + r.status + '). Prueba otra vez'); return false; }
      this.api('PUT', '/me/player/shuffle?state=true').catch(() => {});   // aleatorio, para no oír siempre lo mismo
      return true;
    },
    pausa(){ return this.api('PUT', '/me/player/pause').catch(() => {}); },
    sigue(){ return this.api('PUT', '/me/player/play').catch(() => {}); }
  };
  const abreUri = uri => { const a = document.createElement('a'); a.href = uri; document.body.appendChild(a); a.click(); a.remove(); };   // spotify:playlist:… abre la app

  async function abreApp(e){
    if (cargado) quita();
    M().sel = e.k; O.save();
    if (SP.ok()){
      try { if (await SP.play(e)){ enApp = e.uri; sonando = true; pinta(); setTimeout(() => SP.estado(), 1500); } } catch (er) {}
      return;
    }
    enApp = e.uri; abreUri(e.uri);
    pinta();
  }
  function quita(){
    if (enApp && SP.ok() && sonando) SP.pausa();
    enApp = '';
    cargado = ''; sonando = false; porSonar = false; muestras = false;
    dock.querySelector('.mu-player').innerHTML = '';
    pinta();
  }

  dock.addEventListener('click', ev => {
    const del = ev.target.closest('[data-mu-del]');
    if (del){ ev.stopPropagation(); const m = M(), k = del.dataset.muDel; m.custom = m.custom.filter(c => c.k !== k); if (m.sel === k){ m.sel = ''; quita(); } O.save(); return pinta(); }
    const est = ev.target.closest('[data-mu-est]');
    if (est){ const e = todos().find(x => x.k === est.dataset.muEst); if (e) (M().modo === 'app' ? abreApp : pon)(e); return; }
    const mo = ev.target.closest('[data-mu-modo]');
    if (mo){ M().modo = mo.dataset.muModo; O.save(); if (mo.dataset.muModo === 'app' && cargado) quita(); else if (mo.dataset.muModo === 'web') enApp = ''; return pinta(); }
    const b = ev.target.closest('[data-mu]'); if (!b) return;
    const a = b.dataset.mu;
    if (a === 'abre'){ if (!enFoco()){ S.view = 'dia'; S.diaMode = 'foco'; O.render(); } else abierto = !abierto; }
    if (a === 'pp'){ if (enApp && SP.ok()){ (sonando ? SP.pausa() : SP.sigue()).then(() => setTimeout(() => SP.estado(), 800)); sonando = !sonando; } else ctrl.togglePlay(); }
    if (a === 'conecta'){ if (M().clientId) return SP.conecta(M().clientId); pideId = !pideId; }
    if (a === 'desco'){ SP.guarda(null); enApp = ''; sonando = false; O.toast('Spotify desconectado en este dispositivo'); }
    if (a === 'quita') quita();
    if (a === 'mas') anadiendo = !anadiendo;
    pinta();
  });
  dock.addEventListener('submit', ev => {
    ev.preventDefault();
    const f = ev.target;
    if ('muCid' in f.dataset){
      const cid = f.cid.value.trim();
      if (!/^[0-9a-f]{32}$/i.test(cid)) return O.toast('El Client ID son 32 letras y números: cópialo entero de tu app de Spotify');
      M().clientId = cid; O.save(); pideId = false; return SP.conecta(cid);
    }
    const uri = aUri(f.url.value);
    if (!uri) return O.toast('Ese enlace no parece de Spotify. En Spotify: ··· → Compartir → Copiar enlace');
    const e = { k: 'c' + Date.now().toString(36), n: f.n.value.trim() || 'Mi playlist', uri };
    M().custom.push(e); anadiendo = false; O.save(); (M().modo === 'app' ? abreApp : pon)(e);
  });
  dock.addEventListener('change', ev => { if (ev.target.matches('[data-mu-parar]')){ M().parar = ev.target.checked; O.save(); } });

  // cada segundo: mostrar/ocultar según la vista y pausar cuando acaba el bloque del Foco
  let antes = '';
  setInterval(() => {
    const est = enFoco() + '|' + !!cargado + '|' + !!enApp;
    if (est !== antes){ antes = est; pinta(); }
    const r = document.getElementById('foReloj');
    if (enFoco()) finBloque = r ? +r.dataset.fin : null;   // solo cuenta el bloque que tienes en marcha
    if (finBloque == null) return;
    const d = new Date(), now = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
    if (now < finBloque) return;
    finBloque = null;
    if (enApp && SP.ok()){ if (sonando && M().parar){ SP.pausa(); sonando = false; pinta(); O.toast('⏹ Bloque terminado: Spotify en pausa. ¡Buen trabajo!'); } }
    else if (enApp) O.toast('⏹ Bloque terminado: pausa Spotify. ¡Buen trabajo!');
    else if (sonando && M().parar){ ctrl.pause(); O.toast('⏹ Bloque terminado: música en pausa. ¡Buen trabajo!'); }
  }, 1000);
  // con Spotify conectado, mira cada 10 s si suena (por si lo tocas desde la app)
  setInterval(() => { if (SP.ok() && (enApp || enFoco()) && document.visibilityState === 'visible') SP.estado(); }, 10000);
  SP.vuelta();
  pinta();
})();
