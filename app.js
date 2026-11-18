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
const CU_DEFAULT = () => ({token:'', me:null, meName:'', lists:[], onlyMine:true, statuses:{}, lastSync:0});
const S = { tasks:[], clients:[], view:'hoy', group:'all', weekOffset:0, cu:CU_DEFAULT() };

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
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.tasks && d.clients){ Object.assign(S, {tasks:d.tasks, clients:d.clients, view:d.view||'hoy', group:d.group||'all', cu:{...CU_DEFAULT(), ...(d.cu||{})}}); return; } } catch(e){}
  seed();
}
function saveLocal(){ try { localStorage.setItem(KEY, JSON.stringify({tasks:S.tasks, clients:S.clients, view:S.view, group:S.group, cu:S.cu})); } catch(e){} }
function save(){ saveLocal(); scheduleCloud(); }

/* ---------- Sincronización con tu cuenta de Google (cloud.js) ---------- */
// Se sube: tus clientes, tus tareas (no las de ClickUp, que ya viven allí) y el token de ClickUp.
const DEMO_IDS = new Set(['mio-1','mio-2','ag-a','ag-b','ag-int']);
let lastSent = '', cloudTimer = null;
function cloudData(){
  return JSON.parse(JSON.stringify({
    clients: S.clients.map(({id,name,group,color,keywords,listId}) => ({id,name,group,color,keywords,listId})),
    tasks: S.tasks.filter(t => !t.cu && !t.demo),
    token: S.cu.token || '', onlyMine: S.cu.onlyMine !== false }));
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
  S.cu = {...CU_DEFAULT(), token, onlyMine: S.cu.onlyMine};
  setMode('Conectando…');
  try { const {user} = await cu('/user'); S.cu.me = user.id; S.cu.meName = user.username || user.email || ''; await loadLists(); saveLocal(); await sync(); }
  catch(e){ toast('ClickUp: ' + e.message); modeIdle(); }
}
function applyCloud(d){
  if (D || (typeof ed !== 'undefined' && ed.open)) return setTimeout(() => applyCloud(d), 800);
  S.clients = d.clients || [];
  S.tasks = [...S.tasks.filter(t => t.cu), ...(d.tasks || [])];
  S.cu.onlyMine = d.onlyMine !== false;
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
    for (const s of spaces){
      const [{folders}, {lists}] = await Promise.all([cu(`/space/${s.id}/folder?archived=false`), cu(`/space/${s.id}/list?archived=false`)]);
      for (const l of lists) out.push({id:l.id, name:l.name, team:t.id, path:`${t.name} › ${s.name}`});
      for (const f of folders) for (const l of (f.lists || [])) out.push({id:l.id, name:l.name, team:t.id, path:`${t.name} › ${s.name} › ${f.name}`});
    }
  }
  S.cu.lists = out;
}
async function connect(token){
  S.cu = {...CU_DEFAULT(), token: token.trim()};
  setMode('Conectando…');
  try {
    const {user} = await cu('/user');
    S.cu.me = user.id; S.cu.meName = user.username || user.email || '';
    await loadLists();
  } catch(e){ S.cu = CU_DEFAULT(); modeIdle(); throw e; }
  // Fuera los clientes de ejemplo y las tareas de ejemplo
  S.clients = S.clients.filter(c => !c.id.startsWith('ag-'));
  for (const c of S.clients.filter(c => c.group === 'agency')){
    const m = S.cu.lists.find(l => norm(l.name).includes(norm(c.name)) || norm(c.name).includes(norm(l.name)));
    if (m && !c.listId) c.listId = m.id;
  }
  S.tasks = S.tasks.filter(t => !t.demo && !t.cu);
  save(); await sync();
}
function disconnect(){ S.cu = CU_DEFAULT(); S.tasks = S.tasks.filter(t => !t.cu); save(); render(); modeIdle(); }

function fromCU(raw, clientId, prev){
  const st = raw.status || {};
  const status = (st.type === 'closed' || st.type === 'done') ? 'done' : st.type === 'open' ? 'todo'
    : /revis|review|aprob|feedback|valid/i.test(st.status || '') ? 'review' : 'doing';
  const p = raw.priority ? +raw.priority.id : 3;
  const old = prev.get(raw.id);
  return {id:raw.id, title:raw.name, client:clientId, day: raw.due_date ? iso(new Date(+raw.due_date)) : null,
    status, priority: p <= 2 ? 'alta' : p === 4 ? 'baja' : 'normal',
    order: old ? old.order : +raw.date_created / 1e6,
    doneAt: status === 'done' ? iso(new Date(+(raw.date_done || raw.date_closed || Date.now()))) : null,
    url: raw.url, cu: true};
}
async function pages(path){
  let all = [];
  for (let p = 0; p < 10; p++){
    const r = await cu(path + `&page=${p}`);
    all = all.concat(r.tasks || []);
    if (r.last_page !== false || (r.tasks || []).length < 100) break;
  }
  return all;
}
async function sync(silent){
  if (!online() || syncing || inflight || D) return;
  syncing = true; setMode('Sincronizando…');
  try {
    const prev = new Map(S.tasks.map(t => [t.id, t]));
    const mine = S.cu.onlyMine && S.cu.me ? `&assignees[]=${S.cu.me}` : '';
    const since = Date.now() - 14 * 864e5;
    const out = new Map();
    await Promise.all(S.clients.filter(c => c.listId).map(async c => {
      const [open, closed] = await Promise.all([
        pages(`/list/${c.listId}/task?subtasks=true${mine}`),
        pages(`/list/${c.listId}/task?subtasks=true&include_closed=true&date_done_gt=${since}${mine}`)]);
      for (const raw of [...open, ...closed]) out.set(raw.id, fromCU(raw, c.id, prev));
    }));
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
  if (!S.cu.statuses[listId]){ const l = await cu(`/list/${listId}`); S.cu.statuses[listId] = l.statuses || []; save(); }
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
const PRIO = {alta:1, normal:3, baja:4};
const dueMs = day => { const d = fromIso(day); d.setHours(12); return d.getTime(); };
const snap = t => ({title:t.title, day:t.day, status:t.status, priority:t.priority, client:t.client});

const isAgency = id => { const c = client(id); return !!(c && c.group === 'agency'); };

// Regla de oro: solo se sube a ClickUp lo que es de un cliente marcado como «Agencia». Lo tuyo nunca sale de la app.
async function pushCreate(t){
  const c = client(t.client);
  if (!online() || t.cu || !c || c.group !== 'agency' || !c.listId) return;
  await write(async () => {
    const body = {name:t.title, priority:PRIO[t.priority], assignees: S.cu.me ? [S.cu.me] : []};
    if (t.day){ body.due_date = dueMs(t.day); body.due_date_time = false; }
    if (t.status !== 'todo'){ const s = await statusName(c.listId, t.status); if (s) body.status = s; }
    const res = await cu(`/list/${c.listId}/task`, {method:'POST', body});
    t.id = res.id; t.url = res.url; t.cu = true; save(); render();
  });
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
    const from = listInfo(client(before.client)?.listId), to = listInfo(c.listId);
    if (!to || !from || from.team !== to.team) return revert(!to ? 'Ese cliente no tiene lista de ClickUp' : 'No se puede mover entre espacios de trabajo distintos');
    await write(() => cu(`/v3/workspaces/${to.team}/tasks/${t.id}/home_list/${to.id}`, {method:'PUT', body:{}}));
  }
  const body = {};
  if (before.title !== t.title) body.name = t.title;
  if (before.day !== t.day){ body.due_date = t.day ? dueMs(t.day) : null; body.due_date_time = false; }
  if (before.priority !== t.priority) body.priority = PRIO[t.priority];
  if (before.status !== t.status || before.client !== t.client){ const s = await statusName(c.listId, t.status).catch(() => null); if (s) body.status = s; }
  if (Object.keys(body).length) await write(() => cu(`/task/${t.id}`, {method:'PUT', body}));
}
async function pushDelete(t){
  if (!online() || !t.cu) return;
  await write(() => cu(`/task/${t.id}`, {method:'DELETE'}));
}

/* ---------- Clasificador de voz/texto (sin IA, sin tokens) ---------- */
const STOP = new Set(['cliente','clientes','agencia','tienda','store','shop','interno','general','proyecto','proyectos','marketing','digital','personal','tareas','lista','grupo','studio','estudio']);
function nextDow(target){ const now = new Date(); let n = (target - now.getDay() + 7) % 7; if (n === 0) n = 7; return iso(addDays(now,n)); }
function parseOne(raw){
  let title = ' ' + raw.trim() + ' ';
  let day = null, dayLabel = null, priority = 'normal';
  const now = new Date();
  const take = (re, fn) => { const m = title.match(re); if (!m) return false; fn(m); title = title.replace(re,' '); return true; };

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
    if (m && !/(la|esta)\s+$/i.test(title.slice(0, m.index + m[1].length))){
      day = iso(addDays(now,1));
      title = title.slice(0, m.index) + ' ' + title.slice(m.index + m[0].length);
    }
  }
  take(/\b(?:es\s+)?(?:muy\s+)?(urgente|urgent[ií]simo|asap|cuanto\s+antes|important[ií]sim[oa]|importante|prioridad\s+alta)\b/i, () => priority = 'alta') ||
  take(/\b(sin\s+prisa|cuando\s+pueda|baja\s+prioridad|prioridad\s+baja)\b/i, () => priority = 'baja');

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
function visibleTasks(){
  const ids = new Set(visibleClients().map(c => c.id));
  return S.tasks.filter(t => t.client && client(t.client) ? ids.has(t.client) : S.group === 'all');
}
const byOrder = (a,b) => (a.order||0) - (b.order||0);

function card(t, hide={}){
  const c = client(t.client), done = t.status === 'done', late = !done && t.day && t.day < today();
  const meta = [];
  if (!hide.client) meta.push(c ? `<span class="cl" style="--c:${c.color}"><i></i>${esc(c.name)}</span>` : `<span class="cl" style="--c:var(--faint)"><i></i>Sin cliente</span>`);
  if (!hide.day && t.day) meta.push(`<span class="${late?'late':''}">${late?'Atrasada · ':''}${dayLabel(t.day)}</span>`);
  if (t.priority === 'alta' && !done) meta.push('<span class="alta">Urgente</span>');
  if (t.priority === 'baja' && !done) meta.push('<span class="st">Sin prisa</span>');
  if (!hide.status && t.status !== 'todo' && !done) meta.push(`<span class="st">${STATUS[t.status]}</span>`);
  if (online() && !t.cu && isAgency(t.client)) meta.push('<span class="st">Sin subir a ClickUp</span>');
  return `<article class="card ${done?'done':''}" data-id="${t.id}" style="--c:${c?c.color:'var(--faint)'}" tabindex="0">
    <button class="chk" aria-label="${done?'Marcar como pendiente':'Completar'}"></button>
    <div class="body"><p class="tt">${esc(t.title)}</p>${meta.length?`<div class="meta">${meta.join('')}</div>`:''}</div></article>`;
}
function column({title, sub='', field, value='', tasks, hide, cls='', dot, undone=false, empty='Arrastra aquí'}){
  return `<section class="col ${cls}" data-field="${field}" data-value="${value}" ${undone?'data-undone="1"':''}>
    <header><h3>${dot?`<i style="--c:${dot}"></i>`:''}${esc(title)} ${sub?`<span class="csub">${esc(sub)}</span>`:''}</h3><span class="count">${tasks.length}</span></header>
    <div class="list">${tasks.length ? tasks.map(t => card(t, hide)).join('') : `<div class="empty">${empty}</div>`}</div></section>`;
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
      .sort((a,b) => (a.priority==='alta'?0:1) - (b.priority==='alta'?0:1) || byOrder(a,b));
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
    const T = visibleTasks();
    setToolbar('Clientes', 'tareas pendientes de cada uno', '', 'Arrastra para cambiar de cliente');
    let html = '<div class="board">';
    for (const [g, label] of [['mine','Mis clientes'],['agency','Agencia']]){
      const cs = visibleClients().filter(c => c.group === g);
      if (!cs.length) continue;
      html += `<div class="sep">${label}</div>`;
      for (const c of cs){
        const ts = T.filter(x => x.client === c.id);
        const pend = ts.filter(x => x.status !== 'done').sort((a,b)=>(a.day||'9').localeCompare(b.day||'9')||byOrder(a,b));
        const hechas = ts.length - pend.length;
        html += column({title:c.name, sub: hechas ? `${hechas} hecha${hechas>1?'s':''}` : '', field:'client', value:c.id, tasks:pend, hide:{client:true}, dot:c.color});
      }
    }
    const sin = T.filter(x => (!x.client || !client(x.client)) && x.status !== 'done');
    if (S.group === 'all' && sin.length) html += column({title:'Sin cliente', field:'client', value:'', tasks:sin, hide:{client:true}, dot:'var(--faint)'});
    return html + '</div>';
  },
};

function render(){
  const sx = main.querySelector('.board')?.scrollLeft || 0;
  main.innerHTML = views[S.view]();
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
  const zone = el && el.closest('.col[data-field]');
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
  save(); S._keepScroll = true; render();
  afterChange(t, was);
}

main.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'mouse' || e.button !== 0) return;
  const cardEl = e.target.closest('.card');
  if (!cardEl || e.target.closest('.chk')) return;
  e.preventDefault();
  const sx = e.clientX, sy = e.clientY;
  const mv = ev => { if (!D && Math.hypot(ev.clientX-sx, ev.clientY-sy) > 6) beginDrag(cardEl, sx, sy); if (D) moveDrag(ev.clientX, ev.clientY); };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (D) endDrag(); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
});
main.addEventListener('touchstart', e => {
  const cardEl = e.target.closest('.card');
  if (!cardEl || e.touches.length > 1 || e.target.closest('.chk')) return;
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
function openEditor(id){
  const t = task(id); if (!t) return; editing = id;
  edForm.title.value = t.title; edForm.client.innerHTML = clientOptions(t.client);
  edForm.day.value = t.day || ''; edForm.status.value = t.status; edForm.priority.value = t.priority;
  const link = $('#edLink'); link.hidden = !t.url; if (t.url) link.href = t.url;
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
  t.title = edForm.title.value.trim() || t.title; t.client = edForm.client.value || null;
  t.day = edForm.day.value || null; t.priority = edForm.priority.value;
  if (edForm.status.value !== t.status) setStatus(t, edForm.status.value);
  save(); render(); afterChange(t, was);
});
ed.addEventListener('click', e => { if (e.target === ed) ed.close('cancel'); });

/* ---------- Captura ---------- */
const q = $('#q'), pv = $('#pv');
function preview(){
  const items = q.value.trim() ? parse(q.value) : [];
  pv.innerHTML = items.map(p => {
    const c = client(p.client);
    return `<div class="pv"><b>${esc(p.title)}</b>
      ${c ? `<span class="tag" style="--c:${c.color}"><i></i>${esc(c.name)}</span>` : '<span class="tag miss">sin cliente</span>'}
      ${p.day ? `<span class="tag">${dayLabel(p.day)}</span>` : '<span class="tag miss">a la bandeja</span>'}
      ${p.priority==='alta' ? '<span class="tag warn">Urgente</span>' : p.priority==='baja' ? '<span class="tag">Sin prisa</span>' : ''}</div>`;
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
  clList.innerHTML = S.clients.map(c => `<div class="cl-row" data-id="${c.id}">
    <input type="color" value="${c.color}" data-k="color" aria-label="Color">
    <input value="${esc(c.name)}" data-k="name" aria-label="Nombre">
    <select data-k="group"><option value="mine" ${c.group==='mine'?'selected':''}>Mío</option><option value="agency" ${c.group==='agency'?'selected':''}>Agencia</option></select>
    <button type="button" class="x" data-del aria-label="Borrar cliente">×</button>
    <span></span><input class="kw" value="${esc(c.keywords||'')}" data-k="keywords" placeholder="palabras clave, separadas por comas">
    ${!online() ? '' : c.group === 'agency'
      ? `<span></span><select class="ls" data-k="listId">${listOptions(c.listId, '— Sin lista de ClickUp —')}</select>`
      : `<span></span><span class="lock">🔒 Solo en la app, nunca va a ClickUp</span>`}</div>`).join('');
  const add = $('#addFromList');
  add.hidden = !online();
  if (online()) add.innerHTML = `<option value="">+ Cliente de la agencia desde ClickUp…</option>` +
    S.cu.lists.filter(l => !S.clients.some(c => c.listId === l.id)).map(l => `<option value="${l.id}">${esc(l.name)} · ${esc(l.path)}</option>`).join('');
  $('#resetDemo').hidden = online();
  document.querySelectorAll('.only-on').forEach(e => e.hidden = !online());
  renderCU();
}
function listOptions(sel, empty){
  const groups = {};
  for (const l of S.cu.lists) (groups[l.path] = groups[l.path] || []).push(l);
  return `<option value="">${empty}</option>` + Object.entries(groups).map(([p, ls]) =>
    `<optgroup label="${esc(p)}">${ls.map(l => `<option value="${l.id}" ${l.id===sel?'selected':''}>${esc(l.name)}</option>`).join('')}</optgroup>`).join('');
}
function renderCU(){
  const box = $('#cuBox');
  if (!online()){
    box.innerHTML = `<b>Conectar el ClickUp de la agencia</b>
      <div class="note" style="background:none;padding:0">Solo se conectan los clientes que marques como <b>Agencia</b>. Tus clientes (<b>Mío</b>) nunca se envían a ClickUp. El token se guarda en tu cuenta de Google (protegida), así lo tienen todos tus dispositivos.</div>
      <div class="row"><label>Token de ClickUp<input type="password" id="cuToken" placeholder="pk_…" autocomplete="off"></label><button type="button" class="btn primary" id="cuConnect">Conectar</button></div>`;
    return;
  }
  box.innerHTML = `<div><span class="ok">● Agencia conectada</span> como ${esc(S.cu.meName)} · ${S.cu.lists.length} listas</div>
    <label class="check"><input type="checkbox" id="cuMine" ${S.cu.onlyMine?'checked':''}> Ver solo las tareas asignadas a mí</label>
    <div class="actions" style="margin:0"><button type="button" class="btn" id="cuRefresh">Actualizar listas</button><span class="sp"></span><button type="button" class="btn danger" id="cuOff">Desconectar</button></div>`;
}
$('#cuBox').addEventListener('click', async e => {
  const id = e.target.id;
  if (id === 'cuConnect'){
    const tk = $('#cuToken').value.trim(); if (!tk) return;
    e.target.disabled = true; e.target.textContent = 'Conectando…';
    try { await connect(tk); toast('ClickUp de la agencia conectado'); } catch(err){ toast('No se pudo conectar: ' + err.message); }
    renderClients();
  }
  if (id === 'cuRefresh'){ e.target.textContent = 'Cargando…'; try { await loadLists(); save(); } catch(err){ toast(err.message); } renderClients(); }
  if (id === 'cuOff' && confirm('¿Desconectar ClickUp en todos tus dispositivos? Tus clientes y sus tareas se quedan.')){ disconnect(); renderClients(); }
});
$('#cuBox').addEventListener('change', e => {
  if (e.target.id === 'cuMine'){ S.cu.onlyMine = e.target.checked; save(); sync(); }
});
$('#addFromList').addEventListener('change', e => {
  const l = listInfo(e.target.value); if (!l) return;
  S.clients.push({id:uid(), name:l.name, group:'agency', color:PALETA[S.clients.length % PALETA.length], keywords:'', listId:l.id});
  save(); renderClients(); render(); sync(true);
});
clList.addEventListener('input', e => {
  const row = e.target.closest('.cl-row'), k = e.target.dataset.k; if (!row || !k) return;
  const c = client(row.dataset.id);
  if (k === 'group' && e.target.value === 'mine' && c.group === 'agency'){
    // Pasar un cliente a «Mío»: se desconecta de ClickUp y sus tareas de ClickUp dejan de verse aquí
    delete c.listId; S.tasks = S.tasks.filter(t => !(t.cu && t.client === c.id));
  }
  c[k] = e.target.value; save(); render(); preview();
  if (k === 'group') renderClients();
  if (k === 'listId' || k === 'group') sync(true);
});
clList.addEventListener('click', e => {
  if (!e.target.closest('[data-del]')) return;
  const id = e.target.closest('.cl-row').dataset.id, c = client(id);
  const n = S.tasks.filter(t => t.client === id && !t.cu).length;
  if (!confirm(`¿Quitar «${c.name}»?${n ? ` Sus ${n} tareas pasarán a «Sin cliente».` : ''}`)) return;
  S.clients = S.clients.filter(x => x.id !== id);
  S.tasks = S.tasks.filter(t => !(t.cu && t.client === id));
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

load(); render(); modeIdle();
$('#mode').classList.add('mode-btn');
$('#mode').addEventListener('click', () => online() ? sync() : ($('#settingsBtn').click()));
if (online()) sync(true);
// Mantener PC y móvil al día: cada 60 s con la app abierta y al volver a ella
setInterval(() => { if (document.visibilityState === 'visible') sync(true); }, 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(true); });
window.__org = {S, parse, applyCloud, cloudEmpty, cloudReady, wipeLocal, toast};
})();
