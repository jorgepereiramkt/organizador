// «Añadir rápido»: escribes (o dictas) la tarea, eliges cliente y urgencia, y listo.
// Sin urgencia → «Cuando pueda». Sin fecha: va a «Por colocar».
(() => {
const O = window.__org, S = O.S, esc = O.esc, $ = s => document.querySelector(s);
let urg = 'baja', cid = '';

// Botón junto a «Añadir»
const btn = document.createElement('button');
btn.className = 'btn qbtn'; btn.id = 'quickBtn'; btn.type = 'button';
btn.innerHTML = '<span>+</span> Rápida';
btn.title = 'Añadir tarea rápida';
$('#addBtn').after(btn);

const dlg = document.createElement('dialog');
dlg.id = 'quickDlg';
dlg.innerHTML = `<form method="dialog" class="sheet" id="quickForm">
  <h2>Añadir tarea</h2>
  <div class="qrow"><input id="qText" autocomplete="off" placeholder="¿Qué tienes que hacer?" enterkeyhint="done">
    <button type="button" class="mic sm" id="qMic" aria-label="Dictar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button></div>
  <div><div class="qlbl">Cliente</div><div class="qchips" id="qClients"></div></div>
  <div><div class="qlbl">Urgencia</div><div class="qseg" id="qUrg"></div></div>
  <div class="actions"><button class="btn" value="cancel" formnovalidate>Cancelar</button><span class="sp"></span>
    <button class="btn" value="more" id="qMore">Añadir y otra</button><button class="btn primary" value="ok">Añadir</button></div>
</form>`;
document.body.appendChild(dlg);
const txt = $('#qText');

function recent(){
  // Clientes con más tareas recientes primero
  const n = {};
  for (const t of S.tasks) if (t.client) n[t.client] = (n[t.client] || 0) + 1;
  return [...S.clients].sort((a, b) => (b.group === 'mine') - (a.group === 'mine') || (n[b.id] || 0) - (n[a.id] || 0) || a.name.localeCompare(b.name));
}
function drawClients(){
  const mine = recent().filter(c => c.group === 'mine'), ag = recent().filter(c => c.group !== 'mine');
  const chip = c => `<button type="button" class="chip cchip" data-qc="${c.id}" aria-pressed="${cid === c.id}" style="--c:${c.color}"><i></i>${esc(c.name)}</button>`;
  $('#qClients').innerHTML = `<button type="button" class="chip cchip" data-qc="" aria-pressed="${!cid}">Sin cliente</button>`
    + (mine.length ? `<span class="qsub">Míos</span>${mine.map(chip).join('')}` : '')
    + (ag.length ? `<span class="qsub">Agencia</span>${ag.map(chip).join('')}` : '');
}
function drawUrg(){
  $('#qUrg').innerHTML = ['super', 'alta', 'normal', 'baja'].map(k =>
    `<button type="button" class="seg u-${k}" data-qu="${k}" aria-pressed="${urg === k}">${O.URG[k].icon} ${O.URG[k].label}</button>`).join('');
}
function open(){
  urg = 'baja'; cid = ''; txt.value = '';
  drawClients(); drawUrg(); dlg.showModal(); setTimeout(() => txt.focus(), 50);
}
btn.addEventListener('click', open);

// Al escribir: si nombras un cliente o dices «urgente», se marca solo
txt.addEventListener('input', () => {
  const p = O.parse(txt.value)[0]; if (!p) return;
  if (p.client && p.client !== cid){ cid = p.client; drawClients(); }
  if (p.priority !== 'baja' && p.priority !== urg){ urg = p.priority; drawUrg(); }
});
dlg.addEventListener('click', e => {
  const c = e.target.closest('[data-qc]'); if (c){ cid = c.dataset.qc; drawClients(); return; }
  const u = e.target.closest('[data-qu]'); if (u){ urg = u.dataset.qu; drawUrg(); return; }
  if (e.target === dlg) dlg.close('cancel');
});
txt.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); add(); dlg.close('done'); } });

function add(){
  const raw = txt.value.trim(); if (!raw) return false;
  const p = O.parse(raw)[0] || {title: raw};
  const t = {id: O.uid(), title: p.title || raw, client: cid || null, day: null, status: 'todo', priority: urg, order: O.maxOrder() + 1, doneAt: null};
  S.tasks.push(t); O.save(); O.render();
  if (O.online()) O.pushCreate(t);
  O.toast(`Añadida${t.client ? ' a ' + O.client(t.client).name : ''} · ${O.URG[urg].label}`);
  return true;
}
dlg.addEventListener('close', () => {
  if (dlg.returnValue === 'ok') add();
  if (dlg.returnValue === 'more'){ if (add()) { txt.value = ''; urg = 'baja'; drawUrg(); dlg.showModal(); setTimeout(() => txt.focus(), 50); } }
});

// Dictado dentro de la ventanita
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
$('#qMic').addEventListener('click', () => {
  const mic = $('#qMic');
  if (!SR){ O.toast('Usa el micro del teclado para dictar'); txt.focus(); return; }
  if (rec){ rec.stop(); return; }
  rec = new SR(); rec.lang = 'es-ES'; rec.interimResults = true; rec.continuous = false;
  rec.onresult = e => { let s = ''; for (const r of e.results) s += r[0].transcript; txt.value = s; txt.dispatchEvent(new Event('input')); };
  rec.onend = () => { rec = null; mic.classList.remove('rec'); };
  rec.onerror = e => O.toast('Micro: ' + e.error);
  try { rec.start(); mic.classList.add('rec'); } catch(e){ rec = null; }
});
})();
