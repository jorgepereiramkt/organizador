// Planificador del día por bloques + Google Calendar (solo lectura).
// Reuniones del calendario, bloques fijos (comida, cena, deporte…) y bloques de trabajo generados en los huecos.
// Las tareas se arrastran a los bloques; eso no cambia su fecha ni toca ClickUp.
(() => {
const O = window.__org, S = O.S, $ = s => document.querySelector(s), esc = O.esc;

// ID de cliente OAuth (público) del proyecto organizador-jp. Se rellena al configurar Google Cloud.
const GCAL_CLIENT_ID = '59642019941-05m7v8u7o9n22ch98kl6rb491oggn6l9.apps.googleusercontent.com';
const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

const PLAN_DEFAULT = () => ({
  workStart: '09:00', workEnd: '19:00', minBlock: 25, maxBlock: 90,
  routines: [
    {id:'comida',  name:'Comida',  icon:'🍽️', start:'14:00', end:'15:00', days:[1,2,3,4,5,6,0], on:true},
    {id:'deporte', name:'Deporte', icon:'🏋️', start:'19:00', end:'20:00', days:[1,3,5], on:true},
    {id:'cena',    name:'Cena',    icon:'🌙', start:'21:00', end:'22:00', days:[1,2,3,4,5,6,0], on:true},
  ],
  accounts: [],          // [{email, cals:[{id, name, color, on}]}]
  morning: MORNING_DEFAULT(),
});
function MORNING_DEFAULT(){ return ['Revisar todos los clientes (uno a uno)', 'Revisar métricas y estadísticas', 'Revisar pagos y saldo de anuncios', 'Revisar mensajes (WhatsApp, email, Slack)', 'Organizar el día: colocar tareas en bloques']; }
if (!S.plan) S.plan = PLAN_DEFAULT();
const P = () => { S.plan = S.plan || PLAN_DEFAULT(); if (!S.plan.morning) S.plan.morning = MORNING_DEFAULT(); S.plan.morningDone = S.plan.morningDone || {}; return S.plan; };

let planDay = O.today();
O.planDay = () => planDay;
const toMin = hm => { const [h,m] = hm.split(':').map(Number); return h*60 + m; };
const toHM = m => `${O.pad(Math.floor(m/60))}:${O.pad(m%60)}`;
const dur = m => m >= 60 ? `${Math.floor(m/60)} h${m%60 ? ' ' + (m%60) + ' min' : ''}` : `${m} min`;

/* ---------- Google Calendar ---------- */
// Tokens solo en memoria/sesión (caducan en 1 h). Nunca se guardan en la nube.
const tokens = {};
try { Object.assign(tokens, JSON.parse(sessionStorage.getItem('jp-gcal-tokens') || '{}')); } catch(e){}
const saveTokens = () => { try { sessionStorage.setItem('jp-gcal-tokens', JSON.stringify(tokens)); } catch(e){} };
const tokenOk = email => email === 'puente' ? !!(S.plan && S.plan.bridge) : !!(tokens[email] && tokens[email].exp > Date.now() + 60e3);
/* ---------- Puente de Google (Apps Script en tu cuenta): lee calendarios y buzón sin pedir permisos cada hora ---------- */
async function bridge(params){
  const url = P().bridge; if (!url) throw new Error('sin puente');
  const r = await fetch(url + (url.includes('?') ? '&' : '?') + new URLSearchParams(params), {redirect: 'follow'});
  if (!r.ok) throw new Error('puente ' + r.status);
  const j = await r.json(); if (j.error) throw new Error(j.error); return j;
}
async function connectBridge(url){
  url = url.trim().replace(/\?.*$/, '');
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) throw new Error('la dirección debe acabar en /exec');
  P().bridge = url;
  try {
    const r = await bridge({a: 'calendars'});
    const plan = P(), prev = plan.accounts.find(a => a.email === 'puente');
    const prevOn = new Map((prev ? prev.cals : []).map(c => [c.id, c.on]));
    const cals = (r.calendars || []).map(c => ({id: c.id, name: c.name, color: c.color || '#8E8E93', on: prevOn.has(c.id) ? prevOn.get(c.id) : /jorgepereiramktdigital|leadfluence/i.test(c.id)}));
    plan.accounts = [{email: 'puente', bridge: true, cals}, ...plan.accounts.filter(a => a.email !== 'puente')];
    O.save(); clearCache();
  } catch(e){ P().bridge = null; throw e; }
}
O.bridge = bridge;
const evCache = {};     // `${email}|${day}` -> eventos
let gisReady = null;
function loadGis(){
  if (gisReady) return gisReady;
  gisReady = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => res(); s.onerror = () => { gisReady = null; rej(new Error('no se pudo cargar Google')); };
    document.head.appendChild(s);
  });
  return gisReady;
}
// Pide permiso de lectura del calendario a una cuenta (abre la ventanita de Google: necesita un clic)
async function authorize(hint){
  if (!GCAL_CLIENT_ID) throw new Error('falta configurar Google Calendar');
  await loadGis();
  return new Promise((res, rej) => {
    const tc = google.accounts.oauth2.initTokenClient({
      client_id: GCAL_CLIENT_ID, scope: GCAL_SCOPE, hint: hint || undefined, prompt: hint ? '' : 'select_account',
      callback: async r => {
        if (r.error) return rej(new Error(r.error));
        try {
          const me = await gapi('https://www.googleapis.com/calendar/v3/calendars/primary', r.access_token);
          const email = me.id;
          tokens[email] = {token: r.access_token, exp: Date.now() + (r.expires_in || 3600) * 1000}; saveTokens();
          res(email);
        } catch(e){ rej(e); }
      },
      error_callback: e => rej(new Error(e.type || 'cancelado')),
    });
    tc.requestAccessToken();
  });
}
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const INBOX_FOLDER = '📥 Tareas Organizador';
async function authorizeDrive(hint){
  await loadGis();
  return new Promise((res, rej) => {
    const tc = google.accounts.oauth2.initTokenClient({
      client_id: GCAL_CLIENT_ID, scope: DRIVE_SCOPE, hint: hint || undefined, prompt: hint ? '' : 'select_account',
      callback: async r => {
        if (r.error) return rej(new Error(r.error));
        try {
          const me = await gapi('https://www.googleapis.com/drive/v3/about?fields=user', r.access_token);
          const email = me.user.emailAddress;
          tokens[email + '|drive'] = {token: r.access_token, exp: Date.now() + (r.expires_in || 3600) * 1000}; saveTokens();
          res(email);
        } catch(e){ rej(e); }
      },
      error_callback: e => rej(new Error(e.type || 'cancelado')),
    });
    tc.requestAccessToken();
  });
}
async function connectDriveInbox(hint){
  const email = await authorizeDrive(hint);
  const q = encodeURIComponent(`name = '${INBOX_FOLDER}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  const r = await gapi(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, tokens[email + '|drive'].token);
  const f = (r.files || [])[0];
  if (!f) throw new Error(`no encuentro la carpeta «${INBOX_FOLDER}» en ${email}`);
  P().inbox = {type: 'drive', email, folderId: f.id};
  O.save(); return email;
}
async function gapi(url, token){
  const r = await fetch(url, {headers:{Authorization:'Bearer ' + token}});
  if (!r.ok) throw new Error('Google ' + r.status);
  return r.json();
}
async function connectAccount(hint){
  const email = await authorize(hint);
  const list = await gapi('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader', tokens[email].token);
  const plan = P();
  let acc = plan.accounts.find(a => a.email === email);
  const prevOn = new Map((acc ? acc.cals : []).map(c => [c.id, c.on]));
  const cals = (list.items || []).map(c => ({id:c.id, name:c.summaryOverride || c.summary, color:c.backgroundColor,
    on: prevOn.has(c.id) ? prevOn.get(c.id) : !!c.primary}));
  if (acc) acc.cals = cals; else plan.accounts.push(acc = {email, cals});
  O.save(); clearCache(); return email;
}
// Última versión de cada calendario: si Google pide permiso otra vez, se sigue viendo lo último que se leyó
const snapGet = (email, day) => { const s = ((P().evSnap || {})[email] || {})[day]; return s ? s.evs : []; };
const snapAt = email => { const d = (P().evSnap || {})[email]; return d ? Math.max(0, ...Object.values(d).map(x => x.at || 0)) : 0; };
function snapPut(email, day, evs){
  const all = P().evSnap = P().evSnap || {}, mine = all[email] = all[email] || {};
  const old = mine[day]; if (old && JSON.stringify(old.evs) === JSON.stringify(evs)) { old.at = Date.now(); return; }
  mine[day] = {at: Date.now(), evs};
  const min = O.iso(O.addDays(new Date(), -3)); for (const d in mine) if (d < min) delete mine[d];
  O.save();
}
const clearCache = () => { for (const k in evCache) delete evCache[k]; };
async function fetchEvents(day){
  const start = O.fromIso(day), end = O.addDays(start, 1);
  const out = [];
  await Promise.all(P().accounts.map(async acc => {
    const key = acc.email + '|' + day;
    if (evCache[key]) return out.push(...evCache[key]);
    if (!tokenOk(acc.email)) return out.push(...snapGet(acc.email, day));
    // si hay puente, las demás cuentas solo se usan para calendarios que el puente no ve
    if (!acc.bridge && P().bridge){ const seenIds = new Set(((P().accounts.find(a => a.bridge) || {}).cals || []).map(c => c.id)); if (acc.cals.filter(c => c.on).every(c => seenIds.has(c.id))) return; }
    if (acc.bridge){
      const ids = acc.cals.filter(c => c.on).map(c => c.id); if (!ids.length) return;
      const r = await bridge({a: 'events', day, cals: ids.join(',')});
      const evs = (r.events || []).map(e => {
        const tt = O.norm(e.title || '');
        const isCall = e.guests > 0 || !!e.meet || /<>|\breu\b|reunion|llamada|\bcall\b|meet|zoom|entrevista|☎|📞/.test(tt + (e.title || ''));
        return {title: e.title || '(sin título)', allDay: e.allDay, color: e.color, cal: e.cal, free: !!e.free, isCall,
          start: e.allDay ? 0 : Math.max(0, minutesOfDay(new Date(e.start), day)), end: e.allDay ? 0 : Math.min(24 * 60, minutesOfDay(new Date(e.end), day))};
      });
      evCache[key] = evs; out.push(...evs); return;
    }
    const evs = [];
    try {
    const viaPuente = new Set(((P().accounts.find(a => a.bridge) || {}).cals || []).map(c => c.id));
    await Promise.all(acc.cals.filter(c => c.on && !viaPuente.has(c.id) && !(P().inbox && P().inbox.calId === c.id)).map(async c => {
      const u = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.id)}/events?singleEvents=true&orderBy=startTime`
        + `&timeMin=${encodeURIComponent(start.toISOString())}&timeMax=${encodeURIComponent(end.toISOString())}&maxResults=100`;
      const r = await gapi(u, tokens[acc.email].token);
      for (const e of r.items || []){
        if (e.status === 'cancelled') continue;
        const meDeclined = (e.attendees || []).some(a => a.self && a.responseStatus === 'declined');
        if (meDeclined) continue;
        const allDay = !!(e.start && e.start.date);
        const s = allDay ? null : new Date(e.start.dateTime), en = allDay ? null : new Date(e.end.dateTime);
        const others = (e.attendees || []).filter(a => !a.self && !a.resource).length;
        const tt = O.norm(e.summary || '');
        const isCall = others > 0 || !!e.hangoutLink || !!e.conferenceData || /<>|\breu\b|reunion|llamada|\bcall\b|meet|zoom|entrevista|☎|📞/.test(tt + (e.summary || ''));
        evs.push({title: e.summary || '(sin título)', allDay, color: c.color, cal: c.name, free: e.transparency === 'transparent', isCall,
          start: s ? Math.max(0, minutesOfDay(s, day)) : 0, end: en ? Math.min(24*60, minutesOfDay(en, day)) : 0, link: e.htmlLink});
      }
    }));
    } catch(err){ console.warn('calendario', acc.email, err); return out.push(...snapGet(acc.email, day)); }
    evCache[key] = evs; snapPut(acc.email, day, evs); out.push(...evs);
  }));
  return out;
}
function minutesOfDay(d, day){ const base = O.fromIso(day); return Math.round((d - base) / 60000); }

/* ---------- Construir el día ---------- */
// Desde el 20/11 los bloques de trabajo los montas tú cada día (Montar bloques). Antes, se generan solos en los huecos.
const MANUAL_FROM = '2026-11-20';
const dayBlocks = day => ((P().dayBlocks = P().dayBlocks || {})[day]);
const isManual = day => day >= MANUAL_FROM || !!dayBlocks(day);
function buildDay(day, events, auto){
  const plan = P(), dow = O.fromIso(day).getDay();
  const items = [];
  const mv = (plan.moved || {})[day] || {};
  const place = (key, start, end) => mv[key] ? {start: mv[key].start, end: mv[key].end, moved: true} : {start, end};
  for (const e of events.filter(e => !e.allDay)){ const key = `e:${e.title}|${e.start}`; items.push({kind: e.free ? 'free' : 'event', ...e, mkey: key, ...(e.isCall ? {} : place(key, e.start, e.end))}); }
  for (const r of plan.routines.filter(r => r.on && r.days.includes(dow))){ const key = 'r:' + r.id;
    items.push({kind:'routine', title:`${r.icon || ''} ${r.name}`.trim(), id:r.id, mkey: key, ...place(key, toMin(r.start), toMin(r.end))}); }
  // Ocupado = reuniones (no las marcadas como «libre») + bloques fijos
  const busy = items.filter(i => i.kind !== 'free').map(i => [i.start, i.end]).sort((a,b) => a[0]-b[0]);
  const ws = toMin(plan.workStart), we = toMin(plan.workEnd);
  let cur = ws;
  const gaps = [];
  for (const [s, e] of busy){
    if (e <= cur) continue;
    if (s > cur) gaps.push([cur, Math.min(s, we)]);
    cur = Math.max(cur, e);
    if (cur >= we) break;
  }
  if (cur < we) gaps.push([cur, we]);
  if (!auto && isManual(day)){
    for (const b of (dayBlocks(day) || [])) items.push({kind:'work', start:b.start, end:b.end, at:toHM(b.start), bid:b.id});
    return items.sort((a,b) => a.start - b.start || (a.kind === 'work') - (b.kind === 'work'));
  }
  for (const [s, e] of gaps){
    let len = e - s; if (len < plan.minBlock) continue;
    const n = Math.ceil(len / plan.maxBlock), size = Math.round(len / n / 5) * 5;
    for (let i = 0, a = s; i < n; i++){
      const b = i === n - 1 ? e : a + size;
      items.push({kind:'work', start:a, end:b, at:toHM(a)});
      a = b;
    }
  }
  return items.sort((a,b) => a.start - b.start || (a.kind === 'work') - (b.kind === 'work'));
}

/* ---------- Vista «Día» ---------- */
let lastEvents = [], loading = false, calError = '';
function calStatus(){
  const accs = P().accounts;
  if (!GCAL_CLIENT_ID) return '';
  if (!accs.length) return `<button class="chip" data-gcal="add">📅 Conectar Google Calendar</button>`;
  const short = e => { const [u, d] = e.split('@'); return d === 'gmail.com' ? u : d.split('.')[0]; };
  const viaP = new Set(((accs.find(a => a.bridge) || {}).cals || []).map(c => c.id));
  const cubierta = a => !a.bridge && P().bridge && (a.cals || []).filter(c => c.on).every(c => viaP.has(c.id));
  return accs.filter(a => !cubierta(a)).map(a => a.bridge ? `<span class="chip on" title="Calendarios por el puente: sin permisos cada hora">🔗 Google</span>` : tokenOk(a.email)
    ? `<span class="chip on" title="${esc(a.email)}">📅 ${esc(short(a.email))}</span>`
    : snapAt(a.email)
      ? `<button class="chip" data-gcal="${esc(a.email)}" title="Mostrando la última versión guardada. Toca para actualizar">↻ ${esc(short(a.email))} · ${new Date(snapAt(a.email)).toTimeString().slice(0,5)}</button>`
      : `<button class="chip warn" data-gcal="${esc(a.email)}" title="Google pide confirmar cada hora">↻ ${esc(short(a.email))}</button>`).join('')
    + `<button class="chip" data-gcal="add" title="Conectar otra cuenta de Google">+ Calendario</button>`;
}
O.views.dia = function(){
  const d = O.fromIso(planDay), isToday = planDay === O.today();
  O.setToolbar('Día', `${O.DIAS_L[d.getDay()]} ${d.getDate()} ${O.MESES[d.getMonth()]}`,
    `<button class="icon" data-pday="-1" aria-label="Día anterior"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></button>
     <button class="chip" data-pday="0">Hoy</button>
     <button class="icon" data-pday="1" aria-label="Día siguiente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg></button>
     <button class="chip build-btn" data-buildday>🧱 Montar bloques</button>
     <span class="cal-st">${calStatus()}</span>`, 'Arrastra tareas a los bloques de trabajo');

  const items = buildDay(planDay, lastEvents);
  const workAts = new Set(items.filter(i => i.kind === 'work').map(i => i.at));
  const T = O.visibleTasks();
  // Cada tarea va al bloque de trabajo que contiene su hora (aunque los bloques se muevan al cargar el calendario)
  const works = items.filter(i => i.kind === 'work');
  const blockAt = at => { const m = toMin(at); const b = works.find(w => m >= w.start && m < w.end) || works.find(w => w.start >= m) || works[works.length - 1]; return b ? b.at : null; };
  const slotted = t => { const sl = S.slots[t.id]; return sl && sl.day === planDay ? blockAt(sl.at) : null; };
  const now = new Date(), nowMin = isToday ? now.getHours()*60 + now.getMinutes() : -1;
  const allDay = lastEvents.filter(e => e.allDay);

  // Color de cada reunión: el del cliente si su nombre aparece en el título
  const evClient = title => { const t = O.norm(title); return S.clients.find(c => O.norm(c.name).split(/\s+/).some(w => w.length >= 4 && t.includes(w))); };
  const ROUT = {comida:'#FFC93D', cena:'#C77DFF', deporte:'#3DDC97'};
  const mDone = new Set(P().morningDone[planDay] || []), mItems = P().morning;
  const morningRow = () => !mItems.length ? '' : `<div class="trow mrow ${mDone.size >= mItems.length ? 'past' : ''}" style="--c:#FFC93D;--p:${Math.round(mDone.size / mItems.length * 100)}%">
      <div class="tcol"><b>☀️</b><small>cada día</small></div><div class="rail"><span></span></div>
      <div class="tbody"><div class="blk morning"><header><b>Arranque del día · revisión de clientes + organizar</b><span class="count">${mDone.size}/${mItems.length}</span>
        <button type="button" class="btn mall${mDone.size >= mItems.length ? ' on' : ''}" data-morningall>${mDone.size >= mItems.length ? '✓ Hecho' : 'Marcar todo hecho'}</button></header>
        <ul>${mItems.map((m, i) => `<li><button type="button" class="mchk${mDone.has(i) ? ' on' : ''}" data-morning="${i}" aria-label="Marcar">${mDone.has(i) ? '✓' : ''}</button><span>${esc(m)}</span></li>`).join('')}</ul></div></div></div>`;
  let mPut = false;
  let tl = allDay.length ? `<div class="allday">${allDay.map(e => `<span class="tag" style="--c:${e.color}"><i></i>${esc(e.title)}</span>`).join('')}</div>` : '';
  for (const it of items){
    const st = !isToday ? '' : nowMin >= it.end ? 'past' : nowMin >= it.start ? 'now' : 'future';
    const pct = st === 'past' ? 100 : st === 'now' ? Math.round((nowMin - it.start) / (it.end - it.start) * 100) : 0;
    let body, color;
    if (it.kind === 'work'){
      const ts = T.filter(t => slotted(t) === it.at).sort(O.byOrder);
      const hechas = ts.filter(t => t.status === 'done').length;
      color = 'var(--accent)';
      body = `<section class="blk work" data-field="slot" data-value="${it.at}" data-day="${planDay}">
        <header><b>Trabajo</b><span class="rg">${dur(it.end - it.start)}</span>${ts.length ? `<span class="count">${hechas}/${ts.length} ✓</span>` : ''}</header>
        <div class="list">${ts.map(t => O.card(t)).join('') || '<div class="empty">Suelta tareas aquí</div>'}</div></section>`;
    } else if (it.kind === 'routine'){
      color = ROUT[it.id] || '#A3A3AD';
      body = `<div class="blk routine" style="--c:${color}"><b>${esc(it.title)}</b><span class="rg">${dur(it.end - it.start)}</span></div>`;
    } else if (!it.isCall){
      // Bloques propios del calendario (Bloque 0, comida, cena, fin de trabajo…): no son llamadas
      color = '#A3A3AD';
      body = `<div class="blk routine cal-blk" style="--c:${color}"><b>${esc(it.title)}</b><span class="rg">${dur(it.end - it.start)}</span></div>`;
    } else {
      // Llamadas y reuniones: todas iguales, en morado y con 📞
      color = '#A78BFA';
      body = `<div class="blk event call${it.kind === 'free' ? ' free' : ''}" style="--c:${color}"><span class="ico">📞</span><b>${esc(it.title.replace(/^[\u2600-\u27BF\u{1F300}-\u{1FAFF}\s]+/u, ''))}</b>
        <span class="cal">${dur(it.end - it.start)}</span></div>`;
    }
    tl += `<div class="trow ${st}" style="--c:${color};--p:${pct}%;--h:${Math.round(34 + (it.end - it.start) * 1.0)}px">
      <div class="tcol${it.isCall ? ' tcall' : ''}">${it.isCall ? '<span class="tphone">📞</span>' : ''}<b>${toHM(it.start)}</b><small>${toHM(it.end)}</small></div>
      <div class="rail"><span></span>${st === 'now' ? '<i class="nowdot"></i>' : ''}</div>
      <div class="tbody">${body}</div></div>`;
    if (!mPut && /bloque\s*0/i.test(it.title || '')){ tl += morningRow(); mPut = true; }
  }
  if (!mPut) tl = morningRow() + tl;
  if (isManual(planDay) && !(dayBlocks(planDay) || []).length)
    tl = `<div class="build-empty"><b>🧱 Monta tus bloques de hoy</b><span>Arrastra bloques de trabajo a las horas que quieras y estíralos. Luego colocas tus tareas dentro.</span><button class="btn primary" data-buildday>Montar bloques</button></div>` + tl;
  // Cabecera del día: reloj, jornada y contador de tareas
  const plan = P(), ws = toMin(plan.workStart), we = Math.max(toMin(plan.workEnd), ...items.map(i => i.end).filter(e => e <= 24 * 60));
  // Barra: trabajo = bloques de trabajo + reuniones (contados por separado, sin contar dos veces lo que se solapa)
  const calls = items.filter(i => i.kind === 'event' && i.isCall).sort((a,b) => a.start - b.start);
  const union = iv => iv.map(x => [x.start, x.end]).sort((a,b) => a[0]-b[0]).reduce((o, [a, b]) => { const l = o[o.length-1]; if (l && a <= l[1]) l[1] = Math.max(l[1], b); else o.push([a, b]); return o; }, []);
  const cU = union(calls);
  const minus = ([a, b]) => cU.reduce((segs, [ca, cb]) => segs.flatMap(([x, y]) => cb <= x || ca >= y ? [[x, y]] : [[x, Math.min(y, ca)], [Math.max(x, cb), y]].filter(([p, q]) => q > p)), [[a, b]]);
  const wU = union(works).flatMap(minus);
  const len = iv => iv.reduce((s, [a, b]) => s + (b - a), 0);
  const upto = iv => isToday ? iv.reduce((s, [a, b]) => s + Math.max(0, Math.min(nowMin, b) - a), 0) : 0;
  const wTot = len(wU), cTot = len(cU), tot = wTot + cTot;
  const wDone = upto(wU), cDone = upto(cU), done = wDone + cDone;
  const jorn = tot ? Math.round(done / tot * 100) : 0;
  const pw = tot ? wDone / tot * 100 : 0, pc = tot ? cDone / tot * 100 : 0;
  const split = `<span class="jsplit"><em><i class="jw"></i>Bloques ${dur(wDone)} / ${dur(wTot)}</em><em><i class="jc"></i>Reuniones ${dur(cDone)} / ${dur(cTot)}</em></span>`;
  const jornTxt = !tot ? 'Aún no tienes bloques de trabajo hoy'
    : !isToday ? `${dur(tot)} de trabajo planificado ${split}`
    : !done ? `${dur(tot)} de trabajo hoy · empiezas a las ${toHM(Math.min(...[...wU, ...cU].map(x => x[0])))} ${split}`
    : done >= tot ? `Trabajo del día terminado · ${dur(tot)} 💪 ${split}`
    : `<b>${dur(done)}</b> de ${dur(tot)} de trabajo · ${jorn}% · te quedan ${dur(tot - done)} ${split}`;
  // Temporizador hasta la siguiente reunión (o fin de la actual)
  const base = O.fromIso(planDay).getTime();
  const curC = isToday && calls.find(c => nowMin >= c.start && nowMin < c.end), nextC = isToday && calls.find(c => c.start > nowMin);
  const timer = !isToday || (!curC && !nextC) ? '' : `<div class="cdbox${curC ? ' in' : ''}">${curC
      ? `<small>En reunión · termina en</small><b data-cdto="${base + curC.end * 60e3}"></b><span>${esc(curC.title)}</span>`
      : `<small>Siguiente reunión en</small><b data-cdto="${base + nextC.start * 60e3}" data-mtg="${esc(nextC.title)}"></b><span>${toHM(nextC.start)} · ${esc(nextC.title)}</span>`}
      <button type="button" class="cdbell${bellOn() ? ' on' : ''}" data-bell title="${bellOn() ? 'Aviso con sonido 5 min antes: activado' : 'Activar aviso con sonido 5 min antes'}">${bellOn() ? '🔔' : '🔕'}</button></div>`;
  // Reuniones del día en una fila
  const mtgRow = `<div class="mtgs">${calls.length ? calls.map(c => {
      const s = !isToday ? '' : nowMin >= c.end ? 'past' : nowMin >= c.start ? 'now' : '';
      return `<span class="mtg ${s}" title="${esc(c.title)} · ${toHM(c.start)}–${toHM(c.end)}"><b>📞 ${toHM(c.start)}</b><span>${esc(c.title)}</span></span>`;
    }).join('') : '<span class="mtg none">Sin reuniones hoy</span>'}</div>`;
  const hoyTs = T.filter(t => slotted(t));
  const hechasHoy = hoyTs.filter(t => t.status === 'done').length;
  const quedan = isToday ? Math.max(0, we - nowMin) : 0;
  const ring = hoyTs.length ? Math.round(hechasHoy / hoyTs.length * 100) : 0;
  const head = `<div class="dayhead">
    <div class="clock">${isToday ? `${O.pad(now.getHours())}:${O.pad(now.getMinutes())}` : `${d.getDate()} ${O.MESES[d.getMonth()]}`}</div>
    <div class="jorn"><div class="jbar"><span style="width:${pw}%"></span><span class="jc" style="left:${pw}%;width:${pc}%"></span></div>
      <small>${jornTxt}</small></div>
    <div class="legend"><span style="--c:${O.GROUP.agency.color}">Agencia</span><span style="--c:${O.GROUP.mine.color}">Mis clientes</span><span style="--c:#A78BFA">Llamadas</span></div>
    <div class="ring" style="--r:${ring}"><b>${hechasHoy}/${hoyTs.length}</b><small>hechas</small></div>
    ${timer}${mtgRow}
  </div>`;
  // «Por colocar»: solo las tareas marcadas para este día (las eliges en Clientes → Tareas) que aún no están en un bloque
  const procMap = P().proc || {}, inProc = t => !!procMap[t.id];
  const procTs = T.filter(t => t.status !== 'done' && inProc(t)).sort((a,b) => procMap[a.id].localeCompare(procMap[b.id]) || O.byOrder(a,b));
  const pend = T.filter(t => t.status !== 'done' && !t.ia && !slotted(t) && !inProc(t)).sort(O.byOrder);
  const isLeft = t => { const sl = S.slots[t.id]; return !!((sl && sl.day < planDay) || (t.today && t.today < planDay)); };
  const left = pend.filter(isLeft).sort((a,b) => O.urgRank(a) - O.urgRank(b) || O.byOrder(a,b));
  const rest = pend.filter(t => !isLeft(t) && t.today === planDay);
  const nCol = left.length + rest.length;
  const side = `<section class="col side"><header><h3>Por colocar hoy</h3><span class="count">${nCol}</span></header>`
    + `<div class="urg u-proc" data-field="unslot" data-proc><h4>⏳ En proceso<span>${procTs.length}</span></h4>
        <div class="list">${procTs.map(t => O.card(t)).join('') || '<div class="empty">Arrastra aquí lo que ya empezaste y ahora espera a otros</div>'}</div></div>`
    + (!nCol ? '<div class="empty">Elige en <b>Clientes → Tareas</b> lo que vas a hacer hoy (botón «Hoy»).</div>' : '')
    + (left.length ? `<div class="urg u-left" data-field="unslot"><h4>⏪ Pendientes de días anteriores<span>${left.length}</span></h4>
        <div class="list">${left.map(t => O.card(t)).join('')}</div></div>` : '')
    + Object.entries(O.URG).map(([k, u]) => {
      const ts = rest.filter(t => (O.URG[t.priority] ? t.priority : 'normal') === k);
      return `<div class="urg u-${k}" data-field="unslot" data-urg="${k}"><h4>${u.icon} ${u.label}<span>${ts.length}</span></h4>
        <div class="list">${ts.map(t => O.card(t)).join('') || '<div class="empty">Arrastra aquí</div>'}</div></div>`;
    }).join('') + '</section>';
  const msg = calError ? `<div class="note warnbox">${esc(calError)}</div>` : loading ? '<div class="note">Cargando calendario…</div>' : '';
  setTimeout(tickCd);
  return `${msg}${head}<div class="planner"><div class="timeline">${tl}</div>${side}</div>`;
};
O.views.dia.after = () => {
  const need = P().accounts.some(a => tokenOk(a.email) && !evCache[a.email + '|' + planDay]);
  if (need && !loading) refresh();
};
/* ---------- Buzón: tareas que Claude deja en un calendario ---------- */
// Cada evento del calendario buzón = una tarea. Título = la tarea. Descripción: «cliente: …», «urgencia: …».
// Entran en «Por revisar (IA)» para que las revises antes de colocarlas (y antes de subir nada a ClickUp).
let importing = false;
async function importInbox(){
  const ib = P().inbox || (P().bridge ? {type: 'drive'} : null); if (!ib || importing) return;
  if (ib.type === 'drive') return importDrive(ib);
  if (!ib.calId || !tokenOk(ib.email)) return;
  importing = true;
  try {
    const now = new Date(), seen = (P().inboxSeen = P().inboxSeen || {});
    const u = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(ib.calId)}/events?singleEvents=true&maxResults=250`
      + `&timeMin=${encodeURIComponent(O.addDays(now, -30).toISOString())}&timeMax=${encodeURIComponent(O.addDays(now, 30).toISOString())}`;
    const r = await gapi(u, tokens[ib.email].token);
    let n = 0;
    for (const e of r.items || []){
      if (e.status === 'cancelled' || seen[e.id]) continue;
      seen[e.id] = Date.now();
      const desc = (e.description || '').replace(/<[^>]+>/g, '\n');
      const get = k => { const m = desc.match(new RegExp('^\\s*' + k + '\\s*:\\s*(.+)$', 'im')); return m ? m[1].trim() : ''; };
      const title = (e.summary || '').replace(/^[📥\s]+/u, '').trim(); if (!title) continue;
      const cName = O.norm(get('cliente'));
      let cl = cName ? S.clients.find(c => O.norm(c.name) === cName) || S.clients.find(c => O.norm(c.name).includes(cName) || cName.includes(O.norm(c.name).split(' ')[0])) : null;
      if (!cl){ const p = O.parse(title)[0]; cl = p && p.client ? O.client(p.client) : null; }
      const ur = O.norm(get('urgencia'));
      const priority = /super|urgentisim|critic/.test(ur) ? 'super' : /urgent/.test(ur) ? 'alta' : /media|normal/.test(ur) ? 'normal' : 'baja';
      S.tasks.push({id: O.uid(), title, client: cl ? cl.id : null, day: null, status: 'todo', priority, order: O.maxOrder() + 1, doneAt: null, ia: true, iaNote: get('nota')});
      n++;
    }
    // olvidar los vistos de hace más de 60 días
    for (const [k, t] of Object.entries(seen)) if (t < Date.now() - 60 * 864e5) delete seen[k];
    if (n){ O.save(); O.render(); O.toast(`🤖 ${n} tarea${n > 1 ? 's' : ''} nueva${n > 1 ? 's' : ''} por revisar`); }
    else O.save();
  } catch(e){ /* sin conexión o permiso caducado: se reintenta luego */ }
  importing = false;
}
// Buzón de Drive: cada archivo de la carpeta = una tarea. Nombre = la tarea. Contenido: «cliente: …», «urgencia: …», «nota: …».
function parseInbox(title, desc){
  const get = k => { const m = desc.match(new RegExp('^\\s*' + k + '\\s*:\\s*(.*)$', 'im')); return m ? m[1].trim() : ''; };
  const cName = O.norm(get('cliente'));
  let cl = cName ? S.clients.find(c => O.norm(c.name) === cName) || S.clients.find(c => O.norm(c.name).includes(cName) || cName.includes(O.norm(c.name).split(' ')[0])) : null;
  if (!cl){ const p = O.parse(title)[0]; cl = p && p.client ? O.client(p.client) : null; }
  const ur = O.norm(get('urgencia'));
  const priority = /super|urgentisim|critic/.test(ur) ? 'super' : /urgent/.test(ur) ? 'alta' : /media|normal/.test(ur) ? 'normal' : 'baja';
  const origen = O.norm(get('origen'));
  const call = /fathom|reunion|videollamada|llamada|clickup/.test(origen);
  return {id: O.uid(), title, client: cl ? cl.id : null, day: null, status: 'todo', priority, order: O.maxOrder() + 1, doneAt: null, ia: true,
    iaNote: get('nota'), src: call ? 'call' : 'voz', meeting: call ? get('reunion') || get('reunión') : ''};
}
async function importDrive(ib){
  if (P().bridge){
    importing = true;
    try {
      const seen = (P().inboxSeen = P().inboxSeen || {});
      const r = await bridge({a: 'inbox'});
      let n = 0;
      for (const f of (r.files || []).sort((a, b) => a.created - b.created)){
        if (seen[f.id]) continue; seen[f.id] = Date.now();
        const title = (f.name || '').replace(/\.(txt|md)$/i, '').replace(/^[📥\s]+/u, '').trim(); if (!title) continue;
        S.tasks.push(parseInbox(title, f.text || '')); n++;
      }
      O.save(); if (n){ O.render(); O.toast(`🤖 ${n} tarea${n > 1 ? 's' : ''} nueva${n > 1 ? 's' : ''} por revisar`); }
    } catch(e){}
    importing = false; return;
  }
  const tk = tokens[ib.email + '|drive'];
  if (!tk || tk.exp < Date.now() + 60e3) return;
  importing = true;
  try {
    const seen = (P().inboxSeen = P().inboxSeen || {});
    const since = O.addDays(new Date(), -30).toISOString();
    const q = encodeURIComponent(`'${ib.folderId}' in parents and trashed = false and createdTime > '${since}'`);
    const r = await gapi(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,createdTime)&orderBy=createdTime&pageSize=100`, tk.token);
    let n = 0;
    for (const f of r.files || []){
      if (seen[f.id]) continue;
      const url = f.mimeType === 'application/vnd.google-apps.document'
        ? `https://www.googleapis.com/drive/v3/files/${f.id}/export?mimeType=text/plain`
        : `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`;
      const res = await fetch(url, {headers: {Authorization: 'Bearer ' + tk.token}});
      const txt = res.ok ? await res.text() : '';
      seen[f.id] = Date.now();
      const title = f.name.replace(/\.(txt|md)$/i, '').replace(/^[📥\s]+/u, '').trim();
      if (!title) continue;
      S.tasks.push(parseInbox(title, txt)); n++;
    }
    for (const [k, t] of Object.entries(seen)) if (t < Date.now() - 60 * 864e5) delete seen[k];
    O.save();
    if (n){ O.render(); O.toast(`🤖 ${n} tarea${n > 1 ? 's' : ''} nueva${n > 1 ? 's' : ''} por revisar`); }
  } catch(e){ /* sin conexión o permiso caducado */ }
  importing = false;
}
O.importInbox = importInbox;

/* ---------- Montar bloques (vista de horas, arrastrar / mover / estirar) ---------- */
const PX = 1.1, SNAP = 15, G0 = 7 * 60, G1 = 22 * 60;   // 1 min = 1,1 px; de 7:00 a 22:00
const bdlg = document.createElement('dialog');
bdlg.id = 'buildDlg';
bdlg.innerHTML = `<div class="sheet bsheet">
  <div class="bhead"><h2>Montar bloques · <span id="bdTitle"></span></h2><span class="sp"></span>
    <button type="button" class="btn" data-bauto>Propuesta automática</button><button type="button" class="btn" data-bclear>Vaciar</button>
    <button type="button" class="btn primary" data-bclose>Listo</button></div>
  <p class="iahint">Arrastra un bloque desde la izquierda a la hora que quieras (o tócalo para añadirlo en el primer hueco). Muévelo arrastrando y estíralo desde el borde de abajo.</p>
  <div class="bwrap"><div class="bpal">${[[30,'30 min'],[45,'45 min'],[60,'1 h'],[90,'1 h 30'],[120,'2 h']].map(([m, l]) => `<button type="button" class="bchip" data-bdur="${m}">＋ ${l}</button>`).join('')}</div>
    <div class="bscroll"><div class="bgrid" id="bgrid"></div></div></div></div>`;
document.body.appendChild(bdlg);
const bgrid = bdlg.querySelector('#bgrid');
let bDay = null;
const snap = m => Math.round(m / SNAP) * SNAP;
const clampB = (s, e) => { const d = e - s; s = Math.max(G0, Math.min(G1 - d, s)); return [s, s + d]; };
function openBuild(day){
  bDay = day; const d = O.fromIso(day);
  bdlg.querySelector('#bdTitle').textContent = `${O.DIAS_L[d.getDay()]} ${d.getDate()} ${O.MESES[d.getMonth()]}`;
  if (!dayBlocks(day)) P().dayBlocks[day] = day >= MANUAL_FROM ? [] :
    buildDay(day, planDay === day ? lastEvents : [], true).filter(i => i.kind === 'work').map(i => ({id: Math.random().toString(36).slice(2, 8), start: i.start, end: i.end}));
  O.save();
  drawGrid(); bdlg.showModal();
  const first = bgrid.querySelector('.bblk,.bfix'); bdlg.querySelector('.bscroll').scrollTop = first ? Math.max(0, first.offsetTop - 60) : (9 * 60 - G0) * PX;
}
function drawGrid(){
  const evs = planDay === bDay ? lastEvents : [];
  const fixed = buildDay(bDay, evs).filter(i => i.kind !== 'work' && i.kind !== 'free');
  let h = '';
  for (let m = G0; m <= G1; m += 60) h += `<div class="bhour" style="top:${(m - G0) * PX}px"><span>${toHM(m)}</span></div>`;
  for (const f of fixed){
    const movable = !f.isCall && f.mkey;
    h += `<div class="bfix${f.isCall ? ' call' : ''}${movable ? ' bmov' : ''}${f.moved ? ' moved' : ''}" ${movable ? `data-mkey="${esc(f.mkey)}" data-s="${f.start}" data-e="${f.end}"` : ''} style="top:${(f.start - G0) * PX}px;height:${(f.end - f.start) * PX}px">
      <b>${f.isCall ? '📞 ' : ''}${esc(f.title)}</b><small>${toHM(f.start)}–${toHM(f.end)}${f.moved ? ' · movido' : ''}</small>${movable ? '<i class="bres" data-bres></i>' : ''}</div>`;
  }
  for (const b of dayBlocks(bDay)) h += `<div class="bblk" data-bid="${b.id}" style="top:${(b.start - G0) * PX}px;height:${(b.end - b.start) * PX}px">
      <b>Trabajo</b><small>${toHM(b.start)}–${toHM(b.end)} · ${dur(b.end - b.start)}</small>
      <button type="button" class="bdel" data-bdel aria-label="Quitar bloque">×</button><i class="bres" data-bres></i></div>`;
  bgrid.style.height = (G1 - G0) * PX + 'px';
  bgrid.innerHTML = h;
}
function setBlock(b, s, e){
  const old = toHM(b.start);
  b.start = s; b.end = e;
  // las tareas colocadas en ese bloque se mueven con él
  for (const sl of Object.values(S.slots)) if (sl.day === bDay && sl.at === old) sl.at = toHM(s);
}
function addBlock(start, len){
  const [s, e] = clampB(snap(start), snap(start) + len);
  dayBlocks(bDay).push({id: Math.random().toString(36).slice(2, 8), start: s, end: e});
  O.save(); drawGrid();
}
function firstFree(len){
  const busy = [...buildDay(bDay, planDay === bDay ? lastEvents : []).filter(i => i.kind !== 'free').map(i => [i.start, i.end]), ...dayBlocks(bDay).map(b => [b.start, b.end])].sort((a, b) => a[0] - b[0]);
  let t = toMin(P().workStart);
  for (const [s, e] of busy){ if (s - t >= len) break; if (e > t) t = e; }
  return t;
}
const yToMin = y => G0 + (y - bgrid.getBoundingClientRect().top) / PX;
// Mover y estirar bloques
// Mover/estirar comida, cena, deporte y tus bloques del calendario (solo cambia en la app, para ese día)
bgrid.addEventListener('pointerdown', e => {
  const el = e.target.closest('.bmov'); if (!el) return;
  e.preventDefault();
  const resize = !!e.target.closest('[data-bres]'), y0 = e.clientY, s0 = +el.dataset.s, e0 = +el.dataset.e;
  el.setPointerCapture(e.pointerId); el.classList.add('drag');
  let ns = s0, ne = e0;
  const mv = ev => {
    const dm = (ev.clientY - y0) / PX;
    if (resize) ne = Math.max(s0 + SNAP, Math.min(G1, snap(e0 + dm)));
    else { [ns, ne] = clampB(snap(s0 + dm), snap(s0 + dm) + (e0 - s0)); }
    el.style.top = (ns - G0) * PX + 'px'; el.style.height = (ne - ns) * PX + 'px';
    el.querySelector('small').textContent = `${toHM(ns)}–${toHM(ne)}`;
  };
  const up = () => {
    el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
    const plan = P(); plan.moved = plan.moved || {}; const d = (plan.moved[bDay] = plan.moved[bDay] || {});
    d[el.dataset.mkey] = {start: ns, end: ne};
    for (const k of Object.keys(plan.moved)) if (k < O.iso(O.addDays(new Date(), -7))) delete plan.moved[k];
    O.save(); drawGrid();
  };
  el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
});
bgrid.addEventListener('pointerdown', e => {
  if (e.target.closest('[data-bdel]')) return;
  const el = e.target.closest('.bblk'); if (!el) return;
  e.preventDefault();
  const b = dayBlocks(bDay).find(x => x.id === el.dataset.bid), resize = !!e.target.closest('[data-bres]');
  const y0 = e.clientY, s0 = b.start, e0 = b.end;
  el.setPointerCapture(e.pointerId); el.classList.add('drag');
  const mv = ev => {
    const dm = (ev.clientY - y0) / PX;
    if (resize){ const ne = Math.max(s0 + SNAP, Math.min(G1, snap(e0 + dm))); el.style.height = (ne - s0) * PX + 'px'; el.dataset.ne = ne; el.querySelector('small').textContent = `${toHM(s0)}–${toHM(ne)} · ${dur(ne - s0)}`; }
    else { const [ns, ne] = clampB(snap(s0 + dm), snap(s0 + dm) + (e0 - s0)); el.style.top = (ns - G0) * PX + 'px'; el.dataset.ns = ns; el.querySelector('small').textContent = `${toHM(ns)}–${toHM(ne)} · ${dur(ne - ns)}`; }
  };
  const up = () => {
    el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
    if (resize && el.dataset.ne) setBlock(b, s0, +el.dataset.ne);
    if (!resize && el.dataset.ns){ const ns = +el.dataset.ns; setBlock(b, ns, ns + (e0 - s0)); }
    O.save(); drawGrid();
  };
  el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
});
// Arrastrar un bloque nuevo desde la paleta (o tocarlo para ponerlo en el primer hueco)
bdlg.querySelector('.bpal').addEventListener('pointerdown', e => {
  const c = e.target.closest('[data-bdur]'); if (!c) return;
  e.preventDefault();
  const len = +c.dataset.bdur, x0 = e.clientX, y0 = e.clientY;
  let ghost = null;
  c.setPointerCapture(e.pointerId);
  const mv = ev => {
    if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6){
      ghost = document.createElement('div'); ghost.className = 'bghost'; ghost.style.height = len * PX + 'px'; ghost.textContent = 'Trabajo · ' + dur(len); document.body.appendChild(ghost);
    }
    if (ghost){ ghost.style.transform = `translate(${ev.clientX - 60}px, ${ev.clientY - 14}px)`; }
  };
  const up = ev => {
    c.removeEventListener('pointermove', mv); c.removeEventListener('pointerup', up); c.removeEventListener('pointercancel', up);
    if (!ghost) return addBlock(firstFree(len), len);
    ghost.remove();
    const r = bgrid.getBoundingClientRect();
    if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) addBlock(yToMin(ev.clientY - 14), len);
  };
  c.addEventListener('pointermove', mv); c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
});
bdlg.addEventListener('click', e => {
  if (e.target.closest('[data-bdel]')){ const id = e.target.closest('.bblk').dataset.bid; P().dayBlocks[bDay] = dayBlocks(bDay).filter(b => b.id !== id); O.save(); drawGrid(); }
  if (e.target.closest('[data-bclear]') && confirm('¿Quitar todos los bloques de este día y devolver comida y eventos a su hora?')){ P().dayBlocks[bDay] = []; if (P().moved) delete P().moved[bDay]; O.save(); drawGrid(); }
  if (e.target.closest('[data-bauto]')){
    P().dayBlocks[bDay] = buildDay(bDay, planDay === bDay ? lastEvents : [], true).filter(i => i.kind === 'work').map(i => ({id: Math.random().toString(36).slice(2, 8), start: i.start, end: i.end}));
    O.save(); drawGrid();
  }
  if (e.target.closest('[data-bclose]')) bdlg.close();
});
bdlg.addEventListener('close', () => { if (S.view === 'dia') O.render(); });
document.addEventListener('click', e => { if (e.target.closest('[data-buildday]')) openBuild(planDay); });
// Bloques de trabajo de hoy (para colocar tareas desde el editor, sin arrastrar)
O.todayBlocks = () => buildDay(O.today(), planDay === O.today() ? lastEvents : []).filter(i => i.kind === 'work').map(b => ({at: b.at, label: `${toHM(b.start)} – ${toHM(b.end)}`}));
O.connectDriveInbox = connectDriveInbox;
O.inboxStatus = () => { const ib = P().inbox; if (P().bridge) return {email: 'puente', ok: true}; if (!ib || ib.type !== 'drive') return null; const tk = tokens[ib.email + '|drive']; return {email: ib.email, ok: !!(tk && tk.exp > Date.now() + 60e3)}; };
async function refresh(){
  importInbox();
  loading = true; calError = '';
  try { lastEvents = await fetchEvents(planDay); O.planEvents = {day: planDay, events: lastEvents}; }
  catch(e){ calError = 'Calendario: ' + e.message; }
  loading = false;
  if (S.view === 'dia') O.render();
}
function setDay(n){
  planDay = n === 0 ? O.today() : O.iso(O.addDays(O.fromIso(planDay), n));
  lastEvents = []; O.render();
  const accs = P().accounts.filter(a => tokenOk(a.email));
  if (accs.length) refresh();
}
document.addEventListener('click', e => {
  const all = e.target.closest('[data-morningall]');
  const b = e.target.closest('[data-morning]'); if (!b && !all) return;
  const plan = P(), set = new Set(plan.morningDone[planDay] || []);
  if (all){ if (set.size >= plan.morning.length) set.clear(); else plan.morning.forEach((_, i) => set.add(i)); }
  else { const i = +b.dataset.morning; set.has(i) ? set.delete(i) : set.add(i); }
  plan.morningDone[planDay] = [...set];
  // guardar solo las últimas 2 semanas
  for (const d of Object.keys(plan.morningDone)) if (d < O.iso(O.addDays(new Date(), -14))) delete plan.morningDone[d];
  O.save(); O.render();
  if (set.size === plan.morning.length) O.toast('¡Arranque hecho! A por el primer bloque 💪');
});
$('#toolbar').addEventListener('click', async e => {
  const d = e.target.closest('[data-pday]'); if (d) return setDay(+d.dataset.pday);
  const g = e.target.closest('[data-gcal]'); if (!g) return;
  try {
    await connectAccount(g.dataset.gcal === 'add' ? '' : g.dataset.gcal);
    await refresh(); O.toast('Calendario conectado');
  } catch(err){ O.toast('Google Calendar: ' + err.message); }
});

/* ---------- Ajustes del planificador ---------- */
const DAYN = ['D','L','M','X','J','V','S'];
function renderPlanSettings(){
  const plan = P(), box = $('#planBox'); if (!box) return;
  box.innerHTML = `
    <div class="row"><label>Empiezo a trabajar<input type="time" data-pk="workStart" value="${plan.workStart}"></label>
      <label>Termino (aprox.)<input type="time" data-pk="workEnd" value="${plan.workEnd}"></label></div>
    <div class="rt-list">${plan.routines.map((r, i) => `<div class="rt" data-i="${i}">
      <input type="checkbox" data-rk="on" ${r.on ? 'checked' : ''} aria-label="Activo">
      <input data-rk="icon" value="${esc(r.icon || '')}" class="ic" aria-label="Icono">
      <input data-rk="name" value="${esc(r.name)}" aria-label="Nombre">
      <input type="time" data-rk="start" value="${r.start}"><input type="time" data-rk="end" value="${r.end}">
      <span class="days">${DAYN.map((n, d) => `<button type="button" class="dchip" data-day="${d}" aria-pressed="${r.days.includes(d)}">${n}</button>`).join('')}</span>
      <button type="button" class="x" data-rdel aria-label="Quitar">×</button></div>`).join('')}</div>
    <div class="actions" style="margin:0"><button type="button" class="btn" id="rtAdd">+ Bloque fijo</button></div>
    <label>Arranque del día (una cosa por línea)<textarea rows="5" data-morningtxt>${esc(plan.morning.join('\n'))}</textarea></label>
    <h3 class="h3">Calendarios de Google</h3>
    ${!GCAL_CLIENT_ID ? '<div class="note">Pendiente de activar Google Calendar en el proyecto.</div>' :
      plan.accounts.map((a, ai) => `<div class="acc"><b>${esc(a.email)}</b>
        ${a.cals.map((c, ci) => `<label class="check"><input type="checkbox" data-cal="${ai}:${ci}" ${c.on ? 'checked' : ''}><i class="dot" style="background:${c.color}"></i>${esc(c.name)}</label>`).join('')}
        <button type="button" class="btn danger" data-accdel="${ai}">Quitar cuenta</button></div>`).join('')
      + `<div class="actions" style="margin:0"><button type="button" class="btn" id="accAdd">+ Conectar cuenta de Google</button></div>
         <div class="note">Solo lectura. Puedes conectar tu cuenta personal y la de la agencia y elegir qué calendarios cuentan. Los eventos no se guardan en la nube.</div>
         <div class="acc bridgebox"><b>🔗 Puente de Google (sin pedir permisos cada hora)</b>
           <span class="lock">${plan.bridge ? 'Conectado: calendarios y buzón se leen solos en todos tus dispositivos.' : 'Pega aquí la dirección de tu Apps Script (acaba en /exec).'}</span>
           <div class="row"><input id="bridgeUrl" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(plan.bridge || '')}" autocomplete="off">
           <button type="button" class="btn primary" id="bridgeSave">${plan.bridge ? 'Actualizar' : 'Conectar'}</button></div></div>
         <div class="acc"><b>📥 Buzón de tareas por voz (Drive)</b>
           <span class="lock">${plan.inbox && plan.inbox.type === 'drive' ? `Conectado: ${esc(plan.inbox.email)} · carpeta «${INBOX_FOLDER}»` : 'Sin conectar'}</span>
           <button type="button" class="btn" id="driveInbox">${plan.inbox && plan.inbox.type === 'drive' ? 'Volver a conectar' : 'Conectar buzón'}</button></div>`}`;
}
document.addEventListener('click', async e => {
  const box = e.target.closest('#planBox'); if (!box) return;
  const plan = P();
  const dc = e.target.closest('.dchip');
  if (dc){ const r = plan.routines[+dc.closest('.rt').dataset.i], d = +dc.dataset.day;
    r.days = r.days.includes(d) ? r.days.filter(x => x !== d) : [...r.days, d]; return done(); }
  if (e.target.closest('[data-rdel]')){ plan.routines.splice(+e.target.closest('.rt').dataset.i, 1); return done(); }
  if (e.target.id === 'rtAdd'){ plan.routines.push({id:Math.random().toString(36).slice(2,8), name:'Nuevo', icon:'⏱️', start:'17:00', end:'17:30', days:[1,2,3,4,5], on:true}); return done(); }
  if (e.target.dataset.accdel){ plan.accounts.splice(+e.target.dataset.accdel, 1); clearCache(); lastEvents = []; return done(); }
  if (e.target.id === 'bridgeSave'){
    try { await connectBridge(document.getElementById('bridgeUrl').value); O.toast('Puente conectado ✓'); lastEvents = []; refresh(); importInbox(); }
    catch(err){ O.toast('Puente: ' + err.message); }
    return done();
  }
  if (e.target.id === 'driveInbox'){
    try { const em = await connectDriveInbox(''); O.toast('Buzón conectado: ' + em); importInbox(); } catch(err){ O.toast('Buzón: ' + err.message); }
    return done();
  }
  if (e.target.id === 'accAdd'){
    try { await connectAccount(''); O.toast('Cuenta conectada: elige sus calendarios'); } catch(err){ O.toast('Google Calendar: ' + err.message); }
    return done();
  }
});
document.addEventListener('change', e => {
  const box = e.target.closest('#planBox'); if (!box) return;
  const plan = P(), t = e.target;
  if (t.dataset.pk) plan[t.dataset.pk] = t.value;
  if (t.dataset.inbox !== undefined){ const [email, calId] = t.value.split('|'); plan.inbox = calId ? {email, calId} : null; clearCache(); lastEvents = []; setTimeout(importInbox, 300); }
  if (t.dataset.morningtxt !== undefined) plan.morning = t.value.split('\n').map(x => x.trim()).filter(Boolean);
  if (t.dataset.rk){ const r = plan.routines[+t.closest('.rt').dataset.i]; r[t.dataset.rk] = t.type === 'checkbox' ? t.checked : t.value; }
  if (t.dataset.cal){ const [ai, ci] = t.dataset.cal.split(':').map(Number); plan.accounts[ai].cals[ci].on = t.checked; clearCache(); lastEvents = []; }
  O.save(); if (S.view === 'dia'){ O.render(); refresh(); }
});
function done(){ O.save(); renderPlanSettings(); if (S.view === 'dia') { O.render(); refresh(); } }
$('#settingsBtn').addEventListener('click', renderPlanSettings);

// Cada minuto: reloj y barra del día
// Aviso de reunión 5 minutos antes: sonido + notificación (en este dispositivo, con la app abierta)
const bellOn = () => { try { return localStorage.getItem('jp-bell') !== 'off'; } catch(e){ return true; } };
let actx = null;
function chime(){
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume();
    const t0 = actx.currentTime;
    [[880, 0], [1175, .18], [1568, .36]].forEach(([f, d]) => {
      const o = actx.createOscillator(), g = actx.createGain(); o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t0 + d); g.gain.linearRampToValueAtTime(.25, t0 + d + .02); g.gain.exponentialRampToValueAtTime(.001, t0 + d + .9);
      o.connect(g).connect(actx.destination); o.start(t0 + d); o.stop(t0 + d + 1);
    });
  } catch(e){}
}
// el navegador solo deja sonar después de un toque: se «desbloquea» con el primer clic
document.addEventListener('pointerdown', () => { if (!actx && bellOn()) try { actx = new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch(e){} }, {once: true});
const avisadas = (() => { try { return JSON.parse(localStorage.getItem('jp-avisos') || '{}'); } catch(e){ return {}; } })();
function avisar(key, title){
  avisadas[key] = 1; try { localStorage.setItem('jp-avisos', JSON.stringify(Object.fromEntries(Object.entries(avisadas).filter(([k]) => +k > Date.now() - 864e5)))); } catch(e){}
  if (!bellOn()) return;
  chime(); O.toast(`📞 En 5 min: ${title}`);
  try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Reunión en 5 minutos', {body: title, icon: 'logo-claro.png', tag: 'reu-' + key}); } catch(e){}
}
document.addEventListener('click', e => {
  if (!e.target.closest('[data-bell]')) return;
  const on = !bellOn(); try { localStorage.setItem('jp-bell', on ? 'on' : 'off'); } catch(err){}
  if (on){ chime(); O.toast('🔔 Te avisaré con un sonido 5 min antes de cada reunión'); try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch(err){} }
  else O.toast('🔕 Aviso de reuniones desactivado en este dispositivo');
  O.render();
});
// Temporizador de la siguiente reunión: se actualiza cada segundo
function tickCd(){ for (const el of document.querySelectorAll('[data-cdto]')){ const ms = +el.dataset.cdto - Date.now(), s = Math.max(0, Math.round(ms / 1000));
  if (el.dataset.mtg !== undefined && s > 0 && s <= 300 && !avisadas[el.dataset.cdto]) avisar(el.dataset.cdto, el.dataset.mtg);
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
  el.textContent = h ? `${h} h ${O.pad(m)} min` : `${O.pad(m)}:${O.pad(ss)}`; el.closest('.cdbox')?.classList.toggle('soon', s < 600); } }
setInterval(tickCd, 1000);
setInterval(() => { if (S.view === 'dia' && !document.querySelector('.ghost') && !document.querySelector('dialog[open]') && !document.activeElement?.matches('input,textarea')) O.render(); }, 60e3);
// Refresco suave: la marca de «ahora» y el calendario cada 5 min
setInterval(() => { if (S.view === 'dia' && !document.querySelector('.ghost')){ clearCache(); refresh(); } }, 5 * 60e3);
if (S.view === 'dia') O.render();
// Buzón: al abrir la app y cada 5 minutos
setTimeout(importInbox, 2500);
setInterval(importInbox, 5 * 60e3);
})();
