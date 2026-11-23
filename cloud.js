// Inicio de sesión con Google y sincronización entre dispositivos (Firebase, plan gratis).
// Solo la cuenta ALLOWED puede entrar; las reglas de Firestore lo vuelven a comprobar en el servidor.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signInWithCredential, signOut }
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

// Safari (iPad/iPhone/Mac) bloquea el inicio de sesión normal de Firebase (se queda «cargando» en firebaseapp.com).
// Ahí se entra con la ventana de Google directamente y luego se pasa el permiso a Firebase.
const ua = navigator.userAgent;
const esSafari = /iP(ad|hone|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) || (/Safari/.test(ua) && !/Chrome|CriOS|FxiOS|Edg|Android/.test(ua));
const GOOGLE_CLIENT = '59642019941-05m7v8u7o9n22ch98kl6rb491oggn6l9.apps.googleusercontent.com';
let gisTc = null;
if (esSafari) {
  const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
  s.onload = () => {
    gisTc = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT, scope: 'openid email profile', hint: ALLOWED,
      callback: async r => {
        if (r.error) return showGate('No se pudo entrar: ' + r.error);
        gateMsg.textContent = 'Entrando…';
        try { await signInWithCredential(auth, GoogleAuthProvider.credential(null, r.access_token)); }
        catch (e) { showGate('No se pudo entrar: ' + (e.code || e.message)); }
      },
      error_callback: e => showGate(e && e.type === 'popup_closed' ? '' : 'No se pudo entrar: ' + ((e && e.type) || 'cancelado')),
    });
  };
  document.head.appendChild(s);
}

gateBtn.addEventListener('click', async () => {
  gateBtn.disabled = true; gateMsg.textContent = 'Abriendo Google…';
  if (esSafari && gisTc) { gisTc.requestAccessToken(); return; }
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
      let rev = 0, sube = data, mezclado = false;
      await runTransaction(db, async tx => {
        const s = await tx.get(ref), cur = s.exists() ? (s.data().rev || 0) : 0;
        sube = data; mezclado = false;
        // Si otro dispositivo guardó algo más nuevo mientras tanto, se JUNTAN los dos cambios (no se pierde ninguno)
        if (s.exists() && cur !== baseRev) {
          const remoto = { ...s.data() }; delete remoto.rev; delete remoto.by; delete remoto.at;
          sube = window.__org.mergeCloud(remoto, data); mezclado = true;
        }
        rev = cur + 1;
        tx.set(ref, { ...sube, rev, by: DEVICE, at: serverTimestamp() });
      });
      baseRev = rev;
      window.__org.cloudSaved(sube, mezclado);
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
