(() => {
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2,'0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const fromIso = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d); };
const addDays = (d,n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const today = () => iso(new Date());
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
const uid = () => Math.random().toString(36).slice(2,10);
const DIAS = ['dom','lun','mar','mié','jue','vie','sáb'];
const DIAS_L = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const STATUS = {todo:'Por hacer', doing:'En curso', review:'En revisión', done:'Hecho'};
const PALETA = ['#FF6B3D','#4F8CFF','#3DDC97','#C77DFF','#FFC93D','#FF5C8A','#3DD6DC','#A3A3AD'];

/* ---------- Estado ---------- */
const KEY = 'jp-organizador-v1';
const CU_DEFAULT = () => ({token:'', me:null, meName:'', lists:[], teams:[], hidden:[], statuses:{}, lastSync:0});
const S = { tasks:[], clients:[], view:'hoy', group:'all', weekOffset:0, cu:CU_DEFAULT(), plan:null, slots:{}, hours:null, ai:null };

function seed(){
  S.clients = [
    {id:'mio-1', name:'Mi cliente 1', group:'mine', color:'#FF6B3D', keywords:''},
    {id:'mio-2', name:'Mi cliente 2', group:'mine', color:'#4F8CFF', keywords:''},
    {id:'ag-a', name:'Cliente agencia A', group:'agency', color:'#3DDC97', keywords:'cliente a'},
    {id:'ag-b', name:'Cliente agencia B', group:'agency', color:'#C77DFF', keywords:'cliente b'},
    {id:'ag-int', name:'Agencia (interno)', group:'agency', color:'#FFC93D', keywords:'agencia, interno, equipo'},
  ];
  const t = new Date(), d = n => iso(addDays(t,n));
  let o = 1;
  const mk = (title, client, day, status='todo', priority='normal') =>
    ({id:uid(), title, client, day, status, priority, order:o++, doneAt: status==='done' ? today() : null, demo:true});
  S.tasks = [
    mk('Editar reel colección invierno','mio-1',d(0),'doing','alta'),
    mk('Revisar campaña Meta Ads Black Friday','mio-1',d(0)),
    mk('Reunión de seguimiento semanal','ag-a',d(0)),
    mk('Auditoría de la cuenta de Google Ads','ag-a',d(-1),'todo','alta'),
    mk('Prompts de imágenes IA nueva colección','mio-2',d(1)),
    mk('Montar flujo de emails de bienvenida','ag-b',d(2),'doing'),
    mk('Informe mensual de Google Ads','mio-2',d(3),'review'),
    mk('Actualizar plantilla de informes','ag-int',null),
    mk('Optimizar feed de Merchant Center','mio-1',null,'todo','baja'),
    mk('Nuevas creatividades para Meta','mio-2',d(0),'done'),
    mk('Propuesta de presupuesto Q1','ag-b',d(5)),
  ];
}
function load(){
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.tasks && d.clients){ Object.assign(S, {tasks:d.tasks, clients:d.clients, view:d.view||'hoy', group:d.group||'all', cu:{...CU_DEFAULT(), ...(d.cu||{})}, plan:d.plan||null, slots:d.slots||{}, hours:d.hours||null, ai:d.ai||null}); return; } } catch(e){}
  seed();
}
function saveLocal(){ try { localStorage.setItem(KEY, JSON.stringify({tasks:S.tasks, clients:S.clients, view:S.view, group:S.group, cu:S.cu, plan:S.plan, slots:S.slots, hours:S.hours, ai:S.ai})); } catch(e){} }
function save(){ saveLocal(); scheduleCloud(); }

/* ---------- Sincronización con tu cuenta de Google (cloud.js) ---------- */
// Se sube: tus clientes, tus tareas (no las de ClickUp, que ya viven allí) y el token de ClickUp.
const DEMO_IDS = new Set(['mio-1','mio-2','ag-a','ag-b','ag-int']);
let lastSent = '', cloudTimer = null;
function cloudData(){
  return JSON.parse(JSON.stringify({
    clients: S.clients.map(({id,name,group,color,keywords,listId,auto,services,hours,notes}) => ({id,name,group,color,keywords,listId,auto,services,hours,notes})),
    tasks: S.tasks.filter(t => !t.cu && !t.demo),
    token: S.cu.token || '', hidden: S.cu.hidden || [], plan: S.plan || null, slots: S.slots || {}, hours: S.hours || null, ai: S.ai || null,
    picks: Object.fromEntries(S.tasks.filter(t => t.cu && t.today && t.today >= today()).map(t => [t.id, t.today])) }));
}
function scheduleCloud(){
  if (!window.__cloud) return;
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(() => {
    const data = cloudData(), js = JSON.stringify(data);
    if (js === lastSent || !window.__cloud) return;
    lastSent = js;
    window.__cloud.save(data).catch(e => { lastSent = ''; toast('No se pudo guardar en tu cuenta: ' + (e.code || e.message)); });
  }, 700);
}
async function adoptToken(token){
  S.cu = {...CU_DEFAULT(), token, hidden: S.cu.hidden || []};
  setMode('Conectando…');
  try { const {user} = await cu('/user'); S.cu.me = user.id; S.cu.meName = user.username || user.email || ''; await loadLists(); saveLocal(); await sync(); }
  catch(e){ toast('ClickUp: ' + e.message); modeIdle(); }
}
function applyCloud(d){
  if (D || (typeof ed !== 'undefined' && ed.open)) return setTimeout(() => applyCloud(d), 800);
  S.clients = d.clients || [];
  S.tasks = [...S.tasks.filter(t => t.cu), ...(d.tasks || [])];
  S.cu.hidden = d.hidden || [];
  if (d.plan) S.plan = d.plan;
  dropAliased();
  S.slots = d.slots || {};
  if (d.hours) S.hours = d.hours;
  if (d.ai) S.ai = d.ai;
  S.picks = d.picks || {};
  S.tasks.forEach(t => { if (t.cu && S.picks[t.id]) t.today = S.picks[t.id]; });
  const tokenChanged = (d.token || '') !== (S.cu.token || '');
  if (tokenChanged && !d.token){ S.cu = CU_DEFAULT(); S.tasks = S.tasks.filter(t => !t.cu); }
  lastSent = JSON.stringify({...cloudData(), token: d.token || ''});
  saveLocal(); render(); preview();
  if (typeof st !== 'undefined' && st.open) renderClients();
  if (tokenChanged && d.token) adoptToken(d.token);
}
function cloudEmpty(){
  // Primera vez con la cuenta: quitar los ejemplos y subir lo que haya en este dispositivo
  S.tasks = S.tasks.filter(t => !t.demo && !(DEMO_IDS.has(t.client) && !t.cu && t.demo !== false && isSeedTask(t)));
  S.clients = S.clients.filter(c => !(DEMO_IDS.has(c.id) && !c.listId));
  S.tasks.forEach(t => { if (t.client && !client(t.client)) t.client = null; });
  save(); render();
}
const SEED_TITLES = new Set(['Editar reel colección invierno','Revisar campaña Meta Ads Black Friday','Reunión de seguimiento semanal','Auditoría de la cuenta de Google Ads','Prompts de imágenes IA nueva colección','Montar flujo de emails de bienvenida','Informe mensual de Google Ads','Actualizar plantilla de informes','Optimizar feed de Merchant Center','Nuevas creatividades para Meta','Propuesta de presupuesto Q1']);
const isSeedTask = t => SEED_TITLES.has(t.title);
function cloudReady(){ scheduleCloud(); modeIdle(); }
function wipeLocal(){ try { localStorage.removeItem(KEY); } catch(e){} }
const client = id => S.clients.find(c => c.id === id);
const task = id => S.tasks.find(t => t.id === id);
const maxOrder = () => S.tasks.reduce((m,t) => Math.max(m, t.order||0), 0);
function setStatus(t, st){ t.status = st; t.doneAt = st === 'done' ? today() : null; }

/* ---------- ClickUp ---------- */
const online = () => !!S.cu.token;
const listInfo = id => S.cu.lists.find(l => l.id === id);
let inflight = 0, syncing = false;
async function cu(path, opt = {}){
  const base = path.startsWith('/v3/') ? 'https://api.clickup.com/api' : 'https://api.clickup.com/api/v2';
  let r;
  try {
    r = await fetch(base + path, {method: opt.method || 'GET',
      headers: {Authorization: S.cu.token, 'Content-Type': 'application/json'},
      body: opt.body ? JSON.stringify(opt.body) : undefined});
  } catch(e){ throw new Error('token no válido o sin conexión'); }   // ClickUp no manda CORS en sus errores
  if (!r.ok){ let m = ''; try { const j = await r.json(); m = j.err || j.message || ''; } catch(e){} throw new Error(m || 'error ' + r.status); }
  const txt = await r.text(); return txt ? JSON.parse(txt) : null;
}
function setMode(txt){ $('#mode').textContent = txt; }
function modeIdle(){
  if (!online()) return setMode(window.__cloud ? 'Sin ClickUp' : 'Datos de ejemplo');
  const d = S.cu.lastSync ? new Date(S.cu.lastSync) : null;
  setMode(d ? `ClickUp ✓ ${pad(d.getHours())}:${pad(d.getMinutes())}` : 'ClickUp');
}
async function loadLists(){
  const out = [];
  const {teams} = await cu('/team');
  for (const t of teams){
    const {spaces} = await cu(`/team/${t.id}/space?archived=false`);
    await Promise.all(spaces.map(async s => {
      const [{folders}, {lists}] = await Promise.all([cu(`/space/${s.id}/folder?archived=false`), cu(`/space/${s.id}/list?archived=false`)]);
      for (const l of lists) out.push({id:l.id, name:l.name, team:t.id, folder:null, folderName:'', path:`${s.name}`});
      for (const f of folders) for (const l of (f.lists || [])) out.push({id:l.id, name:l.name, team:t.id, folder:f.id, folderName:f.name, path:`${s.name} › ${f.name}`});
    }));
  }
  S.cu.lists = out;
  S.cu.teams = teams.map(t => t.id);
}
async function connect(token){
  S.cu = {...CU_DEFAULT(), token: token.trim()};
  setMode('Conectando…');
  try {
    const {user} = await cu('/user');
    S.cu.me = user.id; S.cu.meName = user.username || user.email || '';
    await loadLists();
  } catch(e){ S.cu = CU_DEFAULT(); modeIdle(); throw e; }
  S.clients = S.clients.filter(c => !c.id.startsWith('ag-'));
  S.tasks = S.tasks.filter(t => !t.demo && !t.cu);
  save(); await sync();
}
function disconnect(){ S.cu = CU_DEFAULT(); S.tasks = S.tasks.filter(t => !t.cu); S.clients = S.clients.filter(c => !c.auto); save(); render(); modeIdle(); }

/* Clientes de la agencia = carpetas de ClickUp (o listas sueltas sin carpeta). Se crean solos con tus tareas. */
const rawKey = (folderId, listId) => folderId ? 'f:' + folderId : 'l:' + listId;
// Clientes unidos: una carpeta/lista de ClickUp puede contar como otro cliente de la agencia (⚙ → «Unir con…»)
const cuAlias = () => (S.plan && S.plan.cuAlias) || {};
const folderKey = (folderId, listId) => { const k = rawKey(folderId, listId); return cuAlias()[k] || k; };
function dropAliased(){
  const al = cuAlias(); if (!Object.keys(al).length) return;
  for (const t of S.tasks) if (al[t.client]) t.client = al[t.client];
  S.clients = S.clients.filter(c => !al[c.id]);
}
function ensureAgencyClient(key, name){
  let c = client(key);
  if (!c){
    c = {id:key, name, group:'agency', color:PALETA[S.clients.length % PALETA.length], keywords:'', auto:true};
    S.clients.push(c);
  }
  return c;
}
const hidden = () => new Set(S.cu.hidden || []);
// Listas de un cliente de la agencia
function clientLists(c){
  if (!c) return [];
  return S.cu.lists.filter(l => folderKey(l.folder, l.id) === c.id);
}
// Elegir la lista según lo que digas: «meta», «google», «email»…
const LIST_HINTS = [
  [/meta|facebook|instagram|\bfb\b|\big\b|reels?|ads? de meta/, /meta/],
  [/google|gads|pmax|shopping|search|merchant/, /google/],
  [/tiktok shop/, /tiktok shop/],
  [/tiktok/, /tiktok ads|tiktok/],
  [/email|mail|klaviyo|newsletter|flujo/, /email|mail/],
  [/dise[nñ]o|banner|creatividad|creativo|imagen|imagenes/, /dise/],
  [/\bcro\b|landing|conversion|web\b/, /cro|web/],
  [/\bugc\b/, /ugc/],
  [/analitica|analytics|ga4|tracking|pixel|gtm/, /anal/],
  [/informe|reporte|revision|review|estrategia|reunion|llamada/, /review|strategy/],
];
function chooseList(c, title, prefer){
  const ls = clientLists(c); if (!ls.length) return null;
  // Regla fija: las tareas de clientes van a «Review & Strategy»; las de Jorge Personal, a «Tareas Internas»
  // (si el cliente no tiene «Review & Strategy», va a su lista «Jorge | …»)
  const fija = ls.find(l => /tareas internas/.test(norm(l.name))) || ls.find(l => /review/.test(norm(l.name)) && /strategy/.test(norm(l.name)))
    || ls.find(l => /^jorge\s*\|/.test(norm(l.name).trim()));
  if (fija) return fija;
  if (prefer){ const same = ls.find(l => norm(l.name) === norm(prefer)); if (same) return same; }
  const t = norm(title || '');
  for (const [re, target] of LIST_HINTS) if (re.test(t)){ const l = ls.find(l => target.test(norm(l.name))); if (l) return l; }
  return ls.find(l => /review|strategy/.test(norm(l.name))) || ls[0];
}

function fromCU(raw, clientId, prev){
  const st = raw.status || {};
  const status = (st.type === 'closed' || st.type === 'done') ? 'done' : st.type === 'open' ? 'todo'
    : /revis|review|aprob|feedback|valid/i.test(st.status || '') ? 'review' : 'doing';
  const p = raw.priority ? +raw.priority.id : 3;
  const old = prev.get(raw.id);
  return {id:raw.id, title:raw.name, client:clientId, day: raw.due_date ? iso(new Date(+raw.due_date)) : null,
    status, priority: p === 1 ? 'super' : p === 2 ? 'alta' : p === 4 ? 'baja' : 'normal',
    order: old ? old.order : +raw.date_created / 1e6,
    doneAt: status === 'done' ? iso(new Date(+(raw.date_done || raw.date_closed || Date.now()))) : null,
    url: raw.url, cu: true, listId: raw.list && raw.list.id, listName: raw.list && raw.list.name,
    today: old ? (old.today || null) : ((S.picks || {})[raw.id] || null)};   // si ya la teníamos, manda lo de la app
}
async function pages(path){
  let all = [];
  for (let p = 0; p < 20; p++){
    const r = await cu(path + `&page=${p}`);
    all = all.concat(r.tasks || []);
    if (r.last_page !== false || (r.tasks || []).length < 100) break;
  }
  return all;
}
// Trae TUS tareas asignadas de todo el espacio de trabajo (abiertas + cerradas en los últimos 14 días)
async function sync(silent){
  if (!online() || syncing || inflight || D) return;
  syncing = true; setMode('Sincronizando…');
  try {
    if (!S.cu.teams || !S.cu.lists.length || !('folder' in (S.cu.lists[0] || {}))) await loadLists();
    dropAliased();
    const prev = new Map(S.tasks.map(t => [t.id, t]));
    const since = Date.now() - 14 * 864e5, hid = hidden();
    const out = new Map();
    for (const team of S.cu.teams){
      const base = `/team/${team}/task?subtasks=true&assignees[]=${S.cu.me}`;
      const [open, closed] = await Promise.all([pages(base), pages(base + `&include_closed=true&date_done_gt=${since}`)]);
      for (const raw of [...open, ...closed]){
        const f = raw.folder || {}, l = raw.list || {};
        const key = folderKey(f.hidden ? null : f.id, l.id);
        if (hid.has(key)) continue;
        ensureAgencyClient(key, f.hidden || !f.name ? l.name : f.name);
        out.set(raw.id, fromCU(raw, key, prev));
      }
    }
    if (inflight || D) { modeIdle(); return; }   // hubo cambios mientras tanto: se repite en la próxima vuelta
    S.tasks = [...out.values(), ...S.tasks.filter(t => !t.cu)];
    S.cu.lastSync = Date.now(); save();
    if (!ed.open) render();
  } catch(e){ if (!silent) toast('ClickUp: ' + e.message); setMode('Sin conexión'); syncing = false; return; }
  finally { syncing = false; }
  modeIdle();
}
async function write(fn){
  inflight++;
  try { return await fn(); }
  catch(e){ toast('No se guardó en ClickUp: ' + e.message); setTimeout(() => sync(true), 800); }
  finally { inflight--; }
}
async function listStatuses(listId){
  if (!S.cu.statuses[listId]){ const l = await cu(`/list/${listId}`); S.cu.statuses[listId] = l.statuses || []; saveLocal(); }
  return [...S.cu.statuses[listId]].sort((a,b) => a.orderindex - b.orderindex);
}
async function statusName(listId, target){
  const sts = await listStatuses(listId);
  const custom = sts.filter(s => s.type === 'custom');
  const rev = custom.find(s => /revis|review|aprob|feedback|valid/i.test(s.status));
  const doing = custom.find(s => s !== rev);
  const pick = {todo: sts.find(s => s.type === 'open'), done: sts.find(s => s.type === 'closed') || sts.find(s => s.type === 'done'),
    review: rev || doing, doing: doing || rev}[target];
  return pick && pick.status;
}
const PRIO = {super:1, alta:2, normal:3, baja:4};
const dueMs = day => { const d = fromIso(day); d.setHours(12); return d.getTime(); };
const snap = t => ({title:t.title, day:t.day, status:t.status, priority:t.priority, client:t.client});

const isAgency = id => { const c = client(id); return !!(c && c.group === 'agency'); };

// Regla de oro: solo se sube a ClickUp lo que es de un cliente marcado como «Agencia». Lo tuyo nunca sale de la app.
const subiendo = new Set();   // tareas que se están creando en ClickUp ahora mismo (evita crearlas dos veces)
async function pushCreate(t){
  const c = client(t.client);
  if (!online() || t.cu || t.ia || !c || c.group !== 'agency') return;   // las de la IA esperan a que las revises
  if (subiendo.has(t.id)) return;
  const oldId = t.id; subiendo.add(oldId);
  const l = chooseList(c, t.title);
  if (!l) return toast('Ese cliente no tiene listas en ClickUp');
  await write(async () => {
    const body = {name:t.title, priority:PRIO[t.priority], assignees: S.cu.me ? [S.cu.me] : []};
    if (t.day){ body.due_date = dueMs(t.day); body.due_date_time = false; }
    if (t.status !== 'todo'){ const s = await statusName(l.id, t.status); if (s) body.status = s; }
    const res = await cu(`/list/${l.id}/task`, {method:'POST', body});
    // la tarea puede haber sido reemplazada mientras tanto (sincronización con la nube o con ClickUp): se actualiza la que hay ahora
    const cur = S.tasks.find(x => x.id === oldId) || t;
    if (S.tasks.some(x => x.id === res.id && x !== cur)) S.tasks = S.tasks.filter(x => x !== cur);   // ClickUp ya la trajo: fuera la copia local
    else Object.assign(cur, {id: res.id, url: res.url, cu: true, listId: l.id, listName: l.name});
    if (t !== cur) Object.assign(t, {id: res.id, url: res.url, cu: true, listId: l.id, listName: l.name});
    for (const m of [S.slots, (S.plan && S.plan.tnotes) || {}, (S.plan && S.plan.proc) || {}]) if (m[oldId] !== undefined){ m[res.id] = m[oldId]; delete m[oldId]; }
    save(); render();
    toast(`Guardada en ClickUp · ${c.name} › ${l.name}`);
  }).finally(() => subiendo.delete(oldId));
}
// Llamar después de cambiar una tarea: compara con cómo estaba y manda a ClickUp solo lo que toca
async function afterChange(t, before){
  if (!online()) return;
  const revert = msg => { t.client = before.client; save(); render(); toast(msg); };
  if (!t.cu){
    if (before.client === t.client || !isAgency(t.client)) return;   // sigue siendo tuya: nada sale de la app
    if (before.client && !isAgency(before.client)) return revert('Las tareas de tus clientes no se pasan a la agencia');
    if (!confirm(`Esta tarea se subirá al ClickUp de la agencia (${client(t.client).name}). ¿Seguro?`)) return revert('No se ha subido');
    return pushCreate(t);
  }
  const c = client(t.client);
  if (before.client !== t.client){
    if (!c || c.group !== 'agency') return revert('Las tareas de la agencia se quedan en la agencia');
    const from = listInfo(t.listId), to = chooseList(c, t.title, t.listName);
    if (!to) return revert('Ese cliente no tiene listas en ClickUp');
    if (from && from.team !== to.team) return revert('No se puede mover entre espacios de trabajo distintos');
    await write(async () => {
      await cu(`/v3/workspaces/${to.team}/tasks/${t.id}/home_list/${to.id}`, {method:'PUT', body:{}});
      t.listId = to.id; t.listName = to.name; save(); render();
    });
  }
  const body = {};
  if (before.title !== t.title) body.name = t.title;
  if (before.day !== t.day){ body.due_date = t.day ? dueMs(t.day) : null; body.due_date_time = false; }
  if (before.priority !== t.priority) body.priority = PRIO[t.priority];
  if ((before.status !== t.status || before.client !== t.client) && t.listId){ const s = await statusName(t.listId, t.status).catch(() => null); if (s) body.status = s; }
  if (Object.keys(body).length) await write(() => cu(`/task/${t.id}`, {method:'PUT', body}));
}
async function pushDelete(t){
  if (!online() || !t.cu) return;
  await write(() => cu(`/task/${t.id}`, {method:'DELETE'}));
}

/* ---------- Clasificador de voz/texto (sin IA, sin tokens) ---------- */
const STOP = new Set(['agency','leadfluence','tier','onboarding','cliente','clientes','agencia','tienda','store','shop','interno','general','proyecto','proyectos','marketing','digital','personal','tareas','lista','grupo','studio','estudio']);
function nextDow(target){ const now = new Date(); let n = (target - now.getDay() + 7) % 7; if (n === 0) n = 7; return iso(addDays(now,n)); }
// Las tareas nuevas NO llevan fecha: van a «Por colocar» (la fecha, si hace falta, va en el propio nombre)
const PARSE_DATES = false;
// Urgencia: 4 niveles (en ClickUp: Urgent, High, Normal, Low)
const URG = {super:{label:'Súper urgente', icon:'🔥', rank:0}, alta:{label:'Urgente', icon:'🔴', rank:1},
             normal:{label:'Media', icon:'🟡', rank:2}, baja:{label:'Cuando pueda', icon:'🟢', rank:3}};
const urgRank = t => (URG[t.priority] || URG.normal).rank;
function parseOne(raw){
  let title = ' ' + raw.trim() + ' ';
  let day = null, dayLabel = null, priority = 'baja';   // sin decir nada → «Cuando pueda»
  const now = new Date();
  const take = (re, fn) => { const m = title.match(re); if (!m) return false; fn(m); title = title.replace(re,' '); return true; };

  if (PARSE_DATES){
  take(/\b(?:para\s+)?pasado\s+ma[ñn]ana\b/i, () => day = iso(addDays(now,2))) ||
  take(/\b(?:para\s+(?:el\s+)?|el\s+|este\s+)?(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)(?:\s+que\s+viene)?\b/i,
       m => day = nextDow(['domingo','lunes','martes','miercoles','jueves','viernes','sabado'].indexOf(norm(m[1])))) ||
  take(/\b(?:para\s+)?(?:la\s+)?(?:pr[oó]xima\s+semana|semana\s+que\s+viene)\b/i, () => day = nextDow(1)) ||
  take(/\b(?:para\s+)?hoy\b/i, () => day = iso(now)) ||
  take(/\b(?:para\s+)?el\s+(?:d[ií]a\s+)?(\d{1,2})\b(?!\s*(?:reels?|v[ií]deos?|posts?|%))/i, m => {
    const n = +m[1]; if (n < 1 || n > 31) return;
    let d = new Date(now.getFullYear(), now.getMonth(), n);
    if (iso(d) < iso(now)) d = new Date(now.getFullYear(), now.getMonth()+1, n);
    day = iso(d);
  });
  if (!day){
    // «mañana» = día siguiente, salvo «por/esta/de la mañana»
    const m = title.match(/(^|\s)(?:para\s+)?ma[ñn]ana\b/i);
    if (m && !/(^|\s)(la|esta)\s+$/i.test(title.slice(0, m.index + m[1].length))){
      day = iso(addDays(now,1));
      title = title.slice(0, m.index) + ' ' + title.slice(m.index + m[0].length);
    }
  }
  }
  take(/\b(?:es\s+)?(s[uú]per\s*urgente|muy\s+urgente|urgent[ií]simo|asap|ya\s+mismo|cr[ií]tic[oa]|para\s+ya)\b/i, () => priority = 'super') ||
  take(/\b(?:es\s+)?(urgente|cuanto\s+antes|important[ií]sim[oa]|importante|prioridad\s+alta)\b/i, () => priority = 'alta') ||
  take(/\b(urgencia\s+media|prioridad\s+media)\b/i, () => priority = 'normal') ||
  take(/\b(sin\s+prisa|cuando\s+pueda|poco\s+urgente|baja\s+prioridad|prioridad\s+baja)\b/i, () => priority = 'baja');

  // Cliente: palabra clave más larga que aparezca
  const n = ' ' + norm(raw).replace(/[^a-z0-9ñ ]/g,' ') + ' ';
  let best = null, bestLen = 0;
  for (const c of S.clients){
    // nombre completo + palabras clave + cada palabra del nombre de 4+ letras (Bodegas Sur → «bodegas»)
    const words = norm(c.name).split(/\s+/).filter(w => w.length >= 4 && !STOP.has(w));
    const kws = [c.name, ...String(c.keywords||'').split(','), ...words].map(k => norm(k).trim()).filter(Boolean);
    for (const k of kws) if (k.length > bestLen && n.includes(' ' + k + ' ')){ best = c.id; bestLen = k.length; }
  }
  title = title.replace(/\s+/g,' ').trim()
    .replace(/^(?:tengo\s+que|hay\s+que|tarea:?|recordar\s+|recu[eé]rdame\s+)\s*/i,'')
    .replace(/[\s,.:;-]+$/,'').replace(/^[\s,.:;-]+/,'')
    .replace(/\s+(para|el|de|a|y|que|es)$/i,'');
  title = title.charAt(0).toUpperCase() + title.slice(1);
  return {title, client:best, day, priority};
}
function parse(text){
  return text.split(/[.;\n]+|\s+y\s+(?:luego|despu[eé]s|adem[aá]s)\s+|,?\s+(?:otra\s+tarea|y\s+otra(?:\s+cosa)?|adem[aá]s)[,:]?\s+/i)
    .map(s => s.trim()).filter(s => s.length > 2).map(parseOne).filter(p => p.title);
}

/* ---------- Etiquetas ---------- */
function dayLabel(s){
  if (!s) return null;
  const t = today(), d = fromIso(s);
  if (s === t) return 'Hoy';
  if (s === iso(addDays(new Date(),1))) return 'Mañana';
  if (s === iso(addDays(new Date(),-1))) return 'Ayer';
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`;
}

/* ---------- Render ---------- */
const main = $('#main'), toolbar = $('#toolbar');
function visibleClients(){ return S.clients.filter(c => S.group === 'all' || c.group === S.group); }
// Tareas de ClickUp con ⭐: solo sirven para registrar horas, no salen en los paneles de tareas
const isRegTask = t => !!(t.cu && /\u2B50|tarea principal/i.test(t.title || ''));   // cualquier tarea con ⭐
function visibleTasks(){
  const ids = new Set(visibleClients().map(c => c.id));
  return S.tasks.filter(t => !isRegTask(t) && (t.client && client(t.client) ? ids.has(t.client) : S.group === 'all'));
}
const byOrder = (a,b) => (a.order||0) - (b.order||0);

// Colores por tipo (no por cliente): agencia, mis clientes y sin cliente. Las llamadas tienen el suyo en el Día.
const GROUP = {agency:{color:'#4F8CFF', label:'Agencia', cls:'g-ag'}, mine:{color:'#3DDC97', label:'Mío', cls:'g-mine'}, none:{color:'#8A8A94', label:'', cls:'g-none'}};
const groupOf = c => c ? (c.group === 'mine' ? GROUP.mine : GROUP.agency) : GROUP.none;
// Cada cliente tiene su tono dentro de la familia de su grupo: verdes/amarillos para los míos, azules/turquesas para la agencia
// Cada cliente tiene un color bien distinto, dentro de su familia: cálidos/verdes los míos, fríos/azules la agencia
const PAL_MINE = ['#22C55E','#FACC15','#F97316','#A3E635','#14B8A6','#FB7185','#EAB308','#10B981','#F59E0B','#84CC16','#FDBA74','#2DD4BF'];
const PAL_AG   = ['#3B82F6','#06B6D4','#6366F1','#38BDF8','#0EA5E9','#818CF8','#22D3EE','#60A5FA','#4F46E5','#67E8F9','#1D4ED8','#93C5FD'];
function clientColor(c){
  if (!c) return GROUP.none.color;
  const fam = S.clients.filter(x => (x.group === 'mine') === (c.group === 'mine')).sort((a, b) => a.name.localeCompare(b.name));
  const i = Math.max(0, fam.findIndex(x => x.id === c.id)), pal = c.group === 'mine' ? PAL_MINE : PAL_AG;
  return pal[i % pal.length];
}
// Notas de cada tarea: solo en la app (se sincronizan con tu cuenta, nunca van a ClickUp)
const URL_RE = /https?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)\]]/g;
const noteOf = id => ((S.plan && S.plan.tnotes) || {})[id] || '';
function setNote(id, txt){ if (!S.plan) return; const n = S.plan.tnotes = S.plan.tnotes || {}; txt = txt.trim(); if (txt) n[id] = txt; else delete n[id]; }
const linkHost = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch(e){ return 'enlace'; } };
function notePeek(id){
  const n = noteOf(id); if (!n) return '';
  const links = [...new Set(n.match(URL_RE) || [])];
  const text = n.replace(URL_RE, '').replace(/\s+/g, ' ').trim();
  return `<div class="npeek">${text ? `<span class="ntx">📝 ${esc(text)}</span>` : ''}${links.slice(0, 2).map(u => `<a class="nlink" href="${esc(u)}" target="_blank" rel="noopener" title="${esc(u)}">🔗 ${esc(linkHost(u))}</a>`).join('')}${links.length > 2 ? `<span class="nmore">+${links.length - 2}</span>` : ''}</div>`;
}
function card(t, hide={}){
  const c = client(t.client), done = t.status === 'done', late = !done && t.day && t.day < today();
  const g = groupOf(c);
  const meta = [];
  if (!hide.client) meta.push(c ? `<span class="clp">${esc(c.name)}</span>` : `<span class="clp none">Sin cliente</span>`);
  if (g.label && !hide.group) meta.push(`<span class="gb2 ${g.cls}">${g.label === 'Mío' ? '🔒 Mío' : '🏢 Agencia'}</span>`);
  if (!hide.day && t.day) meta.push(`<span class="${late?'late':''}">${late?'Atrasada · ':''}${dayLabel(t.day)}</span>`);
  if (t.cu && t.listName) meta.push(`<span class="st">${esc(t.listName)}</span>`);
  if (!done && !hide.urg){ const u = URG[t.priority] ? t.priority : 'normal'; meta.unshift(`<span class="ub u-${u}">${URG[u].icon} ${URG[u].label}</span>`); }
  if (!hide.status && t.status !== 'todo' && !done) meta.push(`<span class="st">${STATUS[t.status]}</span>`);
  if (online() && !t.cu && isAgency(t.client)) meta.push('<span class="st">Sin subir a ClickUp</span>');
  if (t.ia) meta.unshift(t.src === 'call' ? `<span class="callb">📞 ${esc(t.meeting || 'Videollamada')}</span>` : '<span class="iab">🤖 IA · revisa</span>');
  return `<article class="card ${g.cls} ${done?'done':''} ${t.ia?'ia':''}" data-id="${t.id}" style="--c:${clientColor(c)};--g:${g.color}" tabindex="0">
    <button class="chk" aria-label="${done?'Marcar como pendiente':'Completar'}"></button>
    <div class="body"><p class="tt">${esc(t.title)}</p>${notePeek(t.id)}${meta.length?`<div class="meta">${meta.join('')}</div>`:''}</div>
    ${hide.pick && !done ? `<button class="pick${t.today === today() ? ' on' : ''}" data-pick aria-label="Para hoy" title="${t.today === today() ? 'Quitar de hoy' : 'Hacer hoy'}">${t.today === today() ? '✓ Hoy' : 'Hoy'}</button>` : ''}</article>`;
}
function column({title, sub='', field, value='', tasks, hide, cls='', dot, undone=false, empty='Arrastra aquí', add, byUrg}){
  const listHtml = !byUrg ? tasks.map(t => card(t, hide)).join('') : Object.entries(URG).map(([k, u]) => {
    const ts = tasks.filter(t => (URG[t.priority] ? t.priority : 'normal') === k);
    return ts.length ? `<div class="ugrp u-${k}"><div class="uh">${u.icon} ${u.label} <span>${ts.length}</span></div>${ts.map(t => card(t, hide)).join('')}</div>` : '';
  }).join('');
  return `<section class="col ${cls}" data-field="${field}" data-value="${value}" ${undone?'data-undone="1"':''} ${dot?`style="--cc:${dot}"`:''}>
    <header><h3>${dot?`<span class="colname">${esc(title)}</span>`:esc(title)} ${sub?`<span class="csub">${esc(sub)}</span>`:''}</h3><span class="count">${tasks.length}</span></header>
    <div class="list">${tasks.length ? listHtml : `<div class="empty${add !== undefined ? ' mini' : ''}">${add !== undefined ? 'Sin tareas pendientes' : empty}</div>`}</div>
    ${add !== undefined ? `<form class="qadd" data-qclient="${add}"><input placeholder="Añadir tarea" title="Intro para añadir · entiende «mañana», «el viernes», «urgente»…" aria-label="Añadir tarea a ${esc(title)}" autocomplete="off" enterkeyhint="done"></form>` : ''}</section>`;
}
function setToolbar(title, sub, extra='', hint='Arrastra las tareas para moverlas'){
  toolbar.innerHTML = `<h2>${title}</h2><span class="sub">${sub}</span><span class="sp"></span>${extra}<span class="hint">${hint}</span>`;
}

const views = {
  hoy(){
    const T = visibleTasks(), t = today(), wk = iso(addDays(new Date(),7));
    const d = new Date();
    setToolbar('Hoy', `${DIAS_L[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`);
    const hoy = T.filter(x => x.status !== 'done' && x.day && x.day <= t)
      .sort((a,b) => urgRank(a) - urgRank(b) || byOrder(a,b));
    return `<div class="board stack">
      ${column({title:'Hoy', field:'day', value:t, tasks:hoy, undone:true, cls:'today', empty:'Nada para hoy. Arrastra aquí lo que quieras hacer.'})}
      ${column({title:'Bandeja', sub:'sin fecha', field:'day', value:'', tasks:T.filter(x => x.status!=='done' && !x.day).sort(byOrder), undone:true, empty:'Lo que dictes sin fecha cae aquí'})}
      ${column({title:'Próximos 7 días', field:'day', value:iso(addDays(new Date(),1)), tasks:T.filter(x => x.status!=='done' && x.day > t && x.day <= wk).sort((a,b)=>a.day.localeCompare(b.day)||byOrder(a,b)), undone:true, empty:'Suelta aquí para pasarla a mañana'})}
      ${column({title:'Hecho hoy', field:'status', value:'done', tasks:T.filter(x => x.status==='done' && x.doneAt===t).sort(byOrder), empty:'Suelta aquí para completar'})}
    </div>`;
  },
  semana(){
    const T = visibleTasks(), now = new Date();
    const mon = addDays(now, -((now.getDay()+6)%7) + S.weekOffset*7);
    const sun = addDays(mon,6);
    setToolbar('Semana', `${mon.getDate()} ${MESES[mon.getMonth()]} – ${sun.getDate()} ${MESES[sun.getMonth()]}`,
      `<button class="icon" data-week="-1" aria-label="Semana anterior"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg></button>
       <button class="chip" data-week="0">Esta semana</button>
       <button class="icon" data-week="1" aria-label="Semana siguiente"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg></button>`);
    let html = '<div class="board">';
    for (let i=0;i<7;i++){
      const d = addDays(mon,i), s = iso(d);
      html += column({title:`${DIAS_L[d.getDay()][0].toUpperCase()+DIAS_L[d.getDay()].slice(1)} ${d.getDate()}`, sub: s===today()?'hoy':'', field:'day', value:s,
        tasks:T.filter(x => x.day === s).sort((a,b)=>(a.status==='done')-(b.status==='done')||byOrder(a,b)), hide:{day:true}, cls: s===today()?'today':'', empty:'Libre'});
    }
    html += column({title:'Sin fecha', field:'day', value:'', tasks:T.filter(x => !x.day && x.status!=='done').sort(byOrder), hide:{day:true}});
    return html + '</div>';
  },
  tablero(){
    const T = visibleTasks();
    setToolbar('Tablero', 'por estado');
    return '<div class="board">' + Object.entries(STATUS).map(([k,v]) =>
      column({title:v, field:'status', value:k, tasks:T.filter(x => x.status === k).sort(byOrder), hide:{status:true}})).join('') + '</div>';
  },
  clientes(){
    const all = visibleTasks(), hoyMode = S.clientMode === 'hoy';
    const iaT = all.filter(t => t.ia && t.status !== 'done');
    // En «Tareas hoy» solo las marcadas para hoy (y las hechas hoy)
    const T = all.filter(t => !t.ia && (!hoyMode || t.today === today() || (t.status === 'done' && t.doneAt === today() && t.today)));
    const nHoy = all.filter(t => !t.ia && t.status !== 'done' && t.today === today()).length;
    setToolbar('Clientes', hoyMode ? `${nHoy} tarea${nHoy === 1 ? '' : 's'} para hoy` : 'marca con «Hoy» lo que vas a hacer hoy', '', hoyMode ? 'Luego colócalas en Día' : 'Arrastra para cambiar de cliente');
    let html = '';
    const ibs = window.__org && window.__org.inboxStatus ? window.__org.inboxStatus() : null;
    if (ibs && !ibs.ok && !hoyMode) html += `<div class="ibx">📥 Buzón de tareas por voz: <button class="btn" data-ibx>Mirar si hay tareas nuevas</button><span>Google pide confirmarlo cada hora</span></div>`;
    if (iaT.length && !hoyMode){
      html += `<div class="iarev"><div class="iarev-h"><b>🤖 Revisa las tareas que ha detectado la IA</b><span>${iaT.length}</span>
        <button class="btn" data-iaall>Aprobar todas</button></div>
        ${[['call', '📞 Propuestas de tus videollamadas'], ['voz', '🎙️ Lo que me has mandado']].map(([k, lbl]) => {
          const ts = iaT.filter(t => (t.src === 'call') === (k === 'call'));
          return ts.length ? `<div class="iagrp">${lbl} · ${ts.length}</div><div class="iarev-l">${ts.map(t => card(t, {}).replace('</article>', `<div class="iaact"><button class="btn primary" data-iaok>✓ Aprobar</button><button class="btn" data-iano title="Descartar">✕</button></div></article>`)).join('')}</div>` : '';
        }).join('')}
        <p class="iahint">Toca una tarea para corregir el texto, el cliente o la urgencia antes de aprobarla.</p></div>`;
    }
    if (hoyMode && !nHoy) html += '<div class="empty big">Aún no has elegido nada para hoy. En «Tareas», pulsa <b>Hoy</b> en las que vayas a hacer.</div>';
    // En filas que se adaptan a la pantalla (sin deslizar). Primero los clientes con tareas pendientes, luego el resto.
    html += '<div class="board grid">';
    for (const [g, label] of [['mine','Mis clientes'],['agency','Agencia']]){
      let cs = visibleClients().filter(c => c.group === g);
      if (hoyMode) cs = cs.filter(c => T.some(x => x.client === c.id && x.status !== 'done'));
      if (!cs.length) continue;
      const cols = cs.map((c, i) => {
        const ts = T.filter(x => x.client === c.id);
        const pend = ts.filter(x => x.status !== 'done').sort((a,b) => urgRank(a) - urgRank(b) || byOrder(a,b));
        return {c, i, pend, hechas: ts.length - pend.length};
      }).sort((a, b) => (b.pend.length > 0) - (a.pend.length > 0) || a.i - b.i);
      const conT = cols.filter(x => x.pend.length).length, gc = g === 'mine' ? 'mine' : 'ag';
      html += `<div class="sep sep-${gc}"><b>${g === 'mine' ? '🔒 Mis clientes' : '🏢 Agencia'}</b><span>${conT} con tareas · ${cols.length - conT} sin pendientes</span></div>`;
      for (const {c, pend, hechas} of cols)
        html += column({title:c.name, sub: hechas ? `${hechas} hecha${hechas>1?'s':''}` : '', field:'client', value:c.id, tasks:pend, hide:{client:true, urg:true, group:true, pick:true}, dot:clientColor(c), add: hoyMode ? undefined : c.id, cls: `cg-${gc} ${pend.length ? '' : 'quiet'}`, byUrg:true});
    }
    const sin = T.filter(x => (!x.client || !client(x.client)) && x.status !== 'done');
    if (S.group === 'all' && sin.length) html += column({title:'Sin cliente', field:'client', value:'', tasks:sin, hide:{client:true, pick:true}, dot:'var(--faint)', byUrg:true});
    return html + '</div>';
  },
};

function render(){
  const sx = main.querySelector('.board')?.scrollLeft || 0;
  // Solo quedan las vistas Día y Clientes
  if (!['dia','clientes','ia'].includes(S.view)) S.view = 'dia';
  const vw = S.view;
  if (!views[vw]) return;   // la vista Día la añade planner.js, que se carga después
  main.innerHTML = views[vw]();
  if (views[vw].after) views[vw].after();
  if (S.view === 'semana' && S._keepScroll) main.querySelector('.board').scrollLeft = sx;
  S._keepScroll = false;
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-current', b.dataset.view === S.view));
  document.querySelectorAll('#filters .chip').forEach(b => b.setAttribute('aria-pressed', b.dataset.group === S.group));
  if (S.view === 'semana' && !S._scrolled){
    const td = main.querySelector('.col.today');
    if (td && innerWidth < 761) td.scrollIntoView({inline:'center', block:'nearest'});
    S._scrolled = true;
  }
}

/* ---------- Arrastrar (ratón y dedo) ---------- */
let D = null, justDragged = false;
function beginDrag(cardEl, x, y){
  const r = cardEl.getBoundingClientRect();
  const ghost = cardEl.cloneNode(true);
  ghost.classList.add('ghost'); ghost.style.width = r.width + 'px';
  document.body.appendChild(ghost);
  cardEl.classList.add('dragging');
  document.body.classList.add('is-dragging');
  D = {id:cardEl.dataset.id, cardEl, ghost, ox:x-r.left, oy:y-r.top, x, y, zone:null, before:null};
  moveDrag(x, y);
  const loop = () => {
    if (!D) return;
    const board = (D.zone && D.zone.closest('.board')) || main.querySelector('.board');
    if (board && !board.classList.contains('stack')){
      const br = board.getBoundingClientRect();
      if (D.x < br.left + 50) board.scrollLeft -= 14; else if (D.x > br.right - 50) board.scrollLeft += 14;
    }
    if (D.y < 70) scrollBy(0,-12); else if (D.y > innerHeight - 70 - (innerWidth<761?64:0)) scrollBy(0,12);
    hitTest();
    D.raf = requestAnimationFrame(loop);
  };
  D.raf = requestAnimationFrame(loop);
}
function hitTest(){
  const el = document.elementFromPoint(D.x, D.y);
  const zone = el && el.closest('[data-field]');
  if (zone !== D.zone){ D.zone && D.zone.classList.remove('over'); zone && zone.classList.add('over'); D.zone = zone; }
  let before = null;
  if (zone){
    for (const c of zone.querySelectorAll('.card:not(.dragging)')){
      const r = c.getBoundingClientRect();
      if (r.top + r.height/2 > D.y){ before = c; break; }
    }
  }
  if (before !== D.before){ D.before && D.before.classList.remove('ins'); before && before.classList.add('ins'); D.before = before; }
}
function moveDrag(x, y){
  D.x = x; D.y = y;
  D.ghost.style.transform = `translate(${x - D.ox}px, ${y - D.oy}px)`;
  hitTest();
}
function endDrag(){
  cancelAnimationFrame(D.raf);
  const {zone, before, id, ghost, cardEl} = D;
  ghost.remove(); cardEl.classList.remove('dragging'); document.body.classList.remove('is-dragging');
  zone && zone.classList.remove('over'); before && before.classList.remove('ins');
  D = null; justDragged = true; setTimeout(() => justDragged = false, 80);
  if (!zone) return;
  const t = task(id), f = zone.dataset.field, v = zone.dataset.value;
  const list = [...zone.querySelectorAll('.card')].filter(c => c !== cardEl).map(c => task(c.dataset.id));
  const idx = before ? list.indexOf(task(before.dataset.id)) : list.length;
  const prev = list[idx-1], next = list[idx];
  t.order = prev && next ? (prev.order + next.order)/2 : prev ? prev.order + 1 : next ? next.order - 1 : maxOrder() + 1;
  const was = snap(t);
  if (f === 'day'){ t.day = v || null; if (zone.dataset.undone && t.status === 'done') setStatus(t,'todo'); }
  if (f === 'status') setStatus(t, v);
  if (f === 'client') t.client = v || null;
  // Planificador: meter/sacar la tarea de un bloque del día (no toca la fecha ni ClickUp)
  if (f === 'slot'){
    let tier = zone.dataset.tier || null;
    if (tier === 'top' && list.length >= 3){ tier = 'extra'; toast('El Top 3 ya está lleno: va a «Échale huevos»'); }
    S.slots[t.id] = {day: zone.dataset.day, at: v, ...(tier ? {tier} : {})}; t.today = zone.dataset.day;
  }
  // «En proceso»: ya empezada pero ahora depende de otros; sale del bloque y queda apartada a la vista
  const proc = S.plan && (S.plan.proc = S.plan.proc || {});
  if (proc){ if (f === 'unslot' && zone.dataset.proc !== undefined){ delete S.slots[t.id]; proc[t.id] = proc[t.id] || today(); } else if (f === 'slot' || f === 'unslot') delete proc[t.id]; }
  if (f === 'unslot' && zone.dataset.wk){ delete S.slots[t.id]; if (zone.dataset.wk === 'hoy') t.today = today(); if (zone.dataset.wk === 'sin') t.today = null; }
  if (f === 'unslot' && zone.dataset.urg){ delete S.slots[t.id]; t.priority = zone.dataset.urg; if (!t.today || t.today < today()) t.today = today(); }   // a una urgencia: sale del bloque
  const revisada = t.ia && !zone.dataset.ia;
  if (revisada) t.ia = false;
  save(); S._keepScroll = true; render();
  if (revisada) pushCreate(t); else afterChange(t, was);
}

main.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse' || e.button !== 0) return;
  const cardEl = e.target.closest('.card');
  if (!cardEl || e.target.closest('.chk,[data-pick],[data-iaok],[data-iano],.npeek a')) return;
  e.preventDefault();
  const sx = e.clientX, sy = e.clientY;
  const mv = ev => { if (!D && Math.hypot(ev.clientX-sx, ev.clientY-sy) > 6) beginDrag(cardEl, sx, sy); if (D) moveDrag(ev.clientX, ev.clientY); };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (D) endDrag(); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
});
main.addEventListener('touchstart', e => {
  const cardEl = e.target.closest('.card');
  if (!cardEl || e.touches.length > 1 || e.target.closest('.chk,.npeek a')) return;
  const p0 = e.touches[0], sx = p0.clientX, sy = p0.clientY;
  let lx = sx, ly = sy;
  const timer = setTimeout(() => { beginDrag(cardEl, lx, ly); navigator.vibrate && navigator.vibrate(12); }, 260);
  const mv = ev => {
    const p = ev.touches[0]; lx = p.clientX; ly = p.clientY;
    if (!D){ if (Math.hypot(lx-sx, ly-sy) > 10) clearTimeout(timer); }
    else { ev.preventDefault(); moveDrag(lx, ly); }
  };
  const end = () => { clearTimeout(timer); cardEl.removeEventListener('touchmove', mv); cardEl.removeEventListener('touchend', end); cardEl.removeEventListener('touchcancel', end); if (D) endDrag(); };
  cardEl.addEventListener('touchmove', mv, {passive:false});
  cardEl.addEventListener('touchend', end); cardEl.addEventListener('touchcancel', end);
}, {passive:true});
main.addEventListener('contextmenu', e => { if (e.target.closest('.card')) e.preventDefault(); });

main.addEventListener('click', e => {
  if (justDragged) return;
  const pk = e.target.closest('[data-pick]');
  if (pk){
    const t = task(pk.closest('.card').dataset.id);
    t.today = t.today === today() ? null : today();
    if (!t.today) delete S.slots[t.id];
    save(); S._keepScroll = true; render();
    toast(t.today ? 'Para hoy ✓' : 'Quitada de hoy');
    return;
  }
  if (e.target.closest('[data-ibx]')){
    const ib = S.plan && S.plan.inbox;
    window.__org.connectDriveInbox(ib && ib.email).then(() => window.__org.importInbox()).then(() => render()).catch(err => toast('Buzón: ' + err.message));
    return;
  }
  if (e.target.closest('[data-iaall]')){
    const ts = S.tasks.filter(t => t.ia); ts.forEach(t => t.ia = false); save(); render(); ts.forEach(pushCreate);
    toast(`${ts.length} aprobadas`); return;
  }
  const iaB = e.target.closest('[data-iaok],[data-iano]');
  if (iaB){
    const t = task(iaB.closest('.card').dataset.id);
    if (iaB.dataset.iano !== undefined){ S.tasks = S.tasks.filter(x => x !== t); save(); render(); toast('Descartada'); return; }
    t.ia = false; save(); render(); pushCreate(t); toast(`Aprobada${t.client ? ' · ' + client(t.client).name : ''}`); return;
  }
  if (e.target.closest('.npeek a')) return;
  const chk = e.target.closest('.chk');
  const cardEl = e.target.closest('.card');
  if (chk && cardEl){
    const t = task(cardEl.dataset.id), was = snap(t);
    setStatus(t, t.status === 'done' ? 'todo' : 'done');
    save(); S._keepScroll = true; render();
    afterChange(t, was);
    if (t.status === 'done') toast('¡Hecha! ✓');
    return;
  }
  if (cardEl) openEditor(cardEl.dataset.id);
});
main.addEventListener('keydown', e => { const c = e.target.closest('.card'); if (c && e.key === 'Enter') openEditor(c.dataset.id); });
toolbar.addEventListener('click', e => {
  const b = e.target.closest('[data-week]'); if (!b) return;
  const n = +b.dataset.week; S.weekOffset = n === 0 ? 0 : S.weekOffset + n; render();
});

/* ---------- Editor ---------- */
const ed = $('#ed'), edForm = $('#edForm');
let editing = null;
function clientOptions(sel){
  const grp = (g,l) => `<optgroup label="${l}">` + S.clients.filter(c=>c.group===g).map(c => `<option value="${c.id}" ${c.id===sel?'selected':''}>${esc(c.name)}</option>`).join('') + '</optgroup>';
  return `<option value="">Sin cliente</option>` + grp('mine','Mis clientes') + grp('agency','Agencia');
}
const noteLinks = txt => [...new Set(txt.match(URL_RE) || [])].map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">🔗 ${esc(linkHost(u))}</a>`).join('');
edForm.notes.addEventListener('input', () => { $('#edLinks').innerHTML = noteLinks(edForm.notes.value); });
function openEditor(id){
  const t = task(id); if (!t) return; editing = id;
  edForm.title.value = t.title; edForm.client.innerHTML = clientOptions(t.client);
  edForm.day.value = t.day || ''; edForm.status.value = t.status; edForm.priority.value = t.priority;
  edForm.notes.value = noteOf(t.id); $('#edLinks').innerHTML = noteLinks(edForm.notes.value);
  const link = $('#edLink'); link.hidden = !t.url; if (t.url) link.href = t.url;
  // Para hoy + colocar en un bloque de hoy (sin arrastrar, cómodo en el móvil)
  edForm.today.checked = t.today === today();
  const blocks = window.__org.todayBlocks ? window.__org.todayBlocks() : [];
  const sl = S.slots[t.id];
  edForm.slot.innerHTML = '<option value="">— Sin colocar —</option>' + blocks.map(b => `<option value="${b.at}" ${sl && sl.day === today() && sl.at === b.at ? 'selected' : ''}>${b.label}</option>`).join('');
  ed.showModal();
}
ed.addEventListener('close', () => {
  const t = task(editing); if (!t) return;
  const was = snap(t);
  if (ed.returnValue === 'del'){
    if (t.cu && !confirm('Se borrará también en el ClickUp de la agencia. ¿Seguro?')) return;
    S.tasks = S.tasks.filter(x => x !== t); save(); render(); toast('Tarea borrada'); pushDelete(t); return;
  }
  if (ed.returnValue !== 'ok') return;
  setNote(t.id, edForm.notes.value);
  t.title = edForm.title.value.trim() || t.title; t.client = edForm.client.value || null;
  t.day = edForm.day.value || null; t.priority = edForm.priority.value;
  if (edForm.status.value !== t.status) setStatus(t, edForm.status.value);
  if (edForm.slot.value){ S.slots[t.id] = {day: today(), at: edForm.slot.value}; t.today = today(); }
  else { if (S.slots[t.id] && S.slots[t.id].day === today()) delete S.slots[t.id]; t.today = edForm.today.checked ? today() : (t.today === today() ? null : t.today); }
  const revisada = !!t.ia; t.ia = false;
  save(); render();
  if (revisada) pushCreate(t); else afterChange(t, was);
});
ed.addEventListener('click', e => { if (e.target === ed) ed.close('cancel'); });

/* ---------- Captura ---------- */
const q = $('#q'), pv = $('#pv');
function preview(){
  const items = q.value.trim() ? parse(q.value) : [];
  pv.innerHTML = items.map(p => {
    const c = client(p.client);
    return `<div class="pv"><b>${esc(p.title)}</b>
      ${c ? `<span class="tag" style="--c:${clientColor(c)}"><i></i>${esc(c.name)}</span>` : '<span class="tag miss">sin cliente</span>'}
      ${c && c.group === 'agency' && online() ? (l => l ? `<span class="tag">ClickUp › ${esc(l.name)}</span>` : '')(chooseList(c, p.title)) : c && c.group === 'mine' ? '<span class="tag">🔒 solo app</span>' : ''}
      <span class="tag ${p.priority === 'super' || p.priority === 'alta' ? 'warn' : ''}">${URG[p.priority].icon} ${URG[p.priority].label}</span>
      <span class="tag miss">por colocar</span></div>`;
  }).join('');
}
function addFromInput(){
  const items = parse(q.value);
  if (!items.length) return;
  let o = maxOrder();
  const nuevas = items.map(p => ({id:uid(), ...p, status:'todo', order:++o, doneAt:null}));
  S.tasks.push(...nuevas);
  save(); q.value = ''; preview(); render();
  if (online()) nuevas.forEach(pushCreate);
  toast(items.length === 1 ? `Añadida: ${items[0].title}` : `${items.length} tareas añadidas`);
}
// Añadir una tarea directamente debajo de un cliente (Clientes → Tareas). Entiende fechas y «urgente» como el dictado.
main.addEventListener('submit', e => {
  const f = e.target.closest('.qadd'); if (!f) return;
  e.preventDefault();
  const input = f.querySelector('input'), txt = input.value.trim(); if (!txt) return;
  const cid = f.dataset.qclient || null;
  let o = maxOrder();
  const nuevas = parse(txt).map(p => ({id:uid(), ...p, client:cid, status:'todo', order:++o, doneAt:null}));
  if (!nuevas.length) return;
  S.tasks.push(...nuevas); save(); render();
  const again = main.querySelector(`.qadd[data-qclient="${cid || ''}"] input`); if (again) again.focus();
  if (online()) nuevas.forEach(pushCreate);
  toast(nuevas.length === 1 ? `Añadida a ${client(cid)?.name || 'Sin cliente'}` : `${nuevas.length} tareas añadidas`);
});
q.addEventListener('input', preview);
q.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); if (rec) rec.stop(); addFromInput(); } });
$('#addBtn').addEventListener('click', addFromInput);

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
$('#mic').addEventListener('click', () => {
  const mic = $('#mic');
  if (!SR){ toast('Este navegador no dicta: usa el micro del teclado'); q.focus(); return; }
  if (rec){ rec.stop(); return; }
  rec = new SR(); rec.lang = 'es-ES'; rec.interimResults = true; rec.continuous = true;
  const base = q.value.trim() ? q.value.trim() + '. ' : '';
  rec.onresult = e => { let s = ''; for (const r of e.results) s += r[0].transcript + (r.isFinal ? '. ' : ''); q.value = base + s.trim(); preview(); };
  rec.onerror = e => toast(e.error === 'not-allowed' ? 'Permite el micrófono para dictar' : 'Micro: ' + e.error);
  rec.onend = () => { rec = null; mic.classList.remove('rec'); mic.setAttribute('aria-label','Dictar tareas'); if (q.value.trim()) toast('Revisa y pulsa Intro para añadir'); };
  try { rec.start(); mic.classList.add('rec'); mic.setAttribute('aria-label','Parar dictado'); } catch(err){ rec = null; toast('No se pudo iniciar el micro'); }
});

/* ---------- Ajustes ---------- */
const st = $('#st'), clList = $('#clList');
function renderClients(){
  const row = c => `<div class="cl-row" data-id="${c.id}">
    <input type="color" value="${c.color}" data-k="color" aria-label="Color">
    <input value="${esc(c.name)}" data-k="name" aria-label="Nombre">
    ${c.auto ? `<span class="lock" style="grid-column:auto">Agencia</span>`
      : `<select data-k="group"><option value="mine" ${c.group==='mine'?'selected':''}>Mío</option><option value="agency" ${c.group==='agency'?'selected':''}>Agencia</option></select>`}
    <button type="button" class="x" data-del aria-label="${c.auto ? 'Ocultar cliente' : 'Borrar cliente'}">×</button>
    ${c.auto ? `<span></span><select class="kw" data-merge><option value="">Unir con otro cliente de la agencia…</option>${S.clients.filter(x => x.auto && x.id !== c.id).map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>` : ''}
    <span></span><input class="kw" value="${esc(c.keywords||'')}" data-k="keywords" placeholder="palabras clave extra, separadas por comas">
    <span></span><span class="lock">${c.auto ? `🔗 Carpeta de ClickUp · ${clientLists(c).length} listas` : c.group === 'mine' ? '🔒 Solo en la app, nunca va a ClickUp' : 'Sin carpeta de ClickUp: sus tareas no se suben'}</span></div>`;
  const mine = S.clients.filter(c => c.group === 'mine'), ag = S.clients.filter(c => c.group !== 'mine');
  clList.innerHTML = `<b class="grp">Mis clientes (${mine.length})</b>` + (mine.map(row).join('') || '<span class="lock">Aún ninguno: pulsa «+ Cliente».</span>')
    + `<b class="grp">Agencia (${ag.length})</b>` + (ag.map(row).join('') || `<span class="lock">${online() ? 'Aparecen solos cuando tienes tareas asignadas en su carpeta.' : 'Conecta ClickUp para verlos.'}</span>`);
  const add = $('#addFromList');
  add.hidden = !online();
  if (online()){
    const folders = new Map();
    for (const l of S.cu.lists){ const key = folderKey(l.folder, l.id); if (!client(key) && !folders.has(key)) folders.set(key, {key, name: l.folder ? l.folderName : l.name, path: l.path}); }
    add.innerHTML = `<option value="">+ Cliente de la agencia…</option>` +
      [...folders.values()].sort((a,b) => a.name.localeCompare(b.name)).map(f => `<option value="${f.key}">${esc(f.name)}</option>`).join('');
  }
  $('#resetDemo').hidden = online();
  document.querySelectorAll('.only-on').forEach(e => e.hidden = !online());
  renderCU();
}
function renderCU(){
  const box = $('#cuBox');
  if (!online()){
    box.innerHTML = `<b>Conectar el ClickUp de la agencia</b>
      <div class="note" style="background:none;padding:0">Verás tus tareas asignadas de la agencia, agrupadas por cliente (cada carpeta de ClickUp). Tus clientes (<b>Mío</b>) nunca se envían a ClickUp. El token se guarda en tu cuenta de Google (protegida), así lo tienen todos tus dispositivos.</div>
      <div class="row"><label>Token de ClickUp<input type="password" id="cuToken" placeholder="pk_…" autocomplete="off"></label><button type="button" class="btn primary" id="cuConnect">Conectar</button></div>`;
    return;
  }
  const nh = (S.cu.hidden || []).length;
  box.innerHTML = `<div><span class="ok">● Agencia conectada</span> como ${esc(S.cu.meName)} · tus tareas asignadas</div>
    <div class="actions" style="margin:0"><button type="button" class="btn" id="cuRefresh">Actualizar</button>${nh ? `<button type="button" class="btn" id="cuUnhide">Mostrar ${nh} oculto${nh>1?'s':''}</button>` : ''}<span class="sp"></span><button type="button" class="btn danger" id="cuOff">Desconectar</button></div>`;
}
$('#cuBox').addEventListener('click', async e => {
  const id = e.target.id;
  if (id === 'cuConnect'){
    const tk = $('#cuToken').value.trim(); if (!tk) return;
    e.target.disabled = true; e.target.textContent = 'Conectando…';
    try { await connect(tk); toast('ClickUp de la agencia conectado'); } catch(err){ toast('No se pudo conectar: ' + err.message); }
    renderClients();
  }
  if (id === 'cuRefresh'){ e.target.textContent = 'Cargando…'; try { await loadLists(); saveLocal(); await sync(); } catch(err){ toast(err.message); } renderClients(); }
  if (id === 'cuUnhide'){ S.cu.hidden = []; save(); await sync(); renderClients(); }
  if (id === 'cuOff' && confirm('¿Desconectar ClickUp en todos tus dispositivos? Tus clientes y sus tareas se quedan.')){ disconnect(); renderClients(); }
});
$('#addFromList').addEventListener('change', e => {
  const key = e.target.value; if (!key) return;
  const l = S.cu.lists.find(l => folderKey(l.folder, l.id) === key);
  S.cu.hidden = (S.cu.hidden || []).filter(h => h !== key);
  ensureAgencyClient(key, l.folder ? l.folderName : l.name);
  save(); renderClients(); render(); sync(true);
});
clList.addEventListener('input', e => {
  const row = e.target.closest('.cl-row'), k = e.target.dataset.k; if (!row || !k) return;
  const c = client(row.dataset.id);
  c[k] = e.target.value;
  // Un cliente «Mío» nunca puede quedarse con el id de una carpeta/lista de ClickUp de la agencia:
  // pasa a ser un cliente propio nuevo (con sus tareas de la app) y la carpeta vuelve a ser de la agencia al sincronizar.
  if (k === 'group' && c.group === 'mine' && /^[fl]:/.test(c.id)){
    const nid = uid(), old = c.id;
    for (const t of S.tasks) if (t.client === old && !t.cu) t.client = nid;
    c.id = nid; delete c.auto;
    toast('Separado de ClickUp: ahora es solo tuyo'); setTimeout(() => sync(true), 300);
  }
  save(); render(); preview();
  if (k === 'group') renderClients();
});
clList.addEventListener('change', e => {
  const sel = e.target.closest('[data-merge]'); if (!sel || !sel.value) return;
  const from = client(sel.closest('.cl-row').dataset.id), to = client(sel.value);
  if (!from || !to || !confirm(`¿Unir «${from.name}» con «${to.name}»? Sus tareas pasarán a «${to.name}». En ClickUp no se toca nada.`)){ sel.value = ''; return; }
  mergeAgency(from.id, to.id); toast(`Unido con ${to.name}`);
});
function mergeAgency(fromId, toId){
  S.plan = S.plan || {}; const al = S.plan.cuAlias = S.plan.cuAlias || {};
  for (const k in al) if (al[k] === fromId) al[k] = toId;   // lo que ya apuntaba a «from» ahora va a «to»
  al[fromId] = toId;
  for (const t of S.tasks) if (t.client === fromId) t.client = toId;
  S.clients = S.clients.filter(c => c.id !== fromId);
  save(); renderClients(); render(); sync(true);
}
clList.addEventListener('click', e => {
  if (!e.target.closest('[data-del]')) return;
  const id = e.target.closest('.cl-row').dataset.id, c = client(id);
  if (c.auto){
    if (!confirm(`¿Ocultar «${c.name}» de la app? En ClickUp no se toca nada.`)) return;
    S.cu.hidden = [...new Set([...(S.cu.hidden || []), id])];
    S.clients = S.clients.filter(x => x.id !== id);
    S.tasks = S.tasks.filter(t => t.client !== id || !t.cu);
    S.tasks.forEach(t => { if (t.client === id) t.client = null; });
    save(); renderClients(); render(); return;
  }
  const n = S.tasks.filter(t => t.client === id && !t.cu).length;
  if (!confirm(`¿Quitar «${c.name}»?${n ? ` Sus ${n} tareas pasarán a «Sin cliente».` : ''}`)) return;
  S.clients = S.clients.filter(x => x.id !== id);
  S.tasks.forEach(t => { if (t.client === id) t.client = null; });
  save(); renderClients(); render();
});
$('#addClient').addEventListener('click', () => {
  S.clients.push({id:uid(), name:'Nuevo cliente', group:'mine', color: PALETA[S.clients.length % PALETA.length], keywords:''});
  save(); renderClients(); render();
  const ins = clList.querySelectorAll('[data-k=name]'); const last = ins[ins.length-1]; last.focus(); last.select();
});
$('#resetDemo').addEventListener('click', () => { if (confirm('¿Volver a los datos de ejemplo? Se pierden los cambios.')){ seed(); save(); renderClients(); render(); } });
$('#settingsBtn').addEventListener('click', () => { renderClients(); st.showModal(); });

$('#logoutBtn').addEventListener('click', () => { if (window.__cloud && confirm('¿Cerrar sesión en este dispositivo?')) window.__cloud.logout(); });
function renderAccount(){ $('#accountTxt').textContent = window.__cloud ? window.__cloud.email : ''; }
$('#settingsBtn').addEventListener('click', renderAccount);

/* ---------- Navegación ---------- */
$('#tabs').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (!b) return; S.view = b.dataset.view; S._scrolled = false; save(); render(); scrollTo(0,0); });
$('#filters').addEventListener('click', e => { const b = e.target.closest('[data-group]'); if (!b) return; S.group = b.dataset.group; save(); render(); });
addEventListener('storage', e => { if (e.key === KEY){ load(); render(); } });
let lastDay = today();
setInterval(() => { if (today() !== lastDay){ lastDay = today(); render(); } }, 60000);

let tt;
function toast(msg){ const el = $('#toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('on'), 2200); }

// Al recargar: si ya habías entrado en este dispositivo, la app sale al momento (Google lo confirma por detrás).
// Si no, se ve la pantalla de carga hasta saber si hay sesión.
(() => {
  const g = $('#gate'), h = new Date().getHours();
  $('#gateHello').textContent = (h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches') + ', Jorge';
  try { if (localStorage.getItem('jp-session') === '1') g.hidden = true; } catch(e){}
})();
load();
// Apariencia (Claro por defecto, como las apps de Apple). Se guarda solo en este dispositivo.
function applyTheme(){
  let m = 'light'; try { m = localStorage.getItem('jp-theme') || 'light'; } catch(e){}
  const dark = m === 'dark' || (m === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const mc = document.querySelector('meta[name=theme-color]'); if (mc) mc.content = dark ? '#000000' : '#f5f5f7';
  document.querySelectorAll('[data-themebtn]').forEach(b => b.setAttribute('aria-pressed', b.dataset.themebtn === m));
  const tb = document.getElementById('themeBtn'); if (tb){ tb.textContent = dark ? '☀️' : '🌙'; tb.setAttribute('aria-label', dark ? 'Cambiar a modo día' : 'Cambiar a modo noche'); }
}
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
document.getElementById('themeBtn').addEventListener('click', () => { const dark = document.documentElement.dataset.theme === 'dark'; try { localStorage.setItem('jp-theme', dark ? 'light' : 'dark'); } catch(err){} applyTheme(); });
document.addEventListener('click', e => { const b = e.target.closest('[data-themebtn]'); if (!b) return; try { localStorage.setItem('jp-theme', b.dataset.themebtn); } catch(err){} applyTheme(); });
S.view = 'dia'; S.clientMode = 'tareas';   // al abrir la app se empieza en el Día
render(); modeIdle();
$('#mode').classList.add('mode-btn');
$('#mode').addEventListener('click', () => online() ? sync() : ($('#settingsBtn').click()));
if (online()) sync(true);
// Mantener PC y móvil al día: cada 60 s con la app abierta y al volver a ella
setInterval(() => { if (document.visibilityState === 'visible') sync(true); }, 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(true); });
window.__org = {S, GROUP, clientColor, URG, urgRank, parse, pushCreate, uid, maxOrder, clientLists, online, PALETA, cu, listInfo, norm, isRegTask, applyCloud, cloudEmpty, cloudReady, wipeLocal, toast, views, render, save, card, setToolbar, visibleTasks, client, task, esc, iso, fromIso, addDays, today, dayLabel, DIAS_L, MESES, pad, byOrder};
})();
