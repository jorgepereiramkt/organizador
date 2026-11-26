// JP Fitness: entrenos tipo Hevy (rutinas, series, descansos con temporizador, historial y progreso).
// Mismo login y misma base de datos que el Organizador (Firebase, plan gratis).
// Datos en Firestore:  users/{uid}/fit/perfil  (rutinas, ajustes, entreno en curso)
//                      users/{uid}/fit/m-AAAA-MM  (entrenos de ese mes: { e: { id: entreno } })
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signInWithCredential, signOut }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, doc, collection, onSnapshot, setDoc, updateDoc, deleteField, FieldPath }
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
  const dark = m === 'dark' || (m === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const mc = document.querySelector('meta[name=theme-color]'); if (mc) mc.content = dark ? '#0a0a0b' : '#f5f5f7'; })();

let toastT;
const toast = (m, ms = 2600) => { const t = $('#toast'); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, ms); };

// ---------- estado ----------
const F = { rutinas: [], ajustes: { descanso: 120, objSemana: 4 }, meses: {}, entrenos: [], porId: {}, ultimoFin: null };
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
  return [...F.rutinas].sort((a, b) => ult(a) - ult(b))[0];
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
  if (prs) return ['💪', `${prs} récord${prs > 1 ? 's' : ''} en los últimos 7 días`, `Vas ${sem}/${obj} esta semana. Mantén el ritmo.`];
  return ['🎯', `Vas ${sem}/${obj} esta semana`, sug ? `La que más tiempo llevas sin hacer: «${sug.nombre}».` : 'Sigue sumando.'];
}

// ---------- vistas ----------
function pinta() {
  if (!listo) return;
  document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.v === vista));
  const m = $('#main');
  m.innerHTML = ({ hoy: vHoy, rutinas: vRutinas, historial: vHistorial, ejercicios: vEjercicios }[vista] || vHoy)();
  pintaEnCurso();
}

function vHoy() {
  const h = new Date().getHours(), saludo = h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
  const [av, t, p] = coach();
  const l = lunes(Date.now()), sem = semanaActual();
  const dias = [...Array(7)].map((_, i) => { const d0 = l + i * DIA; const si = F.entrenos.some(w => w.ini >= d0 && w.ini < d0 + DIA);
    const hoy = Date.now() >= d0 && Date.now() < d0 + DIA; return `<div class="${si ? 'si' : ''} ${hoy ? 'hoy' : ''}"><i></i>${'LMXJVSD'[i]}</div>`; }).join('');
  const vol = sem.reduce((a, w) => a + volumen(w), 0), dur = sem.reduce((a, w) => a + ((w.fin || w.ini) - w.ini), 0);
  const sug = sugerida(), ult = F.entrenos[0];
  return `<div class="hola"><h1>${saludo}, Jorge</h1><p>${fDia(Date.now())} · objetivo ${F.ajustes.objSemana || 4} entrenos/semana</p></div>
  <div class="coach"><span class="av">${av}</span><div><b>${esc(t)}</b><span class="muted small">${esc(p)}</span></div></div>
  <div class="semana">${dias}</div>
  <div class="grid3" style="margin-top:12px">
    <div class="stat"><b>${sem.length}/${F.ajustes.objSemana || 4}</b><span>Entrenos semana</span></div>
    <div class="stat"><b>${vol >= 1000 ? fmtN(Math.round(vol / 100) / 10) + ' t' : fmtN(Math.round(vol)) + ' kg'}</b><span>Volumen semana</span></div>
    <div class="stat"><b>${racha()}</b><span>Semanas cumpliendo</span></div>
  </div>
  <div style="margin-top:16px">${activo ? `<button class="btn primary big" data-act="abrirWo">⏱️ Seguir con el entreno</button>` : `<button class="btn primary big" data-act="empezar">💪 Empezar entreno</button>`}</div>
  ${sug && !activo ? `<div class="sec"><h2>Te toca</h2></div>${cardRutina(sug)}` : ''}
  ${ult ? `<div class="sec"><h2>Último entreno</h2></div>${cardEntreno(ult)}` : ''}
  ${dur ? `<p class="faint small" style="text-align:center;margin-top:18px">Esta semana: ${fDur(dur)} entrenando</p>` : ''}`;
}

function cardRutina(r) {
  const ult = F.entrenos.find(w => w.rut === r.id);
  return `<div class="card rut"><div class="row"><h3 style="flex:1">${esc(r.nombre)}</h3>${ult ? `<span class="pill">hace ${Math.max(0, Math.round((Date.now() - ult.ini) / DIA))} d</span>` : ''}</div>
    <p>${(r.ej || []).map(e => esc(nombreDe(e))).join(' · ') || 'Sin ejercicios'}</p>
    <div class="acts"><button class="btn primary" data-act="empRut" data-id="${r.id}">Empezar</button><button class="btn" data-act="editRut" data-id="${r.id}">Editar</button></div></div>`;
}
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
  const h = historialDe(k), x = catalogo().get(k); if (!x) return;
  const pts = h.map(o => ({ t: o.w.ini, v: Math.max(0, ...seriesBuenas(o.e).map(s => e1rm(s.kg, s.r))) })).filter(p => p.v).reverse();
  const maxKg = Math.max(0, ...h.flatMap(o => seriesBuenas(o.e).map(s => s.kg || 0)));
  const best = h.map(o => mejor(o.e)).filter(Boolean).sort((a, b) => e1rm(b.kg, b.r) - e1rm(a.kg, a.r))[0];
  const maxReps = Math.max(0, ...h.flatMap(o => seriesBuenas(o.e).map(s => s.r || 0)));
  hoja(`<h2>${esc(x.n)}</h2>
  <div class="grid3"><div class="stat"><b>${maxKg ? fmtN(maxKg) : '—'}</b><span>Peso máximo (kg)</span></div>
  <div class="stat"><b>${best && best.kg ? fmtN(Math.round(e1rm(best.kg, best.r))) : '—'}</b><span>1RM estimado</span></div>
  <div class="stat"><b>${maxReps || '—'}</b><span>Más reps</span></div></div>
  <div class="sec"><h2>1RM estimado</h2></div>${grafica(pts)}
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
document.querySelectorAll('#tabbar button').forEach(b => b.addEventListener('click', () => { vista = b.dataset.v; lsSet('jp-fit-vista', vista); scrollTo(0, 0); pinta(); }));
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
  return { entrenos: [...porW.values()], rutinas: [] };
}
$('#fileIn').addEventListener('change', async ev => {
  const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
  let d; try { const txt = await f.text(); d = /\.csv$/i.test(f.name) || !txt.trim().startsWith('{') ? deCSV(txt) : deJSON(JSON.parse(txt)); }
  catch (e) { return toast('No pude leer el archivo: ' + e.message, 5000); }
  // Evita duplicados: mismo inicio (al minuto) = mismo entreno
  const ya = new Set(F.entrenos.map(w => Math.round(w.ini / 60000)));
  const nuevos = d.entrenos.filter(w => w.ini && !ya.has(Math.round(w.ini / 60000)));
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
window.__fit = { F, deJSON, importa: async d => { const x = deJSON(d); const ya = new Set(F.entrenos.map(w => Math.round(w.ini / 60000)));
  const nuevos = x.entrenos.filter(w => w.ini && !ya.has(Math.round(w.ini / 60000))); const porMes = {}; for (const w of nuevos) ((porMes[ym(w.ini)] ||= {})[w.id] = w);
  for (const [k, e] of Object.entries(porMes)) { Object.assign(F.meses[k] ||= {}, e); await setDoc(mesRef(k), { e }, { merge: true }); }
  for (const r of x.rutinas) { const i = F.rutinas.findIndex(y => y.id === r.id); if (i >= 0) F.rutinas[i] = r; else F.rutinas.push(r); }
  guardaPerfil(0); reconstruye(); pinta(); return { entrenos: nuevos.length, rutinas: x.rutinas.length }; } };

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
  unsub = onSnapshot(collection(db, 'users', user.uid, 'fit'), snap => {
    for (const ch of snap.docChanges()) {
      const id = ch.doc.id, d = ch.type === 'removed' ? null : ch.doc.data();
      if (id === 'perfil') {
        if (!d) continue;
        F.rutinas = d.rutinas || []; F.ajustes = { ...F.ajustes, ...(d.ajustes || {}) }; F.ultimoFin = d.ultimoFin || null;
        if (activo && F.ultimoFin === activo.id) { activo = null; lsSet('jp-fit-activo', null); if (!$('#wo').hidden) minimizaWo(); }
        else if (d.activo && d.activo.id !== F.ultimoFin && (!activo || ((d.activo.upd || 0) > (activo.upd || 0) + 1000 && $('#wo').hidden))) { activo = d.activo; lsSet('jp-fit-activo', activo); }   // empezado o avanzado en otro dispositivo
        else if (!d.activo && activo && !ch.doc.metadata.hasPendingWrites && (d.at || 0) > (activo.upd || 0) + 3000) { activo = null; lsSet('jp-fit-activo', null); }   // lo descartaste en otro dispositivo
      } else if (id.startsWith('m-')) { if (d) F.meses[id.slice(2)] = d.e || {}; else delete F.meses[id.slice(2)]; }
    }
    reconstruye();
    if (!listo) { listo = true; gate.hidden = true; }
    if ($('#wo').hidden) pinta(); else if (!activo) minimizaWo();
    tickDescanso();
  }, e => { toast('Sincronización: ' + (e.code || e.message), 6000); if (!listo) showGate('No pude cargar tus datos: ' + (e.code || e.message)); });
});
