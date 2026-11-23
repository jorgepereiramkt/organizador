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
// colores de evento de Google Calendar (los mismos 11 que en Google)
const GCOL = {'1':'#7986CB','2':'#33B679','3':'#8E24AA','4':'#E67C73','5':'#F6BF26','6':'#F4511E','7':'#039BE5','8':'#616161','9':'#3F51B5','10':'#0B8043','11':'#D50000'};
const GCOLN = {'1':'Lavanda','2':'Salvia','3':'Uva','4':'Flamenco','5':'Plátano','6':'Mandarina','7':'Pavo real','8':'Grafito','9':'Arándano','10':'Albahaca','11':'Tomate'};
// colores para lo que es solo de la app (bloques de trabajo, comida, cena…)
const APPCOL = ['#FF6B3D','#F59E0B','#16A34A','#0D9488','#06B6D4','#2563EB','#4F46E5','#7C3AED','#C026D3','#DB2777','#EF4444','#475569'];
const swatches = (cur, attr, cols) => `<div class="swatches">${Object.entries(cols).map(([k, c]) => `<button type="button" class="sw${String(cur) === String(k) ? ' on' : ''}" ${attr}="${k}" style="background:${c}" title="${GCOLN[k] || ''}"></button>`).join('')}</div>`;
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
  const min = O.iso(O.addDays(new Date(), -40)); for (const d in mine) if (d < min) delete mine[d];
  O.save();
}
O.fetchEvents = d => fetchEvents(d);
O.callsOn = day => {
  const out = [], seen = new Set(), add = e => { if (!e || e.allDay || !e.isCall) return; const k = e.title + '|' + e.start; if (seen.has(k)) return; seen.add(k); out.push({title: e.title, min: Math.max(0, e.end - e.start)}); };
  for (const a of P().accounts || []) for (const e of snapGet(a.email, day)) add(e);
  for (const e of (typeof weekEv !== 'undefined' && weekEv[day]) || []) add(e);
  if (day === planDay) for (const e of lastEvents || []) add(e);
  return out;
};
O.fetchMonthAgency = async function(month){
  const [y, m] = month.split('-').map(Number), start = new Date(y, m - 1, 1), end = new Date(y, m, 1);
  for (const acc of (P().accounts || []).filter(a => !a.bridge && tokenOk(a.email))){
    const byDay = {};
    try {
      for (const c of acc.cals.filter(c => c.on)){
        const u = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.id)}/events?singleEvents=true&orderBy=startTime&maxResults=250`
          + `&timeMin=${encodeURIComponent(start.toISOString())}&timeMax=${encodeURIComponent(end.toISOString())}`;
        const r = await gapi(u, tokens[acc.email].token);
        for (const e of r.items || []){
          if (e.status === 'cancelled' || (e.attendees || []).some(a => a.self && a.responseStatus === 'declined')) continue;
          if (!(e.start && e.start.dateTime)) continue;
          const s = new Date(e.start.dateTime), en = new Date(e.end.dateTime), day = O.iso(s);
          const others = (e.attendees || []).filter(a => !a.self && !a.resource).length, tt = O.norm(e.summary || '');
          const isCall = others > 0 || !!e.hangoutLink || !!e.conferenceData || /<>|\breu\b|reunion|llamada|\bcall\b|meet|zoom|entrevista|☎|📞/.test(tt + (e.summary || ''));
          (byDay[day] = byDay[day] || []).push({title: e.summary || '(sin título)', allDay: false, color: c.color, cal: c.name, free: e.transparency === 'transparent', isCall,
            start: Math.max(0, minutesOfDay(s, day)), end: Math.min(24 * 60, minutesOfDay(en, day))});
        }
      }
      for (const [d, evs] of Object.entries(byDay)) snapPut(acc.email, d, evs);
    } catch(e){ console.warn('mes', acc.email, e); }
  }
};
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
          gid: e.id, gcal: e.calId, mine: !!e.mine, desc: e.desc || '', gstart: e.start, rec: !!e.rec, ecolor: e.ecolor || '', ...(GCOL[e.ecolor] ? {color: GCOL[e.ecolor]} : {}),
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
    for (const b of (dayBlocks(day) || [])) items.push({kind:'work', start:b.start, end:b.end, at:toHM(b.start), bid:b.id, bname:b.name || ''});
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
  O.setToolbar('Calendario', `${O.DIAS_L[d.getDay()]} ${d.getDate()} ${O.MESES[d.getMonth()]}`,
    `<button class="icon" data-pday="-1" aria-label="Día anterior"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></button>
     <button class="chip" data-pday="0">Hoy</button>
     <button class="icon" data-pday="1" aria-label="Día siguiente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg></button>
     <div class="modes"><button class="chip" data-dmode="dia" aria-pressed="true">Día</button><button class="chip" data-dmode="semana" aria-pressed="false">Semana</button><button class="chip" data-dmode="diario" aria-pressed="false">📒 Clientes</button></div>
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
      // Dos apartados: Top 3 (sí o sí) y «Échale huevos» (si da tiempo). Las que no tienen apartado llenan el Top 3 por orden.
      const quick = ts.filter(t => S.slots[t.id].tier === 'quick');
      const top = ts.filter(t => S.slots[t.id].tier === 'top');
      for (const t of ts) if (!S.slots[t.id].tier && top.length < 3) top.push(t);
      top.sort(O.byOrder);
      const extra = ts.filter(t => !top.includes(t) && !quick.includes(t));
      const zone = (tier, list, title, emptyTxt) => `<div class="wzone z-${tier}" data-field="slot" data-value="${it.at}" data-day="${planDay}" data-tier="${tier}">
          <h5>${title}<span>${list.filter(t => t.status === 'done').length}/${list.length}</span></h5>
          <div class="list">${list.map(t => O.card(t)).join('') || `<div class="empty">${emptyTxt}</div>`}</div></div>`;
      body = `<section class="blk work">
        <header><b>${esc(it.bname || 'Trabajo')}</b>${it.bid ? `<button type="button" class="bname-ed" data-bname="${it.bid}" data-bday="${planDay}" title="Poner nombre al bloque">✏️</button>` : ''}<span class="rg">${dur(it.end - it.start)}</span>${ts.length ? `<span class="count">${hechas}/${ts.length} ✓</span>` : ''}</header>
        ${zone('quick', quick, '⚡ Rápidas · menos de 5 min', 'Quítate primero lo que se hace en menos de 5 min')}
        ${zone('top', top, '🎯 Top 3 · sí o sí', 'Lo que tienes que sacar sí o sí (máx. 3)')}
        ${zone('extra', extra, '💪 Échale huevos · saca también estas', 'Si te da tiempo, también estas')}</section>`;
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
  // Barra por tramos: cada bloque y cada reunión en orden; lo hecho se rellena (naranja trabajo, morado reunión)
  const segBar = !tot ? '<div class="jbar"></div>' : `<div class="jsegs">${[...wU.map(x => [...x, 'w']), ...cU.map(x => [...x, 'c'])].sort((a,b) => a[0]-b[0]).map(([a, b, k]) => {
      const f = !isToday ? 0 : Math.max(0, Math.min(1, (nowMin - a) / (b - a)));
      return `<span class="jseg ${k}${f > 0 && f < 1 ? ' cur' : ''}" style="flex-grow:${b - a}" title="${k === 'c' ? 'Reunión' : 'Bloque'} ${toHM(a)}–${toHM(b)}"><i style="width:${Math.round(f * 100)}%"></i></span>`;
    }).join('')}</div>`;
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
      <button type="button" class="cdbell${bellOn() ? ' on' : ''}" data-bell title="${bellOn() ? 'Aviso con sonido 5 min y 1 min antes: activado' : 'Activar aviso con sonido 5 min y 1 min antes'}">${bellOn() ? '🔔' : '🔕'}</button></div>`;
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
    <div class="jorn">${segBar}
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
  return `${msg}${O.statsBar()}${head}<div class="planner"><div class="timeline">${tl}</div>${side}</div>`;
};
O.views.dia.after = () => {
  if (S.diaMode === 'semana') return loadWeek();
  const need = P().accounts.some(a => tokenOk(a.email) && !evCache[a.email + '|' + planDay]);
  if (need && !loading) refresh();
};

/* ---------- Vista Semana: calendario de 7 días con tus eventos, bloques de trabajo y rutinas ---------- */
const diaView = O.views.dia, diaAfter = O.views.dia.after;
const weekEv = {};            // día -> eventos (de Google, por el puente o la última versión guardada)
let weekLoading = false;
const monday = day => { const d = O.fromIso(day); return O.addDays(d, -((d.getDay() + 6) % 7)); };
const weekDays = () => { const m = monday(planDay); return [...Array(7)].map((_, i) => O.iso(O.addDays(m, i))); };
async function loadWeek(force){
  const days = weekDays().filter(d => force || !weekEv[d]);
  if (!days.length || weekLoading) return;
  weekLoading = true;
  try { await Promise.all(days.map(async d => { weekEv[d] = await fetchEvents(d); })); } catch(e){ calError = 'Calendario: ' + e.message; }
  weekLoading = false;
  if (S.view === 'dia' && S.diaMode === 'semana') O.render();
}
// reparte en columnas los elementos que se solapan
function lanes(items){
  const out = []; let group = [], end = -1;
  const flush = () => { const cols = []; for (const it of group){ let c = cols.findIndex(e => e <= it.start); if (c < 0){ c = cols.length; cols.push(0); } cols[c] = it.end; it.col = c; } group.forEach(it => it.ncol = cols.length); out.push(...group); group = []; };
  for (const it of items.sort((a, b) => a.start - b.start || b.end - a.end)){ if (group.length && it.start >= end) flush(); group.push(it); end = Math.max(end, it.end); }
  if (group.length) flush();
  return out;
}
function wkTasks(d, blk, its){
  const works = its.filter(x => x.kind === 'work');
  const T = O.visibleTasks();
  return T.filter(t => { const sl = S.slots[t.id]; if (!sl || sl.day !== d) return false;
    const m = toMin(sl.at); const b = works.find(w => m >= w.start && m < w.end) || works.find(w => w.start >= m) || works[works.length - 1];
    return b && b.start === blk.start; }).sort(O.byOrder);
}
// Panel derecho de la semana: atrasadas, para hoy y sin fecha (arrástralas a un bloque)
function wkSide(){
  const hoy = O.today(), T = O.visibleTasks().filter(t => t.status !== 'done' && !t.ia && !(P().proc || {})[t.id]);
  const futuro = t => { const sl = S.slots[t.id]; return sl && sl.day >= hoy; };
  const libres = T.filter(t => !futuro(t));
  const atr = libres.filter(t => { const sl = S.slots[t.id]; return (sl && sl.day < hoy) || (t.today && t.today < hoy) || (t.day && t.day < hoy); });
  const hoyTs = libres.filter(t => !atr.includes(t) && (t.today === hoy || t.day === hoy));
  const sin = libres.filter(t => !atr.includes(t) && !hoyTs.includes(t) && !t.day && !t.today);
  const rank = (a, b) => O.urgRank(a) - O.urgRank(b) || O.byOrder(a, b);
  const sec = (k, title, ts, empty) => `<div class="urg wk-l" data-field="unslot" data-wk="${k}"><h4>${title}<span>${ts.length}</span></h4>
    <div class="list">${(k === 'hoy' ? porUrg(ts) : ts.sort(rank).map(t => O.card(t)).join('')) || `<div class="empty">${empty}</div>`}</div></div>`;
  // «Para hoy» en subgrupos por urgencia
  const porUrg = ts => Object.entries(O.URG).map(([u, x]) => { const g = ts.filter(t => (O.URG[t.priority] ? t.priority : 'normal') === u).sort(O.byOrder);
    return g.length ? `<div class="ugrp u-${u}"><div class="uh">${x.icon} ${x.label} <span>${g.length}</span></div>${g.map(t => O.card(t)).join('')}</div>` : ''; }).join('');
  return `<aside class="col side wk-side"><header><h3>Tareas para colocar</h3></header>
    ${sec('atr', '⏪ Atrasadas', atr, 'Nada atrasado 👌')}
    ${sec('hoy', '📌 Para hoy', hoyTs, 'Marca tareas con «Hoy» en Clientes')}
    ${sec('sin', '🗂️ Sin fecha', sin, 'No hay tareas sin fecha')}</aside>`;
}
let wkScale = {H0: 480, H1: 1440, cum: [0]};
const wkY = m => { const {H0, cum} = wkScale; return cum[Math.max(0, Math.min(cum.length - 1, Math.round(m) - H0))]; };
const wkM = y => { const {H0, cum} = wkScale; let k = 0; while (k < cum.length - 1 && cum[k + 1] <= y) k++; return H0 + k; };
// las notas de Google pueden venir en HTML: para mostrarlas se pasan a texto
const plainDesc = h => String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<li[^>]*>/gi, '• ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
function weekView(){
  const days = weekDays(), m = O.fromIso(days[0]), dEnd = O.fromIso(days[6]);
  const rango = m.getMonth() === dEnd.getMonth() ? `${m.getDate()} – ${dEnd.getDate()} ${O.MESES[m.getMonth()]}` : `${m.getDate()} ${O.MESES[m.getMonth()]} – ${dEnd.getDate()} ${O.MESES[dEnd.getMonth()]}`;
  O.setToolbar('Semana', rango,
    `<button class="icon" data-pweek="-1" aria-label="Semana anterior"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></button>
     <button class="chip" data-pweek="0">Hoy</button>
     <button class="icon" data-pweek="1" aria-label="Semana siguiente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg></button>
     <div class="modes"><button class="chip" data-dmode="dia" aria-pressed="false">Día</button><button class="chip" data-dmode="semana" aria-pressed="true">Semana</button><button class="chip" data-dmode="diario" aria-pressed="false">📒 Clientes</button></div>
     <span class="cal-st">${calStatus()}</span>`, 'Toca un día para abrirlo · toca un bloque para montarlo');
  const ROUTC = {comida:'#FFC93D', cena:'#C77DFF', deporte:'#3DDC97'};
  const per = days.map(d => {
    const evs = weekEv[d] || [];
    const its = buildDay(d, evs).filter(i => i.end > i.start);
    // ☀️ Arranque del día: cada día a las 08:30 (con su lista para marcar)
    const mi = P().morning || [], md = new Set((P().morningDone || {})[d] || []);
    if (mi.length) its.push({kind: 'morning', start: 510, end: 540, title: `☀️ Arranque ${md.size}/${mi.length}`, morning: true});
    return {d, allDay: evs.filter(e => e.allDay), its};
  });
  const all = per.flatMap(p => p.its);
  const G0 = Math.min(8 * 60, ...all.map(i => i.start)) , G1 = Math.max(22 * 60, ...all.map(i => i.end));
  const H0 = Math.floor(G0 / 60) * 60, H1 = Math.min(24 * 60, Math.ceil(G1 / 60) * 60), PXM = 0.9;
  const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes(), hoy = O.today();
  // píxeles por minuto (se estiran donde un bloque de trabajo de hoy o de días futuros tiene más tareas de las que caben)
  const ROWH = 33, w = new Array(H1 - H0).fill(PXM);
  for (const {d, its} of per){ if (d < hoy) continue;
    for (const b of its.filter(x => x.kind === 'work')){
      const n = wkTasks(d, b, its).length, need = 34 + n * ROWH, have = (b.end - b.start) * PXM;
      if (n && need > have){ const extra = (need - have) / (b.end - b.start); for (let m = Math.max(H0, b.start); m < Math.min(H1, b.end); m++) w[m - H0] = Math.max(w[m - H0], PXM + extra); }
    } }
  const cum = [0]; for (let k = 0; k < w.length; k++) cum.push(cum[k] + w[k]);
  const Y = m => cum[Math.max(0, Math.min(cum.length - 1, Math.round(m) - H0))];
  wkScale = {H0, H1, cum};
  let hours = '', lines = ''; for (let h = H0; h < H1; h += 60){ hours += `<div class="wk-h" style="top:${Y(h)}px"><span>${toHM(h)}</span></div>`; lines += `<i class="wk-line" style="top:${Y(h)}px"></i>`; }
  const tpl = days.map(d => d < hoy ? 'minmax(74px,.55fr)' : 'minmax(118px,1fr)').join(' ');
  const cols = per.map(({d, its}) => {
    const blocks = lanes(its.map(i => ({...i}))).map(i => {
      const top = Y(i.start), h = Math.max(16, Y(i.end) - Y(i.start) - 2);
      const w = 100 / i.ncol, left = i.col * w;
      let cls = 'ev', color = i.color || '#8E8E93', label = esc(i.title || ''), extra = '';
      let inner = '';
      const kcol = (P().kcolors || {});
      if (i.kind === 'work'){ cls = 'work'; color = kcol.work || 'var(--accent)'; label = esc(i.bname || 'Trabajo');
        const ts = wkTasks(d, i, its); extra = ts.length ? ` · ${ts.filter(t => t.status === 'done').length}/${ts.length}` : '';
        if (d < hoy){ cls += ' wk-old'; inner = ts.length ? `<span class="wk-sum">✓ ${ts.filter(t => t.status === 'done').length}/${ts.length}</span>` : ''; }
        else inner = `<div class="wk-ts">${ts.map((t, k) => { const c = O.client(t.client);
          return `<article class="card wk-t${t.status === 'done' ? ' done' : ''}" data-id="${t.id}" style="--c:${O.clientColor(c)}"><span class="wk-n">#${k + 1}</span><button class="chk" aria-label="Completar"></button><span class="wk-tx"><span class="tt">${esc(t.title)}</span><span class="wk-cl">${c ? esc(c.name) : 'Sin cliente'}</span></span></article>`; }).join('')}</div>`; }
      else if (i.kind === 'routine'){ cls = 'rout'; color = kcol['r:' + i.id] || ROUTC[i.id] || '#A3A3AD'; }
      else if (i.kind === 'morning'){ cls = 'morn'; color = kcol.morning || '#FFC93D'; }
      else if (i.isCall){ cls = 'call'; color = '#A78BFA'; label = '📞 ' + label; }
      else if (i.kind === 'free'){ cls = 'free'; }
      const gAttr = i.gid && i.mine ? ` data-gid="${esc(i.gid)}" data-gcal="${esc(i.gcal)}" data-gday="${d}" data-gs="${i.start}" data-ge="${i.end}" data-gorig="${i.gstart}"` : '';
      if (gAttr){ cls += ' g-ev'; const nt = plainDesc(i.desc).split('\n').find(x => x.trim()); if (nt && h > 40) inner = `<p class="wk-note">📝 ${esc(nt)}</p>`; }
      const past = d < hoy || (d === hoy && i.end <= nowMin);
      const canMove = d >= hoy && ((i.kind === 'routine') || (i.kind === 'work' && i.bid));
      const xAttr = (i.kind === 'morning' ? ` data-wmorn="${d}"` : i.kind === 'routine' ? ` data-wrout="r:${esc(i.id)}" data-wname="${esc(i.title)}"` : '')
        + (canMove ? ` data-mvday="${d}" data-mvs="${i.start}" data-mve="${i.end}" data-mvkey="${i.kind === 'work' ? 'b:' + i.bid : 'r:' + esc(i.id)}"` : '');
      if (canMove) cls += ' mv-ev';
      return `<div class="wk-ev ${cls}${past ? ' past' : ''}"${gAttr}${xAttr} ${i.kind === 'work' ? `data-wbuild="${d}" data-field="slot" data-value="${i.at}" data-day="${d}"` : ''} style="--hh:${h}px;top:${top}px;height:${h}px;left:calc(${left}% + 1px);width:calc(${w}% - 3px);--c:${color}" title="${label.replace(/"/g, '')} · ${toHM(i.start)}–${toHM(i.end)}">
        <b>${label}</b>${i.kind === 'work' && i.bid && d >= hoy ? `<button type="button" class="bname-ed" data-bname="${i.bid}" data-bday="${d}" title="Poner nombre al bloque">✏️</button>` : ''}${h > 26 ? `<small>${toHM(i.start)} – ${toHM(i.end)}${extra}</small>` : ''}${inner}${gAttr || (canMove) ? '<i class="g-res"></i>' : ''}</div>`;
    }).join('');
    const line = d === hoy && nowMin >= H0 && nowMin <= H1 ? `<i class="wk-now" style="top:${Y(nowMin)}px"></i>` : '';
    return `<div class="wk-col${d === hoy ? ' today' : d < hoy ? ' old' : ''}" data-wday="${d}">${blocks}${line}</div>`;
  }).join('');
  const heads = per.map(({d, allDay}) => { const x = O.fromIso(d);
    return `<button type="button" class="wk-head${d === hoy ? ' today' : d < hoy ? ' old' : ''}" data-wopen="${d}"><small>${O.DIAS_L[x.getDay()].slice(0, 3).toUpperCase()}</small><b>${x.getDate()}</b>
      ${allDay.slice(0, 2).map(e => `<span class="wk-all" style="--c:${e.color || '#8E8E93'}">${esc(e.title)}</span>`).join('')}</button>`; }).join('');
  const msg = calError ? `<div class="note warnbox">${esc(calError)}</div>` : weekLoading ? '<div class="note">Cargando la semana…</div>' : '';
  return `${msg}${O.statsBar ? O.statsBar() : ''}<div class="wk-wrap"><div class="wk"><div class="wk-grid" style="grid-template-columns:52px ${tpl}"><div class="wk-corner"></div>${heads}
    <div class="wk-hours" style="height:${Y(H1)}px">${hours}</div>
    <div class="wk-cols" style="height:${Y(H1)}px;grid-template-columns:${tpl}">${lines}${cols}</div></div></div>${wkSide()}</div>`;
}
/* ---------- Contador: hechas esta semana / este mes y pendientes por urgencia ---------- */
// Se apunta cada tarea hecha con su fecha (así se cuentan también las de ClickUp aunque ya no se descarguen)
O.statsBar = function(){
  const log = P().doneLog = P().doneLog || {};
  let cambio = false;
  for (const t of S.tasks) if (t.status === 'done' && t.doneAt && !O.isRegTask(t) && log[t.id] !== t.doneAt){ log[t.id] = t.doneAt; cambio = true; }
  const lim = O.iso(O.addDays(new Date(), -70)); for (const k in log) if (log[k] < lim){ delete log[k]; cambio = true; }
  if (cambio) setTimeout(O.save, 0);
  const hoy = O.today(), lun = O.iso(monday(hoy)), mes = hoy.slice(0, 7);
  const vals = Object.values(log), sem = vals.filter(d => d >= lun && d <= hoy).length, mesN = vals.filter(d => d.startsWith(mes)).length, hoyN = vals.filter(d => d === hoy).length;
  const pend = O.visibleTasks().filter(t => t.status !== 'done' && !t.ia);
  const byU = k => pend.filter(t => (O.URG[t.priority] ? t.priority : 'normal') === k).length;
  return `<div class="stats"><div class="st-done"><span><b>${hoyN}</b><small>hechas hoy</small></span><span><b>${sem}</b><small>esta semana</small></span><span><b>${mesN}</b><small>este mes</small></span></div>
    <div class="st-pend"><small>Pendientes</small>${Object.entries(O.URG).map(([k, u]) => `<span class="u-${k}" title="${u.label}">${u.icon} <b>${byU(k)}</b></span>`).join('')}<span class="st-tot">${pend.length} en total</span></div></div>`;
};
O.views.dia = function(){ return S.diaMode === 'diario' && O.diarioView ? O.diarioView() : S.diaMode === 'semana' ? weekView() : diaView(); };
O.views.dia.after = () => { if (S.diaMode === 'diario' && O.diarioView) return O.diarioAfter && O.diarioAfter(); diaAfter(); };
document.addEventListener('click', e => {
  const m = e.target.closest('[data-dmode]');
  if (m){ S.diaMode = m.dataset.dmode; try { localStorage.setItem('jp-diamode', S.diaMode); } catch(err){} O.render(); return; }
  const w = e.target.closest('[data-pweek]');
  if (w){ const n = +w.dataset.pweek; planDay = n === 0 ? O.today() : O.iso(O.addDays(O.fromIso(planDay), 7 * n)); lastEvents = []; O.render(); return; }
  const o = e.target.closest('[data-wopen]');
  if (o){ planDay = o.dataset.wopen; S.diaMode = 'dia'; lastEvents = weekEv[planDay] || []; O.render(); refresh(); return; }
  const x = e.target.closest('[data-wexp]');
  if (x){ const ev = x.closest('.wk-ev'); const on = ev.classList.toggle('open'); x.textContent = on ? 'Recoger' : x.dataset.lbl; return; }
  const mo = e.target.closest('[data-wmorn]'); if (mo){ openMorning(mo.dataset.wmorn); return; }
  const rc = e.target.closest('[data-wrout]'); if (rc){ if (!wkJustMade) openKColor(rc.dataset.wrout, rc.dataset.wname, rc.dataset.mvday); return; }
  const b = !e.target.closest('.card') && !wkJustMade && e.target.closest('[data-wbuild]');
  if (b){ planDay = b.dataset.wbuild; lastEvents = weekEv[planDay] || []; openBuild(planDay); }
});
let wkJustMade = false, wkGesture = false;
const miniDlg = document.createElement('dialog'); miniDlg.id = 'miniDlg';
miniDlg.innerHTML = '<form method="dialog" class="sheet" id="miniForm"></form>'; document.body.appendChild(miniDlg);
const miniForm = miniDlg.querySelector('form'); let miniDay = null, miniKey = null;
function openMorning(day){
  miniDay = day; miniKey = 'morning'; const d = O.fromIso(day), mi = P().morning || [], md = new Set((P().morningDone || {})[day] || []);
  miniForm.innerHTML = `<h2>☀️ Arranque del día · ${O.DIAS_L[d.getDay()]} ${d.getDate()}</h2>
    <div class="mlist">${mi.map((t, k) => `<label class="mitem"><input type="checkbox" data-mk="${k}" ${md.has(k) ? 'checked' : ''}> ${esc(t)}</label>`).join('')}</div>
    <label>Color</label>${swatches((P().kcolors || {}).morning || '', 'data-kcol', Object.fromEntries(APPCOL.map(c => [c, c])))}
    <div class="actions"><button type="button" class="btn" data-mall>Marcar todo</button><button type="button" class="btn" data-medit>✏️ Editar</button><span class="sp"></span><button class="btn primary" value="ok">Listo</button></div>`;
  if (!miniDlg.open) miniDlg.showModal();
}
// ✏️ Editar la lista del Arranque (la misma para todos los días): textos, orden, añadir y quitar
let mDraft = null;
function morningEdit(){
  mDraft = mDraft || (P().morning || []).map((t, i) => ({t, old: i}));
  miniForm.innerHTML = `<h2>✏️ Editar el Arranque</h2><p class="iahint">Se aplica a todos los días. Ordena arrastrando ⠿ o con las flechas.</p>
    <div class="mlist medit-list">${mDraft.map((m, k) => `<div class="medit" draggable="true" data-mi="${k}"><span class="mgrip" title="Arrastrar">⠿</span>
      <input type="text" data-mtxt="${k}" value="${esc(m.t)}" placeholder="Escribe el punto…">
      <button type="button" class="micon" data-mup="${k}" ${k === 0 ? 'disabled' : ''} aria-label="Subir">↑</button><button type="button" class="micon" data-mdown="${k}" ${k === mDraft.length - 1 ? 'disabled' : ''} aria-label="Bajar">↓</button><button type="button" class="micon del" data-mrm="${k}" aria-label="Quitar">×</button></div>`).join('')}</div>
    <button type="button" class="btn" data-madd>+ Añadir punto</button>
    <div class="actions"><button type="button" class="btn" data-mcancel>Cancelar</button><span class="sp"></span><button type="button" class="btn primary" data-msave>Guardar</button></div>`;
}
const mSync = () => miniForm.querySelectorAll('[data-mtxt]').forEach(i => { mDraft[+i.dataset.mtxt].t = i.value; });
function mMove(from, to){ mSync(); if (to < 0 || to >= mDraft.length || from === to) return; const [x] = mDraft.splice(from, 1); mDraft.splice(to, 0, x); morningEdit(); }
function mSave(){
  mSync();
  const keep = mDraft.map(m => ({...m, t: m.t.trim()})).filter(m => m.t);
  const p = P(), map = new Map(keep.filter(m => m.old != null).map((m, i) => [m.old, keep.indexOf(m)]));
  p.morning = keep.map(m => m.t);
  for (const d in (p.morningDone || {})) p.morningDone[d] = (p.morningDone[d] || []).filter(i => map.has(i)).map(i => map.get(i));   // lo ya marcado sigue marcado
  mDraft = null; O.save(); openMorning(miniDay); O.render();
}
miniForm.addEventListener('click', e => {
  if (e.target.closest('[data-medit]')){ mDraft = null; morningEdit(); return; }
  if (!mDraft) return;
  const t = e.target.closest('[data-mup],[data-mdown],[data-mrm],[data-madd],[data-mcancel],[data-msave]'); if (!t) return;
  if (t.dataset.mup) return mMove(+t.dataset.mup, +t.dataset.mup - 1);
  if (t.dataset.mdown) return mMove(+t.dataset.mdown, +t.dataset.mdown + 1);
  if (t.dataset.mrm){ mSync(); mDraft.splice(+t.dataset.mrm, 1); return morningEdit(); }
  if (t.hasAttribute('data-madd')){ mSync(); mDraft.push({t: '', old: null}); morningEdit(); const ins = miniForm.querySelectorAll('[data-mtxt]'); ins[ins.length - 1].focus(); return; }
  if (t.hasAttribute('data-mcancel')){ mDraft = null; return openMorning(miniDay); }
  if (t.hasAttribute('data-msave')) return mSave();
});
let mDrag = null;
miniForm.addEventListener('dragstart', e => { const r = e.target.closest && e.target.closest('.medit'); if (!r || !mDraft) return; if (e.target.tagName === 'INPUT') return e.preventDefault(); mDrag = +r.dataset.mi; e.dataTransfer.effectAllowed = 'move'; r.classList.add('dragging'); });
miniForm.addEventListener('dragover', e => { const r = e.target.closest && e.target.closest('.medit'); if (mDrag == null || !r) return; e.preventDefault(); miniForm.querySelectorAll('.medit.over').forEach(x => x.classList.remove('over')); r.classList.add('over'); });
miniForm.addEventListener('drop', e => { const r = e.target.closest && e.target.closest('.medit'); if (mDrag == null || !r) return; e.preventDefault(); const f = mDrag; mDrag = null; mMove(f, +r.dataset.mi); });
miniForm.addEventListener('dragend', () => { mDrag = null; miniForm.querySelectorAll('.medit').forEach(x => x.classList.remove('over', 'dragging')); });
miniForm.addEventListener('keydown', e => { if (mDraft && e.key === 'Enter' && e.target.dataset.mtxt != null){ e.preventDefault(); } });
function openKColor(key, name, day){
  miniKey = key; miniDay = null; miniForm.dataset.day = day || '';
  const mv = day && ((P().moved || {})[day] || {})[key];
  miniForm.innerHTML = `<h2>${esc(name)}</h2><label>Color (en todos los días)</label>${swatches((P().kcolors || {})[key] || '', 'data-kcol', Object.fromEntries(APPCOL.map(c => [c, c])))}
    ${day ? (() => { const el = document.querySelector(`.wk-ev[data-mvkey="${key}"][data-mvday="${day}"]`), s = el ? +el.dataset.mvs : 0, en = el ? +el.dataset.mve : 0;
      return el ? `<label>Hora solo este día</label><div class="row"><input type="time" step="300" data-mvt="s" value="${toHM(s)}"><input type="time" step="300" data-mvt="e" value="${toHM(en)}"></div>
      <p class="iahint">También puedes arrastrarla en el calendario con el ratón o el Pencil (y estirarla desde abajo).</p>` : ''; })() : ''}
    <div class="actions">${mv ? `<button type="button" class="btn" data-unmove="${esc(key)}" data-unday="${day}">↺ Volver a su hora</button>` : ''}<span class="sp"></span><button class="btn primary" value="ok">Listo</button></div>`;
  miniDlg.showModal();
}
miniForm.addEventListener('change', e => {
  const t = e.target.dataset.mvt;
  if (t){ const um = miniForm.querySelector('[data-mvt="s"]'), ue = miniForm.querySelector('[data-mvt="e"]'), day = miniForm.dataset.day;
    const a = toMin(um.value), b = toMin(ue.value); if (!day || !(b > a)) return;
    const m = (P().moved = P().moved || {}); (m[day] = m[day] || {})[miniKey] = {start: a, end: b}; O.save(); O.render(); return; }
  const k = e.target.dataset.mk; if (k === undefined || !miniDay) return;
  const p = P(), set = new Set((p.morningDone = p.morningDone || {})[miniDay] || []);
  e.target.checked ? set.add(+k) : set.delete(+k); p.morningDone[miniDay] = [...set]; O.save();
});
miniForm.addEventListener('click', e => {
  const um = e.target.closest('[data-unmove]');
  if (um){ const m = (P().moved || {})[um.dataset.unday]; if (m) delete m[um.dataset.unmove]; O.save(); miniDlg.close(); O.render(); return; }
  const c = e.target.closest('[data-kcol]');
  if (c){ const kc = P().kcolors = P().kcolors || {}; kc[miniKey] = c.dataset.kcol; O.save(); miniForm.querySelectorAll('[data-kcol]').forEach(b => b.classList.toggle('on', b === c)); return; }
  if (e.target.closest('[data-mall]') && miniDay){ const p = P(); p.morningDone = p.morningDone || {}; p.morningDone[miniDay] = (p.morning || []).map((_, i) => i); O.save(); miniForm.querySelectorAll('[data-mk]').forEach(x => x.checked = true); }
});
miniDlg.addEventListener('close', () => { mDraft = null; if (S.view === 'dia') O.render(); });
miniDlg.addEventListener('click', e => { if (e.target === miniDlg) miniDlg.close(); });
/* ---------- Eventos de Google desde la semana: crear, mover, estirar, editar y borrar ---------- */
const evDlg = document.createElement('dialog'); evDlg.id = 'evDlg';
evDlg.innerHTML = '<form method="dialog" class="sheet" id="evForm"></form>'; document.body.appendChild(evDlg);
const evForm = evDlg.querySelector('form'); let evCur = null;
const misCals = () => ((P().accounts.find(a => a.bridge) || {}).cals || []).filter(c => !/holiday|#/.test(c.id));
const msAt = (day, min) => O.fromIso(day).getTime() + min * 60e3;
const hmIn = v => toMin(v || '00:00');
async function wkReload(...ds){ for (const d of ds) delete weekEv[d]; clearCache(); lastEvents = []; await loadWeek(); if (S.view === 'dia') O.render(); }
function wkCreate(day, s, e){
  evCur = {nuevo: true, day, s, e};
  const cals = misCals();
  evForm.innerHTML = `<h2>Nuevo bloque · ${toHM(s)} – ${toHM(e)}</h2>
    <div class="modes evtype"><button type="button" class="chip" data-evt="work" aria-pressed="false">🧱 Trabajo (tareas)</button><button type="button" class="chip" data-evt="ev" aria-pressed="true">📅 Evento / bloque</button></div>
    <div class="evfields"><label>Título<input name="title" placeholder="Ej.: Gestiones personales, Grabar reels, Médico…" autocomplete="off"></label>
    <div class="row"><label>Empieza<input type="time" name="s" step="900" value="${toHM(s)}"></label><label>Acaba<input type="time" name="e" step="900" value="${toHM(e)}"></label></div>
    <label>Notas<textarea name="desc" rows="4" placeholder="Lo que quieras apuntar para organizarte en este bloque…"></textarea></label>
    ${cals.length > 1 ? `<label>Calendario<select name="cal">${cals.map(c => `<option value="${esc(c.id)}" ${c.on ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : ''}
    <p class="iahint">Se crea en tu Google Calendar (cuenta personal).</p></div>
    <div class="actions"><span class="sp"></span><button type="button" class="btn" data-evcancel>Cancelar</button><button class="btn primary" value="ok">Crear</button></div>`;
  evDlg.showModal(); setTimeout(() => evForm.querySelector('[name=title]').focus(), 50);
}
function wkEditEvent(el){
  const ev = (weekEv[el.dataset.gday] || []).find(x => x.gid === el.dataset.gid && String(x.gstart) === el.dataset.gorig) || {};
  evCur = {nuevo: false, day: el.dataset.gday, gid: el.dataset.gid, gcal: el.dataset.gcal, orig: el.dataset.gorig, desc0: plainDesc(ev.desc), title0: ev.title || '', color0: ev.ecolor || '', color: ev.ecolor || ''};
  evForm.innerHTML = `<h2>${esc(ev.title || 'Evento')}</h2>
    <label>Título<input name="title" value="${esc(ev.title || '')}" autocomplete="off"></label>
    <div class="row"><label>Día<input type="date" name="day" value="${el.dataset.gday}"></label><label>Empieza<input type="time" name="s" step="900" value="${toHM(+el.dataset.gs)}"></label><label>Acaba<input type="time" name="e" step="900" value="${toHM(+el.dataset.ge)}"></label></div>
    <label>Notas<textarea name="desc" rows="6" placeholder="Apunta aquí lo que necesites…">${esc(plainDesc(ev.desc))}</textarea></label>
    <label>Color</label>${swatches(ev.ecolor || '', 'data-gcol', GCOL)}
    <p class="iahint">Los cambios se guardan en tu Google Calendar.${ev.rec ? ' Este evento se repite: los cambios de hora y color son solo para este día.' : ''}</p>
    <div class="actions">${ev.rec ? '<button type="button" class="btn danger" data-evdel>Borrar solo este</button><button type="button" class="btn danger" data-evdel="all">Borrar todos</button>' : '<button type="button" class="btn danger" data-evdel>Borrar</button>'}<span class="sp"></span><button type="button" class="btn" data-evcancel>Cancelar</button><button class="btn primary" value="ok">Guardar</button></div>`;
  evDlg.showModal();
}
evForm.addEventListener('click', async e => {
  if (e.target.closest('[data-evcancel]')){ evDlg.close('cancel'); return; }
  const t = e.target.closest('[data-evt]');
  if (t){ if (t.dataset.evt === 'work'){ const c = evCur; evCur = null; evDlg.close('cancel'); wkAddBlock(c.day, c.s, c.e); } return; }
  const sw = e.target.closest('[data-gcol]');
  if (sw && evCur){ evCur.color = sw.dataset.gcol; evForm.querySelectorAll('[data-gcol]').forEach(b => b.classList.toggle('on', b === sw)); return; }
  const del = e.target.closest('[data-evdel]');
  if (del){
    const todos = del.dataset.evdel === 'all';
    if (!confirm(todos ? '¿Borrar TODOS los eventos de esta serie (los de todos los días) de tu Google Calendar?' : '¿Borrar este evento (solo este día) de tu Google Calendar?')) return;
    const c = evCur; evCur = null; evDlg.close('cancel');
    try { await bridge({a: 'delete', cal: c.gcal, id: c.gid, orig: c.orig, ...(todos ? {all: '1'} : {})}); O.toast(todos ? 'Serie borrada' : 'Evento borrado'); } catch(err){ O.toast('No se pudo borrar: ' + err.message); }
    if (todos){ for (const k in weekEv) delete weekEv[k]; }
    wkReload(c.day);
  }
});
// Se crea/guarda al enviar el formulario (botón o Intro); el «close» queda de respaldo
evForm.addEventListener('submit', e => {
  e.preventDefault();
  const v = (e.submitter && e.submitter.value) || 'ok';
  evDlg.close(v); evDone(v);
});
evDlg.addEventListener('close', () => evDone(evDlg.returnValue));
async function evDone(rv){
  const c = evCur; evCur = null;
  if (rv !== 'ok' || !c) return;
  const f = evForm, val = n => (f.querySelector(`[name=${n}]`) || {}).value;
  const s = hmIn(val('s')), en = hmIn(val('e'));
  if (en <= s) return O.toast('La hora de fin tiene que ser después del inicio');
  try {
    if (c.nuevo){
      const cal = val('cal') || (misCals().find(x => x.on) || misCals()[0] || {}).id;
      if (!cal) throw new Error('no hay calendario del puente');
      await bridge({a: 'create', cal, title: (val('title') || '').trim() || 'Bloque', desc: val('desc') || '', start: msAt(c.day, s), end: msAt(c.day, en)});
      O.toast('Creado en tu Google Calendar ✓'); wkReload(c.day);
    } else {
      const day = val('day') || c.day;
      const q = {a: 'update', cal: c.gcal, id: c.gid, orig: c.orig, start: msAt(day, s), end: msAt(day, en)};
      if (val('title') !== c.title0) q.title = val('title');
      if (val('desc') !== c.desc0) q.desc = val('desc');
      if (c.color && c.color !== c.color0) q.color = c.color;
      await bridge(q);
      O.toast('Guardado en tu Google Calendar ✓'); wkReload(c.day, day);
    }
  } catch(err){ O.toast('Google Calendar: ' + err.message); }
}
evDlg.addEventListener('click', e => { if (e.target === evDlg) evDlg.close('cancel'); });
// Arrastrar un evento (cambiarlo de hora o de día) o estirarlo desde el borde de abajo
document.addEventListener('pointerdown', e => {
  const el = e.target.closest('.wk-ev.g-ev'); if (!el || e.button !== 0) return;
  const res = !!e.target.closest('.g-res');
  if (e.pointerType === 'touch' && !res){   // en el móvil: tocar abre la ficha (ahí se cambia la hora o el día)
    const sx = e.clientX, sy = e.clientY;
    addEventListener('pointerup', ev => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 8) wkEditEvent(el); }, {once: true}); return;
  }
  e.preventDefault(); e.stopPropagation();
  const s0 = +el.dataset.gs, e0 = +el.dataset.ge, len = e0 - s0, y0 = e.clientY, x0 = e.clientX, snap15 = m => Math.round(m / 15) * 15;
  let day = el.dataset.gday, s = s0, en = e0, moved = false;
  el.classList.add('dragging-ev');
  const mv = ev => {
    if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 5) moved = true; if (!moved) return;
    const dy = ev.clientY - y0;
    if (res){ en = Math.max(s0 + 15, Math.min(24 * 60, snap15(wkM(wkY(e0) + dy)))); el.style.height = wkY(en) - wkY(s0) - 2 + 'px'; }
    else {
      s = Math.max(0, Math.min(24 * 60 - len, snap15(wkM(wkY(s0) + dy)))); en = s + len;
      const col = document.elementsFromPoint(ev.clientX, ev.clientY).find(x => x.classList && x.classList.contains('wk-col'));
      if (col && col.dataset.wday !== day){ day = col.dataset.wday; col.appendChild(el); }
      el.style.top = wkY(s) + 'px'; el.style.height = wkY(en) - wkY(s) - 2 + 'px'; el.style.left = '1px'; el.style.width = 'calc(100% - 3px)';
    }
    const sm = el.querySelector('small'); if (sm) sm.textContent = `${toHM(s)} – ${toHM(en)}`;
  };
  const fin = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', fin); el.classList.remove('dragging-ev'); };
  const up = async () => {
    fin(); wkJustMade = true; setTimeout(() => wkJustMade = false, 150);
    if (!moved) return wkEditEvent(el);
    if (day === el.dataset.gday && s === s0 && en === e0) return;
    try { await bridge({a: 'update', cal: el.dataset.gcal, id: el.dataset.gid, orig: el.dataset.gorig, start: msAt(day, s), end: msAt(day, en)}); O.toast(`Movido a ${toHM(s)} – ${toHM(en)} ✓`); }
    catch(err){ O.toast('No se pudo mover: ' + err.message); }
    wkReload(el.dataset.gday, day);
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', fin);
}, true);

// Arrastrar la comida/rutinas (solo ese día) y los bloques de trabajo; estirarlos desde el borde de abajo
document.addEventListener('pointerdown', e => {
  const el = e.target.closest('.wk-ev.mv-ev'); if (!el || e.button !== 0 || e.target.closest('.card,button')) return;
  const res = !!e.target.closest('.g-res');
  if (e.pointerType === 'touch' && !res) return;          // con el dedo se hace scroll; con ratón o Pencil se arrastra
  const s0 = +el.dataset.mvs, e0 = +el.dataset.mve, len = e0 - s0, y0 = e.clientY, x0 = e.clientX, snap = m => Math.round(m / 5) * 5;
  const key = el.dataset.mvkey, day0 = el.dataset.mvday, esBloque = key.startsWith('b:');
  let day = day0, s = s0, en = e0, moved = false;
  if (res) e.preventDefault();
  const mv = ev => {
    if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
    if (!moved){ moved = true; el.classList.add('dragging-ev'); }
    ev.preventDefault();
    const dy = ev.clientY - y0;
    if (res){ en = Math.max(s0 + 15, Math.min(24 * 60, snap(wkM(wkY(e0) + dy)))); el.style.height = wkY(en) - wkY(s0) - 2 + 'px'; }
    else {
      s = Math.max(0, Math.min(24 * 60 - len, snap(wkM(wkY(s0) + dy)))); en = s + len;
      if (esBloque){ const col = document.elementsFromPoint(ev.clientX, ev.clientY).find(x => x.classList && x.classList.contains('wk-col'));
        if (col && col.dataset.wday !== day && col.dataset.wday >= O.today()){ day = col.dataset.wday; col.appendChild(el); } }
      el.style.top = wkY(s) + 'px'; el.style.height = wkY(en) - wkY(s) - 2 + 'px'; el.style.left = '1px'; el.style.width = 'calc(100% - 3px)';
    }
    const sm = el.querySelector('small'); if (sm) sm.textContent = `${toHM(s)} – ${toHM(en)}`;
  };
  const fin = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', fin); el.classList.remove('dragging-ev'); };
  const up = () => {
    fin(); if (!moved) return;
    wkJustMade = true; setTimeout(() => wkJustMade = false, 200);
    if (day === day0 && s === s0 && en === e0) return O.render();
    if (esBloque){
      const id = key.slice(2), from = dayBlocks(day0) || [], b = from.find(x => x.id === id); if (!b) return O.render();
      b.start = s; b.end = en;
      if (day !== day0){ P().dayBlocks[day0] = from.filter(x => x !== b);
        if (!dayBlocks(day)) P().dayBlocks[day] = day >= MANUAL_FROM ? [] : buildDay(day, weekEv[day] || [], true).filter(i => i.kind === 'work').map(i => ({id: Math.random().toString(36).slice(2, 8), start: i.start, end: i.end}));
        P().dayBlocks[day].push(b); }
      P().dayBlocks[day].sort((a, c) => a.start - c.start);
    } else {
      const m = (P().moved = P().moved || {}); (m[day0] = m[day0] || {})[key] = {start: s, end: en};
    }
    O.save(); O.render(); O.toast(`${esBloque ? 'Bloque' : 'Movido'} a ${toHM(s)} – ${toHM(en)} ✓`);
  };
  addEventListener('pointermove', mv, {passive: false}); addEventListener('pointerup', up); addEventListener('pointercancel', fin);
}, true);
// ✏️ Poner nombre a un bloque de trabajo
document.addEventListener('click', e => {
  const n = e.target.closest('[data-bname]'); if (!n) return;
  e.preventDefault(); e.stopPropagation();
  const b = (dayBlocks(n.dataset.bday) || []).find(x => x.id === n.dataset.bname); if (!b) return;
  const v = prompt('Nombre del bloque (vacío = «Trabajo»)', b.name || '');
  if (v === null) return;
  b.name = v.trim().slice(0, 60); O.save(); O.render();
  if (typeof drawGrid === 'function' && document.querySelector('dialog[open] .bgrid, dialog[open] #bgrid')) drawGrid();
}, true);
function wkAddBlock(day, s, e){
  const blocks = P().dayBlocks = P().dayBlocks || {};
  if (!blocks[day]) blocks[day] = day >= MANUAL_FROM ? [] : buildDay(day, weekEv[day] || [], true).filter(i => i.kind === 'work').map(i => ({id: Math.random().toString(36).slice(2, 8), start: i.start, end: i.end}));
  if (blocks[day].some(b => b.start === s && b.end === e)) return;   // evita duplicados
  blocks[day].push({id: Math.random().toString(36).slice(2, 8), start: s, end: e});
  blocks[day].sort((a, b) => a.start - b.start);
  O.save(); O.render(); O.toast(`Bloque de trabajo ${toHM(s)} – ${toHM(e)}`);
}
document.addEventListener('pointerdown', e => {
  const col = e.target.closest('.wk-col'); if (!col || e.target.closest('.wk-ev') || e.button !== 0) return;
  const day = col.dataset.wday;
  const atY = y => { const r = col.getBoundingClientRect(); return Math.max(wkScale.H0, Math.min(24 * 60, Math.round(wkM(y - r.top) / 15) * 15)); };
  const s0 = atY(e.clientY);
  if (wkGesture) return;
  if (e.pointerType === 'touch'){ // en el móvil: tocar un hueco crea un bloque de 1 h (arrastrar sigue siendo hacer scroll)
    const sx = e.clientX, sy = e.clientY; wkGesture = true;
    const fin = () => { removeEventListener('pointerup', up); removeEventListener('pointercancel', fin); wkGesture = false; };
    const up = ev => { fin(); if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 8 ) wkCreate(day, s0, Math.min(24 * 60, s0 + 60)); };
    addEventListener('pointerup', up); addEventListener('pointercancel', fin); return;
  }
  e.preventDefault(); wkGesture = true;
  const g = document.createElement('div'); g.className = 'wk-ev work wk-new'; col.appendChild(g);
  let s = s0, en = s0 + 15;
  const draw = () => { g.style.top = wkY(s) + 'px'; g.style.height = wkY(en) - wkY(s) + 'px'; g.style.left = '1px'; g.style.width = 'calc(100% - 3px)'; g.innerHTML = `<b>Trabajo</b><small>${toHM(s)} – ${toHM(en)}</small>`; };
  draw();
  const mv = ev => { const m = atY(ev.clientY); if (m >= s0){ s = s0; en = Math.max(s0 + 15, m); } else { s = m; en = s0 + 15; } draw(); };
  const fin = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', fin); g.remove(); wkGesture = false; };
  const up = () => { fin(); wkJustMade = true; setTimeout(() => wkJustMade = false, 100); if (en - s >= 15) wkCreate(day, s, en); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', fin);
});
S.diaMode = S.diaMode || 'semana';   // al abrir la app, Semana; al recargar se respeta donde estabas
// al guardar bloques o refrescar el calendario, la semana se recarga
setInterval(() => { if (S.view === 'dia' && S.diaMode === 'semana' && !document.querySelector('dialog[open]')){ for (const k in weekEv) delete weekEv[k]; clearCache(); loadWeek(); } }, 5 * 60e3);
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
        // id fijo sacado del archivo: si dos dispositivos lo importan a la vez, sigue siendo la misma tarea (no se duplica)
        const tid = 'ib' + String(f.id).replace(/[^\w]/g, '').slice(-14);
        const t = parseInbox(title, f.text || ''); t.id = tid;
        if (S.tasks.some(x => x.id === tid || (x.ia && x.title === t.title && (x.meeting || '') === (t.meeting || '')))) continue;
        S.tasks.push(t); n++;
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
    <button type="button" class="btn" data-bcolor>🎨 Color</button><button type="button" class="btn" data-bauto>Propuesta automática</button><button type="button" class="btn" data-bclear>Vaciar</button>
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
      <b>${esc(b.name || 'Trabajo')}</b><small>${toHM(b.start)}–${toHM(b.end)} · ${dur(b.end - b.start)}</small>
      <button type="button" class="bname-ed" data-bname="${b.id}" data-bday="${bDay}" title="Poner nombre al bloque">✏️</button><button type="button" class="bdel" data-bdel aria-label="Quitar bloque">×</button><i class="bres" data-bres></i></div>`;
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
  if (e.target.closest('[data-bcolor]')) openKColor('work', 'Bloques de trabajo');
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
// 5 min: campanita suave de tres notas. 1 min: «bip-bip» rápido repetido, más urgente.
function chime(kind = 'soft'){
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume();
    const t0 = actx.currentTime;
    const notes = kind === 'urgent'
      ? [0, .14, .5, .64, 1, 1.14].map(d => [1320, d, .1, 'triangle'])
      : [[880, 0, .9, 'sine'], [1175, .18, .9, 'sine'], [1568, .36, .9, 'sine']];
    notes.forEach(([f, d, len, type]) => {
      const o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0, t0 + d); g.gain.linearRampToValueAtTime(kind === 'urgent' ? .3 : .25, t0 + d + .01); g.gain.exponentialRampToValueAtTime(.001, t0 + d + len);
      o.connect(g).connect(actx.destination); o.start(t0 + d); o.stop(t0 + d + len + .05);
    });
  } catch(e){}
}
// el navegador solo deja sonar después de un toque: se «desbloquea» con el primer clic
document.addEventListener('pointerdown', () => { if (!actx && bellOn()) try { actx = new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch(e){} }, {once: true});
const avisadas = (() => { try { return JSON.parse(localStorage.getItem('jp-avisos') || '{}'); } catch(e){ return {}; } })();
function avisar(key, title, min = 5){
  avisadas[key] = 1; try { localStorage.setItem('jp-avisos', JSON.stringify(Object.fromEntries(Object.entries(avisadas).filter(([k]) => parseInt(k) > Date.now() - 864e5)))); } catch(e){}
  if (!bellOn()) return;
  chime(min === 1 ? 'urgent' : 'soft'); O.toast(min === 1 ? `📞 ¡En 1 minuto!: ${title}` : `📞 En 5 min: ${title}`);
  try { if ('Notification' in window && Notification.permission === 'granted') new Notification(min === 1 ? 'Reunión en 1 minuto' : 'Reunión en 5 minutos', {body: title, icon: 'logo-claro.png', tag: 'reu-' + key}); } catch(e){}
}
document.addEventListener('click', e => {
  if (!e.target.closest('[data-bell]')) return;
  const on = !bellOn(); try { localStorage.setItem('jp-bell', on ? 'on' : 'off'); } catch(err){}
  if (on){ chime(); O.toast('🔔 Te avisaré con un sonido 5 min y 1 min antes de cada reunión'); try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch(err){} }
  else O.toast('🔕 Aviso de reuniones desactivado en este dispositivo');
  O.render();
});
// Temporizador de la siguiente reunión: se actualiza cada segundo
function tickCd(){ for (const el of document.querySelectorAll('[data-cdto]')){ const ms = +el.dataset.cdto - Date.now(), s = Math.max(0, Math.round(ms / 1000));
  if (el.dataset.mtg !== undefined && s > 0){
    if (s <= 60 && !avisadas[el.dataset.cdto + ':1']){ avisadas[el.dataset.cdto] = 1; avisar(el.dataset.cdto + ':1', el.dataset.mtg, 1); }
    else if (s > 60 && s <= 300 && !avisadas[el.dataset.cdto]) avisar(el.dataset.cdto, el.dataset.mtg, 5);
  }
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
