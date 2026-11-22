// «Añadir rápido»: escribes (o dictas) la tarea, eliges cliente y urgencia, y listo.
// Sin urgencia → «Cuando pueda». Sin fecha: va a «Por colocar».
(() => {
const O = window.__org, S = O.S, esc = O.esc, $ = s => document.querySelector(s);
let urg = 'baja', cid = '';

// Botón junto a «Añadir»
const btn = document.createElement('button');
btn.className = 'btn qbtn'; btn.id = 'quickBtn'; btn.type = 'button';
btn.innerHTML = '<span>+</span> Añadir tarea';
btn.title = 'Añadir tarea rápida';
$('#helloAct').appendChild(btn);

const dlg = document.createElement('dialog');
dlg.id = 'quickDlg';
dlg.innerHTML = `<form method="dialog" class="sheet" id="quickForm">
  <h2>Añadir tarea</h2>
  <div class="qrow"><input id="qText" autocomplete="off" placeholder="¿Qué tienes que hacer?" enterkeyhint="done">
</div>
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
  return S.clients.filter(c => !O.isApartado(c)).sort((a, b) => (b.group === 'mine') - (a.group === 'mine') || (n[b.id] || 0) - (n[a.id] || 0) || a.name.localeCompare(b.name));
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


/* ---------- Saludo y frase del día ---------- */
const FRASES = [
  'Hoy no hace falta hacerlo todo: hace falta hacer lo importante.',
  'Empieza por la que más pereza te da. El resto va rodado.',
  'Una tarea terminada vale más que diez empezadas.',
  'Tus clientes confían en ti porque cumples. Hoy, otra vez.',
  'Menos pestañas abiertas, más cosas cerradas.',
  'El día lo ganas en el primer bloque. A por él.',
  'No necesitas motivación, necesitas empezar. La motivación llega después.',
  'Pequeños avances cada día hacen cuentas enormes a final de mes.',
  'Lo urgente grita; lo importante construye. Haz hueco a lo segundo.',
  'Hoy eres el Jorge que dentro de un año te dará las gracias.',
  'Una cosa cada vez. Bien hecha. Y a la siguiente.',
  'Si cabe en dos minutos, hazla ya.',
  'Disciplina es elegir lo que quieres de verdad frente a lo que te apetece ahora.',
  'Cada campaña que mejoras es un negocio que crece gracias a ti.',
  'Organiza la mañana y la tarde se organiza sola.',
  'No compitas con nadie: supera al Jorge de ayer.',
  'Foco: el móvil boca abajo y el bloque en marcha.',
  'Lo difícil de hoy es lo fácil de mañana.',
  'Hecho es mejor que perfecto. Luego se mejora.',
  'Cierra el día sabiendo que has movido lo que importaba.',
  'Tu energía es limitada: gástala en lo que mueve la aguja.',
  'Un buen sistema vale más que mil ganas.',
  'Hoy toca sembrar. Los resultados llegan.',
  'Respira, ordena y ataca la primera.',
  'Constancia > intensidad.',
  'Cada "sí" a algo es un "no" a otra cosa. Elige bien.',
  'El trabajo profundo se hace en bloques, no en ratos.',
  'Celebra lo que tachas: estás avanzando.',
  'Ser bueno es fácil un día. Ser constante es lo que te hace distinto.',
  'Hoy, mejor que ayer. Mañana, mejor que hoy.',
];
function saludo(){
  const h = new Date().getHours();
  const s = h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
  const icon = h < 6 ? '🌙' : h < 14 ? '☀️' : h < 21 ? '🌤️' : '🌙';
  $('#helloTxt').textContent = `${s}, Jorge ${icon}`;
}
let fi = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 864e5) % FRASES.length;
const frase = () => { $('#motivo').textContent = FRASES[fi % FRASES.length]; };
$('#motivo').addEventListener('click', () => { fi++; frase(); });
saludo(); frase();
setInterval(saludo, 10 * 60e3);
})();
