// Inicio de sesión con Google y sincronización entre dispositivos (Firebase, plan gratis).
// Solo la cuenta ALLOWED puede entrar; las reglas de Firestore lo vuelven a comprobar en el servidor.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, doc, onSnapshot, runTransaction, serverTimestamp }
  from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const ALLOWED = 'jorgepereiramktdigital@gmail.com';
const firebaseConfig = {   // configuración pública (no es secreta: la protección la ponen las reglas)
  apiKey: 'AIzaSyBFOE-WO9-Q3RYnv2zJ_-BoBJT9ewCyIn0',
  authDomain: 'organizador-jp.firebaseapp.com',
  projectId: 'organizador-jp',
  storageBucket: 'organizador-jp.firebasestorage.app',
  messagingSenderId: '59642019941',
  appId: '1:59642019941:web:edbd1490f5a134661c468c'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, { localCache: persistentLocalCache() });
const DEVICE = Math.random().toString(36).slice(2, 10);

const gate = document.getElementById('gate');
const gateMsg = document.getElementById('gateMsg');
const gateBtn = document.getElementById('gateBtn');
const showGate = msg => { try { localStorage.removeItem('jp-session'); } catch(e){} gate.classList.remove('loading'); gate.hidden = false; gateMsg.textContent = msg || ''; gateBtn.disabled = false; };

gateBtn.addEventListener('click', async () => {
  gateBtn.disabled = true; gateMsg.textContent = 'Abriendo Google…';
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ login_hint: ALLOWED, prompt: 'select_account' });
  try { await signInWithPopup(auth, provider); }
  catch (e) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) {
      return signInWithRedirect(auth, provider);
    }
    showGate(e.code === 'auth/popup-closed-by-user' ? '' : 'No se pudo entrar: ' + (e.code || e.message));
  }
});
getRedirectResult(auth).catch(e => showGate('No se pudo entrar: ' + (e.code || e.message)));

let unsub = null;
onAuthStateChanged(auth, user => {
  if (unsub) { unsub(); unsub = null; }
  if (!user) { window.__cloud = null; showGate(); return; }
  if ((user.email || '').toLowerCase() !== ALLOWED || !user.emailVerified) {
    signOut(auth); showGate('Esta cuenta de Google no tiene acceso.'); return;
  }
  gate.hidden = true; gate.classList.remove('loading');
  try { localStorage.setItem('jp-session', '1'); } catch(e){}
  const ref = doc(db, 'users', user.uid);
  let baseRev = 0;
  window.__cloud = {
    email: user.email,
    ready: false,                                         // no se sube nada hasta tener la versión del servidor
    save: async data => {
      if (!window.__cloud || !window.__cloud.ready) throw Object.assign(new Error('aún no tengo la versión de la nube'), { code: 'wait' });
      let rev = 0;
      await runTransaction(db, async tx => {
        const s = await tx.get(ref), cur = s.exists() ? (s.data().rev || 0) : 0;
        // Si otro dispositivo guardó algo más nuevo, NO se pisa: se carga lo suyo
        if (s.exists() && cur !== baseRev) throw Object.assign(new Error('había cambios más nuevos en otro dispositivo'), { code: 'stale' });
        rev = cur + 1;
        tx.set(ref, { ...data, rev, by: DEVICE, at: serverTimestamp() });
      });
      baseRev = rev;
    },
    logout: async () => { await signOut(auth); window.__org.wipeLocal(); location.reload(); }
  };
  unsub = onSnapshot(ref, { includeMetadataChanges: true }, snap => {
    if (snap.metadata.hasPendingWrites) return;          // es un cambio nuestro que aún se está enviando
    if (snap.metadata.fromCache) return;                 // copia guardada en este dispositivo: puede ser vieja
    const d = snap.data(), first = !window.__cloud.ready;
    if (!d) { window.__cloud.ready = true; window.__org.cloudEmpty(); return window.__org.cloudReady(); }
    if (d.rev != null && d.rev === baseRev && !first) return;   // ya la tenemos
    baseRev = d.rev || 0;
    if (first || d.by !== DEVICE) window.__org.applyCloud(d);
    if (first) { window.__cloud.ready = true; window.__org.cloudReady(); }
  }, e => window.__org.toast('Sincronización: ' + (e.code || e.message)));
});
