// Elige almacén: Firestore si hay credenciales; si no, memoria. En --dry-run, Firestore se
// envuelve en modo solo lectura: lee el estado real (para que la prueba sea realista) y no escribe nada.
import { crearStoreFirestore, credencialesFirebase } from './firestore.js';
import { crearStoreMemoria } from './memoria.js';

export async function crearStore({ dryRun, env = process.env }) {
  const cred = credencialesFirebase(env);
  if (!cred) {
    if (!dryRun) throw new Error('Faltan las credenciales de Firebase (secret FIREBASE_SERVICE_ACCOUNT).');
    return crearStoreMemoria();
  }
  const store = crearStoreFirestore(cred);
  return dryRun ? soloLectura(store) : store;
}

/** Lecturas reales, escrituras simuladas sobre una copia en memoria del estado leído. */
export function soloLectura(store) {
  const sombra = crearStoreMemoria();
  let globalLeido = null;
  return {
    ...sombra,
    tipo: `${store.tipo} (solo lectura)`,
    proyecto: store.proyecto,
    async leerGlobal() {
      globalLeido = await store.leerGlobal();
      sombra.db.estado.set('_global', structuredClone(globalLeido));
      return structuredClone(globalLeido);
    },
    leerUmbrales: () => store.leerUmbrales(),
    leerEstados: (ids) => store.leerEstados(ids),
    // Para que reclamarAviso funcione en la sombra, los chollos "creados" se guardan en ella
    async crearDeal(doc) {
      return sombra.crearDeal(doc);
    },
    async reclamarAviso(id, opts) {
      if (!sombra.db.deals.has(id)) sombra.db.deals.set(id, { id, notificado: false });
      return sombra.reclamarAviso(id, opts);
    },
  };
}
