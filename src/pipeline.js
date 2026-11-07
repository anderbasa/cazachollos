// Recogida y puntuación: fuentes aisladas → normalizar → puntuar → deduplicar.
// No guarda ni envía nada: eso lo hace motor.js comparando con el estado guardado.
import { puntuar } from './scorer.js';
import { cargarFuentes } from './sources/index.js';

export async function ejecutar({ modo, config, http, log, ahora = Date.now(), solo, fuentes }) {
  const lista = fuentes ?? (await cargarFuentes(config, modo, { solo }));
  const resultados = [];

  for (const f of lista) {
    if (solo && !solo.includes(f.id)) continue;
    const t0 = Date.now();
    const informe = {};
    try {
      const deals = await f.modulo.fetch({ fuente: f.id, opciones: f.opciones, modo, config, http, log, ahora, informe });
      resultados.push({ fuente: f.id, ok: true, deals, informe, ms: Date.now() - t0 });
    } catch (e) {
      // Una fuente que falla no para a las demás
      resultados.push({ fuente: f.id, ok: false, error: e.message, bloqueo: Boolean(e.bloqueo), informe, ms: Date.now() - t0 });
    }
  }

  const porId = new Map();
  for (const r of resultados) for (const d of r.deals ?? []) if (!porId.has(d.id)) porId.set(d.id, d);
  const todos = [...porId.values()].map((d) => ({ ...d, ...puntuar(d, config.umbrales, ahora) }));

  const chollos = todos.filter((d) => d.esChollo && !d.caducado).sort(porPuntuacion);
  const chollazos = chollos.filter((d) => d.esChollazo);
  // Lo que casi avisa: útil para afinar umbrales
  const casi = todos.filter((d) => !d.esChollazo && d.motivos.length > 0).sort(porPuntuacion);

  return { modo, ahora, resultados, todos, chollos, chollazos, casi, peticiones: http.peticiones ?? 0 };
}

export const porPuntuacion = (a, b) => b.puntuacion - a.puntuacion || (b.temperatura ?? 0) - (a.temperatura ?? 0);

/** Lo urgente (errores de precio y gratis) primero; luego por puntuación. */
export const esUrgente = (d) => d.etiquetas.includes('ERROR_DE_PRECIO') || d.gratis;
export const ordenarAvisos = (lista) => [...lista].sort((a, b) => esUrgente(b.d ?? b) - esUrgente(a.d ?? a) || porPuntuacion(a.d ?? a, b.d ?? b));

/** ¿Estamos dentro de las horas de silencio? Soporta rangos que cruzan medianoche (23:00–08:00). */
export function estaEnSilencio(s, ahora = Date.now(), zona = 'Europe/Madrid') {
  if (!s?.activo) return false;
  const hhmm = new Intl.DateTimeFormat('es-ES', { timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ahora);
  const min = (x) => {
    const [h, m] = x.split(':').map(Number);
    return h * 60 + m;
  };
  const t = min(hhmm);
  const desde = min(s.desde);
  const hasta = min(s.hasta);
  return desde <= hasta ? t >= desde && t < hasta : t >= desde || t < hasta;
}

/** "AAAA-MM-DD" en la zona horaria dada. */
export function diaLocal(ms, zona = 'Europe/Madrid') {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
}
