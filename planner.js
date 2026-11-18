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
});
if (!S.plan) S.plan = PLAN_DEFAULT();
const P = () => (S.plan = S.plan || PLAN_DEFAULT());

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
const tokenOk = email => tokens[email] && tokens[email].exp > Date.now() + 60e3;
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
const clearCache = () => { for (const k in evCache) delete evCache[k]; };
async function fetchEvents(day){
  const start = O.fromIso(day), end = O.addDays(start, 1);
  const out = [];
  await Promise.all(P().accounts.map(async acc => {
    const key = acc.email + '|' + day;
    if (evCache[key]) return out.push(...evCache[key]);
    if (!tokenOk(acc.email)) return;
    const evs = [];
    await Promise.all(acc.cals.filter(c => c.on).map(async c => {
      const u = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(c.id)}/events?singleEvents=true&orderBy=startTime`
        + `&timeMin=${encodeURIComponent(start.toISOString())}&timeMax=${encodeURIComponent(end.toISOString())}&maxResults=100`;
      const r = await gapi(u, tokens[acc.email].token);
      for (const e of r.items || []){
        if (e.status === 'cancelled') continue;
        const meDeclined = (e.attendees || []).some(a => a.self && a.responseStatus === 'declined');
        if (meDeclined) continue;
        const allDay = !!(e.start && e.start.date);
        const s = allDay ? null : new Date(e.start.dateTime), en = allDay ? null : new Date(e.end.dateTime);
        evs.push({title: e.summary || '(sin título)', allDay, color: c.color, cal: c.name, free: e.transparency === 'transparent',
          start: s ? Math.max(0, minutesOfDay(s, day)) : 0, end: en ? Math.min(24*60, minutesOfDay(en, day)) : 0, link: e.htmlLink});
      }
    }));
    evCache[key] = evs; out.push(...evs);
  }));
  return out;
}
function minutesOfDay(d, day){ const base = O.fromIso(day); return Math.round((d - base) / 60000); }

/* ---------- Construir el día ---------- */
function buildDay(day, events){
  const plan = P(), dow = O.fromIso(day).getDay();
  const items = [];
  for (const e of events.filter(e => !e.allDay)) items.push({kind: e.free ? 'free' : 'event', ...e});
  for (const r of plan.routines.filter(r => r.on && r.days.includes(dow)))
    items.push({kind:'routine', title:`${r.icon || ''} ${r.name}`.trim(), start:toMin(r.start), end:toMin(r.end), id:r.id});
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
  return accs.map(a => tokenOk(a.email)
    ? `<span class="chip on" title="${esc(a.email)}">📅 ${esc(short(a.email))}</span>`
    : `<button class="chip warn" data-gcal="${esc(a.email)}" title="Google pide confirmar cada hora">↻ ${esc(short(a.email))}</button>`).join('')
    + `<button class="chip" data-gcal="add" title="Conectar otra cuenta de Google">+ Calendario</button>`;
}
O.views.dia = function(){
  const d = O.fromIso(planDay), isToday = planDay === O.today();
  O.setToolbar('Día', `${O.DIAS_L[d.getDay()]} ${d.getDate()} ${O.MESES[d.getMonth()]}`,
    `<button class="icon" data-pday="-1" aria-label="Día anterior"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></button>
     <button class="chip" data-pday="0">Hoy</button>
     <button class="icon" data-pday="1" aria-label="Día siguiente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg></button>
     <span class="cal-st">${calStatus()}</span>`, 'Arrastra tareas a los bloques de trabajo');

  const items = buildDay(planDay, lastEvents);
  const workAts = new Set(items.filter(i => i.kind === 'work').map(i => i.at));
  const T = O.visibleTasks();
  const slotted = t => { const sl = S.slots[t.id]; return sl && sl.day === planDay && workAts.has(sl.at) ? sl.at : null; };
  const now = new Date(), nowMin = isToday ? now.getHours()*60 + now.getMinutes() : -1;
  const allDay = lastEvents.filter(e => e.allDay);

  let tl = allDay.length ? `<div class="allday">${allDay.map(e => `<span class="tag" style="--c:${e.color}"><i></i>${esc(e.title)}</span>`).join('')}</div>` : '';
  for (const it of items){
    const range = `${toHM(it.start)}–${toHM(it.end)}`, live = nowMin >= it.start && nowMin < it.end ? ' live' : '';
    if (it.kind === 'work'){
      const ts = T.filter(t => slotted(t) === it.at).sort(O.byOrder);
      const used = ts.length;
      tl += `<section class="blk work${live}" data-field="slot" data-value="${it.at}" data-day="${planDay}">
        <header><b>Trabajo</b><span class="rg">${range} · ${dur(it.end - it.start)}</span><span class="count">${used || ''}</span></header>
        <div class="list">${ts.map(t => O.card(t)).join('') || '<div class="empty">Suelta tareas aquí</div>'}</div></section>`;
    } else {
      const cls = it.kind === 'routine' ? 'routine' : it.kind === 'free' ? 'free' : 'event';
      tl += `<div class="blk ${cls}${live}" style="--c:${it.color || 'var(--accent)'}"><span class="rg">${range}</span><b>${esc(it.title)}</b>${it.cal ? `<span class="cal">${esc(it.cal)}</span>` : ''}</div>`;
    }
  }
  const pend = T.filter(t => t.status !== 'done' && !slotted(t) && (!t.day || t.day <= planDay))
    .sort((a,b) => (a.priority==='alta'?0:1) - (b.priority==='alta'?0:1) || (a.day||'9').localeCompare(b.day||'9') || O.byOrder(a,b));
  const side = `<section class="col side" data-field="unslot"><header><h3>Por colocar</h3><span class="count">${pend.length}</span></header>
    <div class="list">${pend.map(t => O.card(t)).join('') || '<div class="empty">Todo colocado 👌</div>'}</div></section>`;
  const msg = calError ? `<div class="note warnbox">${esc(calError)}</div>` : loading ? '<div class="note">Cargando calendario…</div>' : '';
  return `${msg}<div class="planner"><div class="timeline">${tl}</div>${side}</div>`;
};
O.views.dia.after = () => {
  const need = P().accounts.some(a => tokenOk(a.email) && !evCache[a.email + '|' + planDay]);
  if (need && !loading) refresh();
};
async function refresh(){
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
    <h3 class="h3">Calendarios de Google</h3>
    ${!GCAL_CLIENT_ID ? '<div class="note">Pendiente de activar Google Calendar en el proyecto.</div>' :
      plan.accounts.map((a, ai) => `<div class="acc"><b>${esc(a.email)}</b>
        ${a.cals.map((c, ci) => `<label class="check"><input type="checkbox" data-cal="${ai}:${ci}" ${c.on ? 'checked' : ''}><i class="dot" style="background:${c.color}"></i>${esc(c.name)}</label>`).join('')}
        <button type="button" class="btn danger" data-accdel="${ai}">Quitar cuenta</button></div>`).join('')
      + `<div class="actions" style="margin:0"><button type="button" class="btn" id="accAdd">+ Conectar cuenta de Google</button></div>
         <div class="note">Solo lectura. Puedes conectar tu cuenta personal y la de la agencia y elegir qué calendarios cuentan. Los eventos no se guardan en la nube.</div>`}`;
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
  if (e.target.id === 'accAdd'){
    try { await connectAccount(''); O.toast('Cuenta conectada: elige sus calendarios'); } catch(err){ O.toast('Google Calendar: ' + err.message); }
    return done();
  }
});
document.addEventListener('change', e => {
  const box = e.target.closest('#planBox'); if (!box) return;
  const plan = P(), t = e.target;
  if (t.dataset.pk) plan[t.dataset.pk] = t.value;
  if (t.dataset.rk){ const r = plan.routines[+t.closest('.rt').dataset.i]; r[t.dataset.rk] = t.type === 'checkbox' ? t.checked : t.value; }
  if (t.dataset.cal){ const [ai, ci] = t.dataset.cal.split(':').map(Number); plan.accounts[ai].cals[ci].on = t.checked; clearCache(); lastEvents = []; }
  O.save(); if (S.view === 'dia'){ O.render(); refresh(); }
});
function done(){ O.save(); renderPlanSettings(); if (S.view === 'dia') { O.render(); refresh(); } }
$('#settingsBtn').addEventListener('click', renderPlanSettings);

// Refresco suave: la marca de «ahora» y el calendario cada 5 min
setInterval(() => { if (S.view === 'dia' && !document.querySelector('.ghost')){ clearCache(); refresh(); } }, 5 * 60e3);
if (S.view === 'dia') O.render();
})();
