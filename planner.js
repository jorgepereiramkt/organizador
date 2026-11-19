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
      <div class="tbody"><div class="blk morning"><header><b>Arranque del día · revisión de clientes + organizar</b><span class="count">${mDone.size}/${mItems.length}</span></header>
        <ul>${mItems.map((m, i) => `<li><button type="button" class="mchk${mDone.has(i) ? ' on' : ''}" data-morning="${i}" aria-label="Marcar">${mDone.has(i) ? '✓' : ''}</button><span>${esc(m)}</span></li>`).join('')}</ul></div></div></div>`;
  let mPut = false;
  let tl = allDay.length ? `<div class="allday">${allDay.map(e => `<span class="tag" style="--c:${e.color}"><i></i>${esc(e.title)}</span>`).join('')}</div>` : '';
  for (const it of items){
    const st = !isToday ? 'future' : nowMin >= it.end ? 'past' : nowMin >= it.start ? 'now' : 'future';
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
    } else {
      // Llamadas y reuniones: todas iguales, en morado y con 📞
      color = '#A78BFA';
      body = `<div class="blk event call${it.kind === 'free' ? ' free' : ''}" style="--c:${color}"><span class="ico">📞</span><b>${esc(it.title.replace(/^[\u2600-\u27BF\u{1F300}-\u{1FAFF}\s]+/u, ''))}</b>
        <span class="cal">${dur(it.end - it.start)}</span></div>`;
    }
    tl += `<div class="trow ${st}" style="--c:${color};--p:${pct}%">
      <div class="tcol"><b>${toHM(it.start)}</b><small>${toHM(it.end)}</small></div>
      <div class="rail"><span></span>${st === 'now' ? '<i class="nowdot"></i>' : ''}</div>
      <div class="tbody">${body}</div></div>`;
    if (!mPut && /bloque\s*0/i.test(it.title || '')){ tl += morningRow(); mPut = true; }
  }
  if (!mPut) tl = morningRow() + tl;
  // Cabecera del día: reloj, jornada y contador de tareas
  const plan = P(), ws = toMin(plan.workStart), we = Math.max(toMin(plan.workEnd), ...items.map(i => i.end).filter(e => e <= 24 * 60));
  const jorn = isToday ? Math.max(0, Math.min(100, Math.round((nowMin - ws) / (we - ws) * 100))) : 0;
  const hoyTs = T.filter(t => slotted(t));
  const hechasHoy = hoyTs.filter(t => t.status === 'done').length;
  const quedan = isToday ? Math.max(0, we - nowMin) : 0;
  const ring = hoyTs.length ? Math.round(hechasHoy / hoyTs.length * 100) : 0;
  const head = `<div class="dayhead">
    <div class="clock">${isToday ? `${O.pad(now.getHours())}:${O.pad(now.getMinutes())}` : `${d.getDate()} ${O.MESES[d.getMonth()]}`}</div>
    <div class="jorn"><div class="jbar"><span style="width:${jorn}%"></span></div>
      <small>${isToday ? (nowMin < ws ? `Tu día empieza a las ${plan.workStart}` : quedan ? `${jorn}% del día · quedan ${dur(quedan)}` : 'Día terminado') : 'Planificando otro día'}</small></div>
    <div class="legend"><span style="--c:${O.GROUP.agency.color}">Agencia</span><span style="--c:${O.GROUP.mine.color}">Mis clientes</span><span style="--c:#A78BFA">Llamadas</span></div>
    <div class="ring" style="--r:${ring}"><b>${hechasHoy}/${hoyTs.length}</b><small>hechas</small></div>
  </div>`;
  // «Por colocar»: TODAS las tareas pendientes que no estén en un bloque de este día, agrupadas por urgencia
  const pend = T.filter(t => t.status !== 'done' && !slotted(t)).sort(O.byOrder);
  // Las que estaban en un bloque de un día anterior y no se marcaron como hechas: arriba del todo
  const isLeft = t => { const sl = S.slots[t.id]; return !!(sl && sl.day < planDay); };
  const left = pend.filter(isLeft).sort((a,b) => O.urgRank(a) - O.urgRank(b) || O.byOrder(a,b));
  const rest = pend.filter(t => !isLeft(t));
  const side = `<section class="col side"><header><h3>Por colocar</h3><span class="count">${pend.length}</span></header>`
    + (left.length ? `<div class="urg u-left" data-field="unslot"><h4>⏪ Pendientes de días anteriores<span>${left.length}</span></h4>
        <div class="list">${left.map(t => O.card(t)).join('')}</div></div>` : '')
    + Object.entries(O.URG).map(([k, u]) => {
      const ts = rest.filter(t => (O.URG[t.priority] ? t.priority : 'normal') === k);
      return `<div class="urg u-${k}" data-field="unslot" data-urg="${k}"><h4>${u.icon} ${u.label}<span>${ts.length}</span></h4>
        <div class="list">${ts.map(t => O.card(t)).join('') || '<div class="empty">Arrastra aquí</div>'}</div></div>`;
    }).join('') + '</section>';
  const msg = calError ? `<div class="note warnbox">${esc(calError)}</div>` : loading ? '<div class="note">Cargando calendario…</div>' : '';
  return `${msg}${head}<div class="planner"><div class="timeline">${tl}</div>${side}</div>`;
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
document.addEventListener('click', e => {
  const b = e.target.closest('[data-morning]'); if (!b) return;
  const plan = P(), i = +b.dataset.morning, set = new Set(plan.morningDone[planDay] || []);
  set.has(i) ? set.delete(i) : set.add(i);
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
  if (t.dataset.morningtxt !== undefined) plan.morning = t.value.split('\n').map(x => x.trim()).filter(Boolean);
  if (t.dataset.rk){ const r = plan.routines[+t.closest('.rt').dataset.i]; r[t.dataset.rk] = t.type === 'checkbox' ? t.checked : t.value; }
  if (t.dataset.cal){ const [ai, ci] = t.dataset.cal.split(':').map(Number); plan.accounts[ai].cals[ci].on = t.checked; clearCache(); lastEvents = []; }
  O.save(); if (S.view === 'dia'){ O.render(); refresh(); }
});
function done(){ O.save(); renderPlanSettings(); if (S.view === 'dia') { O.render(); refresh(); } }
$('#settingsBtn').addEventListener('click', renderPlanSettings);

// Cada minuto: reloj y barra del día
setInterval(() => { if (S.view === 'dia' && !document.querySelector('.ghost') && !document.querySelector('dialog[open]') && !document.activeElement?.matches('input,textarea')) O.render(); }, 60e3);
// Refresco suave: la marca de «ahora» y el calendario cada 5 min
setInterval(() => { if (S.view === 'dia' && !document.querySelector('.ghost')){ clearCache(); refresh(); } }, 5 * 60e3);
if (S.view === 'dia') O.render();
})();
