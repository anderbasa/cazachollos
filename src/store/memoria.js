// Almacén en memoria con la misma interfaz que el de Firestore. Para tests y para el
// dry-run sin credenciales. Las fechas se guardan como milisegundos.

const clonar = (x) => (x == null ? x : structuredClone(x));

export function crearStoreMemoria(inicial = {}) {
  const db = {
    deals: new Map(Object.entries(clonar(inicial.deals ?? {}))),
    estado: new Map(Object.entries(clonar(inicial.estado ?? {}))),
    config: new Map(Object.entries(clonar(inicial.config ?? {}))),
    ejecuciones: new Map(),
  };
  const global = () => db.estado.get('_global') ?? {};
  const setGlobal = (g) => db.estado.set('_global', g);

  return {
    tipo: 'memoria',
    db,

    async leerGlobal() {
      return clonar(global());
    },
    async leerUmbrales() {
      return clonar(db.config.get('umbrales') ?? null);
    },
    async leerEstados(ids) {
      return Object.fromEntries(ids.map((id) => [id, clonar(db.estado.get(id) ?? null)]));
    },
    async marcarInicio(modo, ahora) {
      const g = global();
      setGlobal({ ...g, ultimaPorModo: { ...g.ultimaPorModo, [modo]: ahora } });
    },

    async crearDeal(doc) {
      if (db.deals.has(doc.id)) return false;
      db.deals.set(doc.id, clonar(doc));
      return true;
    },
    async actualizarDeal(id, campos) {
      const previo = db.deals.get(id) ?? {};
      const { fuentes, ...resto } = campos;
      const nuevo = { ...previo, ...clonar(resto) };
      if (fuentes) nuevo.fuentes = [...new Set([...(previo.fuentes ?? []), ...fuentes])];
      db.deals.set(id, nuevo);
    },

    /** Marca como avisado de forma atómica. Devuelve lo que había (para deshacer) o null si ya estaba. */
    async reclamarAviso(id, { ahora, precio, rebajaPct = null, via = 'telegram' }) {
      const d = db.deals.get(id);
      if (!d) return null;
      if (d.notificado && rebajaPct == null) return null;
      if (rebajaPct != null && d.precioNotificado != null && !(precio <= d.precioNotificado * (1 - rebajaPct / 100))) return null;
      const previo = { notificado: d.notificado ?? false, precioNotificado: d.precioNotificado ?? null, notificadoEn: d.notificadoEn ?? null, via: d.via ?? null };
      Object.assign(d, { notificado: true, notificadoEn: ahora, precioNotificado: precio, via, avisos: (d.avisos ?? 0) + 1 });
      return previo;
    },
    async liberarAviso(id, previo) {
      const d = db.deals.get(id);
      if (d) Object.assign(d, previo, { avisos: Math.max(0, (d.avisos ?? 1) - 1) });
    },
    /** Marca como avisado sin enviar nada (siembra, silencio, tope). */
    async marcarAvisado(id, { ahora, precio, via }) {
      const d = db.deals.get(id);
      if (d) Object.assign(d, { notificado: true, notificadoEn: ahora, precioNotificado: precio, via });
    },

    async reservarCupo(dia, quiero, maxDia) {
      const g = global();
      const hoy = g.dia === dia ? (g.avisosHoy ?? 0) : 0;
      const topeAvisado = g.dia === dia ? Boolean(g.topeAvisado) : false;
      const k = Math.max(0, Math.min(quiero, maxDia - hoy));
      setGlobal({ ...g, dia, avisosHoy: hoy + k, topeAvisado });
      return { k, avisosHoy: hoy + k, topeAvisado };
    },
    async devolverCupo(dia, n) {
      const g = global();
      if (g.dia === dia) setGlobal({ ...g, avisosHoy: Math.max(0, (g.avisosHoy ?? 0) - n) });
    },
    async marcarTope(dia) {
      setGlobal({ ...global(), dia, topeAvisado: true });
    },
    async guardarCola(cola) {
      setGlobal({ ...global(), cola: clonar(cola) });
    },

    async guardarEstado(fuente, { recientes = {}, borrar = [], campos = {} }) {
      const e = db.estado.get(fuente) ?? {};
      const rec = { ...(e.recientes ?? {}) };
      for (const [id, v] of Object.entries(recientes)) rec[id] = { ...rec[id], ...clonar(v) };
      for (const id of borrar) delete rec[id];
      db.estado.set(fuente, { ...e, ...clonar(campos), recientes: rec });
    },

    async registrarEjecucion(id, datos) {
      db.ejecuciones.set(id, clonar(datos));
    },
  };
}
