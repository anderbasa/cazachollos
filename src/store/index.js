// Elige almacén: Firestore si hay credenciales; si no, memoria. En --dry-run, Firestore se
// envuelve en modo solo lectura: lee el estado real (para que la prueba sea realista) y no escribe nada.
import { crearStoreFirestore } from './firestore.js';
import { crearStoreMemoria } from './memoria.js';

export async function crearStore({ dryRun, credenciales }) {
  if (!credenciales) {
    if (!dryRun) throw new Error('Faltan las credenciales de Firebase (secret FIREBASE_SERVICE_ACCOUNT).');
    return crearStoreMemoria();
  }
  const store = crearStoreFirestore(credenciales);
  return dryRun ? soloLectura(store) : store;
}

/** Lecturas reales, escrituras simuladas sobre una copia en memoria del estado leído. */
export function soloLectura(store) {
  const sombra = crearStoreMemoria();
  return {
    ...sombra,
    tipo: `${store.tipo} (solo lectura)`,
    proyecto: store.proyecto,
    async leerGlobal() {
      const g = await store.leerGlobal();
      sombra.db.estado.set('_global', structuredClone(g));
      return structuredClone(g);
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
