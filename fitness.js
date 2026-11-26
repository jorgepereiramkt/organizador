// JP Fitness: entrenos tipo Hevy (rutinas, series, descansos con temporizador, historial y progreso).
// Mismo login y misma base de datos que el Organizador (Firebase, plan gratis).
// Datos en Firestore:  users/{uid}/fit/perfil  (rutinas, ajustes, entreno en curso)
//                      users/{uid}/fit/m-AAAA-MM  (entrenos de ese mes: { e: { id: entreno } })
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signInWithCredential, signOut }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, doc, collection, onSnapshot, setDoc, updateDoc, deleteField, FieldPath, getDoc }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const ALLOWED = 'jorgepereiramktdigital@gmail.com';
const app = initializeApp({
  apiKey: 'AIzaSyBFOE-WO9-Q3RYnv2zJ_-BoBJT9ewCyIn0',
  authDomain: 'organizador-jp.firebaseapp.com',
  projectId: 'organizador-jp',
  storageBucket: 'organizador-jp.firebasestorage.app',
  messagingSenderId: '59642019941',
  appId: '1:59642019941:web:edbd1490f5a134661c468c'
});
const auth = getAuth(app);
const db = initializeFirestore(app, { localCache: persistentLocalCache() });

// ---------- utilidades ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const uid8 = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const num = v => { if (v === '' || v == null) return null; const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };
const fmtN = n => n == null ? '' : (+n).toLocaleString('es-ES', { maximumFractionDigits: 2 });
const fmtKgR = (kg, r) => (kg ? fmtN(kg) + ' kg × ' : '') + (r ?? 0) + (kg ? '' : ' reps');
const e1rm = (kg, r) => (kg && r) ? kg * (1 + Math.min(r, 30) / 30) : 0;
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fDia = t => { const d = new Date(t); return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`; };
const fHora = t => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
const fDur = ms => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`; };
const fReloj = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const fMMSS = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const ym = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const lunes = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
const DIA = 86400000;
const keyOf = e => e.eid ? 'id:' + e.eid : 'n:' + norm(e.n);
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

// Tema: el mismo que elijas en el Organizador
(() => { let m = 'light'; try { m = localStorage.getItem('jp-theme') || 'light'; } catch (e) {}
  ponTema(lsGet('jp-fit-tema', 'dark')); })();
function ponTema(t) {   // modo claro / oscuro propio de Fitness (por defecto oscuro)
  document.documentElement.dataset.theme = t; lsSet('jp-fit-tema', t);
  const mc = document.querySelector('meta[name=theme-color]'); if (mc) mc.content = t === 'dark' ? '#000000' : '#f3f6f4';
  const b = document.getElementById('temaBtn'); if (b) b.textContent = t === 'dark' ? '☀️' : '🌙';
}
document.getElementById('recBtn')?.addEventListener('click', () => window.__refrescar ? window.__refrescar() : location.reload());
document.getElementById('temaBtn')?.addEventListener('click', () => { ponTema(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); if (listo) pinta(); });

let toastT;
const toast = (m, ms = 2600) => { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms); };

// ---------- estado ----------
const F = { rutinas: [], ajustes: { descanso: 120, objSemana: 4 }, meses: {}, entrenos: [], porId: {}, ultimoFin: null, alimentos: [], dieta: { comidas: [], obj: null }, dietas: [], dietaActiva: null, diario: {}, pesos: {}, compra: { falta: {}, comprado: {}, extra: [] } };
let U = null, listo = false, vista = lsGet('jp-fit-vista', 'hoy');
let activo = lsGet('jp-fit-activo', null);
const perfilRef = () => doc(db, 'users', U.uid, 'fit', 'perfil');
const mesRef = k => doc(db, 'users', U.uid, 'fit', 'm-' + k);

function reconstruye() {
  const todos = [];
  for (const m of Object.values(F.meses)) for (const w of Object.values(m || {})) if (w && w.ini) todos.push(w);
  todos.sort((a, b) => b.ini - a.ini);
  F.entrenos = todos; F.porId = Object.fromEntries(todos.map(w => [w.id, w]));
  catCache = null;
}

let perfilT = null;
function guardaPerfil(ms = 800) {
  clearTimeout(perfilT);
  perfilT = setTimeout(() => {
    if (!U) return;
    setDoc(perfilRef(), { rutinas: F.rutinas, ajustes: F.ajustes, activo: activo || null, ultimoFin: F.ultimoFin || null, at: Date.now() }, { merge: true })
      .catch(e => toast('No se pudo guardar: ' + (e.code || e.message)));
  }, ms);
}
function guardaActivo() { if (activo) activo.upd = Date.now(); lsSet('jp-fit-activo', activo); guardaPerfil(2500); }

async function guardaEntreno(w) {
  const k = ym(w.ini);
  (F.meses[k] ||= {})[w.id] = w; reconstruye();
  await setDoc(mesRef(k), { e: { [w.id]: w } }, { merge: true });
}
async function borraEntreno(w) {
  const k = ym(w.ini);
  if (F.meses[k]) delete F.meses[k][w.id]; reconstruye();
  await updateDoc(mesRef(k), new FieldPath('e', w.id), deleteField());
}

// ---------- catálogo de ejercicios (sale de tu historial y tus rutinas) ----------
let catCache = null;
function catalogo() {
  if (catCache) return catCache;
  const c = new Map();
  const mete = (e, t) => { const k = keyOf(e); const x = c.get(k) || { k, n: e.n, eid: e.eid || null, veces: 0, ult: 0 };
    if (t && t >= x.ult) { x.ult = t; x.n = e.n; } if (t) x.veces++; c.set(k, x); };
  for (const w of [...F.entrenos].reverse()) for (const e of w.ej || []) mete(e, w.ini);
  for (const r of F.rutinas) for (const e of r.ej || []) if (!c.has(keyOf(e))) mete(e, 0);
  catCache = c; return c;
}
const nombreDe = e => (catalogo().get(keyOf(e)) || e).n;

// Última vez que hiciste un ejercicio (sin contar el entreno indicado)
function ultimaVez(k, salvo) {
  for (const w of F.entrenos) { if (w.id === salvo) continue; const e = (w.ej || []).find(x => keyOf(x) === k); if (e) return { w, e }; }
  return null;
}
function historialDe(k) {
  const out = [];
  for (const w of F.entrenos) for (const e of w.ej || []) if (keyOf(e) === k) out.push({ w, e });
  return out; // más reciente primero
}
const seriesBuenas = e => (e.s || []).filter(s => s.tipo !== 'w');
const volumen = w => (w.ej || []).reduce((a, e) => a + seriesBuenas(e).reduce((b, s) => b + (s.kg || 0) * (s.r || 0), 0), 0);
const nSeries = w => (w.ej || []).reduce((a, e) => a + seriesBuenas(e).length, 0);
const mejor = e => seriesBuenas(e).reduce((m, s) => e1rm(s.kg, s.r) > e1rm(m?.kg, m?.r) ? s : m, null);

// ---------- entrenador (reglas, dentro de la app) ----------
function sugerida() {
  if (!F.rutinas.length) return null;
  const ult = r => (F.entrenos.find(w => w.rut === r.id) || {}).ini || 0;
  const activas = F.rutinas.filter(r => Date.now() - ult(r) < 45 * DIA);   // solo las que estás usando
  return [...(activas.length ? activas : F.rutinas)].sort((a, b) => ult(a) - ult(b))[0];
}
function semanaActual() {
  const l = lunes(Date.now());
  return F.entrenos.filter(w => w.ini >= l);
}
function racha() { // semanas seguidas cumpliendo el objetivo (sin contar la actual si aún no ha acabado)
  const obj = F.ajustes.objSemana || 4; let n = 0, l = lunes(Date.now());
  const cuenta = (desde) => F.entrenos.filter(w => w.ini >= desde && w.ini < desde + 7 * DIA).length;
  if (cuenta(l) >= obj) n++;
  for (let i = 1; i < 60; i++) { if (cuenta(l - i * 7 * DIA) >= obj) n++; else break; }
  return n;
}
function prsRecientes(dias = 7) {
  const desde = Date.now() - dias * DIA; let n = 0;
  for (const w of F.entrenos) { if (w.ini < desde) break; n += (w.prs || []).length; }
  return n;
}
function coach() {
  const obj = F.ajustes.objSemana || 4, sem = semanaActual().length;
  const ult = F.entrenos[0], dias = ult ? Math.round((new Date().setHours(0, 0, 0, 0) - new Date(ult.ini).setHours(0, 0, 0, 0)) / DIA) : null;
  const dow = (new Date().getDay() + 6) % 7, quedan = 7 - dow, faltan = Math.max(0, obj - sem);
  const sug = sugerida(), prs = prsRecientes();
  if (activo) return ['⏱️', 'Tienes un entreno a medias', 'Termínalo o descártalo para que cuente.'];
  if (dias === null) return ['👋', 'Empezamos', 'Importa tu historial de Hevy desde ⚙︎ o crea tu primera rutina.'];
  if (dias === 0) return ['🔥', 'Hoy ya has cumplido', prs ? `Llevas ${prs} récord${prs > 1 ? 's' : ''} esta semana. Ahora toca comer bien y dormir.` : 'Buen trabajo. Ahora toca comer bien y dormir 7-8 h.'];
  if (faltan > 0 && faltan >= quedan) return ['🚨', `Te faltan ${faltan} entrenos y quedan ${quedan} días`, `Sin excusas: hoy toca${sug ? ' «' + sug.nombre + '»' : ''}.`];
  if (dias >= 3) return ['😤', `Llevas ${dias} días sin entrenar`, `Así no se llega. Hoy toca${sug ? ' «' + sug.nombre + '»' : ' moverse'}, aunque sea una sesión corta.`];
  if (sem >= obj) return ['🏆', `Objetivo semanal cumplido (${sem}/${obj})`, 'Lo que hagas de más es extra. Prioriza descanso y técnica.'];
  if (prs) return ['💪', `${prs} récord${prs > 1 ? 's' : ''} en los últimos 7 días`, sug ? `Mantén el ritmo: hoy te toca «${sug.nombre}».` : 'Mantén el ritmo.'];
  return ['🎯', sug ? `Hoy te toca «${sug.nombre}»` : 'Sigue sumando', sug ? 'Es la rutina que más tiempo llevas sin hacer.' : 'Cada entreno cuenta.'];
}

// ---------- áreas (arriba) y submenú (abajo) ----------
const AREAS = [
  { k: 'hoy', n: 'Hoy', ic: '🏠', subs: [['hoy', 'Hoy', '🏠']] },
  { k: 'entreno', n: 'Entreno', ic: '🏋️', subs: [['rutinas', 'Rutinas', '📋'], ['historial', 'Historial', '🗓️'], ['ejercicios', 'Ejercicios', '📈']] },
  { k: 'comida', n: 'Alimentación', ic: '🥗', subs: [['comida', 'Diario', '🍽️'], ['compra', 'Compra', '🛒'], ['dietas', 'Dietas', '📋'], ['alimentos', 'Alimentos', '📦']] },
  { k: 'progreso', n: 'Progreso', ic: '📊', subs: [['objetivos', 'Objetivos', '🎯'], ['calendario', 'Calendario', '📅'], ['cuerpo', 'Cuerpo', '⚖️']] }];
const areaDe = v => AREAS.find(a => a.subs.some(s => s[0] === v)) || AREAS[0];
const ultSub = lsGet('jp-fit-ultsub', {});
function ir(v) { if (!AREAS.some(a => a.subs.some(s => s[0] === v))) v = 'hoy'; vista = v; ultSub[areaDe(v).k] = v; lsSet('jp-fit-ultsub', ultSub); lsSet('jp-fit-vista', v); scrollTo(0, 0); pinta(); }
function pintaNav() {
  const ar = areaDe(vista);
  $('#areas').innerHTML = AREAS.map(a => `<button data-act="area" data-a="${a.k}" class="${a === ar ? 'on' : ''}"><span>${a.ic}</span>${a.n}</button>`).join('');
  const tb = $('#tabbar'); tb.hidden = ar.subs.length < 2 || !$('#wo').hidden; document.body.classList.toggle('sinsub', ar.subs.length < 2);
  tb.innerHTML = ar.subs.map(([v, n, ic]) => `<button data-act="ir" data-v="${v}" class="${v === vista ? 'on' : ''}"><span>${ic}</span>${n}</button>`).join('');
}
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]'); if (!b) return;
  if (b.dataset.act === 'ir') return ir(b.dataset.v);
  if (b.dataset.act === 'area') { const a = AREAS.find(x => x.k === b.dataset.a); return ir(ultSub[a.k] && a.subs.some(s => s[0] === ultSub[a.k]) ? ultSub[a.k] : a.subs[0][0]); }
});

// ---------- vistas ----------
function pinta() {
  if (!listo) return;
  if (!AREAS.some(a => a.subs.some(s => s[0] === vista))) vista = vista === 'ejercicios' ? 'ejercicios' : 'hoy';
  pintaNav();
  const m = $('#main');
  m.innerHTML = ({ hoy: vHoy, rutinas: vRutinas, historial: vHistorial, ejercicios: vEjercicios, comida: vComida, compra: vCompra, dietas: htmlDietas, alimentos: vAlimentos,
    objetivos: vObjetivos, calendario: vCalendario, cuerpo: vCuerpo }[vista] || vHoy)();
  if (vista === 'compra') filtraCompra();
  if (vista === 'alimentos') pintaAlims();
  pintaEnCurso();
}

function vHoy() {
  if (preparaDia(fISO(Date.now()))) guardaDia(fISO(Date.now()));
  const h = new Date().getHours(), saludo = h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
  const [av, t, p] = coach();
  const l = lunes(Date.now()), sem = semanaActual();
  const dias = [...Array(7)].map((_, i) => { const d0 = l + i * DIA; const si = F.entrenos.some(w => w.ini >= d0 && w.ini < d0 + DIA);
    const hoy = Date.now() >= d0 && Date.now() < d0 + DIA; return `<div class="${si ? 'si' : ''} ${hoy ? 'hoy' : ''}"><i></i>${'LMXJVSD'[i]}</div>`; }).join('');
  const vol = sem.reduce((a, w) => a + volumen(w), 0), dur = sem.reduce((a, w) => a + ((w.fin || w.ini) - w.ini), 0);
  const sug = sugerida(), ult = F.entrenos[0];
  return `<div class="hola"><h1>${saludo}, Jorge</h1><p>${fDia(Date.now())} · objetivo ${F.ajustes.objSemana || 4} entrenos/semana</p></div>
  ${cardRitmo(dias, vol)}
  <div class="coach"><span class="av">${av}</span><div><b>${esc(t)}</b><span class="muted small">${esc(p)}</span></div></div>
  <div style="margin-top:16px">${activo ? `<button class="btn primary big" data-act="abrirWo">⏱️ Seguir con el entreno</button>` : `<button class="btn primary big" data-act="empezar">💪 Empezar entreno</button>`}</div>
  ${sug && !activo ? `<div class="sec"><h2>Te toca</h2></div>${cardRutina(sug)}` : ''}
  <div class="sec"><h2>Comida de hoy</h2></div>${resumenMacros(fISO(Date.now()), true)}
  <div class="sec"><h2>Descanso y actividad</h2></div>${cardSalud()}
  <div class="sec"><h2>Peso</h2></div>${cardPeso(true)}
  ${ult ? `<div class="sec"><h2>Último entreno</h2></div>${cardEntreno(ult)}` : ''}
  ${dur ? `<p class="faint small" style="text-align:center;margin-top:18px">Esta semana: ${fDur(dur)} entrenando</p>` : ''}`;
}

// ---------- ¿cómo va la semana? (teniendo en cuenta qué día y qué hora es) ----------
function ritmoSemana() {
  const obj = F.ajustes.objSemana || 4, ws = semanaActual(), hechos = ws.length, now = new Date(), dow = (now.getDay() + 6) % 7;
  const hoyHecho = ws.some(w => fISO(w.ini) === fISO(Date.now())), frac = (dow + now.getHours() / 24) / 7, esperado = obj * frac;
  const diasDisp = 7 - dow - (hoyHecho ? 1 : 0), faltan = Math.max(0, obj - hechos);
  let ic, tit, cls;
  if (hechos >= obj) { ic = '🏆'; tit = 'Objetivo de la semana cumplido'; cls = 'top'; }
  else if (faltan > diasDisp) { ic = '🚨'; tit = `Ya no llegas a ${obj}: como mucho ${hechos + diasDisp}`; cls = 'mal'; }
  else if (hechos >= esperado + 0.75) { ic = '🔥'; tit = 'Vas por delante'; cls = 'top'; }
  else if (hechos >= esperado - 0.6) { ic = '✅'; tit = 'Vas bien'; cls = 'bien'; }
  else if (faltan === diasDisp) { ic = '⚠️'; tit = 'Vas justo: toca entrenar todos los días que quedan'; cls = 'justo'; }
  else { ic = '⏳'; tit = 'Vas un poco por detrás'; cls = 'justo'; }
  const sub = hechos >= obj ? `${hechos} entrenos esta semana. Lo que hagas de más es extra.` : `Te ${faltan === 1 ? 'queda 1 entreno' : 'quedan ' + faltan + ' entrenos'} y ${diasDisp === 1 ? '1 día' : diasDisp + ' días'}${hoyHecho ? ' (hoy ya entrenaste)' : ''}.`;
  return { obj, hechos, ic, tit, sub, cls, pc: Math.min(1, hechos / obj), esperado };
}
function cardRitmo(dias, vol) {
  const r = ritmoSemana(), R = 34, C = 2 * Math.PI * R;
  if (!dias) { const l = lunes(Date.now()); dias = [...Array(7)].map((_, i) => { const d0 = l + i * DIA; const si = F.entrenos.some(w => w.ini >= d0 && w.ini < d0 + DIA); const hoy = Date.now() >= d0 && Date.now() < d0 + DIA; return `<div class="${si ? 'si' : ''} ${hoy ? 'hoy' : ''}"><i></i>${'LMXJVSD'[i]}</div>`; }).join(''); }
  const sem = [...Array(7)].map((_, i) => fISO(lunes(Date.now()) + i * DIA + 3600e3)).filter(f => f <= fISO(Date.now()));
  const okD = sem.filter(f => estadoDieta(f) === 'ok').length, regD = sem.filter(f => itemsDia(f).length).length;
  return `<div class="card ritmo ${r.cls}"><div class="row" style="gap:14px"><svg viewBox="0 0 80 80" class="aro" aria-hidden="true"><circle cx="40" cy="40" r="${R}" class="aro-f"/><circle cx="40" cy="40" r="${R}" class="aro-v" stroke-dasharray="${(C * r.pc).toFixed(1)} ${C.toFixed(1)}"/><text x="40" y="46" text-anchor="middle" class="aro-t">${r.hechos}/${r.obj}</text></svg>
    <div style="flex:1;min-width:0"><span class="muted small">Esta semana</span><div class="rtit">${r.ic} ${esc(r.tit)}</div><div class="muted small">${esc(r.sub)}</div></div></div>
    <div class="semana">${dias}</div>
    <div class="grid3" style="margin-top:10px"><div><b class="nb">${vol != null ? (vol >= 1000 ? fmtN(Math.round(vol / 100) / 10) + ' t' : fmtN(Math.round(vol)) + ' kg') : fmtN(Math.round(semanaActual().reduce((a, w) => a + volumen(w), 0) / 100) / 10) + ' t'}</b><span class="muted small">volumen</span></div>
    <div><b class="nb">${okD}/${regD || sem.length}</b><span class="muted small">días dieta OK</span></div><div><b class="nb">${racha()}</b><span class="muted small">semanas cumpliendo</span></div></div></div>`;
}
function cardRutina(r) {
  const ult = F.entrenos.find(w => w.rut === r.id);
  return `<div class="card rut"><div class="row"><h3 style="flex:1">${esc(r.nombre)}</h3>${ult ? `<span class="pill">hace ${Math.max(0, Math.round((Date.now() - ult.ini) / DIA))} d</span>` : ''}</div>
    <p>${(r.ej || []).map(e => esc(nombreDe(e))).join(' · ') || 'Sin ejercicios'}</p>
    <div class="acts"><button class="btn primary" data-act="empRut" data-id="${r.id}">Empezar</button><button class="btn" data-act="editRut" data-id="${r.id}">Editar</button></div></div>`;
}
const segEnt = () => `<div class="seg"><button data-act="vEnt" data-v="rutinas" class="${vista === 'rutinas' ? 'on' : ''}">🏋️ Rutinas</button><button data-act="vEnt" data-v="historial" class="${vista === 'historial' ? 'on' : ''}">🗓️ Historial</button></div>`;
function vRutinas() {
  return `<div class="sec" style="margin-top:4px"><h2>Mis rutinas</h2><span class="sp"></span><button class="btn sm" data-act="nuevaRut">＋ Nueva</button></div>
  <div class="stack">${F.rutinas.map(cardRutina).join('') || '<div class="empty">Aún no tienes rutinas. Crea una o importa las de Hevy desde ⚙︎.</div>'}</div>
  <button class="btn big" style="margin-top:14px" data-act="vacio">Empezar entreno vacío</button>`;
}
function cardEntreno(w) {
  const prs = (w.prs || []).length;
  return `<div class="card hist" data-act="verEnt" data-id="${w.id}"><div class="top2"><h3>${esc(w.t || 'Entreno')}</h3>${prs ? `<span class="pill pr">🏆 ${prs}</span>` : ''}</div>
    <div class="muted small">${fDia(w.ini)} · ${fHora(w.ini)} · ${fDur((w.fin || w.ini) - w.ini)} · ${fmtN(Math.round(volumen(w)))} kg</div>
    <ul>${(w.ej || []).slice(0, 4).map(e => { const b = mejor(e); return `<li>${seriesBuenas(e).length} × ${esc(nombreDe(e))}${b ? ` <span class="faint">· ${fmtKgR(b.kg, b.r)}</span>` : ''}</li>`; }).join('')}${(w.ej || []).length > 4 ? `<li class="faint">+${w.ej.length - 4} más</li>` : ''}</ul></div>`;
}
function vHistorial() {
  if (!F.entrenos.length) return '<div class="empty">Sin entrenos todavía.</div>';
  let mes = '', out = `<p class="muted small" style="margin:2px 0 0">${F.entrenos.length} entrenos guardados</p>`;
  for (const w of F.entrenos.slice(0, histN)) {
    const d = new Date(w.ini), m = MESES[d.getMonth()] + ' ' + d.getFullYear();
    if (m !== mes) { const nm = F.entrenos.filter(x => { const y = new Date(x.ini); return y.getMonth() === d.getMonth() && y.getFullYear() === d.getFullYear(); }).length;
      out += `<div class="mes">${m} · ${nm}</div>`; mes = m; }
    out += cardEntreno(w) + '<div style="height:8px"></div>';
  }
  if (F.entrenos.length > histN) out += `<button class="btn big" data-act="masHist">Ver más</button>`;
  return out;
}
let histN = 30, filtroEj = '';
function vEjercicios() {
  const lista = [...catalogo().values()].filter(x => x.veces).sort((a, b) => b.ult - a.ult);
  const f = norm(filtroEj);
  const vis = f ? lista.filter(x => norm(x.n).includes(f)) : lista;
  return `<input class="buscar" id="buscaEj" placeholder="Buscar ejercicio…" value="${esc(filtroEj)}" autocomplete="off">
  <div class="card" style="padding:0;margin-top:12px">${vis.map(x => { const h = historialDe(x.k); const best = h.map(o => mejor(o.e)).filter(Boolean).sort((a, b) => e1rm(b.kg, b.r) - e1rm(a.kg, a.r))[0];
    return `<div class="ej-li" data-act="verEj" data-k="${esc(x.k)}" style="border-bottom:1px solid var(--line)"><div class="n"><b>${esc(x.n)}</b><span>${x.veces} sesiones · última ${fDia(x.ult)}</span></div>
    <div class="v">${best ? fmtKgR(best.kg, best.r) : '—'}<small>mejor serie</small></div></div>`; }).join('') || '<div class="empty">Nada por aquí.</div>'}</div>`;
}

// ---------- hoja inferior ----------
function hoja(html) { const s = $('#sheet'); s.innerHTML = '<div class="grab"></div>' + html; s.hidden = false; $('#sheetBg').hidden = false; s.scrollTop = 0; }
function cierraHoja() { $('#sheet').hidden = true; $('#sheetBg').hidden = true; $('#sheet').innerHTML = ''; hojaCtx = null; }
let hojaCtx = null;
$('#sheetBg').addEventListener('click', cierraHoja);

function hojaEmpezar() {
  hoja(`<h2>Empezar entreno</h2>${F.rutinas.map(r => `<button class="op" data-act="empRut" data-id="${r.id}">📋 ${esc(r.nombre)}<span class="sp"></span><span class="faint small">${(r.ej || []).length} ej.</span></button>`).join('')}
    <button class="op" data-act="vacio">➕ Entreno vacío</button>`);
}

function verEntreno(id) {
  const w = F.porId[id]; if (!w) return;
  hoja(`<h2>${esc(w.t || 'Entreno')}</h2><p class="muted small" style="margin:-6px 0 10px">${fDia(w.ini)} · ${fHora(w.ini)}–${fHora(w.fin || w.ini)} · ${fDur((w.fin || w.ini) - w.ini)} · ${fmtN(Math.round(volumen(w)))} kg · ${nSeries(w)} series</p>
  ${(w.prs || []).length ? `<p><span class="pill pr">🏆 Récords: ${w.prs.map(esc).join(', ')}</span></p>` : ''}
  ${(w.ej || []).map(e => `<div class="det-ex"><b>${esc(nombreDe(e))}</b>${e.notas ? `<div><i>${esc(e.notas)}</i></div>` : ''}${(e.s || []).map((s, i) => `<div>${s.tipo === 'w' ? 'C' : s.tipo === 'd' ? 'D' : s.tipo === 'f' ? 'F' : i + 1 - (e.s.slice(0, i).filter(x => x.tipo === 'w').length)} · ${fmtKgR(s.kg, s.r)}${s.seg ? ' · ' + fReloj(s.seg) : ''}</div>`).join('')}</div>`).join('')}
  ${w.notas ? `<p class="muted">${esc(w.notas)}</p>` : ''}
  <div class="stack" style="margin-top:14px"><button class="btn primary" data-act="repetir" data-id="${w.id}">🔁 Repetir este entreno</button>
  <button class="btn danger" data-act="borraEnt" data-id="${w.id}">Eliminar entreno</button></div>`);
}

function grafica(puntos) { // puntos: [{t, v}] en orden cronológico
  if (puntos.length < 2) return '<p class="faint small">Haz este ejercicio un par de veces más para ver la gráfica.</p>';
  const W = 600, H = 180, P = 28, xs = puntos.map(p => p.t), ys = puntos.map(p => p.v);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys) * .95, y1 = Math.max(...ys) * 1.03;
  const X = t => P + (W - P * 2) * ((t - x0) / ((x1 - x0) || 1)), Y = v => H - 20 - (H - 34) * ((v - y0) / ((y1 - y0) || 1));
  const d = puntos.map((p, i) => (i ? 'L' : 'M') + X(p.t).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join(' ');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Progreso">
    <path d="${d} L${X(x1)} ${H - 20} L${X(x0)} ${H - 20} Z" fill="var(--accent-soft)"/>
    <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    ${puntos.map(p => `<circle cx="${X(p.t)}" cy="${Y(p.v)}" r="3" fill="var(--accent)"/>`).join('')}
    <text x="${P}" y="${H - 4}">${fDia(x0)}</text><text x="${W - P}" y="${H - 4}" text-anchor="end">${fDia(x1)}</text>
    <text x="2" y="12">${fmtN(Math.round(y1))}</text></svg>`;
}
function verEjercicio(k) {
  const h = historialDe(k), x = catalogo().get(k); if (!x) return; hojaCtx = { tipo: 'ej', k };
  const pts = h.map(o => ({ t: o.w.ini, v: Math.max(0, ...seriesBuenas(o.e).map(s => e1rm(s.kg, s.r))) })).filter(p => p.v).reverse();
  const maxKg = Math.max(0, ...h.flatMap(o => seriesBuenas(o.e).map(s => s.kg || 0)));
  const best = h.map(o => mejor(o.e)).filter(Boolean).sort((a, b) => e1rm(b.kg, b.r) - e1rm(a.kg, a.r))[0];
  const maxReps = Math.max(0, ...h.flatMap(o => seriesBuenas(o.e).map(s => s.r || 0)));
  hoja(`<h2>${esc(x.n)}</h2>
  <div class="grid3"><div class="stat"><b>${maxKg ? fmtN(maxKg) : '—'}</b><span>Peso máximo (kg)</span></div>
  <div class="stat"><b>${best && best.kg ? fmtN(Math.round(e1rm(best.kg, best.r))) : '—'}</b><span>1RM estimado</span></div>
  <div class="stat"><b>${maxReps || '—'}</b><span>Más reps</span></div></div>
  <div class="sec"><h2>1RM estimado</h2></div>${graficaPro({ key: 'ej', puntos: pts, unidad: ' kg', dec: 0 })}
  <div class="sec"><h2>Historial</h2><span class="sp"></span><span class="faint small">${h.length} sesiones</span></div>
  ${h.slice(0, 15).map(o => `<div class="det-ex"><b class="small">${fDia(o.w.ini)} · ${esc(o.w.t || '')}</b><div>${seriesBuenas(o.e).map(s => fmtKgR(s.kg, s.r)).join(' · ')}</div></div>`).join('')}`);
}

// ---------- rutinas: editor ----------
function editaRutina(id) {
  const r0 = F.rutinas.find(r => r.id === id);
  hojaCtx = { tipo: 'rut', r: r0 ? JSON.parse(JSON.stringify(r0)) : { id: 'r' + uid8(), nombre: '', ej: [] }, nueva: !r0 };
  pintaEditor();
}
function pintaEditor() {
  const { r, nueva } = hojaCtx;
  hoja(`<h2>${nueva ? 'Nueva rutina' : 'Editar rutina'}</h2>
  <label>Nombre</label><input type="text" id="rNombre" value="${esc(r.nombre)}" placeholder="Ej.: Pecho y hombro">
  <label>Ejercicios (series · descanso en segundos)</label>
  <div id="rEj">${r.ej.map((e, i) => `<div class="re-ej" data-i="${i}"><b>${esc(nombreDe(e))}</b>
    <input type="number" inputmode="numeric" min="1" max="12" value="${(e.s || []).length || 3}" data-f="ns" title="Series">
    <input type="number" inputmode="numeric" min="0" step="15" value="${e.desc ?? F.ajustes.descanso}" data-f="desc" title="Descanso (s)">
    <button type="button" data-act="rUp" data-i="${i}">↑</button><button type="button" data-act="rDel" data-i="${i}">✕</button></div>`).join('') || '<p class="faint small">Sin ejercicios todavía.</p>'}</div>
  <button class="btn" style="width:100%;margin-top:10px" data-act="rAdd">＋ Añadir ejercicio</button>
  <div class="stack" style="margin-top:16px"><button class="btn primary" data-act="rGuardar">Guardar rutina</button>
  ${nueva ? '' : `<button class="btn danger" data-act="rBorrar">Eliminar rutina</button>`}</div>`);
}
function leeEditor() {
  const { r } = hojaCtx; r.nombre = ($('#rNombre')?.value || '').trim();
  document.querySelectorAll('#rEj .re-ej').forEach(row => { const e = r.ej[+row.dataset.i]; if (!e) return;
    const ns = Math.max(1, Math.min(12, parseInt(row.querySelector('[data-f=ns]').value) || 3));
    e.desc = Math.max(0, parseInt(row.querySelector('[data-f=desc]').value) || 0);
    e.s = e.s || []; while (e.s.length < ns) e.s.push({ ...(e.s[e.s.length - 1] || { kg: null, r: null }) }); e.s.length = ns; });
}

// Selector de ejercicios (para rutinas y para el entreno en curso)
let pickCb = null, pickSel = new Set();
function selector(cb, multi = true) {
  pickCb = cb; pickSel = new Set();
  hoja(`<h2>Añadir ejercicio</h2><input class="buscar" id="pickQ" placeholder="Buscar o escribir uno nuevo…" autocomplete="off"><div class="pick" id="pickL"></div>
  <button class="btn primary" style="width:100%;margin-top:12px" data-act="pickOk" ${multi ? '' : 'hidden'}>Añadir</button>`);
  pintaPick(''); setTimeout(() => $('#pickQ')?.focus(), 50);
  $('#pickQ').addEventListener('input', e => pintaPick(e.target.value));
  hojaCtx = { ...(hojaCtx || {}), multi, volver: hojaCtx };
}
function pintaPick(q) {
  const f = norm(q), lista = [...catalogo().values()].sort((a, b) => b.veces - a.veces);
  const vis = (f ? lista.filter(x => norm(x.n).includes(f)) : lista).slice(0, 80);
  const exacto = lista.some(x => norm(x.n) === f);
  $('#pickL').innerHTML = (q.trim() && !exacto ? `<button data-act="pickNuevo">➕ Crear «${esc(q.trim())}»<small>Ejercicio nuevo</small></button>` : '') +
    vis.map(x => `<button data-act="pickUno" data-k="${esc(x.k)}" class="${pickSel.has(x.k) ? 'sel' : ''}">${esc(x.n)}<small>${x.veces ? x.veces + ' sesiones' : 'de tus rutinas'}</small></button>`).join('');
}

// ---------- entreno en curso ----------
function nuevoEj(base, i) {
  const k = keyOf(base), prev = ultimaVez(k);
  const n = Math.max((base.s || []).length, 1);
  const s = [...Array(n)].map((_, j) => {
    const p = prev && seriesBuenas(prev.e)[j], r = (base.s || [])[j] || {};
    return { kg: '', r: '', tipo: r.tipo || 'n', ok: false, pkg: p ? p.kg : r.kg ?? null, pr: p ? p.r : r.r ?? null };
  });
  return { n: nombreDe(base), eid: base.eid || null, desc: base.desc ?? F.ajustes.descanso, notas: '', s };
}
function empezar(rut, desde) {
  if (activo) { abreWo(); return toast('Ya tienes un entreno en marcha'); }
  const base = rut ? rut.ej : desde ? desde.ej.map(e => ({ ...e, s: seriesBuenas(e) })) : [];
  activo = { id: 'w' + uid8(), t: rut ? rut.nombre : desde ? desde.t : 'Entreno', ini: Date.now(), rut: rut ? rut.id : desde?.rut || null, ej: base.map(nuevoEj), upd: Date.now() };
  guardaActivo(); cierraHoja(); abreWo(); despierta();
  if (!rut && !desde) setTimeout(() => selector(addAlEntreno), 200);
}
function addAlEntreno(ks) {
  for (const k of ks) { const x = catalogo().get(k) || { n: k.replace(/^n:/, ''), eid: null };
    activo.ej.push(nuevoEj({ n: x.n, eid: x.eid, s: [{}, {}, {}] })); }
  guardaActivo(); pintaWo();
}
let wakeLock = null;
async function despierta() { try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => wakeLock = null); } } catch (e) {} }
document.addEventListener('visibilitychange', () => { if (!document.hidden && activo && !$('#wo').hidden) despierta(); if (!document.hidden) tickDescanso(); });

function abreWo() { $('#wo').hidden = false; $('#tabbar').hidden = true; $('#enCurso').hidden = true; document.body.style.overflow = 'hidden'; pintaWo(); despierta(); }
function minimizaWo() { $('#wo').hidden = true; $('#tabbar').hidden = false; document.body.style.overflow = ''; pinta(); }
function pintaEnCurso() { const b = $('#enCurso'); b.hidden = !activo || !$('#wo').hidden; if (activo) b.innerHTML = `⏱️ ${esc(activo.t)}<span class="t" id="ecT">${fReloj((Date.now() - activo.ini) / 1000)}</span>`; }

function resumenVivo() {
  let v = 0, n = 0; for (const e of activo.ej) for (const s of e.s) if (s.ok && s.tipo !== 'w') { v += (num(s.kg) || 0) * (num(s.r) || 0); n++; }
  return `<span>Duración <b id="woDur">${fReloj((Date.now() - activo.ini) / 1000)}</b></span><span>Volumen <b>${fmtN(Math.round(v))} kg</b></span><span>Series <b>${n}</b></span>`;
}
function pintaWo() {
  if (!activo) return;
  const etiqueta = (e, j) => { const s = e.s[j]; if (s.tipo === 'w') return 'C'; if (s.tipo === 'd') return 'D'; if (s.tipo === 'f') return 'F'; return j + 1 - e.s.slice(0, j).filter(x => x.tipo === 'w').length; };
  $('#wo').innerHTML = `<div class="wo-head"><button class="icon" data-act="minWo" aria-label="Minimizar" title="Minimizar">⌄</button>
    <div class="tit"><input id="woT" value="${esc(activo.t)}" aria-label="Nombre del entreno"><div class="reloj" id="woReloj">Empezado a las ${fHora(activo.ini)}</div></div>
    <button class="btn ok sm" data-act="terminar">Terminar</button></div>
  <div class="wo-body"><div class="wo-res" id="woRes">${resumenVivo()}</div>
  ${activo.ej.map((e, i) => {
    const prev = ultimaVez(keyOf(e), activo.id), ps = prev ? seriesBuenas(prev.e) : [];
    return `<div class="ex" data-i="${i}"><div class="ex-h"><h3 data-act="verEj" data-k="${esc(keyOf(e))}">${esc(e.n)}</h3>
      <button class="desc" data-act="desc" data-i="${i}" title="Descanso entre series">⏱ ${e.desc ? fMMSS(e.desc) : 'off'}</button>
      <button class="mas" data-act="exMenu" data-i="${i}" aria-label="Opciones">⋯</button></div>
      <input class="ex-nota" data-f="nota" data-i="${i}" value="${esc(e.notas)}" placeholder="Nota (asiento, agarre, sensaciones…)">
      <table class="sets"><thead><tr><th>Serie</th><th>Anterior</th><th>kg</th><th>Reps</th><th>✓</th><th></th></tr></thead><tbody>
      ${e.s.map((s, j) => { const p = ps[j - e.s.slice(0, j).filter(x => x.tipo === 'w').length] || null;
        return `<tr class="${s.ok ? 'ok' : ''}" data-i="${i}" data-j="${j}">
        <td><button class="num ${s.tipo}" data-act="tipo" title="Tipo de serie: normal, C calentamiento, D drop, F fallo">${etiqueta(e, j)}</button></td>
        <td class="ant" data-act="copia">${p ? fmtKgR(p.kg, p.r).replace(' kg × ', '×') : '—'}</td>
        <td><input inputmode="decimal" data-f="kg" value="${esc(s.kg)}" placeholder="${s.pkg != null ? fmtN(s.pkg) : '—'}"></td>
        <td><input inputmode="numeric" data-f="r" value="${esc(s.r)}" placeholder="${s.pr != null ? s.pr : '—'}"></td>
        <td><button class="chk" data-act="ok" aria-label="Serie hecha">✓</button></td>
        <td><button class="x" data-act="delSet" aria-label="Quitar serie">✕</button></td></tr>`; }).join('')}
      </tbody></table><button class="addset" data-act="addSet" data-i="${i}">＋ Añadir serie</button></div>`; }).join('')}
  <div class="wo-acts"><button class="btn big" data-act="addEj">＋ Añadir ejercicio</button>
  <button class="btn big danger" data-act="descartar">Descartar entreno</button></div></div>`;
}
function refrescaRes() { const r = $('#woRes'); if (r) r.innerHTML = resumenVivo(); }

// Temporizador de descanso
let restT = null, audio = null;
const aud = () => { try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch (e) {} return audio; };
function pitido() {
  const a = aud(); if (!a) return;
  [0, .22, .44].forEach((d, i) => { const o = a.createOscillator(), g = a.createGain(); o.type = 'sine'; o.frequency.value = i === 2 ? 1320 : 880;
    g.gain.setValueAtTime(0.0001, a.currentTime + d); g.gain.exponentialRampToValueAtTime(0.5, a.currentTime + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + d + 0.18);
    o.connect(g).connect(a.destination); o.start(a.currentTime + d); o.stop(a.currentTime + d + 0.2); });
  try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) {}
}
function iniciaDescanso(seg) {
  if (!seg || !activo) return;
  activo.rest = { fin: Date.now() + seg * 1000, total: seg }; guardaActivo(); tickDescanso();
}
function tickDescanso() {
  const el = $('#rest'), r = activo && activo.rest;
  clearTimeout(restT);
  if (!r) { el.hidden = true; return; }
  const quedan = (r.fin - Date.now()) / 1000;
  if (quedan <= 0) {
    if (!r.sonado) { r.sonado = true; pitido(); guardaActivo(); }
    if (quedan < -5) { activo.rest = null; guardaActivo(); el.hidden = true; return; }
    el.className = 'rest fin'; el.hidden = false;
    el.innerHTML = `<div class="in"><div class="t">¡A por la siguiente!<small>Descanso terminado</small></div><button class="btn sm" data-act="restX">Vale</button></div>`;
  } else {
    el.className = 'rest'; el.hidden = false;
    el.innerHTML = `<div class="bar" style="width:${Math.min(100, quedan / r.total * 100)}%"></div><div class="in"><div class="t">${fMMSS(quedan)}<small>Descanso</small></div>
      <button class="btn sm" data-act="rest-15">−15</button><button class="btn sm" data-act="rest+15">+15</button><button class="btn sm primary" data-act="restX">Saltar</button></div>`;
  }
  restT = setTimeout(tickDescanso, 250);
}
setInterval(() => { if (!activo) return; const s = fReloj((Date.now() - activo.ini) / 1000); const a = $('#woDur'); if (a) a.textContent = s; const b = $('#ecT'); if (b) b.textContent = s; }, 1000);

function marcaSerie(i, j) {
  const e = activo.ej[i], s = e.s[j];
  if (s.ok) { s.ok = false; guardaActivo(); pintaWo(); return; }
  if (s.kg === '' && s.pkg != null) s.kg = s.pkg;
  if (s.r === '' && s.pr != null) s.r = s.pr;
  if (num(s.r) == null) { toast('Pon las repeticiones'); return; }
  s.ok = true; aud(); guardaActivo(); pintaWo();
  if (e.desc && s.tipo !== 'w') iniciaDescanso(e.desc); else if (e.desc) iniciaDescanso(Math.min(e.desc, 60));
}

function terminar() {
  const pend = activo.ej.reduce((a, e) => a + e.s.filter(s => !s.ok).length, 0), hechas = activo.ej.reduce((a, e) => a + e.s.filter(s => s.ok).length, 0);
  if (!hechas) return hoja(`<h2>No hay series hechas</h2><p class="muted">Marca con ✓ las series que hayas hecho, o descarta el entreno.</p><div class="stack"><button class="btn" data-act="cierra">Seguir entrenando</button><button class="btn danger" data-act="descartar">Descartar entreno</button></div>`);
  hoja(`<h2>¿Terminar entreno?</h2>${pend ? `<p class="muted">Hay ${pend} serie${pend > 1 ? 's' : ''} sin marcar: no se guardarán.</p>` : '<p class="muted">Todo marcado. ¡Bien!</p>'}
    <label>Nota del entreno (opcional)</label><textarea id="woNota" rows="2" placeholder="Cómo te has sentido, energía, dolor…"></textarea>
    <div class="stack" style="margin-top:14px"><button class="btn ok big" data-act="guardarWo">Guardar entreno</button><button class="btn" data-act="cierra">Seguir entrenando</button></div>`);
}
async function guardarWo() {
  const nota = ($('#woNota')?.value || '').trim();
  const w = { id: activo.id, t: activo.t || 'Entreno', ini: activo.ini, fin: Date.now(), rut: activo.rut || null, notas: nota,
    ej: activo.ej.map(e => ({ n: e.n, eid: e.eid || null, notas: e.notas || '', desc: e.desc || 0,
      s: e.s.filter(s => s.ok).map(s => ({ kg: num(s.kg), r: num(s.r), tipo: s.tipo || 'n' })) })).filter(e => e.s.length) };
  // Récords: mejor 1RM estimado o más peso que nunca en ese ejercicio
  const prs = [];
  for (const e of w.ej) {
    const h = historialDe(keyOf(e)).filter(o => o.w.id !== w.id); if (!h.length) continue;
    const prevE1 = Math.max(0, ...h.flatMap(o => seriesBuenas(o.e).map(s => e1rm(s.kg, s.r)))), prevKg = Math.max(0, ...h.flatMap(o => seriesBuenas(o.e).map(s => s.kg || 0)));
    const b = mejor(e); if (b && (e1rm(b.kg, b.r) > prevE1 + 0.01 || (b.kg || 0) > prevKg)) prs.push(e.n);
  }
  w.prs = prs;
  const rut = F.rutinas.find(r => r.id === w.rut);
  activo = null; F.ultimoFin = w.id; lsSet('jp-fit-activo', null); guardaPerfil(0);
  mandaSemana('cambio');
  try { await guardaEntreno(w); } catch (e) { toast('Guardado en este dispositivo; se subirá al volver la conexión'); }
  $('#rest').hidden = true; clearTimeout(restT);
  try { wakeLock && wakeLock.release(); } catch (e) {}
  minimizaWo();
  hojaCtx = { tipo: 'fin', w };
  hoja(`<div class="fin-res"><div class="big">${prs.length ? '🏆' : '💪'}</div><h2>¡Entreno guardado!</h2>
    <p class="muted">${fDur(w.fin - w.ini)} · ${fmtN(Math.round(volumen(w)))} kg · ${nSeries(w)} series</p>
    ${prs.length ? `<p><span class="pill pr">Récords: ${prs.map(esc).join(', ')}</span></p>` : ''}
    <p class="small muted">${F.entrenos.length} entrenos en total · ${semanaActual().length}/${F.ajustes.objSemana || 4} esta semana</p></div>
    <div class="stack" style="margin-top:12px">${rut ? `<button class="btn primary" data-act="actRut" data-id="${rut.id}">Actualizar la rutina «${esc(rut.nombre)}» con estos pesos</button>` : `<button class="btn" data-act="comoRut">Guardar como rutina nueva</button>`}
    <button class="btn" data-act="cierra">Listo</button></div>`);
}
function rutinaDesde(w, r) {
  r.ej = w.ej.map(e => ({ n: e.n, eid: e.eid || null, desc: e.desc ?? F.ajustes.descanso, s: e.s.filter(s => s.tipo !== 'w').map(s => ({ kg: s.kg, r: s.r })) }));
  return r;
}

// ---------- eventos ----------
document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, id = b.dataset.id;
  const fila = b.closest('tr[data-j]'), i = fila ? +fila.dataset.i : +b.dataset.i, j = fila ? +fila.dataset.j : null;
  switch (a) {
    case 'empezar': return hojaEmpezar();
    case 'empRut': return empezar(F.rutinas.find(r => r.id === id));
    case 'vacio': return empezar(null);
    case 'repetir': return empezar(null, F.porId[id]);
    case 'abrirWo': return abreWo();
    case 'minWo': return minimizaWo();
    case 'verEnt': return verEntreno(id);
    case 'verEj': return verEjercicio(b.dataset.k);
    case 'masHist': histN += 40; return pinta();
    case 'vEnt': return ir(b.dataset.v);
    case 'cierra': return cierraHoja();
    case 'borraEnt': if (!confirm('¿Eliminar este entreno? No se puede deshacer.')) return;
      try { await borraEntreno(F.porId[id]); } catch (e) { return toast('No se pudo borrar: ' + (e.code || e.message)); }
      cierraHoja(); pinta(); return toast('Entreno eliminado');
    // rutinas
    case 'nuevaRut': return editaRutina(null);
    case 'editRut': return editaRutina(id);
    case 'rUp': leeEditor(); { const ej = hojaCtx.r.ej; if (i > 0) [ej[i - 1], ej[i]] = [ej[i], ej[i - 1]]; } return pintaEditor();
    case 'rDel': leeEditor(); hojaCtx.r.ej.splice(i, 1); return pintaEditor();
    case 'rAdd': { leeEditor(); const ctx = hojaCtx; return selector(ks => { hojaCtx = ctx; for (const k of ks) { const x = catalogo().get(k) || { n: k.replace(/^n:/, '') };
      ctx.r.ej.push({ n: x.n, eid: x.eid || null, desc: F.ajustes.descanso, s: [{ kg: null, r: null }, { kg: null, r: null }, { kg: null, r: null }] }); } pintaEditor(); }); }
    case 'rGuardar': { leeEditor(); const r = hojaCtx.r; if (!r.nombre) return toast('Ponle nombre a la rutina');
      const k = F.rutinas.findIndex(x => x.id === r.id); if (k >= 0) F.rutinas[k] = r; else F.rutinas.push(r);
      catCache = null; guardaPerfil(0); cierraHoja(); pinta(); return toast('Rutina guardada'); }
    case 'rBorrar': if (!confirm('¿Eliminar esta rutina? Tus entrenos no se borran.')) return;
      F.rutinas = F.rutinas.filter(r => r.id !== hojaCtx.r.id); guardaPerfil(0); cierraHoja(); pinta(); return toast('Rutina eliminada');
    case 'actRut': { const r = F.rutinas.find(x => x.id === id); if (r) { rutinaDesde(hojaCtx.w, r); catCache = null; guardaPerfil(0); toast('Rutina actualizada'); } return cierraHoja(); }
    case 'comoRut': { const w = hojaCtx.w, nombre = prompt('Nombre de la rutina', w.t); if (!nombre) return;
      F.rutinas.push(rutinaDesde(w, { id: 'r' + uid8(), nombre })); guardaPerfil(0); cierraHoja(); pinta(); return toast('Rutina creada'); }
    // selector
    case 'pickUno': { const k = b.dataset.k; if (!hojaCtx?.multi) { const cb = pickCb; cierraHoja(); return cb([k]); }
      pickSel.has(k) ? pickSel.delete(k) : pickSel.add(k); b.classList.toggle('sel'); return; }
    case 'pickNuevo': { const n = $('#pickQ').value.trim(); if (!n) return; const k = 'n:' + norm(n);
      catalogo().set(k, { k, n, eid: null, veces: 0, ult: 0 }); pickSel.add(k); if (!hojaCtx?.multi) { const cb = pickCb; cierraHoja(); return cb([k]); } $('#pickQ').value = ''; return pintaPick(''); }
    case 'pickOk': { const cb = pickCb, ks = [...pickSel]; if (!ks.length) return toast('Elige al menos uno'); if (hojaCtx?.tipo !== 'rut') cierraHoja(); return cb(ks); }
    // entreno en curso
    case 'terminar': return terminar();
    case 'guardarWo': return guardarWo();
    case 'descartar': if (!confirm('¿Descartar el entreno? Se pierde lo apuntado.')) return;
      activo = null; lsSet('jp-fit-activo', null); guardaPerfil(0); cierraHoja(); $('#rest').hidden = true; minimizaWo(); return toast('Entreno descartado');
    case 'addEj': return selector(addAlEntreno);
    case 'ok': return marcaSerie(i, j);
    case 'tipo': { const s = activo.ej[i].s[j]; s.tipo = { n: 'w', w: 'd', d: 'f', f: 'n' }[s.tipo || 'n']; guardaActivo(); return pintaWo(); }
    case 'delSet': activo.ej[i].s.splice(j, 1); guardaActivo(); return pintaWo();
    case 'copia': { const s = activo.ej[i].s[j]; if (s.pkg != null) s.kg = s.pkg; if (s.pr != null) s.r = s.pr; guardaActivo(); return pintaWo(); }
    case 'addSet': { const e = activo.ej[i], u = e.s[e.s.length - 1] || {};
      e.s.push({ kg: '', r: '', tipo: 'n', ok: false, pkg: num(u.kg) ?? u.pkg ?? null, pr: num(u.r) ?? u.pr ?? null }); guardaActivo(); return pintaWo(); }
    case 'desc': hojaCtx = { tipo: 'desc', i };
      return hoja(`<h2>Descanso · ${esc(activo.ej[i].n)}</h2>${[0, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300].map(s => `<button class="op" data-act="setDesc" data-s="${s}">${s ? fMMSS(s) : 'Sin temporizador'}${activo.ej[i].desc === s ? ' ✓' : ''}</button>`).join('')}`);
    case 'setDesc': activo.ej[hojaCtx.i].desc = +b.dataset.s; guardaActivo(); cierraHoja(); return pintaWo();
    case 'exMenu': hojaCtx = { tipo: 'ex', i };
      return hoja(`<h2>${esc(activo.ej[i].n)}</h2><button class="op" data-act="exUp">↑ Subir</button><button class="op" data-act="exDown">↓ Bajar</button>
        <button class="op" data-act="exCambia">🔁 Cambiar por otro ejercicio</button><button class="op" data-act="verEj" data-k="${esc(keyOf(activo.ej[i]))}">📈 Ver progreso</button>
        <button class="op danger" data-act="exDel">🗑 Quitar ejercicio</button>`);
    case 'exUp': case 'exDown': { const k = hojaCtx.i, d = a === 'exUp' ? -1 : 1, ej = activo.ej; if (ej[k + d]) [ej[k], ej[k + d]] = [ej[k + d], ej[k]]; guardaActivo(); cierraHoja(); return pintaWo(); }
    case 'exDel': activo.ej.splice(hojaCtx.i, 1); guardaActivo(); cierraHoja(); return pintaWo();
    case 'exCambia': { const k = hojaCtx.i; return selector(ks => { const x = catalogo().get(ks[0]) || { n: ks[0].replace(/^n:/, '') };
      const viejo = activo.ej[k]; activo.ej[k] = nuevoEj({ n: x.n, eid: x.eid, desc: viejo.desc, s: viejo.s.map(() => ({})) }); guardaActivo(); pintaWo(); }, false); }
    case 'rest-15': case 'rest+15': if (activo?.rest) { activo.rest.fin += (a === 'rest+15' ? 15 : -15) * 1000; activo.rest.total = Math.max(activo.rest.total, (activo.rest.fin - Date.now()) / 1000); activo.rest.sonado = false; guardaActivo(); tickDescanso(); } return;
    case 'restX': if (activo) { activo.rest = null; guardaActivo(); } return tickDescanso();
    // ajustes
    case 'imp': return $('#fileIn').click();
    case 'exp': return exporta();
    case 'ajGuardar': F.ajustes.objSemana = Math.max(1, Math.min(7, parseInt($('#ajObj').value) || 4)); F.ajustes.descanso = Math.max(0, parseInt($('#ajDesc').value) || 120);
      guardaPerfil(0); cierraHoja(); pinta(); return toast('Ajustes guardados');
    case 'salir': if (confirm('¿Cerrar sesión en este dispositivo?')) { await signOut(auth); location.reload(); } return;
  }
});
document.addEventListener('input', ev => {
  const t = ev.target;
  if (t.id === 'buscaEj') { filtroEj = t.value; const pos = t.selectionStart; pinta(); const n = $('#buscaEj'); n.focus(); n.setSelectionRange(pos, pos); return; }
  if (t.id === 'woT' && activo) { activo.t = t.value; return guardaActivo(); }
  if (!activo) return;
  if (t.dataset.f === 'nota') { activo.ej[+t.dataset.i].notas = t.value; return guardaActivo(); }
  const fila = t.closest('tr[data-j]'); if (!fila || !t.dataset.f) return;
  const s = activo.ej[+fila.dataset.i].s[+fila.dataset.j]; s[t.dataset.f] = t.value.replace(',', '.'); guardaActivo(); if (s.ok) refrescaRes();
});

$('#enCurso').addEventListener('click', abreWo);
$('#ajBtn').addEventListener('click', () => hoja(`<h2>Ajustes</h2>
  <label>Objetivo de entrenos por semana</label><input type="number" id="ajObj" min="1" max="7" value="${F.ajustes.objSemana || 4}">
  <label>Descanso por defecto entre series (segundos)</label><input type="number" id="ajDesc" min="0" step="15" value="${F.ajustes.descanso || 120}">
  <button class="btn primary" style="width:100%;margin-top:12px" data-act="ajGuardar">Guardar</button>
  <div class="sec"><h2>Datos</h2></div>
  <button class="op" data-act="imp">📥 Importar archivo (exportación de Hevy .csv o copia .json)</button>
  <button class="op" data-act="exp">📤 Descargar copia de seguridad (.json)</button>
  <p class="faint small">${F.entrenos.length} entrenos · ${F.rutinas.length} rutinas · ${catalogo().size} ejercicios</p>
  <button class="op danger" data-act="salir">Cerrar sesión</button>`));

// ---------- importar / exportar ----------
function exporta() {
  const blob = new Blob([JSON.stringify({ app: 'jp-fitness', v: 1, exportado: new Date().toISOString(), rutinas: F.rutinas, entrenos: F.entrenos }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'jp-fitness-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const TIPO = { normal: 'n', warmup: 'w', dropset: 'd', failure: 'f', n: 'n', w: 'w', d: 'd', f: 'f' };
const serie = s => Array.isArray(s) ? { kg: s[0] ?? null, r: s[1] ?? null, tipo: TIPO[s[2]] || 'n', ...(s[3] ? { seg: s[3] } : {}), ...(s[4] ? { m: s[4] } : {}) }
  : { kg: s.kg ?? s.weight_kg ?? null, r: s.r ?? s.reps ?? null, tipo: TIPO[s.tipo || s.type] || 'n', ...((s.seg || s.duration_seconds) ? { seg: s.seg || s.duration_seconds } : {}) };
function limpiaId(s) { return String(s ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || uid8(); }
const wid = x => { x = limpiaId(x); return x[0] === 'w' ? x : 'w' + x; }, rid = x => { x = limpiaId(x); return x[0] === 'r' ? x : 'r' + x; };
function deJSON(d) {
  const entrenos = (d.entrenos || d.workouts || []).map(w => ({ id: wid(w.id), t: w.t || w.title || 'Entreno', ini: +new Date(w.ini || w.start_time), fin: +new Date(w.fin || w.end_time || w.ini || w.start_time),
    rut: (w.rut || w.routine_id) ? rid(w.rut || w.routine_id) : null, notas: w.notas || w.description || '',
    ej: (w.ej || w.exercises || []).map(e => ({ n: e.n || e.title, eid: e.eid || e.exercise_template_id || null, notas: e.notas || e.notes || '', s: (e.s || e.sets || []).map(serie) })) }));
  const rutinas = (d.rutinas || d.routines || []).map(r => ({ id: rid(r.id), nombre: r.nombre || r.title,
    ej: (r.ej || r.exercises || []).map(e => ({ n: e.n || e.title, eid: e.eid || e.exercise_template_id || null, desc: e.desc ?? e.rest_seconds ?? 120, s: (e.s || e.sets || []).map(serie).filter(s => s.tipo !== 'w').map(s => ({ kg: s.kg || null, r: s.r || null })) })) }));
  return { entrenos, rutinas };
}
function csvFilas(txt) {
  const out = []; let fila = [], campo = '', q = false;
  for (let i = 0; i < txt.length; i++) { const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { campo += '"'; i++; } else q = false; } else campo += c; }
    else if (c === '"') q = true; else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; fila.push(campo); out.push(fila); fila = []; campo = ''; }
    else campo += c; }
  if (campo || fila.length) { fila.push(campo); out.push(fila); }
  return out.filter(f => f.length > 1);
}
const MES_EN = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11, ene: 0, abr: 3, ago: 7, dic: 11 };
function fechaHevy(s) { // «25 Nov 2026, 19:26» o ISO
  const m = String(s).match(/(\d{1,2})\s+([A-Za-zé]{3})\w*\.?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})/);
  if (m && MES_EN[m[2].toLowerCase()] != null) return new Date(+m[3], MES_EN[m[2].toLowerCase()], +m[1], +m[4], +m[5]).getTime();
  const t = Date.parse(s); return isFinite(t) ? t : null;
}
function deCSV(txt) {
  const filas = csvFilas(txt.replace(/^\uFEFF/, '')); const h = filas.shift().map(x => x.trim().toLowerCase()); const c = n => h.indexOf(n);
  if (c('exercise_title') < 0 || c('start_time') < 0) throw new Error('No parece una exportación de Hevy');
  const porW = new Map();
  for (const f of filas) {
    const ini = fechaHevy(f[c('start_time')]); if (!ini) continue;
    const k = f[c('title')] + '|' + ini;
    let w = porW.get(k); if (!w) { w = { id: 'wh' + ini.toString(36), t: f[c('title')] || 'Entreno', ini, fin: fechaHevy(f[c('end_time')]) || ini, rut: null, notas: f[c('description')] || '', ej: [] }; porW.set(k, w); }
    const n = f[c('exercise_title')]; let e = w.ej[w.ej.length - 1];
    if (!e || e.n !== n) { e = { n, eid: null, notas: f[c('exercise_notes')] || '', s: [] }; w.ej.push(e); }
    e.s.push({ kg: num(f[c('weight_kg')]), r: num(f[c('reps')]), tipo: TIPO[f[c('set_type')]] || 'n', ...(num(f[c('duration_seconds')]) ? { seg: num(f[c('duration_seconds')]) } : {}) });
  }
  // Une cada ejercicio con el que ya tienes (mismo nombre) para que el progreso no salga duplicado
  const porNombre = new Map(); for (const x of catalogo().values()) if (x.eid) porNombre.set(norm(x.n), x.eid);
  for (const w of F.entrenos) for (const e of w.ej || []) if (e.eid) porNombre.set(norm(e.n), e.eid);
  const ws = [...porW.values()]; for (const w of ws) for (const e of w.ej) e.eid = porNombre.get(norm(e.n)) || null;
  // Si coincide con un entreno de una rutina tuya (mismos ejercicios), lo enlaza a esa rutina
  for (const w of ws) { const ks = w.ej.map(keyOf).join('|'); const r = F.rutinas.find(r => F.entrenos.some(x => x.rut === r.id && x.ej.map(keyOf).join('|') === ks)); if (r) w.rut = r.id; }
  return { entrenos: ws, rutinas: [] };
}
$('#fileIn').addEventListener('change', async ev => {
  const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
  let d; try { const txt = await f.text(); if (/weight_kg/.test(txt.slice(0, 300)) && !/exercise_title/.test(txt.slice(0, 300))) { const n = await importaPesos(deMedidas(txt)); return toast(`Importados ${n} pesos ✓`, 4000); }
    d = /\.csv$/i.test(f.name) || !txt.trim().startsWith('{') ? deCSV(txt) : deJSON(JSON.parse(txt)); }
  catch (e) { return toast('No pude leer el archivo: ' + e.message, 5000); }
  // Evita duplicados: mismo inicio (al minuto) = mismo entreno
  const ya = new Set(F.entrenos.map(w => Math.floor(w.ini / 60000)));
  const nuevos = d.entrenos.filter(w => w.ini && !ya.has(Math.floor(w.ini / 60000)));
  if (!confirm(`Voy a importar ${nuevos.length} entrenos nuevos${d.entrenos.length - nuevos.length ? ` (${d.entrenos.length - nuevos.length} ya estaban)` : ''} y ${d.rutinas.length} rutinas. ¿Sigo?`)) return;
  toast('Importando…', 20000);
  const porMes = {}; for (const w of nuevos) ((porMes[ym(w.ini)] ||= {})[w.id] = w);
  try {
    for (const [k, e] of Object.entries(porMes)) { Object.assign(F.meses[k] ||= {}, e); await setDoc(mesRef(k), { e }, { merge: true }); }
    for (const r of d.rutinas) { const i = F.rutinas.findIndex(x => x.id === r.id); if (i >= 0) F.rutinas[i] = r; else F.rutinas.push(r); }
    if (d.rutinas.length) guardaPerfil(0);
  } catch (e) { return toast('Error al importar: ' + (e.code || e.message), 6000); }
  reconstruye(); cierraHoja(); pinta(); toast(`Importados ${nuevos.length} entrenos y ${d.rutinas.length} rutinas ✓`, 4000);
});
window.__fit = { F, deJSON, importa: async d => { const x = deJSON(d); const ya = new Set(F.entrenos.map(w => Math.floor(w.ini / 60000)));
  const nuevos = x.entrenos.filter(w => w.ini && !ya.has(Math.floor(w.ini / 60000))); const porMes = {}; for (const w of nuevos) ((porMes[ym(w.ini)] ||= {})[w.id] = w);
  for (const [k, e] of Object.entries(porMes)) { Object.assign(F.meses[k] ||= {}, e); await setDoc(mesRef(k), { e }, { merge: true }); }
  for (const r of x.rutinas) { const i = F.rutinas.findIndex(y => y.id === r.id); if (i >= 0) F.rutinas[i] = r; else F.rutinas.push(r); }
  guardaPerfil(0); reconstruye(); pinta(); return { entrenos: nuevos.length, rutinas: x.rutinas.length }; } };


// ================= ALIMENTACIÓN Y PESO =================
// users/{uid}/fit/alimentos  { lista: [{id,n,marca,super,k,p,c,g,ud,gUd}] }  (macros por 100 g/ml)
// users/{uid}/fit/dieta      { comidas: [{k,nombre,grupos:[{nombre,opciones:[{nombre,items:[{a,q}]}]}]}], obj:{k,p,c,g} }
// users/{uid}/fit/d-AAAA-MM  { dias: { 'AAAA-MM-DD': { c: { des:[item], com:[], mer:[], cen:[], ext:[] } } } }  item = {a,n,q,m:[k,p,c,g]}
// users/{uid}/fit/cuerpo     { pesos: { 'AAAA-MM-DD': kg } }
const COMIDAS = [['des', 'Desayuno', '🥣'], ['com', 'Comida', '🍝'], ['mer', 'Merienda', '🍌'], ['cen', 'Cena', '🍳'], ['ext', 'Extras / picoteo', '🍫']];
const SUPERS = ['Mercadona', 'Lidl', 'Carrefour', 'Dia', 'Alcampo', 'Eroski', 'Aldi', 'Consum', 'Gadis', 'Froiz', 'El Corte Inglés'];
const fISO = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const deISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
let diaSel = fISO(Date.now());
const alim = id => F.alimentos.find(a => a.id === id);
const mac = it => { const f = (it.q || 0) / 100, m = it.m || [0, 0, 0, 0]; return { k: m[0] * f, p: m[1] * f, c: m[2] * f, g: m[3] * f }; };
const suma = items => items.reduce((t, it) => { const m = mac(it); t.k += m.k; t.p += m.p; t.c += m.c; t.g += m.g; return t; }, { k: 0, p: 0, c: 0, g: 0 });
const deDieta = it => { const a = alim(it.a); return a ? { a: a.id, n: a.n, q: it.q, m: [a.k, a.p, a.c, a.g] } : null; };
const fQ = (a, q) => { if (a && a.ud && a.gUd) { const u = q / a.gUd; if (Math.abs(u - Math.round(u)) < 0.05 && u >= 1) return `${Math.round(u)} ${a.ud}${Math.round(u) > 1 && !/s$/.test(a.ud) ? 's' : ''} · ${fmtN(q)} g`; } return fmtN(q) + (a && a.ml ? ' ml' : ' g'); };
const r0 = n => Math.round(n || 0);
const tagM = m => `<span class="mtag"><b>${r0(m.k)}</b> kcal · P ${r0(m.p)} · H ${r0(m.c)} · G ${r0(m.g)}</span>`;
function diaDe(f) { preparaDia(f); return F.diario[f]; }
const itemsDia = f => { const d = F.diario[f]; return d ? COMIDAS.flatMap(([k]) => d.c?.[k] || []) : []; };
function objDieta() { // un día «tipo» con la primera opción de cada grupo
  const t = { k: 0, p: 0, c: 0, g: 0 };
  for (const cm of F.dieta.comidas || []) for (const gr of cm.grupos || []) { const s = suma((gr.opciones?.[0]?.items || []).map(deDieta).filter(Boolean)); t.k += s.k; t.p += s.p; t.c += s.c; t.g += s.g; }
  return t;
}
const objetivo = () => { const o = F.dieta.obj; return o && o.k ? o : objDieta(); };

const fitRef = id => doc(db, 'users', U.uid, 'fit', id);
const guardaAlimentos = () => setDoc(fitRef('alimentos'), { lista: F.alimentos }).catch(e => toast('No se pudo guardar: ' + (e.code || e.message)));
const guardaDieta = () => setDoc(fitRef('dieta'), { dietas: F.dietas.map(({ ult, ...x }) => x), activa: F.dietaActiva, ult: F.dieta.ult || {} }).catch(e => toast('No se pudo guardar: ' + (e.code || e.message)));
const guardaDia = f => (mandaSemana('cambio'), setDoc)(fitRef('d-' + f.slice(0, 7)), { dias: { [f]: F.diario[f] } }, { merge: true }).catch(e => toast('No se pudo guardar: ' + (e.code || e.message)));
const guardaPeso = (f, kg) => (kg == null ? updateDoc(fitRef('cuerpo'), new FieldPath('pesos', f), deleteField()) : setDoc(fitRef('cuerpo'), { pesos: { [f]: kg } }, { merge: true })).catch(e => toast('No se pudo guardar: ' + (e.code || e.message)));

function barra(v, o, cls = '') { const pc = o ? Math.min(100, v / o * 100) : 0; return `<div class="barra ${cls} ${o && v > o * 1.08 ? 'over' : ''}"><i style="width:${pc}%"></i></div>`; }
function resumenMacros(f, corto) {
  const t = suma(itemsDia(f)), o = objetivo();
  return `<div class="card macros"${corto ? ' data-act="irComida" style="cursor:pointer"' : ''}><div class="kc"><b>${fmtN(r0(t.k))}</b><span class="muted">/ ${fmtN(r0(o.k))} kcal</span><span class="sp"></span><span class="muted small">${o.k ? (t.k <= o.k ? 'quedan ' + fmtN(r0(o.k - t.k)) : 'te pasas ' + fmtN(r0(t.k - o.k))) : ''}</span></div>${barra(t.k, o.k)}
    <div class="mac3"><div class="P">Proteína<b>${r0(t.p)} / ${r0(o.p)} g</b>${barra(t.p, o.p)}</div><div class="C">Hidratos<b>${r0(t.c)} / ${r0(o.c)} g</b>${barra(t.c, o.c)}</div><div class="G">Grasa<b>${r0(t.g)} / ${r0(o.g)} g</b>${barra(t.g, o.g)}</div></div></div>`;
}
function vComida() {
  if (diaSel <= fISO(Date.now()) && preparaDia(diaSel)) guardaDia(diaSel);
  const d = F.diario[diaSel], hoy = fISO(Date.now());
  const nom = diaSel === hoy ? 'Hoy' : diaSel === fISO(Date.now() - DIA) ? 'Ayer' : fDia(deISO(diaSel));
  return `<div class="dianav"><button data-act="cDia" data-d="-1" aria-label="Día anterior">‹</button><b>${nom}</b><button data-act="cDia" data-d="1" aria-label="Día siguiente" ${diaSel >= hoy ? 'disabled style="opacity:.3"' : ''}>›</button></div>
  ${resumenMacros(diaSel)}
  ${COMIDAS.map(([k, nombre, ic]) => { const its = d?.c?.[k] || [], t = suma(its), cm = comDieta(k), sel = d?.sel?.[k] || [];
    const chips = cm && k !== 'ext' ? cm.grupos.map((g, gi) => `${g.opciones.length > 1 ? `<div class="faint small" style="margin-top:6px">${esc(g.nombre)}</div>` : ''}<div class="chips">${g.opciones.map((o, oi) => `<button class="${(sel[gi] ?? 0) === oi ? 'on' : ''}" data-act="cOp" data-k="${k}" data-g="${gi}" data-o="${oi}">${g.opciones.length === 1 ? ((sel[gi] ?? 0) === 0 ? '✓ ' : '') : ''}${esc(o.nombre)}</button>`).join('')}${g.opciones.length > 1 ? `<button class="${sel[gi] === -1 ? 'on' : ''}" data-act="cOp" data-k="${k}" data-g="${gi}" data-o="-1">Nada</button>` : ''}</div>`).join('') : '';
    return `<div class="card meal"><div class="meal-h"><h3>${ic} ${nombre}</h3><span><b>${r0(t.k)} kcal</b> · P ${r0(t.p)} · H ${r0(t.c)} · G ${r0(t.g)}</span></div>${chips}
    ${its.map((it, i) => { const m = mac(it); return `<div class="it" data-act="cItem" data-k="${k}" data-i="${i}"><div class="n"><b>${esc(it.n)}</b><span>${fQ(alim(it.a), it.q)}</span></div><div class="k">${r0(m.k)} kcal<small>P ${r0(m.p)} · H ${r0(m.c)} · G ${r0(m.g)}</small></div></div>`; }).join('')}
    <div class="acts"><button class="btn sm" data-act="cAdd" data-k="${k}">＋ Añadir otro alimento</button></div></div>`; }).join('')}
  <div class="stack" style="margin-top:16px"><button class="btn" data-act="cVerDieta">🥗 Mis dietas y objetivos</button><button class="btn primary" data-act="kAbrir">🛒 Lista de la compra</button><button class="btn" data-act="cAlims">📦 Mis alimentos (${F.alimentos.length})</button></div>`;
}

// ---- hojas de comida ----
function hojaDeDieta(k) {
  const cm = F.dieta.comidas.find(c => c.k === k); if (!cm) return;
  if (!hojaCtx || hojaCtx.tipo !== 'cdieta' || hojaCtx.k !== k) hojaCtx = { tipo: 'cdieta', k, sel: (F.dieta.ult?.[k] || cm.grupos.map(() => 0)).slice(0, cm.grupos.length) };
  const sel = hojaCtx.sel; while (sel.length < cm.grupos.length) sel.push(0);
  const items = cm.grupos.flatMap((g, gi) => sel[gi] < 0 ? [] : (g.opciones[sel[gi]]?.items || []).map(deDieta).filter(Boolean));
  hoja(`<h2>${esc(cm.nombre)} · de mi dieta</h2>
  ${cm.grupos.map((g, gi) => `<div class="dgrp">${esc(g.nombre)}</div><div class="chips">${g.opciones.map((o, oi) => { const s = suma(o.items.map(deDieta).filter(Boolean));
    return `<button class="${sel[gi] === oi ? 'on' : ''}" data-act="cSel" data-g="${gi}" data-o="${oi}">${esc(o.nombre)}<small>${r0(s.k)} kcal · P ${r0(s.p)}</small></button>`; }).join('')}${g.opciones.length > 1 || g.opcional ? '' : ''}<button class="${sel[gi] < 0 ? 'on' : ''}" data-act="cSel" data-g="${gi}" data-o="-1">No<small>nada de esto</small></button></div>`).join('')}
  <div class="card" style="margin-top:12px">${items.map(it => `<div class="small">${esc(it.n)} · <span class="muted">${fQ(alim(it.a), it.q)}</span></div>`).join('') || '<span class="muted small">Nada elegido</span>'}<div style="margin-top:8px">${tagM(suma(items))}</div></div>
  <button class="btn primary big" style="margin-top:12px" data-act="cDietaOk">Añadir a ${esc(cm.nombre.toLowerCase())}</button>`);
}
let alimFiltro = '';
function vAlimentos() { hojaCtx = null; return `<h2 style="margin:4px 0 12px">Mis alimentos</h2><input class="buscar" id="alimQ" placeholder="Buscar por nombre, marca o súper…" value="${esc(alimFiltro)}" autocomplete="off"><div class="card pick" id="alimL" style="max-height:none;margin-top:10px"></div><button class="btn primary big" style="margin-top:12px" data-act="cNuevoAlim">＋ Crear alimento nuevo</button>`; }
document.addEventListener('input', ev => { if (ev.target.id === 'alimQ' && vista === 'alimentos' && $('#sheet').hidden) { alimFiltro = ev.target.value; pintaAlims(); } });
function hojaAlimentos(modo, k) { // modo 'add' (elegir para añadir a la comida k) o 'gest'
  hojaCtx = { tipo: 'calims', modo, k };
  hoja(`<h2>${modo === 'gest' ? 'Mis alimentos' : 'Añadir alimento'}</h2><input class="buscar" id="alimQ" placeholder="Buscar por nombre, marca o súper…" value="${esc(alimFiltro)}" autocomplete="off">
  <div class="pick" id="alimL"></div><button class="btn" style="width:100%;margin-top:10px" data-act="cNuevoAlim">＋ Crear alimento nuevo</button>`);
  pintaAlims(); $('#alimQ').addEventListener('input', e => { alimFiltro = e.target.value; pintaAlims(); });
}
function pintaAlims() {
  const f = norm(alimFiltro), uso = {};
  for (const f2 of Object.keys(F.diario)) for (const it of itemsDia(f2)) uso[it.a] = (uso[it.a] || 0) + 1;
  const l = F.alimentos.filter(a => !f || norm(a.n + ' ' + (a.marca || '') + ' ' + (a.super || '')).includes(f)).sort((a, b) => (uso[b.id] || 0) - (uso[a.id] || 0) || a.n.localeCompare(b.n));
  $('#alimL').innerHTML = l.map(a => `<button data-act="cAlim" data-id="${a.id}">${esc(a.n)}<small>${[a.marca, a.super].filter(Boolean).map(esc).join(' · ') || 'sin marca'} · ${r0(a.k)} kcal · P ${fmtN(a.p)} · H ${fmtN(a.c)} · G ${fmtN(a.g)} /100${a.ml ? 'ml' : 'g'}${a.aprox ? ' · aprox.' : ''}</small></button>`).join('') || '<p class="faint small">No hay ninguno con ese nombre.</p>';
}
function hojaCantidad(a, k, i) { // añadir (i == null) o editar el item i de la comida k
  const it = i != null ? F.diario[diaSel].c[k][i] : null, q = it ? it.q : (a.gUd || 100);
  hojaCtx = { tipo: 'cq', a: a.id, k, i };
  hoja(`<h2>${esc(a.n)}</h2><p class="muted small" style="margin:-6px 0 6px">${[a.marca, a.super].filter(Boolean).map(esc).join(' · ')} ${r0(a.k)} kcal/100${a.ml ? 'ml' : 'g'}</p>
  <label>Cantidad (${a.ml ? 'ml' : 'gramos'})</label><input type="number" inputmode="decimal" id="cQ" value="${q}">
  ${a.gUd ? `<div class="qbtns">${[0.5, 1, 2, 3, 4].map(u => `<button data-act="cQu" data-q="${u * a.gUd}">${fmtN(u)} ${esc(a.ud || 'ud')}</button>`).join('')}</div>` : `<div class="qbtns">${[50, 100, 150, 200, 250].map(g => `<button data-act="cQu" data-q="${g}">${g}</button>`).join('')}</div>`}
  <div class="card" style="margin-top:12px" id="cQm"></div>
  <div class="stack" style="margin-top:12px"><button class="btn primary" data-act="cQok">${it ? 'Guardar' : 'Añadir'}</button>${it ? '<button class="btn danger" data-act="cQdel">Quitar</button>' : ''}</div>`);
  const pm = () => { $('#cQm').innerHTML = tagM(mac({ q: num($('#cQ').value) || 0, m: [a.k, a.p, a.c, a.g] })); };
  $('#cQ').addEventListener('input', pm); pm();
}
function hojaAlimento(id) {
  const a = id ? alim(id) : { n: '', marca: '', super: 'Mercadona', k: '', p: '', c: '', g: '', ud: '', gUd: '' };
  hojaCtx = { ...(hojaCtx || {}), tipo: 'calim', id, volver: hojaCtx };
  hoja(`<h2>${id ? 'Editar alimento' : 'Nuevo alimento'}</h2>
  <label>Nombre</label><input type="text" id="aN" value="${esc(a.n)}" placeholder="Ej.: Queso fresco batido 0%">
  <div class="f2"><div><label>Marca</label><input type="text" id="aM" value="${esc(a.marca || '')}" placeholder="Hacendado"></div>
  <div><label>Supermercado</label><input type="text" id="aS" list="supers" value="${esc(a.super || '')}"><datalist id="supers">${SUPERS.map(s => `<option value="${s}">`).join('')}</datalist></div></div>
  <label>Por cada 100 g (o ml) — mira la etiqueta</label>
  <div class="f2"><div><label>Kcal</label><input type="number" inputmode="decimal" id="aK" value="${a.k}"></div><div><label>Proteína (g)</label><input type="number" inputmode="decimal" id="aP" value="${a.p}"></div>
  <div><label>Hidratos (g)</label><input type="number" inputmode="decimal" id="aC" value="${a.c}"></div><div><label>Grasa (g)</label><input type="number" inputmode="decimal" id="aG" value="${a.g}"></div></div>
  <div class="f2"><div><label>Unidad (opcional)</label><input type="text" id="aU" value="${esc(a.ud || '')}" placeholder="lata, huevo, loncha…"></div><div><label>Gramos por unidad</label><input type="number" inputmode="decimal" id="aGu" value="${a.gUd || ''}"></div></div>
  <label>Sección en la lista de la compra</label><select id="aCat"><option value="">Automática (según tu dieta)</option>${CATS.map(c => `<option ${a.compra === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
  <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="aMl" ${a.ml ? 'checked' : ''}> Es líquido (se mide en ml)</label>
  ${!id && hojaCtx?.volver?.tipo === 'compraProd' ? '<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="aFalta" checked> Añadirlo ya a «Comprar»</label>' : ''}
  ${a.aprox ? '<p class="faint small">Valores aproximados: cámbialos por los de la etiqueta de tu producto.</p>' : ''}
  <div class="stack" style="margin-top:12px"><button class="btn primary" data-act="cAlimOk">Guardar alimento</button>${id ? '<button class="btn danger" data-act="cAlimDel">Eliminar</button>' : ''}</div>`);
}
// ---- dietas guardadas, comida del día rellena con la dieta ----
const comDieta = k => (F.dieta.comidas || []).find(c => c.k === k);
const itemsSel = (cm, sel) => cm.grupos.flatMap((g, gi) => (sel[gi] ?? 0) < 0 ? [] : (g.opciones[sel[gi] ?? 0]?.items || []).map(deDieta).filter(Boolean).map(it => ({ ...it, d: 1 })));
function selDef(k) { const cm = comDieta(k), u = F.dieta.ult?.[k]; return cm.grupos.map((g, gi) => (u && u[gi] != null && u[gi] < g.opciones.length) ? u[gi] : 0); }
function preparaDia(f) { // rellena con la dieta las comidas que aún no se han tocado ese día
  const d = F.diario[f] ||= { c: {} }; d.c ||= {}; d.sel ||= {}; let cambio = false;
  for (const [k] of COMIDAS) {
    if (d.c[k] !== undefined) continue;
    const cm = comDieta(k); if (!cm || k === 'ext') { d.c[k] = []; continue; }
    d.sel[k] = selDef(k); d.c[k] = itemsSel(cm, d.sel[k]); cambio = true;
  }
  return cambio;
}
function hojaDieta() { if (vista === 'dietas') { cierraHoja(); return repinta(); } hojaCtx = { tipo: 'cverdieta' }; hoja(htmlDietas()); }
function htmlDietas() {
  const o = objetivo(), od = objDieta();
  return `<h2 style="margin:4px 0 12px">Mis dietas</h2>
  <div class="stack">${F.dietas.map(dt => `<div class="card dieta-it ${dt.id === F.dietaActiva ? 'activa' : ''}"><div class="row"><div style="flex:1"><b>${esc(dt.nombre)}</b><div class="faint small">${dt.id === F.dietaActiva ? '✅ Aplicada ahora' : 'Guardada'}${dt.at ? ' · ' + fDia(dt.at) : ''}</div></div>
    ${dt.id === F.dietaActiva ? '' : `<button class="btn sm primary" data-act="cDAplica" data-id="${dt.id}">Aplicar</button>`}<button class="btn sm" data-act="cDEdit" data-id="${dt.id}">✏️</button>${dt.id === F.dietaActiva ? '' : `<button class="btn sm ghost" data-act="cDBorra" data-id="${dt.id}">🗑</button>`}</div></div>`).join('')}</div>
  <p class="faint small">Al editar una dieta se guarda como una dieta nueva; tú eliges si la aplicas.</p>
  <div class="card" style="margin-top:12px"><b>Objetivo diario</b><p class="faint small" style="margin:2px 0 8px">Por defecto sale de la dieta aplicada (${r0(od.k)} kcal · P ${r0(od.p)}).</p>
  <div class="f2"><div><label>Kcal</label><input type="number" id="oK" value="${r0(o.k)}"></div><div><label>Proteína (g)</label><input type="number" id="oP" value="${r0(o.p)}"></div>
  <div><label>Hidratos (g)</label><input type="number" id="oC" value="${r0(o.c)}"></div><div><label>Grasa (g)</label><input type="number" id="oG" value="${r0(o.g)}"></div></div>
  <div class="row" style="margin-top:10px"><button class="btn primary sm" data-act="cObjOk">Guardar objetivo</button><button class="btn sm" data-act="cObjDieta">Usar el de la dieta</button></div></div>
  <div class="sec"><h2>${esc(F.dieta.nombre || 'Dieta')}</h2></div>
  ${(F.dieta.comidas || []).map(cm => `<div class="dgrp" style="font-size:13px">${esc(cm.nombre)}</div>${cm.grupos.map(g => `${cm.grupos.length > 1 || g.opciones.length > 1 ? `<div class="faint small" style="margin-top:4px">${esc(g.nombre)}</div>` : ''}${g.opciones.map(op => { const its = op.items.map(deDieta).filter(Boolean);
    return `<div class="dop"><b>${esc(op.nombre)}</b> ${tagM(suma(its))}<div class="muted small">${its.map(it => esc(it.n) + ' ' + fQ(alim(it.a), it.q)).join(' · ')}</div>${op.nota ? `<div class="faint small">${esc(op.nota)}</div>` : ''}</div>`; }).join('')}`).join('')}`).join('') || '<p class="muted">Aún no hay dieta cargada.</p>'}`;
}
let deCtx = null;
function hojaEditDieta() {
  const dt = deCtx.d;
  hojaCtx = { tipo: 'dedit' };
  hoja(`<h2>Editar dieta</h2><label>Nombre de la dieta nueva</label><input type="text" id="deN" value="${esc(dt.nombre)}">
  ${dt.comidas.map((cm, ci) => `<div class="sec"><h2>${esc(cm.nombre)}</h2></div>${cm.grupos.map((g, gi) => `<div class="dgrp">${esc(g.nombre)}</div>${g.opciones.map((op, oi) => {
    const its = op.items.map(deDieta).filter(Boolean);
    return `<div class="card de-op"><div class="row"><input type="text" class="deOpN" data-c="${ci}" data-g="${gi}" data-o="${oi}" value="${esc(op.nombre)}" style="flex:1"><button class="btn sm ghost" data-act="dOpDel" data-c="${ci}" data-g="${gi}" data-o="${oi}" title="Quitar opción">🗑</button></div>
      ${op.items.map((it, ii) => { const a = alim(it.a); return `<div class="re-ej"><b>${esc(a ? a.n : it.a)}</b><input type="number" inputmode="decimal" class="deQ" data-c="${ci}" data-g="${gi}" data-o="${oi}" data-i="${ii}" value="${it.q}"><span class="faint small">${a?.ml ? 'ml' : 'g'}</span><button type="button" data-act="dItDel" data-c="${ci}" data-g="${gi}" data-o="${oi}" data-i="${ii}">✕</button></div>`; }).join('')}
      <div class="row" style="margin-top:6px"><span class="mtag">${tagM(suma(its))}</span><span class="sp"></span><button class="btn sm" data-act="dItAdd" data-c="${ci}" data-g="${gi}" data-o="${oi}">＋ Alimento</button></div></div>`; }).join('')}
    <button class="btn sm" style="margin:4px 0 6px" data-act="dOpAdd" data-c="${ci}" data-g="${gi}">＋ Otra opción en «${esc(g.nombre)}»</button>`).join('')}`).join('')}
  <label style="display:flex;gap:8px;align-items:center;margin-top:16px"><input type="checkbox" id="deApl" checked> Aplicarla ya (si no, se queda guardada)</label>
  <div class="stack" style="margin-top:10px"><button class="btn primary big" data-act="dGuardar">Guardar como dieta nueva</button><button class="btn" data-act="cVerDieta">Cancelar</button></div>`);
}
function leeEditDieta() {
  if (!deCtx || !$('#deN')) return; const dt = deCtx.d; dt.nombre = $('#deN').value.trim() || dt.nombre;
  document.querySelectorAll('.deOpN').forEach(i => { dt.comidas[+i.dataset.c].grupos[+i.dataset.g].opciones[+i.dataset.o].nombre = i.value; });
  document.querySelectorAll('.deQ').forEach(i => { const v = num(i.value); if (v != null) dt.comidas[+i.dataset.c].grupos[+i.dataset.g].opciones[+i.dataset.o].items[+i.dataset.i].q = v; });
}
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]'); if (!b) return; const ds = b.dataset;
  const op = () => deCtx.d.comidas[+ds.c].grupos[+ds.g].opciones[+ds.o];
  switch (ds.act) {
    case 'cOp': { const k = ds.k, cm = comDieta(k), d = (preparaDia(diaSel), F.diario[diaSel]), gi = +ds.g, o = +ds.o;
      const sel = (d.sel[k] || selDef(k)).slice(); while (sel.length < cm.grupos.length) sel.push(0);
      sel[gi] = cm.grupos[gi].opciones.length === 1 && o >= 0 ? (sel[gi] === 0 ? -1 : 0) : o;
      d.sel[k] = sel; d.c[k] = [...itemsSel(cm, sel), ...(d.c[k] || []).filter(i => !i.d)];
      if (o >= 0 && cm.grupos[gi].opciones.length > 1) { (F.dieta.ult ||= {})[k] = sel; setDoc(fitRef('dieta'), { ult: F.dieta.ult }, { merge: true }).catch(() => {}); }
      guardaDia(diaSel); return pinta(); }
    case 'cDAplica': { const dt = F.dietas.find(x => x.id === ds.id); if (!dt) return; F.dietaActiva = dt.id; const ult = F.dieta.ult; F.dieta = dt; F.dieta.ult = ult; guardaDieta(); toast('Aplicada: ' + dt.nombre); return hojaDieta(); }
    case 'cDBorra': if (!confirm('¿Borrar esta dieta guardada?')) return; F.dietas = F.dietas.filter(x => x.id !== ds.id); guardaDieta(); return hojaDieta();
    case 'cDEdit': { const dt = F.dietas.find(x => x.id === ds.id); if (!dt) return; const c = JSON.parse(JSON.stringify({ comidas: dt.comidas, obj: dt.obj || null }));
      deCtx = { base: dt.id, d: { ...c, nombre: 'Dieta ' + (F.dietas.length + 1) } }; return hojaEditDieta(); }
    case 'dItDel': leeEditDieta(); op().items.splice(+ds.i, 1); return hojaEditDieta();
    case 'dOpDel': { leeEditDieta(); const g = deCtx.d.comidas[+ds.c].grupos[+ds.g]; if (g.opciones.length < 2) return toast('Debe quedar al menos una opción'); g.opciones.splice(+ds.o, 1); return hojaEditDieta(); }
    case 'dOpAdd': leeEditDieta(); deCtx.d.comidas[+ds.c].grupos[+ds.g].opciones.push({ nombre: 'Nueva opción', items: [] }); return hojaEditDieta();
    case 'dItAdd': leeEditDieta(); deCtx.dest = [+ds.c, +ds.g, +ds.o]; alimFiltro = ''; return hojaAlimentos('dedit');
    case 'dGuardar': { leeEditDieta(); const dt = { id: 'd' + uid8(), nombre: deCtx.d.nombre, comidas: deCtx.d.comidas, obj: deCtx.d.obj, at: Date.now() };
      F.dietas.push(dt); if ($('#deApl').checked) { const ult = F.dieta.ult; F.dietaActiva = dt.id; F.dieta = dt; F.dieta.ult = ult; }
      guardaDieta(); deCtx = null; toast('Dieta guardada' + (F.dietaActiva === dt.id ? ' y aplicada' : '')); pinta(); return hojaDieta(); }
  }
});

// ---- peso ----
function pesosOrden() { return Object.entries(F.pesos).map(([f, kg]) => ({ f, t: deISO(f), kg })).sort((a, b) => a.t - b.t); }
function hojaPeso() {
  hoja(`<h2>Apuntar peso</h2><label>Fecha</label><input type="text" id="pF" value="${fISO(Date.now())}" placeholder="AAAA-MM-DD"><label>Peso (kg)</label><input type="number" inputmode="decimal" id="pK" placeholder="82,5">
  <label>Objetivo de peso (kg, opcional)</label><input type="number" inputmode="decimal" id="pO" value="${F.ajustes.objPeso || ''}">
  <button class="btn primary big" style="margin-top:12px" data-act="cPesoOk">Guardar</button>`); setTimeout(() => $('#pK')?.focus(), 50);
}

document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act; if (!a.startsWith('c') || ['cierra', 'copia'].includes(a)) { if (a === 'irComida') ir('comida'); return; }
  const k = b.dataset.k;
  switch (a) {
    case 'cDia': { const t = deISO(diaSel) + (+b.dataset.d) * DIA; if (t > Date.now()) return; diaSel = fISO(t); return pinta(); }
    case 'cDeDieta': hojaCtx = null; return hojaDeDieta(k);
    case 'cSel': hojaCtx.sel[+b.dataset.g] = +b.dataset.o; return hojaDeDieta(hojaCtx.k);
    case 'cDietaOk': { const cm = F.dieta.comidas.find(c => c.k === hojaCtx.k), sel = hojaCtx.sel;
      const its = cm.grupos.flatMap((g, gi) => sel[gi] < 0 ? [] : (g.opciones[sel[gi]]?.items || []).map(deDieta).filter(Boolean));
      diaDe(diaSel).c[hojaCtx.k].push(...its); (F.dieta.ult ||= {})[hojaCtx.k] = sel; guardaDia(diaSel); setDoc(fitRef('dieta'), { ult: F.dieta.ult }, { merge: true }).catch(() => {});
      cierraHoja(); pinta(); return toast(`Añadido: ${r0(suma(its).k)} kcal`); }
    case 'cAdd': alimFiltro = ''; return hojaAlimentos('add', k);
    case 'cAlims': alimFiltro = ''; return ir('alimentos');
    case 'cAlim': { const al = alim(b.dataset.id); if (!al) return; if (hojaCtx?.modo === 'add') return hojaCantidad(al, hojaCtx.k, null);
      if (hojaCtx?.modo === 'dedit' && deCtx) { const [ci, gi, oi] = deCtx.dest; deCtx.d.comidas[ci].grupos[gi].opciones[oi].items.push({ a: al.id, q: al.gUd || 100 }); return hojaEditDieta(); } return hojaAlimento(al.id); }
    case 'cNuevoAlim': return hojaAlimento(null);
    case 'cAlimOk': { const n = $('#aN').value.trim(); if (!n) return toast('Ponle nombre');
      const v = id => num($(id).value); let K = v('#aK'); const P = v('#aP') || 0, C = v('#aC') || 0, G = v('#aG') || 0; if (K == null) K = Math.round(P * 4 + C * 4 + G * 9);
      const id = hojaCtx.id, al = { id: id || 'a' + uid8(), n, marca: $('#aM').value.trim(), super: $('#aS').value.trim(), k: K, p: P, c: C, g: G, ud: $('#aU').value.trim(), gUd: v('#aGu') || null, ml: $('#aMl').checked, compra: $('#aCat').value || '' };
      const i = F.alimentos.findIndex(x => x.id === al.id); if (i >= 0) F.alimentos[i] = al; else F.alimentos.push(al);
      guardaAlimentos(); const vol = hojaCtx.volver; toast('Guardado');
      if (vol && vol.tipo === 'compraProd') { if ($('#aFalta')?.checked) { (F.compra.falta ||= {})[al.id] = true; kModo = 'comprar'; lsSet('jp-fit-kmodo', kModo); guardaCompra(); } cierraHoja(); return repinta(); }
      if (vol && vol.tipo === 'calims') { if (vol.modo === 'add' && !id) return hojaCantidad(al, vol.k, null); return hojaAlimentos(vol.modo, vol.k); } cierraHoja(); return pinta(); }
    case 'cAlimDel': { if (!confirm('¿Eliminar este alimento? Lo que ya apuntaste se queda igual.')) return; F.alimentos = F.alimentos.filter(x => x.id !== hojaCtx.id); guardaAlimentos(); return hojaAlimentos('gest'); }
    case 'cQu': $('#cQ').value = b.dataset.q; return $('#cQ').dispatchEvent(new Event('input'));
    case 'cQok': { const al = alim(hojaCtx.a), q = num($('#cQ').value); if (!q) return toast('Pon una cantidad'); const d = diaDe(diaSel);
      const it = { a: al.id, n: al.n, q, m: [al.k, al.p, al.c, al.g] }; if (hojaCtx.i != null) { if (d.c[hojaCtx.k][hojaCtx.i]?.d) it.d = 1; d.c[hojaCtx.k][hojaCtx.i] = it; } else d.c[hojaCtx.k].push(it);
      guardaDia(diaSel); cierraHoja(); pinta(); return; }
    case 'cQdel': diaDe(diaSel).c[hojaCtx.k].splice(hojaCtx.i, 1); guardaDia(diaSel); cierraHoja(); return pinta();
    case 'cItem': { const it = F.diario[diaSel].c[k][+b.dataset.i]; const al = alim(it.a) || { id: it.a, n: it.n, k: it.m[0], p: it.m[1], c: it.m[2], g: it.m[3] }; return hojaCantidad(al, k, +b.dataset.i); }
    case 'cVerDieta': if ($('#sheet').hidden || hojaCtx?.tipo !== 'dedit') return ir('dietas'); cierraHoja(); return vista === 'dietas' ? repinta() : hojaDieta();
    case 'cObjOk': F.dieta.obj = { k: num($('#oK').value) || 0, p: num($('#oP').value) || 0, c: num($('#oC').value) || 0, g: num($('#oG').value) || 0 }; guardaDieta(); cierraHoja(); pinta(); return toast('Objetivo guardado');
    case 'cObjDieta': F.dieta.obj = null; guardaDieta(); cierraHoja(); pinta(); return toast('Objetivo = tu dieta');
    case 'cPeso': return hojaPeso();
    case 'cPesoOk': { const f = $('#pF').value.trim(), kg = num($('#pK').value), o = num($('#pO').value);
      if (o !== (F.ajustes.objPeso ?? null)) { F.ajustes.objPeso = o; guardaPerfil(0); }
      if (kg) { if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return toast('Fecha AAAA-MM-DD'); F.pesos[f] = kg; guardaPeso(f, kg); }
      cierraHoja(); pinta(); return toast('Guardado'); }
    case 'cPesos': { const ps = pesosOrden().reverse(); return hoja(`<h2>Pesos</h2>${ps.map(p => `<div class="it"><div class="n"><b>${fmtN(p.kg)} kg</b><span>${fDia(p.t)} ${new Date(p.t).getFullYear()}</span></div><button class="btn sm ghost" data-act="cPesoDel" data-f="${p.f}">✕</button></div>`).join('')}`); }
    case 'cPesoDel': if (!confirm('¿Borrar este peso?')) return; delete F.pesos[b.dataset.f]; guardaPeso(b.dataset.f, null); b.closest('.it').remove(); return pinta();
  }
});

// Importaciones de peso (CSV de medidas de Hevy) y de CSV en texto (para cargas desde Claude)
function deMedidas(txt) {
  const filas = csvFilas(txt.replace(/^﻿/, '')); const h = filas.shift().map(x => x.trim().toLowerCase());
  const cf = h.indexOf('date'), ck = h.indexOf('weight_kg'); const out = {};
  for (const f of filas) { const t = fechaHevy(f[cf]), kg = num(f[ck]); if (t && kg) out[fISO(t)] = kg; }
  return out;
}
async function importaPesos(p) { Object.assign(F.pesos, p); await setDoc(fitRef('cuerpo'), { pesos: p }, { merge: true }); pinta(); return Object.keys(p).length; }
Object.assign(window.__fit, { importaPesos, deMedidas,
  importaCSV: async txt => { const d = deCSV(txt); return window.__fit.importa({ entrenos: d.entrenos.map(w => ({ ...w, ej: w.ej })) }); },
  ponAlimentos: async l => { F.alimentos = l; await guardaAlimentos(); pinta(); return l.length; },
  ponDieta: async c => { F.dieta.comidas = c; await guardaDieta(); pinta(); return c.length; },
  quitaDeDieta: async (aid, nombreOp) => { for (const cm of F.dieta.comidas) for (const g of cm.grupos) for (const o of g.opciones) o.items = o.items.filter(i => i.a !== aid); if (nombreOp) F.dieta.comidas.find(c => c.k === 'des').grupos[0].opciones[0].nombre = nombreOp; await guardaDieta(); pinta(); return true; } });


// ================= GRÁFICAS, OBJETIVOS, CALENDARIO Y LISTA DE LA COMPRA =================
const CH = new Map(); let chId = 0; const rangos = lsGet('jp-fit-rangos', {});
const RANGOS = [['1M', 30], ['3M', 91], ['6M', 182], ['1A', 365], ['Todo', 0]];
function suave(p) {   // curva monótona: suave pero sin pasarse de los datos
  const n = p.length, L = q => q.map((x, i) => (i ? 'L' : 'M') + x[0].toFixed(1) + ' ' + x[1].toFixed(1)).join(' ');
  if (n < 3) return L(p);
  const dx = [], m = [], t = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = p[i + 1][0] - p[i][0]; m[i] = dx[i] ? (p[i + 1][1] - p[i][1]) / dx[i] : 0; }
  t[0] = m[0]; for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2; t[n - 1] = m[n - 2];
  for (let i = 0; i < n - 1; i++) { if (!m[i]) { t[i] = 0; t[i + 1] = 0; continue; } const a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b; if (h > 9) { const k = 3 / Math.sqrt(h); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; } }
  let d = 'M' + p[0][0].toFixed(1) + ' ' + p[0][1].toFixed(1);
  for (let i = 0; i < n - 1; i++) { const h = dx[i] / 3; d += ` C${(p[i][0] + h).toFixed(1)} ${(p[i][1] + t[i] * h).toFixed(1)} ${(p[i + 1][0] - h).toFixed(1)} ${(p[i + 1][1] - t[i + 1] * h).toFixed(1)} ${p[i + 1][0].toFixed(1)} ${p[i + 1][1].toFixed(1)}`; }
  return d;
}
const mediaMovil = (pts, dias = 7) => pts.map(p => { const w = pts.filter(q => q.t <= p.t && q.t > p.t - dias * DIA); return { t: p.t, v: w.reduce((a, b) => a + b.v, 0) / w.length }; });
const redondea = (v, dec) => Math.round(v * 10 ** dec) / 10 ** dec;
function graficaPro({ key, puntos, unidad = '', objetivo = null, media = false, dec = 1, alto = 210, rangoDef = 0 }) {
  const r = rangos[key] ?? rangoDef, ult = puntos.length ? puntos[puntos.length - 1].t : Date.now();
  let pts = r ? puntos.filter(p => p.t >= ult - r * DIA) : puntos;
  if (pts.length < 2) pts = puntos.slice(-2);
  const chips = `<div class="rchips">${RANGOS.map(([n, d]) => `<button data-act="rango" data-key="${key}" data-d="${d}" class="${d === r ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  if (pts.length < 2) return chips + '<p class="faint small">Necesito al menos dos datos para dibujar la gráfica.</p>';
  const W = 420, H = alto, PL = 6, PR = 40, PT = 14, PB = 24;
  const ys = pts.map(p => p.v).concat(objetivo != null ? [objetivo] : []);
  let y0 = Math.min(...ys), y1 = Math.max(...ys); const pad = (y1 - y0) * 0.14 || 1; y0 -= pad; y1 += pad;
  const x0 = pts[0].t, x1 = pts[pts.length - 1].t;
  const X = t => PL + (W - PL - PR) * ((t - x0) / ((x1 - x0) || 1)), Y = v => PT + (H - PT - PB) * (1 - (v - y0) / ((y1 - y0) || 1));
  const id = 'g' + (++chId); CH.set(id, { pts, X, Y, unidad, dec, W, H, PT, PB });
  const linea = suave(pts.map(p => [X(p.t), Y(p.v)])), mm = media ? suave(mediaMovil(pts).map(p => [X(p.t), Y(p.v)])) : null;
  const grid = [0, 1, 2, 3, 4].map(i => { const v = y0 + (y1 - y0) * i / 4; return `<line x1="${PL}" x2="${W - PR}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="gl"/><text x="${W - PR + 5}" y="${(Y(v) + 3.5).toFixed(1)}" class="gt">${fmtN(redondea(v, dec))}</text>`; }).join('');
  const xl = [0, 1, 2, 3].map(i => { const t = x0 + (x1 - x0) * i / 3, d = new Date(t);
    const lab = (x1 - x0) > 300 * DIA ? MESES[d.getMonth()].slice(0, 3) + ' ' + String(d.getFullYear()).slice(2) : d.getDate() + ' ' + MESES[d.getMonth()].slice(0, 3);
    return `<text x="${X(t).toFixed(1)}" y="${H - 6}" class="gt" text-anchor="${i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}">${lab}</text>`; }).join('');
  const last = pts[pts.length - 1];
  const obj = objetivo != null ? `<line x1="${PL}" x2="${W - PR}" y1="${Y(objetivo).toFixed(1)}" y2="${Y(objetivo).toFixed(1)}" class="gobj"/><text x="${PL + 3}" y="${(Y(objetivo) - 5).toFixed(1)}" class="gt gobjt">🎯 ${fmtN(objetivo)}${unidad}</text>` : '';
  return chips + `<div class="gchart" data-g="${id}"><svg viewBox="0 0 ${W} ${H}" class="gsvg" role="img" aria-label="Gráfica">
   <defs><linearGradient id="${id}f" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".32"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
   ${grid}${obj}<path d="${linea} L${X(x1).toFixed(1)} ${H - PB} L${X(x0).toFixed(1)} ${H - PB} Z" fill="url(#${id}f)"/>
   ${media ? `<path d="${linea}" fill="none" stroke="var(--accent)" stroke-opacity=".35" stroke-width="1.2"/>` : ''}
   <path d="${media ? mm : linea}" fill="none" stroke="var(--accent)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
   ${pts.length <= 45 ? pts.map(p => `<circle cx="${X(p.t).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="2.3" class="gdot"/>`).join('') : ''}
   <circle cx="${X(last.t).toFixed(1)}" cy="${Y(last.v).toFixed(1)}" r="5" class="glast"/>${xl}
   <line class="gcur" x1="0" x2="0" y1="${PT}" y2="${H - PB}" visibility="hidden"/><circle class="gcurp" r="5" cx="0" cy="0" visibility="hidden"/></svg>
   <div class="gtip" hidden></div></div>${media ? '<p class="faint small" style="margin:4px 0 0">Línea gruesa: media de 7 días · fina: cada pesaje. Toca la gráfica para ver cada dato.</p>' : ''}`;
}
function gMueve(ev) {
  const g = ev.target.closest?.('.gchart'); if (!g) return; const c = CH.get(g.dataset.g); if (!c) return;
  const svg = g.querySelector('svg'), rc = svg.getBoundingClientRect(), x = (ev.clientX - rc.left) / rc.width * c.W;
  let best = c.pts[0]; for (const p of c.pts) if (Math.abs(c.X(p.t) - x) < Math.abs(c.X(best.t) - x)) best = p;
  const cx = c.X(best.t), cy = c.Y(best.v), cur = svg.querySelector('.gcur'), cp = svg.querySelector('.gcurp'), tip = g.querySelector('.gtip');
  cur.setAttribute('x1', cx); cur.setAttribute('x2', cx); cur.setAttribute('visibility', 'visible'); cp.setAttribute('cx', cx); cp.setAttribute('cy', cy); cp.setAttribute('visibility', 'visible');
  const d = new Date(best.t); tip.hidden = false; tip.textContent = `${fmtN(redondea(best.v, c.dec))}${c.unidad} · ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
  tip.style.left = Math.min(Math.max(cx / c.W * 100, 14), 86) + '%';
  clearTimeout(g._t); g._t = setTimeout(() => { tip.hidden = true; cur.setAttribute('visibility', 'hidden'); cp.setAttribute('visibility', 'hidden'); }, 2500);
}
document.addEventListener('pointermove', gMueve); document.addEventListener('pointerdown', gMueve);

function barras(items, obj, alto = 120) { // items [{lab, v, hoy}]
  const W = 420, H = alto, PB = 20, PT = 10, max = Math.max(obj || 0, ...items.map(i => i.v), 1), bw = (W - 10) / items.length;
  const Y = v => PT + (H - PT - PB) * (1 - v / max);
  return `<svg viewBox="0 0 ${W} ${H}" class="gsvg" role="img" aria-label="Barras">${obj ? `<line x1="0" x2="${W}" y1="${Y(obj)}" y2="${Y(obj)}" class="gobj"/>` : ''}
    ${items.map((it, i) => { const x = 5 + i * bw + bw * 0.18, w = bw * 0.64, y = Y(it.v); return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0, H - PB - y).toFixed(1)}" rx="5" class="${obj && it.v >= obj ? 'bok' : 'bno'} ${it.hoy ? 'bhoy' : ''}"/>
      ${it.v ? `<text x="${(x + w / 2).toFixed(1)}" y="${(y - 3).toFixed(1)}" text-anchor="middle" class="gt">${fmtN(it.v)}</text>` : ''}<text x="${(x + w / 2).toFixed(1)}" y="${H - 5}" text-anchor="middle" class="gt">${it.lab}</text>`; }).join('')}</svg>`;
}

// ---- peso (tarjeta nueva) ----
function cardPeso(compacto) {
  const ps = pesosOrden();
  if (!ps.length) return `<div class="card"><b>Peso</b><p class="muted small">Apunta tu peso para ver la tendencia.</p><button class="btn sm primary" data-act="cPeso">＋ Apuntar peso</button></div>`;
  const u = ps[ps.length - 1], obj = F.ajustes.objPeso, ff = F.ajustes.objFecha;
  const ref = d => { const c = ps.filter(p => p.t <= u.t - d * DIA).pop(); return c && (u.t - c.t) <= d * DIA * 1.6 ? c : null; };
  const chip = (lab, r) => { if (!r) return ''; const dif = redondea(u.kg - r.kg, 1), bien = obj ? (obj < u.kg ? dif <= 0 : dif >= 0) : dif <= 0;
    return `<span class="dchip ${dif === 0 ? '' : bien ? 'bien' : 'mal'}">${dif > 0 ? '▲' : dif < 0 ? '▼' : '='} ${fmtN(Math.abs(dif))} kg <small>${lab}</small></span>`; };
  const hace = Math.round((new Date().setHours(0, 0, 0, 0) - u.t) / DIA);
  let objHtml = '';
  if (obj) {
    const ini = F.ajustes.objIni || Math.max(...ps.filter(p => p.t >= u.t - 120 * DIA).map(p => p.kg)), tot = ini - obj, pc = tot ? Math.max(0, Math.min(100, (ini - u.kg) / tot * 100)) : 100;
    let ritmo = ''; if (ff) { const sem = (deISO(ff) - Date.now()) / (7 * DIA); ritmo = sem > 0 ? `necesitas ${fmtN(redondea((u.kg - obj) / sem, 2))} kg/semana hasta el ${fDia(deISO(ff))}` : 'la fecha del objetivo ya pasó'; }
    objHtml = `<div class="objbar"><div class="row small"><span class="muted">${fmtN(ini)} kg</span><span class="sp"></span><b>${(u.kg - obj) * Math.sign(tot || 1) > 0 ? 'Faltan ' + fmtN(redondea(Math.abs(u.kg - obj), 1)) + ' kg' : '¡Objetivo conseguido! 🏆'}</b><span class="sp"></span><span class="muted">🎯 ${fmtN(obj)} kg</span></div>
      <div class="barra gruesa"><i style="width:${pc}%"></i></div><div class="faint small" style="margin-top:4px">${Math.round(pc)}% del camino${ritmo ? ' · ' + ritmo : ''}</div></div>`;
  }
  return `<div class="card peso"><div class="row" style="align-items:flex-start"><div style="flex:1"><span class="muted small">Peso actual</span><div class="pbig">${fmtN(u.kg)}<small> kg</small></div>
    <span class="small ${hace > 7 ? 'aviso' : 'faint'}">${hace <= 0 ? 'pesado hoy' : hace === 1 ? 'pesado ayer' : 'último pesaje hace ' + hace + ' días'}${hace > 7 ? ' · ¡pésate!' : ''}</span></div>
    <div class="dchips">${chip('7 días', ref(7))}${chip('30 días', ref(30))}${chip('90 días', ref(90))}</div></div>
    ${objHtml}${compacto ? '' : graficaPro({ key: 'peso', puntos: ps.map(p => ({ t: p.t, v: p.kg })), unidad: ' kg', objetivo: obj || null, media: true, rangoDef: 182 })}
    <div class="row btnrow" style="margin-top:12px"><button class="btn sm primary" data-act="cPeso">＋ Peso</button>${compacto ? '<button class="btn sm" data-act="irProg">📈 Gráfica</button>' : `<button class="btn sm" data-act="cPesos">Todos (${ps.length})</button>`}<button class="btn sm" data-act="objEdit">🎯 ${obj ? 'Objetivo' : 'Poner objetivo'}</button></div></div>`;
}

// ---- datos por día ----
const entrenosDia = f => { const t0 = deISO(f); return F.entrenos.filter(w => w.ini >= t0 && w.ini < t0 + DIA); };
function estadoDieta(f) {
  const its = itemsDia(f); if (!its.length) return '';
  const t = suma(its), o = objetivo(); if (!o.k) return 'ok';
  const dk = Math.abs(t.k - o.k) / o.k, okP = !o.p || t.p >= o.p * 0.9;
  return dk <= 0.1 && okP ? 'ok' : dk <= 0.2 ? 'meh' : 'mal';
}

// ---- Progreso: pestañas ----
let progTab = lsGet('jp-fit-prog', 'objetivos'), calModo = 'mes', calRef = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); })();
function vProgreso() {
  const seg = `<div class="seg">${[['objetivos', '🎯 Objetivos'], ['calendario', '📅 Calendario'], ['ejercicios', '🏋️ Ejercicios']].map(([k, n]) => `<button data-act="progTab" data-t="${k}" class="${progTab === k ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  return seg + (progTab === 'calendario' ? vCalendario() : progTab === 'ejercicios' ? vEjercicios() : vObjetivos());
}
function vCuerpo() { return `<div class="sec" style="margin-top:4px"><h2>Peso</h2></div>${cardPeso(false)}<div class="sec"><h2>Descanso y actividad</h2></div>${cardSalud()}`; }
function vObjetivos() {
  const a = F.ajustes, hoy = new Date(), m0 = new Date(hoy.getFullYear(), hoy.getMonth(), 1).getTime();
  const semanas = [...Array(8)].map((_, i) => { const l = lunes(Date.now()) - (7 - i) * 7 * DIA; const n = F.entrenos.filter(w => w.ini >= l && w.ini < l + 7 * DIA).length; const d = new Date(l); return { lab: d.getDate() + '/' + (d.getMonth() + 1), v: n, hoy: i === 7 }; });
  const delMes = F.entrenos.filter(w => w.ini >= m0), diasMes = hoy.getDate(), esperados = Math.round((a.objSemana || 4) * diasMes / 7);
  const fechas = [...Array(diasMes)].map((_, i) => fISO(m0 + i * DIA + 3600e3)), est = fechas.map(estadoDieta);
  const reg = est.filter(Boolean).length, okD = est.filter(e => e === 'ok').length;
  const ult7 = [...Array(7)].map((_, i) => fISO(Date.now() - (6 - i) * DIA)).filter(f => itemsDia(f).length).map(f => suma(itemsDia(f)));
  const med = k => ult7.length ? r0(ult7.reduce((s, t) => s + t[k], 0) / ult7.length) : null, o = objetivo();
  return `<div class="card meta" data-act="objEdit"><span class="muted small">Mi objetivo</span><h2>${esc(a.meta || 'Toca para escribir tu objetivo (p. ej. «Estar definido en enero»)')}</h2>
    ${a.objFecha ? `<span class="pill">📅 ${fDia(deISO(a.objFecha))} · quedan ${Math.max(0, Math.ceil((deISO(a.objFecha) - Date.now()) / DIA))} días</span>` : ''}</div>
  <div class="sec"><h2>Tu semana</h2></div>${cardRitmo()}<div style="height:10px"></div>${cardSemana()}
  <div class="sec"><h2>Entrenos</h2><span class="sp"></span><span class="muted small">objetivo ${a.objSemana || 4}/semana</span></div>
  <div class="card"><div class="grid3"><div><b class="nb">${delMes.length}</b><span class="muted small">este mes (de ~${esperados})</span></div><div><b class="nb">${racha()}</b><span class="muted small">semanas cumpliendo</span></div><div><b class="nb">${semanaActual().length}/${a.objSemana || 4}</b><span class="muted small">esta semana</span></div></div>
    <div style="margin-top:10px">${barras(semanas, a.objSemana || 4)}</div><p class="faint small" style="margin:2px 0 0">Entrenos por semana (últimas 8). La línea es tu objetivo.</p></div>
  <div class="sec"><h2>Comida</h2><span class="sp"></span><span class="muted small">este mes</span></div>
  <div class="card"><div class="grid3"><div><b class="nb">${reg}/${diasMes}</b><span class="muted small">días apuntados</span></div><div><b class="nb">${okD}</b><span class="muted small">días en objetivo</span></div><div><b class="nb">${med('p') ?? '—'}</b><span class="muted small">proteína media 7 d (obj. ${r0(o.p)})</span></div></div>
    ${ult7.length ? `<p class="small muted" style="margin:10px 0 0">Media últimos días apuntados: <b>${fmtN(med('k'))} kcal</b> de ${fmtN(r0(o.k))}.</p>` : '<p class="small muted" style="margin:10px 0 0">Empieza a apuntar tus comidas en la pestaña Comida para ver aquí tu cumplimiento.</p>'}</div>`;
}
function vCalendario() {
  const d = new Date(calRef), y = d.getFullYear(), m = d.getMonth();
  const tog = `<div class="dianav"><button data-act="calNav" data-d="-1" aria-label="Anterior">‹</button><b>${calModo === 'mes' ? MESES[m].charAt(0).toUpperCase() + MESES[m].slice(1) + ' ' + y : y}</b><button data-act="calNav" data-d="1" aria-label="Siguiente">›</button></div>
   <div class="seg mini"><button data-act="calModo" data-m="mes" class="${calModo === 'mes' ? 'on' : ''}">Mes</button><button data-act="calModo" data-m="año" class="${calModo === 'año' ? 'on' : ''}">Año</button></div>`;
  if (calModo === 'año') {
    const vols = F.entrenos.map(volumen).sort((a, b) => a - b), q = p => vols[Math.floor(vols.length * p)] || 0, q1 = q(.33), q2 = q(.66);
    let tot = 0;
    const meses = [...Array(12)].map((_, mi) => { const p = new Date(y, mi, 1), off = (p.getDay() + 6) % 7, nd = new Date(y, mi + 1, 0).getDate(); let n = 0;
      const celdas = [...Array(off)].map(() => '<i class="v"></i>').join('') + [...Array(nd)].map((_, i) => { const f = fISO(new Date(y, mi, i + 1).getTime()), ws = entrenosDia(f); n += ws.length;
        const v = ws.reduce((s, w) => s + volumen(w), 0); return `<i class="${ws.length ? (v > q2 ? 'n3' : v > q1 ? 'n2' : 'n1') : ''} ${f === fISO(Date.now()) ? 'hoy' : ''}"></i>`; }).join('');
      tot += n; return `<button class="mm" data-act="calMes" data-m="${mi}"><b>${MESES[mi].slice(0, 3)}</b><span class="faint small">${n || ''}</span><div class="mmg">${celdas}</div></button>`; }).join('');
    return tog + `<p class="muted small" style="text-align:center;margin:4px 0 10px">${tot} entrenos en ${y}</p><div class="anio">${meses}</div><div class="leyenda"><span><i class="n1"></i>poco volumen</span><span><i class="n2"></i>medio</span><span><i class="n3"></i>mucho</span></div>`;
  }
  const off = (new Date(y, m, 1).getDay() + 6) % 7, nd = new Date(y, m + 1, 0).getDate(), hoyF = fISO(Date.now());
  let ent = 0, vol = 0, dOk = 0, dReg = 0; const pesosMes = [];
  const celdas = [...Array(off)].map(() => '<span></span>').join('') + [...Array(nd)].map((_, i) => {
    const f = fISO(new Date(y, m, i + 1).getTime()), ws = entrenosDia(f), ed = estadoDieta(f), kg = F.pesos[f];
    ent += ws.length; vol += ws.reduce((s, w) => s + volumen(w), 0); if (ed) dReg++; if (ed === 'ok') dOk++; if (kg) pesosMes.push(kg);
    const ic = ws.length ? (/pierna|leg/i.test(ws[0].t + (F.rutinas.find(r => r.id === ws[0].rut)?.nombre || '')) ? '🦵' : '💪') : '';
    return `<button class="cd ${ws.length ? 'tr' : ''} ${f === hoyF ? 'hoy' : ''} ${f > hoyF ? 'fut' : ''}" data-act="calDia" data-f="${f}"><span class="dn">${i + 1}</span><span class="ic">${ic}</span><span class="cb ${ed}"></span>${kg ? '<span class="pd" title="Peso apuntado"></span>' : ''}</button>`; }).join('');
  return tog + `<div class="cal"><div class="cdh">${'LMXJVSD'.split('').map(x => `<span>${x}</span>`).join('')}</div><div class="cdg">${celdas}</div></div>
   <div class="leyenda"><span><i class="tr"></i>entreno</span><span><i class="ok"></i>dieta en objetivo</span><span><i class="meh"></i>cerca</span><span><i class="mal"></i>lejos</span><span><i class="pd"></i>peso</span></div>
   <div class="grid3" style="margin-top:12px"><div class="stat"><b>${ent}</b><span>Entrenos</span></div><div class="stat"><b>${vol >= 1000 ? fmtN(redondea(vol / 1000, 1)) + ' t' : fmtN(r0(vol)) + ' kg'}</b><span>Volumen</span></div>
   <div class="stat"><b>${dOk}/${dReg || 0}</b><span>Días dieta OK</span></div></div>
   ${pesosMes.length > 1 ? `<p class="muted small" style="text-align:center;margin-top:10px">Peso del mes: ${fmtN(pesosMes[0])} → ${fmtN(pesosMes[pesosMes.length - 1])} kg</p>` : ''}`;
}
function hojaDia(f) {
  const ws = entrenosDia(f), kg = F.pesos[f], its = itemsDia(f);
  const sa = F.salud[f] || {};
  hoja(`<h2>${fDia(deISO(f))}</h2>${kg ? `<p class="muted">⚖️ ${fmtN(kg)} kg</p>` : ''}${sa.sueno != null || sa.pasos != null ? `<p class="muted">😴 ${hDec(sa.sueno)} · 👟 ${fmtN(sa.pasos || 0)} pasos${sa.kcal ? ' · 🔥 ' + fmtN(Math.round(sa.kcal)) + ' kcal activas' : ''}</p>` : ''}
   <div class="sec" style="margin-top:6px"><h2>Entreno</h2></div>${ws.map(cardEntreno).join('<div style="height:8px"></div>') || '<p class="faint small">Sin entreno este día.</p>'}
   <div class="sec"><h2>Comida</h2></div>${its.length ? resumenMacros(f) : '<p class="faint small">No apuntaste comida este día.</p>'}
   <button class="btn" style="width:100%;margin-top:10px" data-act="calComida" data-f="${f}">🥗 Ver / apuntar la comida de este día</button>`);
}
function hojaObjetivos() {
  const a = F.ajustes;
  hoja(`<h2>Mis objetivos</h2><label>Mi objetivo en una frase</label><input type="text" id="oMeta" value="${esc(a.meta || '')}" placeholder="Estar definido para enero">
   <div class="f2"><div><label>Peso objetivo (kg)</label><input type="number" inputmode="decimal" id="oPeso" value="${a.objPeso || ''}"></div><div><label>Para el día</label><input type="date" id="oFecha" value="${a.objFecha || ''}"></div>
   <div><label>Peso de partida (kg)</label><input type="number" inputmode="decimal" id="oIni" value="${a.objIni || ''}" placeholder="auto"></div><div><label>Entrenos por semana</label><input type="number" id="oSem" min="1" max="7" value="${a.objSemana || 4}"></div></div>
   <p class="faint small">Las kcal y macros diarios se cambian en Comida → Mi dieta y objetivos.</p>
   <button class="btn primary big" style="margin-top:10px" data-act="objOk">Guardar objetivos</button>`);
}

// ---- lista de la compra ----
// ---- LISTA DE LA COMPRA (pestaña propia): en casa marcas lo que falta → en el súper lo vas metiendo en el carro ----
const CATS = ['Desayuno', 'Comida', 'Merienda', 'Cena', 'Snacks y postres', 'Bebidas', 'Casa y limpieza', 'Otros'];
const CAT_IC = { Desayuno: '🥣', Comida: '🍝', Merienda: '🍌', Cena: '🍳', 'Snacks y postres': '🍮', Bebidas: '🥤', 'Casa y limpieza': '🧽', Otros: '🛍️' };
function alimsDeComida(cm) { const ids = []; for (const g of cm.grupos) for (const o of g.opciones) for (const it of o.items) if (!ids.includes(it.a)) ids.push(it.a); return ids.map(alim).filter(Boolean); }
function catalogoCompra() {
  const m = new Map(CATS.map(c => [c, []])), vistos = new Set();
  for (const a of F.alimentos) if (a.compra) { (m.get(a.compra) || m.get('Otros')).push(a); vistos.add(a.id); }
  for (const cm of F.dieta.comidas || []) for (const a of alimsDeComida(cm)) if (!vistos.has(a.id)) { vistos.add(a.id); (m.get(cm.nombre) || m.get('Otros')).push(a); }
  return [...m].filter(([, l]) => l.length).map(([cat, items]) => ({ cat, items }));
}
let kModo = lsGet('jp-fit-kmodo', 'casa'), kAgr = lsGet('jp-fit-kagr', 'cat'), kFiltro = '';
function repinta() { const y = scrollY; pinta(); scrollTo(0, y); }
function filaCompra(a, modo) {
  const falta = !!F.compra.falta?.[a.id], comp = !!F.compra.comprado?.[a.id], on = modo === 'casa' ? falta : comp;
  return `<div class="kit ${modo === 'casa' ? 'falta' : ''} ${on ? 'ok' : ''}" data-n="${esc(norm(a.n + ' ' + (a.marca || '') + ' ' + (a.super || '')))}">
    <button class="kmain" data-act="${modo === 'casa' ? 'kFalta' : 'kComp'}" data-id="${a.id}"><span class="ck">${on ? (modo === 'casa' ? '!' : '✓') : ''}</span>
    <span class="n">${esc(a.n)}${a.marca ? ` <small class="faint">${esc(a.marca)}</small>` : ''}</span>${a.super ? `<span class="sup">${esc(a.super)}</span>` : ''}${modo === 'casa' && falta ? '<span class="ftag">Falta</span>' : ''}</button>
    <button class="kmas" data-act="kEdit" data-id="${a.id}" aria-label="Editar producto">⋯</button></div>`;
}
function vCompra() {
  const cat = catalogoCompra(), falta = F.compra.falta || {}, comp = F.compra.comprado || {}, ex = F.compra.extra || [];
  const todos = cat.flatMap(c => c.items), fl = todos.filter(a => falta[a.id]), nF = fl.length + ex.length, nC = fl.filter(a => comp[a.id]).length + ex.filter(e => e.ok).length;
  const pc = nF ? Math.round(nC / nF * 100) : 0;
  let cuerpo = '';
  if (kModo === 'casa') {
    cuerpo = `<p class="muted small" style="margin:4px 0 2px">Repasa la despensa y toca lo que <b>te falta</b>. Lo marcado pasa a «Comprar».</p>` +
      cat.map(({ cat: c, items }) => `<div class="kcat"><span>${CAT_IC[c] || '🛍️'} ${esc(c)}</span><span class="faint">${items.filter(a => falta[a.id]).length}/${items.length}</span></div><div class="card klist">${items.map(a => filaCompra(a, 'casa')).join('')}</div>`).join('');
  } else if (!nF) {
    cuerpo = `<div class="empty">🧺 No te falta nada.<br>Pasa por «En casa» y marca lo que se ha acabado.</div>`;
  } else {
    const grupos = kAgr === 'super' ? Object.entries(fl.reduce((o, a) => ((o[a.super || 'Sin súper'] ||= []).push(a), o), {})).map(([s, l]) => ({ t: '🏪 ' + s, l }))
      : cat.map(({ cat: c, items }) => ({ t: (CAT_IC[c] || '🛍️') + ' ' + c, l: items.filter(a => falta[a.id]) })).filter(g => g.l.length);
    cuerpo = `<div class="seg mini" style="max-width:260px;margin:6px auto 4px"><button data-act="kAgr" data-a="cat" class="${kAgr === 'cat' ? 'on' : ''}">Por comida</button><button data-act="kAgr" data-a="super" class="${kAgr === 'super' ? 'on' : ''}">Por súper</button></div>` +
      grupos.map(g => `<div class="kcat"><span>${esc(g.t)}</span><span class="faint">${g.l.filter(a => comp[a.id]).length}/${g.l.length}</span></div><div class="card klist">${g.l.map(a => filaCompra(a, 'comprar')).join('')}</div>`).join('') +
      (ex.length ? `<div class="kcat"><span>📝 Otras cosas</span></div><div class="card klist">${ex.map((e, i) => `<div class="kit ${e.ok ? 'ok' : ''}"><button class="kmain" data-act="kExOk" data-i="${i}"><span class="ck">${e.ok ? '✓' : ''}</span><span class="n">${esc(e.n)}</span></button><button class="kmas" data-act="kExDel" data-i="${i}" aria-label="Quitar">✕</button></div>`).join('')}</div>` : '') +
      `<button class="btn primary big" style="margin-top:16px" data-act="kFin">✅ Compra hecha</button><p class="faint small" style="text-align:center;margin-top:6px">Quita lo que has metido en el carro; lo demás se queda para la próxima.</p>`;
  }
  return `<div class="card khead"><div class="row"><div style="flex:1"><span class="muted small">Lista de la compra</span><div class="kbig">${nF ? nF - nC : 0}<small> por comprar</small></div></div>
     <div class="row btnrow" style="justify-content:flex-end"><button class="btn sm primary" data-act="kProd">＋ Producto</button><button class="btn sm" data-act="kCopiar" ${nF ? '' : 'disabled'}>Copiar</button></div></div>
     ${nF ? `<div class="barra gruesa" style="margin-top:10px"><i style="width:${pc}%"></i></div><div class="faint small" style="margin-top:4px">${nC} de ${nF} en el carro</div>` : ''}</div>
   <div class="seg" style="margin-top:12px"><button data-act="kModo" data-m="casa" class="${kModo === 'casa' ? 'on' : ''}">🏠 En casa</button><button data-act="kModo" data-m="comprar" class="${kModo === 'comprar' ? 'on' : ''}">🛒 Comprar${nF ? ` (${nF - nC})` : ''}</button></div>
   <input class="buscar" id="kQ" placeholder="Buscar producto…" value="${esc(kFiltro)}" autocomplete="off">
   ${cuerpo}
   <div class="row" style="margin-top:14px"><input type="text" class="buscar" id="kNuevo" placeholder="Apuntar algo rápido (papel, café…)" style="flex:1"><button class="btn primary" data-act="kExAdd">Añadir</button></div>`;
}
function filtraCompra() { const f = norm(kFiltro); document.querySelectorAll('.klist .kit[data-n]').forEach(r => { r.hidden = !!f && !r.dataset.n.includes(f); }); }
let compraT = null;
function guardaCompra() { clearTimeout(compraT); compraT = setTimeout(() => setDoc(fitRef('compra'), F.compra).catch(e => toast('No se pudo guardar: ' + (e.code || e.message))), 500); }
document.addEventListener('input', ev => { if (ev.target.id === 'kQ') { kFiltro = ev.target.value; filtraCompra(); } });
document.addEventListener('keydown', ev => { if (ev.target.id === 'kNuevo' && ev.key === 'Enter') document.querySelector('[data-act=kExAdd]')?.click(); });

document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-act]'); if (!b) return;
  switch (b.dataset.act) {
    case 'rango': rangos[b.dataset.key] = +b.dataset.d; lsSet('jp-fit-rangos', rangos); if (!$('#sheet').hidden && hojaCtx?.tipo === 'ej') return verEjercicio(hojaCtx.k); return pinta();
    case 'irProg': return ir('cuerpo');
    case 'progTab': progTab = b.dataset.t; lsSet('jp-fit-prog', progTab); return pinta();
    case 'calModo': calModo = b.dataset.m; return pinta();
    case 'calNav': { const d = new Date(calRef); calRef = calModo === 'mes' ? new Date(d.getFullYear(), d.getMonth() + (+b.dataset.d), 1).getTime() : new Date(d.getFullYear() + (+b.dataset.d), d.getMonth(), 1).getTime(); return pinta(); }
    case 'calMes': { const d = new Date(calRef); calRef = new Date(d.getFullYear(), +b.dataset.m, 1).getTime(); calModo = 'mes'; return pinta(); }
    case 'calDia': return hojaDia(b.dataset.f);
    case 'calComida': diaSel = b.dataset.f; cierraHoja(); return ir('comida');
    case 'objEdit': return hojaObjetivos();
    case 'objOk': { const a = F.ajustes; a.meta = $('#oMeta').value.trim(); a.objPeso = num($('#oPeso').value); a.objFecha = $('#oFecha').value || null; a.objIni = num($('#oIni').value); a.objSemana = Math.max(1, Math.min(7, parseInt($('#oSem').value) || 4));
      guardaPerfil(0); cierraHoja(); pinta(); return toast('Objetivos guardados'); }
    case 'kAbrir': return ir('compra');
    case 'kModo': kModo = b.dataset.m; lsSet('jp-fit-kmodo', kModo); return repinta();
    case 'kAgr': kAgr = b.dataset.a; lsSet('jp-fit-kagr', kAgr); return repinta();
    case 'kFalta': { const f = F.compra.falta ||= {}; if (f[b.dataset.id]) { delete f[b.dataset.id]; delete (F.compra.comprado || {})[b.dataset.id]; } else f[b.dataset.id] = true; guardaCompra(); repinta(); return filtraCompra(); }
    case 'kComp': { const c = F.compra.comprado ||= {}; c[b.dataset.id] = !c[b.dataset.id]; guardaCompra(); repinta(); return filtraCompra(); }
    case 'kExOk': F.compra.extra[+b.dataset.i].ok = !F.compra.extra[+b.dataset.i].ok; guardaCompra(); return repinta();
    case 'kExDel': F.compra.extra.splice(+b.dataset.i, 1); guardaCompra(); return repinta();
    case 'kExAdd': { const n = $('#kNuevo').value.trim(); if (!n) return $('#kNuevo').focus(); (F.compra.extra ||= []).push({ n, ok: false }); guardaCompra(); toast('Añadido a «Comprar»'); return repinta(); }
    case 'kProd': hojaCtx = { tipo: 'compraProd' }; return hojaAlimento(null);
    case 'kEdit': hojaCtx = { tipo: 'compraProd' }; return hojaAlimento(b.dataset.id);
    case 'kFin': { const c = F.compra.comprado || {}; for (const id of Object.keys(c)) if (c[id]) delete F.compra.falta[id]; F.compra.comprado = {}; F.compra.extra = (F.compra.extra || []).filter(e => !e.ok);
      guardaCompra(); toast('¡Compra hecha! 🛒'); scrollTo(0, 0); return pinta(); }
    case 'kCopiar': { const falta = F.compra.falta || {}, comp = F.compra.comprado || {};
      const txt = '🛒 Lista de la compra\n' + catalogoCompra().map(({ cat: c, items }) => { const l = items.filter(a => falta[a.id] && !comp[a.id]); return l.length ? `\n${c}\n` + l.map(a => '- ' + a.n + (a.super ? ` (${a.super})` : '')).join('\n') : ''; }).join('') +
        ((F.compra.extra || []).filter(e => !e.ok).length ? '\n\nOtras cosas\n' + F.compra.extra.filter(e => !e.ok).map(e => '- ' + e.n).join('\n') : '');
      try { await navigator.clipboard.writeText(txt); toast('Lista copiada: pégala en WhatsApp o Notas'); } catch (e) { toast('No pude copiar'); } return; }
  }
});


// ================= SALUD (Apple Watch vía Atajo → puente) Y RESUMEN SEMANAL =================
// El Atajo del iPhone llama al puente: ?a=fitsalud&pasos=…&sueno=…&kcal=…&fc=…  (se guarda en tu Apps Script, no en la app)
// La app lee ?a=fitsaludver y manda cada rato el resumen de la semana (?a=fitsemana) para el email de los domingos.
let BR = null; F.salud = {};
const OBJ_SUENO = 7.5, OBJ_PASOS = 8000;
async function puente(params, cuerpo) {
  if (!BR) throw new Error('sin puente');
  const r = cuerpo ? await fetch(BR, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(cuerpo), redirect: 'follow' })
    : await fetch(BR + '?' + new URLSearchParams({ ...params, _t: Date.now() }), { redirect: 'follow', cache: 'no-store' });
  if (!r.ok) throw new Error('puente ' + r.status); const j = await r.json(); if (j.error) throw new Error(j.error); return j;
}
let saludAt = 0;
async function cargaSalud(forzar) {
  if (!BR || (!forzar && Date.now() - saludAt < 5 * 60e3)) return; saludAt = Date.now();
  try { const j = await puente({ a: 'fitsaludver', desde: fISO(Date.now() - 120 * DIA) }); F.salud = j.dias || {}; F.saludOk = true; if (listo && $('#wo').hidden && $('#sheet').hidden) pinta(); }
  catch (e) { F.saludOk = false; F.saludErr = e.message; }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) { cargaSalud(); mandaSemana(); } });
const hDec = h => h == null ? '—' : Math.floor(h) + ' h ' + String(Math.round((h % 1) * 60)).padStart(2, '0');
function cardSalud() {
  const hoy = fISO(Date.now()), ay = fISO(Date.now() - DIA), sH = F.salud[hoy] || {}, sA = F.salud[ay] || {};
  const dias = [...Array(7)].map((_, i) => fISO(Date.now() - (6 - i) * DIA)), any = dias.some(f => F.salud[f]);
  if (!any) return `<div class="card"><div class="row"><span style="font-size:26px">⌚️</span><div style="flex:1"><b>Conecta tu Apple Watch</b><div class="muted small">Sueño, pasos y calorías de la app Salud, cada día y sin tocar nada.</div></div></div>
    <div class="row btnrow" style="margin-top:10px"><button class="btn sm primary" data-act="sGuia">Cómo conectarlo</button><button class="btn sm" data-act="sMano">Apuntar a mano</button></div></div>`;
  const sueno = sH.sueno ?? null, pasosHoy = sH.pasos ?? null, pasosAy = sA.pasos ?? null;
  const media = k => { const v = dias.map(f => F.salud[f]?.[k]).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const barSu = barras(dias.map(f => ({ lab: 'LMXJVSD'[(new Date(deISO(f)).getDay() + 6) % 7], v: F.salud[f]?.sueno != null ? redondea(F.salud[f].sueno, 1) : 0, hoy: f === hoy })), OBJ_SUENO, 100);
  const barPa = barras(dias.map(f => ({ lab: 'LMXJVSD'[(new Date(deISO(f)).getDay() + 6) % 7], v: F.salud[f]?.pasos != null ? Math.round(F.salud[f].pasos / 100) / 10 : 0, hoy: f === hoy })), OBJ_PASOS / 1000, 100);
  return `<div class="card"><div class="grid3"><div><span class="muted small">😴 Sueño anoche</span><b class="nb ${sueno != null && sueno < 7 ? 'malc' : ''}">${hDec(sueno)}</b><span class="faint small">media 7 d ${hDec(media('sueno'))}</span></div>
    <div><span class="muted small">👟 Pasos ${pasosHoy != null ? 'hoy' : 'ayer'}</span><b class="nb">${fmtN(pasosHoy ?? pasosAy ?? 0)}</b><span class="faint small">media ${fmtN(Math.round(media('pasos') || 0))}</span></div>
    <div><span class="muted small">🔥 Kcal activas</span><b class="nb">${fmtN(Math.round((sH.kcal ?? sA.kcal) || 0)) || '—'}</b><span class="faint small">${sH.fc ? 'FC reposo ' + Math.round(sH.fc) : (sH.kcal != null ? 'hoy' : 'ayer')}</span></div></div>
    <div class="f2" style="margin-top:10px"><div><span class="faint small">Sueño (h) · objetivo ${OBJ_SUENO}</span>${barSu}</div><div><span class="faint small">Pasos (miles) · objetivo ${OBJ_PASOS / 1000}</span>${barPa}</div></div>
    <div class="row btnrow" style="margin-top:6px"><button class="btn sm" data-act="sMano">Apuntar a mano</button><button class="btn sm ghost" data-act="sGuia">⌚️ Atajo</button></div></div>`;
}
function hojaGuia() {
  const url = BR ? BR + '?a=fitsalud' : '(abre antes el Organizador y conecta el puente de Google)';
  hoja(`<h2>⌚️ Apple Watch → JP Fitness</h2>
  <p class="muted small">Un <b>Atajo</b> del iPhone lee la app Salud cada noche y lo manda a tu puente de Google. Gratis y sin cuentas nuevas. Se monta una vez (5 min):</p>
  <ol class="guia">
   <li>Abre <b>Atajos</b> → pestaña <b>Automatización</b> → <b>＋</b> → <b>Hora del día</b>: <b>21:30</b>, <b>Diariamente</b>, <b>Ejecutar inmediatamente</b> → Siguiente → <b>Nuevo atajo en blanco</b>.</li>
   <li>Añade <b>Buscar muestras de salud</b>: Tipo <b>Pasos</b>, filtro <b>Fecha de inicio · es hoy</b>. Luego <b>Calcular estadísticas</b> → <b>Suma</b>. Renómbralo «Pasos» (mantén pulsado → Renombrar).</li>
   <li>Otra vez <b>Buscar muestras de salud</b>: Tipo <b>Análisis del sueño</b>, filtros <b>Fecha de finalización · es hoy</b>, <b>Valor · no es · En cama</b> y <b>Valor · no es · Despierto</b>. Añade <b>Obtener detalles de muestras de salud</b> → <b>Duración</b>, y <b>Calcular estadísticas</b> → <b>Suma</b>. Renómbralo «Sueño».</li>
   <li>(Opcional) Igual con <b>Energía activa</b> (es hoy → Suma) como «Kcal» y <b>Frecuencia cardiaca en reposo</b> (es hoy → Media) como «FC».</li>
   <li>Añade <b>Obtener contenido de URL</b> y pega la dirección de abajo. Toca cada <b>…=</b> del final y mete la variable que toca (Pasos, Sueño, Kcal, FC).</li>
   <li>Pulsa ▶︎ para probar: debe salir <b>{"ok":true…}</b>. Desde ese momento se envía solo cada noche.</li>
  </ol>
  <label>Dirección para el Atajo (es tu llave: no la compartas)</label>
  <div class="row"><input type="text" readonly value="${esc(url)}&pasos=&sueno=&kcal=&fc=" id="sUrl" style="flex:1"><button class="btn sm primary" data-act="sCopia">Copiar</button></div>
  <p class="faint small">El sueño puede llegar en horas, minutos o «7:32»: el puente lo entiende igual. Si un día falla, apúntalo a mano.</p>`);
}
function hojaMano() {
  const f = fISO(Date.now()), s = F.salud[f] || {};
  hoja(`<h2>Apuntar sueño y pasos</h2><label>Día</label><input type="date" id="mF" value="${f}">
   <div class="f2"><div><label>Sueño (horas, p. ej. 7,5)</label><input type="number" inputmode="decimal" id="mS" value="${s.sueno ?? ''}"></div><div><label>Pasos</label><input type="number" inputmode="numeric" id="mP" value="${s.pasos ?? ''}"></div>
   <div><label>Kcal activas</label><input type="number" inputmode="numeric" id="mK" value="${s.kcal ?? ''}"></div><div><label>FC en reposo</label><input type="number" inputmode="numeric" id="mC" value="${s.fc ?? ''}"></div></div>
   <button class="btn primary big" style="margin-top:12px" data-act="sManoOk">Guardar</button>`);
}

// ---- resumen de la semana (lo usa la app y el email del domingo) ----
function estancados(keys) {
  const out = [];
  for (const k of keys) { const h = historialDe(k).slice(0, 4); if (h.length < 4) continue;
    const best = o => Math.max(0, ...seriesBuenas(o.e).map(s => e1rm(s.kg, s.r) || (s.r || 0)));
    if (best(h[0]) <= best(h[3]) + 0.01) out.push(nombreDe(h[0].e)); }
  return out;
}
function resumenSemana(ref = Date.now()) {
  const l = lunes(ref), fin = l + 7 * DIA, hoyF = fISO(Date.now()), obj = F.ajustes.objSemana || 4;
  const ws = F.entrenos.filter(w => w.ini >= l && w.ini < fin), prev = F.entrenos.filter(w => w.ini >= l - 7 * DIA && w.ini < l);
  const vol = ws.reduce((s, w) => s + volumen(w), 0), volPrev = prev.reduce((s, w) => s + volumen(w), 0);
  const prs = [...new Set(ws.flatMap(w => w.prs || []))];
  const dias = [...Array(7)].map((_, i) => fISO(l + i * DIA + 3600e3)).filter(f => f <= hoyF);
  const reg = dias.filter(f => itemsDia(f).length), tots = reg.map(f => suma(itemsDia(f))), o = objetivo();
  const kMed = tots.length ? r0(tots.reduce((s, t) => s + t.k, 0) / tots.length) : null, pMed = tots.length ? r0(tots.reduce((s, t) => s + t.p, 0) / tots.length) : null;
  const okD = dias.filter(f => estadoDieta(f) === 'ok').length;
  const ps = pesosOrden(), pesoFin = ps.filter(p => p.t < fin).pop(), pesoIni = ps.filter(p => p.t < l).pop(), pesSem = ps.filter(p => p.t >= l && p.t < fin);
  const sal = dias.map(f => F.salud[f]).filter(Boolean), med = k => { const v = sal.map(s => s[k]).filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const sueno = med('sueno'), pasos = med('pasos');
  const bien = [], fallos = [], consejos = [];
  if (ws.length >= obj) bien.push(`Objetivo de entrenos cumplido: ${ws.length}/${obj}.`); else fallos.push(`Entrenaste ${ws.length} de ${obj} días.`);
  if (prs.length) bien.push(`${prs.length} récord${prs.length > 1 ? 's' : ''}: ${prs.slice(0, 5).join(', ')}.`);
  if (volPrev && vol > volPrev * 1.05) bien.push(`Volumen +${Math.round((vol / volPrev - 1) * 100)}% respecto a la semana pasada.`);
  else if (volPrev && vol < volPrev * 0.9) fallos.push(`Volumen −${Math.round((1 - vol / volPrev) * 100)}% respecto a la semana pasada.`);
  if (reg.length < dias.length) fallos.push(`Apuntaste la comida ${reg.length} de ${dias.length} días.`); else if (dias.length) bien.push('Apuntaste la comida todos los días.');
  if (pMed != null && o.p) { if (pMed < o.p * 0.9) fallos.push(`Proteína media ${pMed} g (objetivo ${r0(o.p)} g).`); else bien.push(`Proteína en objetivo: ${pMed} g de media.`); }
  if (kMed != null && o.k) { if (kMed > o.k * 1.1) fallos.push(`Te pasaste de kcal: ${fmtN(kMed)} de media (objetivo ${fmtN(r0(o.k))}).`); else if (kMed < o.k * 0.8) fallos.push(`Comiste poco: ${fmtN(kMed)} kcal de media (objetivo ${fmtN(r0(o.k))}).`); else bien.push(`Kcal en su sitio: ${fmtN(kMed)} de media.`); }
  if (sueno != null) { if (sueno < 7) fallos.push(`Duermes poco: ${hDec(sueno)} de media.`); else bien.push(`Buen descanso: ${hDec(sueno)} de media.`); }
  if (pasos != null) { if (pasos < OBJ_PASOS) fallos.push(`Pasos bajos: ${fmtN(Math.round(pasos))} al día.`); else bien.push(`${fmtN(Math.round(pasos))} pasos al día de media.`); }
  if (!pesSem.length) fallos.push('No te has pesado esta semana.');
  else if (pesoIni && pesoFin) { const d = redondea(pesoFin.kg - pesoIni.kg, 1), objP = F.ajustes.objPeso;
    if (objP) ((objP < pesoFin.kg ? d < 0 : d > 0) ? bien : fallos).push(`Peso ${d > 0 ? '+' : ''}${fmtN(d)} kg (${fmtN(pesoFin.kg)} kg).`); }
  const est = estancados([...new Set(ws.flatMap(w => w.ej.map(keyOf)))]);
  if (est.length) consejos.push(`Estancado en ${est.slice(0, 3).join(', ')}: sube 2,5 kg o 1-2 reps la próxima vez.`);
  if (ws.length < obj) consejos.push(`Agenda ya tus ${obj} entrenos de la semana que viene en el calendario.`);
  if (pMed != null && o.p && pMed < o.p * 0.9) consejos.push('Mete un batido o un queso batido extra para llegar a la proteína.');
  if (sueno != null && sueno < 7) consejos.push('Adelanta 30 min la hora de dormir: sin descanso no hay definición.');
  if (reg.length < dias.length) consejos.push('Apunta la comida justo al terminar de comer: «De mi dieta» son dos toques.');
  if (!consejos.length) consejos.push('Sigue así y sube un poco la exigencia: un kilo más o una serie más donde puedas.');
  const nota = fallos.length === 0 ? 'Semana de 10. Así se llega al objetivo. 🔥' : bien.length > fallos.length ? 'Buena semana, pero hay cosas que pulir. Ve a por ellas.' : 'Semana floja. Toca apretar: la constancia es lo que te va a definir. 💪';
  return { semana: fISO(l), hasta: fISO(fin - DIA), at: Date.now(), nota, meta: F.ajustes.meta || '',
    cifras: { entrenos: ws.length, obj, volumen: r0(vol), volPrev: r0(volPrev), prs: prs.length, comidaDias: reg.length, dias: dias.length, okDias: okD, kMed, pMed, kObj: r0(o.k), pObj: r0(o.p), pesoIni: pesoIni?.kg ?? null, pesoFin: pesoFin?.kg ?? null, objPeso: F.ajustes.objPeso || null, sueno: sueno != null ? redondea(sueno, 1) : null, pasos: pasos != null ? Math.round(pasos) : null },
    entrenos: ws.map(w => ({ t: w.t, dia: fDia(w.ini), min: Math.round(((w.fin || w.ini) - w.ini) / 60000), vol: r0(volumen(w)), prs: (w.prs || []).length })), bien, fallos, consejos };
}
function cardSemana() {
  const r = resumenSemana(), c = r.cifras;
  const li = (l, cls) => l.map(x => `<li class="${cls}">${esc(x)}</li>`).join('');
  return `<div class="card semres"><b>${esc(r.nota)}</b><p class="faint small" style="margin:2px 0 8px">Semana del ${fDia(deISO(r.semana))} · el domingo a las 22:00 te llega por email</p>
   <ul>${li(r.bien, 'ok')}${li(r.fallos, 'ko')}</ul>${r.consejos.length ? `<div class="dgrp">Para la semana que viene</div><ul>${li(r.consejos, 'tip')}</ul>` : ''}
   <div class="row btnrow" style="margin-top:8px"><button class="btn sm" data-act="sEmailYa">📧 Mandármelo ahora</button></div></div>`;
}
let semanaT = null;
function mandaSemana(forzar) {
  if (!BR || !listo) return; clearTimeout(semanaT);
  semanaT = setTimeout(async () => {
    const ult = +lsGet('jp-fit-semana-at', 0); if (forzar !== 'cambio' && !forzar && Date.now() - ult < 15 * 60e3) return;
    try { await puente(null, { a: 'fitsemana', resumen: resumenSemana() }); lsSet('jp-fit-semana-at', Date.now()); } catch (e) {}
  }, forzar === true ? 0 : 8000);
}
document.addEventListener('click', async ev => {
  const b = ev.target.closest('[data-act]'); if (!b) return;
  switch (b.dataset.act) {
    case 'sGuia': return hojaGuia();
    case 'sMano': return hojaMano();
    case 'sCopia': { const v = $('#sUrl').value; try { await navigator.clipboard.writeText(v); toast('Copiada. Pégala en «Obtener contenido de URL»'); } catch (e) { $('#sUrl').select(); toast('Selecciónala y cópiala'); } return; }
    case 'sManoOk': { const f = $('#mF').value || fISO(Date.now()), q = { a: 'fitsalud', fecha: f, sueno: $('#mS').value.replace(',', '.'), pasos: $('#mP').value, kcal: $('#mK').value, fc: $('#mC').value };
      try { await puente(q); } catch (e) { return toast('No pude guardar: ' + e.message, 5000); }
      F.salud[f] = { ...(F.salud[f] || {}), ...(q.sueno ? { sueno: +q.sueno } : {}), ...(q.pasos ? { pasos: +q.pasos } : {}), ...(q.kcal ? { kcal: +q.kcal } : {}), ...(q.fc ? { fc: +q.fc } : {}) };
      cierraHoja(); pinta(); return toast('Guardado'); }
    case 'sEmailYa': { if (!BR) return toast('Falta el puente de Google'); b.disabled = true; b.textContent = 'Enviando…';
      try { await puente(null, { a: 'fitsemana', resumen: resumenSemana() }); const j = await puente({ a: 'fitemail' }); toast(j.ok ? 'Email enviado: mira tu correo 📧' : 'No se pudo enviar', 5000); }
      catch (e) { toast('No se pudo: ' + e.message, 6000); } b.disabled = false; b.textContent = '📧 Mandármelo ahora'; return; }
  }
});

// ---------- login (igual que el Organizador) ----------
const gate = $('#gate'), gateMsg = $('#gateMsg'), gateBtn = $('#gateBtn');
const showGate = msg => { gate.classList.remove('loading'); gate.hidden = false; gateMsg.textContent = msg || ''; gateBtn.disabled = false; };
const ua = navigator.userAgent;
const esSafari = /iP(ad|hone|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) || (/Safari/.test(ua) && !/Chrome|CriOS|FxiOS|Edg|Android/.test(ua));
let gisTc = null;
if (esSafari) {
  const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
  s.onload = () => { gisTc = google.accounts.oauth2.initTokenClient({ client_id: '59642019941-05m7v8u7o9n22ch98kl6rb491oggn6l9.apps.googleusercontent.com', scope: 'openid email profile', hint: ALLOWED,
    callback: async r => { if (r.error) return showGate('No se pudo entrar: ' + r.error); gateMsg.textContent = 'Entrando…';
      try { await signInWithCredential(auth, GoogleAuthProvider.credential(null, r.access_token)); } catch (e) { showGate('No se pudo entrar: ' + (e.code || e.message)); } },
    error_callback: e => showGate(e && e.type === 'popup_closed' ? '' : 'No se pudo entrar: ' + ((e && e.type) || 'cancelado')) }); };
  document.head.appendChild(s);
}
gateBtn.addEventListener('click', async () => {
  gateBtn.disabled = true; gateMsg.textContent = 'Abriendo Google…';
  if (esSafari && gisTc) return gisTc.requestAccessToken();
  const p = new GoogleAuthProvider(); p.setCustomParameters({ login_hint: ALLOWED, prompt: 'select_account' });
  try { await signInWithPopup(auth, p); } catch (e) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) return signInWithRedirect(auth, p);
    showGate(e.code === 'auth/popup-closed-by-user' ? '' : 'No se pudo entrar: ' + (e.code || e.message)); }
});
getRedirectResult(auth).catch(e => showGate('No se pudo entrar: ' + (e.code || e.message)));

let unsub = null;
onAuthStateChanged(auth, user => {
  if (unsub) { unsub(); unsub = null; }
  if (!user) { U = null; return showGate(); }
  if ((user.email || '').toLowerCase() !== ALLOWED || !user.emailVerified) { signOut(auth); return showGate('Esta cuenta de Google no tiene acceso.'); }
  U = user;
  getDoc(doc(db, 'users', user.uid)).then(s => { BR = s.data()?.plan?.bridge || null; cargaSalud(true); mandaSemana(); }).catch(() => {});
  unsub = onSnapshot(collection(db, 'users', user.uid, 'fit'), snap => {
    for (const ch of snap.docChanges()) {
      const id = ch.doc.id, d = ch.type === 'removed' ? null : ch.doc.data();
      if (id === 'perfil') {
        if (!d) continue;
        F.rutinas = d.rutinas || []; F.ajustes = { ...F.ajustes, ...(d.ajustes || {}) }; F.ultimoFin = d.ultimoFin || null;
        if (activo && F.ultimoFin === activo.id) { activo = null; lsSet('jp-fit-activo', null); if (!$('#wo').hidden) minimizaWo(); }
        else if (d.activo && d.activo.id !== F.ultimoFin && (!activo || ((d.activo.upd || 0) > (activo.upd || 0) + 1000 && $('#wo').hidden))) { activo = d.activo; lsSet('jp-fit-activo', activo); }   // empezado o avanzado en otro dispositivo
        else if (!d.activo && activo && !ch.doc.metadata.hasPendingWrites && (d.at || 0) > (activo.upd || 0) + 3000) { activo = null; lsSet('jp-fit-activo', null); }   // lo descartaste en otro dispositivo
      } else if (id === 'alimentos') { F.alimentos = d?.lista || [];
      } else if (id === 'dieta') { const ds = d?.dietas || (d?.comidas ? [{ id: 'd1', nombre: 'Dieta 1', comidas: d.comidas, obj: d.obj || null, at: Date.now() }] : []);
        F.dietas = ds; F.dietaActiva = d?.activa || ds[0]?.id || null; F.dieta = ds.find(x => x.id === F.dietaActiva) || { comidas: [], obj: null }; F.dieta.ult = d?.ult || {};
      } else if (id === 'cuerpo') { F.pesos = d?.pesos || {};
      } else if (id === 'compra') { if (d) F.compra = { falta: d.falta || {}, comprado: d.comprado || {}, extra: d.extra || [] };
      } else if (id.startsWith('d-')) { if (d) Object.assign(F.diario, d.dias || {});
      } else if (id.startsWith('m-')) { if (d) F.meses[id.slice(2)] = d.e || {}; else delete F.meses[id.slice(2)]; }
    }
    reconstruye();
    if (!listo) { listo = true; gate.hidden = true; mandaSemana(); }
    if ($('#wo').hidden) pinta(); else if (!activo) minimizaWo();
    tickDescanso();
  }, e => { toast('Sincronización: ' + (e.code || e.message), 6000); if (!listo) showGate('No pude cargar tus datos: ' + (e.code || e.message)); });
});
