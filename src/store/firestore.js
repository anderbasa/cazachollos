// Almacén en Firestore (firebase-admin con cuenta de servicio). Misma interfaz que memoria.js.
// Las escrituras de estado usan "merge" por campo, así dos ejecuciones de modos distintos que
// coinciden en el tiempo no se pisan. Los avisos se reclaman con transacción: nunca dos veces.
// Las credenciales se leen y comprueban en src/entorno.js (sin revelarlas nunca en los logs).
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { rebajaPermitida } from './memoria.js';

const CAMPOS_FECHA = new Set(['publicadoEn', 'vistoEn', 'actualizadoEn', 'notificadoEn', 'inicio', 'fin', 'ultimaEjecucion', 'ultimaOk', 'ultimoFallo', 'fallandoDesde']);
const NOMBRE_APP = 'cazachollos';

const aTs = (v) => (v == null ? null : v instanceof Timestamp ? v : Timestamp.fromMillis(typeof v === 'number' ? v : Date.parse(v)));
const aMs = (v) => (v == null ? null : typeof v?.toMillis === 'function' ? v.toMillis() : typeof v === 'number' ? v : Date.parse(v));

function conTimestamps(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = CAMPOS_FECHA.has(k) ? aTs(v) : v;
  return out;
}
function sinTimestamps(obj) {
  if (!obj) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = typeof v?.toMillis === 'function' ? v.toMillis() : v;
  return out;
}

export function crearStoreFirestore(credenciales) {
  let app = getApps().find((a) => a.name === NOMBRE_APP);
  let db;
  if (!app) {
    app = initializeApp({ credential: cert(credenciales), projectId: credenciales.project_id }, NOMBRE_APP);
    db = getFirestore(app);
    db.settings({ ignoreUndefinedProperties: true });
  } else {
    db = getFirestore(app);
  }
  const global = db.doc('estado/_global');
  const deal = (id) => db.doc(`deals/${id}`);

  return {
    tipo: 'firestore',
    proyecto: credenciales.project_id,

    async leerGlobal() {
      const s = await global.get();
      if (!s.exists) return {};
      const g = s.data();
      const ultimaPorModo = Object.fromEntries(Object.entries(g.ultimaPorModo ?? {}).map(([k, v]) => [k, aMs(v)]));
      return { ...g, ultimaPorModo };
    },
    async leerUmbrales() {
      const s = await db.doc('config/umbrales').get();
      if (!s.exists) return null;
      const { actualizadoEn, actualizadoPor, ...umbrales } = s.data();
      return umbrales;
    },
    async leerEstados(ids) {
      if (ids.length === 0) return {};
      const snaps = await db.getAll(...ids.map((id) => db.doc(`estado/${id}`)));
      return Object.fromEntries(snaps.map((s, i) => [ids[i], s.exists ? sinTimestamps(s.data()) : null]));
    },
    async marcarInicio(modo, ahora) {
      await global.set({ ultimaPorModo: { [modo]: aTs(ahora) } }, { merge: true });
    },

    async crearDeal(doc) {
      try {
        await deal(doc.id).create(conTimestamps(doc));
        return true;
      } catch (e) {
        if (e.code === 6) return false; // ALREADY_EXISTS
        throw e;
      }
    },
    async actualizarDeal(id, campos) {
      const { fuentes, ...resto } = campos;
      const datos = conTimestamps(resto);
      if (fuentes?.length) datos.fuentes = FieldValue.arrayUnion(...fuentes);
      await deal(id).set(datos, { merge: true });
    },

    async reclamarAviso(id, { ahora, precio, rebajaPct = null, maxAvisos = 3, esperaMs = 0, via = 'telegram' }) {
      return db.runTransaction(async (tx) => {
        const s = await tx.get(deal(id));
        if (!s.exists) return null;
        const d = s.data();
        if (d.notificado && rebajaPct == null) return null;
        if (rebajaPct != null && !rebajaPermitida(d, { ahora, precio, rebajaPct, maxAvisos, esperaMs })) return null;
        const previo = { notificado: d.notificado ?? false, precioNotificado: d.precioNotificado ?? null, notificadoEn: d.notificadoEn ?? null, via: d.via ?? null };
        tx.update(deal(id), { notificado: true, notificadoEn: aTs(ahora), precioNotificado: precio, via, avisos: FieldValue.increment(1) });
        return previo;
      });
    },
    async liberarAviso(id, previo) {
      await deal(id).update({ ...previo, avisos: FieldValue.increment(-1) });
    },
    async marcarAvisado(id, { ahora, precio, via }) {
      await deal(id).update({ notificado: true, notificadoEn: aTs(ahora), precioNotificado: precio, via });
    },

    async reservarCupo(dia, quiero, maxDia) {
      return db.runTransaction(async (tx) => {
        const s = await tx.get(global);
        const g = s.exists ? s.data() : {};
        const hoy = g.dia === dia ? (g.avisosHoy ?? 0) : 0;
        const topeAvisado = g.dia === dia ? Boolean(g.topeAvisado) : false;
        const k = Math.max(0, Math.min(quiero, maxDia - hoy));
        tx.set(global, { dia, avisosHoy: hoy + k, topeAvisado }, { merge: true });
        return { k, avisosHoy: hoy + k, topeAvisado };
      });
    },
    async devolverCupo(dia, n) {
      await global.set({ dia, avisosHoy: FieldValue.increment(-n) }, { merge: true });
    },
    async marcarTope(dia) {
      await global.set({ dia, topeAvisado: true }, { merge: true });
    },
    async guardarCola(cola) {
      await global.set({ cola }, { merge: true });
    },

    async guardarEstado(fuente, { recientes = {}, borrar = [], campos = {} }) {
      const datos = conTimestamps(campos);
      const rec = { ...recientes };
      for (const id of borrar) rec[id] = FieldValue.delete();
      if (Object.keys(rec).length) datos.recientes = rec;
      await db.doc(`estado/${fuente}`).set(datos, { merge: true });
    },

    async registrarEjecucion(id, datos) {
      await db.doc(`ejecuciones/${id}`).set(conTimestamps(datos));
    },
  };
}
