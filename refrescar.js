// «Desliza hacia abajo para refrescar» (como en las apps del móvil) para el Organizador y JP Fitness.
// Solo cuando estás arriba del todo y no dentro de una ventana/hoja abierta (para no perder lo que estés escribiendo).
(() => {
  const UMBRAL = 85;
  const st = document.createElement('style');
  st.textContent = `#ptr{position:fixed;left:50%;top:calc(env(safe-area-inset-top) + 8px);z-index:500;width:40px;height:40px;margin-left:-20px;border-radius:50%;
    display:grid;place-items:center;font:700 20px system-ui;background:var(--surface,#1b1b1e);color:var(--accent,#FF6B3D);box-shadow:0 6px 20px rgba(0,0,0,.3);
    opacity:0;transform:translateY(-50px);pointer-events:none;transition:opacity .15s}
    #ptr.listo{background:var(--accent,#FF6B3D);color:#fff} #ptr.girando{animation:ptrgira .7s linear infinite;opacity:1}
    @keyframes ptrgira{from{transform:translateY(40px) rotate(0)}to{transform:translateY(40px) rotate(360deg)}}`;
  document.head.appendChild(st);
  const ind = document.createElement('div'); ind.id = 'ptr'; ind.textContent = '↻'; ind.setAttribute('aria-hidden', 'true');
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(ind)); if (document.body) document.body.appendChild(ind);

  const bloqueado = el => {   // dentro de algo con su propio scroll, o de una ventana fija (hojas, modales, entreno en curso…)
    for (let e = el; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
      if (e.scrollTop > 0) return true;
      const p = getComputedStyle(e).position; if (p === 'fixed') return true;
    }
    return false;
  };
  let y0 = null, x0 = 0, d = 0;
  addEventListener('touchstart', e => {
    y0 = null; if (e.touches.length !== 1 || scrollY > 2 || bloqueado(e.target)) return;
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; d = 0;
  }, { passive: true });
  addEventListener('touchmove', e => {
    if (y0 == null) return;
    const t = e.touches[0]; d = t.clientY - y0;
    if (scrollY > 2 || d <= 0 || Math.abs(t.clientX - x0) > d) { ind.style.opacity = 0; ind.style.transform = ''; ind.classList.remove('listo'); return; }
    const p = Math.min(d, 150);
    ind.style.opacity = Math.min(1, p / UMBRAL); ind.style.transform = `translateY(${p * 0.45 - 10}px) rotate(${p * 2.4}deg)`;
    ind.classList.toggle('listo', d > UMBRAL);
  }, { passive: true });
  addEventListener('touchend', () => {
    if (y0 == null) return; y0 = null;
    if (d > UMBRAL) { ind.style.transform = ''; ind.classList.add('girando'); setTimeout(() => location.reload(), 150); }
    else { ind.style.opacity = 0; ind.style.transform = ''; ind.classList.remove('listo'); }
  });
  window.__refrescar = () => { ind.classList.add('girando'); setTimeout(() => location.reload(), 150); };
})();
