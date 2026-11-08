// Vuelve a puntuar los chollos ya guardados con las reglas actuales (config.yml + ajustes de la web).
// Sirve para que la web siga tus ajustes cuando los cambias: por ejemplo, al desactivar los
// videojuegos, los que ya estaban guardados dejan de contar como chollo (esChollo = false).
// Solo reescribe los documentos en los que cambia algo que la web usa.
import { mapearCategoria } from './config.js';
import { puntuar } from './scorer.js';
import { detectarTipo, normalizarClave } from './text.js';

const ETIQUETAS_TIPO = ['DIGITAL', 'NO_FISICO', 'CUPON', 'RECOPILACION'];

export function recalcularDoc(doc, config, ahora = Date.now()) {
  const etiquetas = new Set((doc.etiquetas ?? []).filter((e) => !ETIQUETAS_TIPO.includes(e)));
  for (const e of detectarTipo(doc.titulo ?? '')) etiquetas.add(e);
  const noFisicas = new Set((config.categorias?.chollometro_no_fisicas ?? []).map(normalizarClave));
  if (doc.categoriaFuente && noFisicas.has(normalizarClave(doc.categoriaFuente))) etiquetas.add('NO_FISICO');
  if (doc.extra?.tipo === 'Voucher') etiquetas.add('CUPON');
  if (doc.precio === 0 && ((doc.titulo ?? '').match(/,/g) ?? []).length >= 3) etiquetas.add('RECOPILACION');

  // Chollometro trae su categoría: se vuelve a mapear (por si cambió el mapa, p. ej. "belleza")
  const categoria = doc.fuente === 'chollometro' && doc.categoriaFuente && !doc.extra?.parcial ? mapearCategoria(config, 'chollometro', doc.categoriaFuente) : doc.categoria;
  const deal = { ...doc, categoria, etiquetas: [...etiquetas].sort(), publicadoEn: typeof doc.publicadoEn === 'number' ? new Date(doc.publicadoEn).toISOString() : doc.publicadoEn };
  const r = puntuar(deal, config.umbrales, ahora);
  // Solo se aplican los filtros de interés. Lo demás (si fue chollazo, etc.) se respeta: con la hora
  // de ahora un chollo de hace días ya no cumpliría "1.000° en 2 h" y perdería su marca.
  let esChollo;
  let esChollazo;
  if (r.filtrado) [esChollo, esChollazo] = [false, false];
  else if (doc.filtrado) [esChollo, esChollazo] = [r.esChollo, r.esChollazo]; // vuelve: su categoría se reactivó
  else [esChollo, esChollazo] = [doc.esChollo ?? r.esChollo, doc.esChollazo ?? r.esChollazo];
  const nuevo = { categoria, etiquetas: deal.etiquetas, esChollo, esChollazo, filtrado: r.filtrado };
  if (r.filtrado) nuevo.bloqueos = r.bloqueos;
  const cambia =
    nuevo.categoria !== doc.categoria ||
    nuevo.esChollo !== doc.esChollo ||
    nuevo.esChollazo !== doc.esChollazo ||
    nuevo.filtrado !== Boolean(doc.filtrado) ||
    nuevo.etiquetas.join() !== [...(doc.etiquetas ?? [])].sort().join();
  return cambia ? nuevo : null;
}

export async function recalcularGuardados({ store, config, log, ahora = Date.now(), dryRun = false }) {
  const docs = await store.listarDeals();
  let cambiados = 0;
  let fuera = 0;
  for (const doc of docs) {
    const cambios = recalcularDoc(doc, config, ahora);
    if (!cambios) continue;
    cambiados++;
    if (doc.esChollo && !cambios.esChollo) fuera++;
    if (!dryRun) await store.actualizarDeal(doc.id, cambios);
  }
  log.info(`Recalculados ${docs.length} chollos guardados: ${cambiados} cambian${fuera ? `, ${fuera} salen de la web` : ''}${dryRun ? ' (dry-run: no se escribe)' : ''}.`);
  return { total: docs.length, cambiados, fuera };
}
