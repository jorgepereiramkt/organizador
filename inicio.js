// Pantalla de inicio «Jorge Control»: tema del Organizador, saludo y fecha.
(() => {
  let m = 'light'; try { m = localStorage.getItem('jp-theme') || 'light'; } catch (e) {}
  const dark = m === 'dark' || (m === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const h = new Date().getHours();
  document.getElementById('hola').textContent = (h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches') + ', Jorge';
  const f = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  document.getElementById('fecha').textContent = 'Jorge Control · ' + f.charAt(0).toUpperCase() + f.slice(1);
})();
