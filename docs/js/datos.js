// Acceso a los datos. Dos implementaciones con la misma interfaz:
//  - Firebase (la de verdad): login con Google y Firestore, con caché local para ir rápido.
//  - Demo: solo en localhost con ?demo, lee una copia exportada (npm run web -- --exportar).
import { CORREO, FIREBASE, SDK } from './config.js';
import { aPlano } from './util.js';

export const esDemo = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('demo');

export function crearDatos() {
  return esDemo ? datosDemo() : datosFirebase();
}

async function datosFirebase() {
  const [{ initializeApp }, A, F] = await Promise.all([import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-firestore.js`)]);
  const app = initializeApp(FIREBASE);
  const auth = A.getAuth(app);
  let db;
  try {
    db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  } catch {
    db = F.getFirestore(app);
  }
  const proveedor = new A.GoogleAuthProvider();
  proveedor.setCustomParameters({ prompt: 'select_account', login_hint: CORREO });
  const lista = (snap) => snap.docs.map((d) => aPlano({ id: d.id, ...d.data() }));
  const deals = F.collection(db, 'deals');
  const umbrales = F.doc(db, 'config', 'umbrales');

  return {
    alCambiarUsuario(fn) {
      A.getRedirectResult(auth).catch((e) => fn(null, e));
      return A.onAuthStateChanged(auth, (u) => fn(u));
    },
    async entrar() {
      try {
        await A.signInWithPopup(auth, proveedor);
      } catch (e) {
        // En algunos móviles la ventana emergente no está permitida: se entra con redirección
        if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(e.code)) {
          return A.signInWithRedirect(auth, proveedor);
        }
        throw e;
      }
    },
    salir: () => A.signOut(auth),
    async mejores(horas = 48) {
      const desde = F.Timestamp.fromMillis(Date.now() - horas * 3600_000);
      return lista(await F.getDocs(F.query(deals, F.where('publicadoEn', '>=', desde), F.orderBy('publicadoEn', 'desc'), F.limit(500))));
    },
    async ultimos(antesDe = null, n = 60) {
      const partes = [F.orderBy('publicadoEn', 'desc')];
      if (antesDe != null) partes.push(F.startAfter(F.Timestamp.fromMillis(antesDe)));
      partes.push(F.limit(n));
      return lista(await F.getDocs(F.query(deals, ...partes)));
    },
    async favoritos() {
      return lista(await F.getDocs(F.query(deals, F.where('favorito', '==', true), F.limit(300))));
    },
    marcar: (id, campo, valor) => F.updateDoc(F.doc(db, 'deals', id), { [campo]: valor }),
    async ajustes() {
      const s = await F.getDoc(umbrales);
      return s.exists() ? aPlano(s.data()) : null;
    },
    guardarAjustes: (u) => F.setDoc(umbrales, { ...u, actualizadoEn: F.serverTimestamp() }, { merge: true }),
    borrarAjustes: () => F.deleteDoc(umbrales),
    reactivar: (fuente) => F.setDoc(umbrales, { reactivar: { [fuente]: Date.now() } }, { merge: true }),
    async estado() {
      const estados = Object.fromEntries((await F.getDocs(F.collection(db, 'estado'))).docs.map((d) => [d.id, aPlano({ ...d.data(), recientes: undefined })]));
      const ejecuciones = lista(await F.getDocs(F.query(F.collection(db, 'ejecuciones'), F.orderBy('inicio', 'desc'), F.limit(12))));
      const mes = new Date().toISOString().slice(0, 7);
      const uso = await F.getDoc(F.doc(db, 'uso', mes));
      return { estados, ejecuciones, uso: uso.exists() ? uso.data() : null };
    },
  };
}

async function datosDemo() {
  const respuesta = await fetch('/__demo/datos.json');
  if (!respuesta.ok) throw new Error(await respuesta.text());
  const copia = await respuesta.json();
  const deals = new Map(copia.deals.map((d) => [d.id, d]));
  let umbrales = copia.umbrales;
  const usuario = { email: CORREO, displayName: 'Demo' };
  const ordenados = () => [...deals.values()].sort((a, b) => (b.publicadoEn ?? 0) - (a.publicadoEn ?? 0));
  return {
    alCambiarUsuario(fn) {
      setTimeout(() => fn(usuario), 0);
      return () => {};
    },
    entrar: async () => {},
    salir: async () => location.reload(),
    mejores: async (horas = 48) => ordenados().filter((d) => d.publicadoEn >= copia.exportado - horas * 3600_000),
    ultimos: async (antesDe = null, n = 60) => ordenados().filter((d) => antesDe == null || d.publicadoEn < antesDe).slice(0, n),
    favoritos: async () => ordenados().filter((d) => d.favorito),
    marcar: async (id, campo, valor) => {
      deals.get(id)[campo] = valor;
    },
    ajustes: async () => umbrales,
    guardarAjustes: async (u) => {
      umbrales = { ...umbrales, ...u };
    },
    borrarAjustes: async () => {
      umbrales = null;
    },
    reactivar: async () => {},
    estado: async () => ({ estados: copia.estado, ejecuciones: copia.ejecuciones, uso: null }),
  };
}
