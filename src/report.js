// Salida por consola. Ojo: en GitHub Actions estos logs son PÚBLICOS, así que aquí solo se
// imprimen datos de los chollos (públicos) y contadores; nunca claves, chat_id ni datos personales.
import { formatoEuros } from './text.js';

export function emoji(d, tipo) {
  if (tipo === 'rebaja') return '📉';
  if (d.etiquetas.includes('ERROR_DE_PRECIO')) return '🚨';
  if (d.gratis) return '🎁';
  if (d.etiquetas.includes('SIN_VERIFICAR')) return '⚠️';
  return '🔥';
}

export function lineaDeal(d, { motivos = false, bloqueos = false } = {}) {
  const precio =
    d.precio == null
      ? d.descuento != null
        ? `-${d.descuento} %`
        : 'sin precio'
      : d.precioAnterior != null
        ? `${formatoEuros(d.precioEfectivo)} (antes ${formatoEuros(d.precioAnterior)}, -${d.descuento} %)`
        : formatoEuros(d.precioEfectivo);
  const partes = [
    `[${String(d.puntuacion).padStart(3)}]`,
    recortar(d.titulo, 70),
    '—',
    precio,
    '·',
    d.tienda ?? '?',
    '·',
    d.categoria,
    d.temperatura != null ? `· ${Math.round(d.temperatura)}°` : '',
    d.edadMinutos != null ? `· hace ${edad(d.edadMinutos)}` : '',
  ];
  let s = partes.filter(Boolean).join(' ');
  // La etiqueta GRATIS visible es la del puntuador (precio 0 verificado), no la palabra clave
  const visibles = d.etiquetas.filter((e) => ['ERROR_DE_PRECIO', 'SIN_VERIFICAR', 'CADUCADO', 'LOCAL'].includes(e));
  if (d.gratis) visibles.unshift('GRATIS');
  if (visibles.length) s += `  {${visibles.join(', ')}}`;
  if (motivos && d.motivos.length) s += `\n        ↳ ${d.motivos.join(' · ')}`;
  if (bloqueos && d.bloqueos.length) s += `\n        ✋ ${d.bloqueos.join(' · ')}`;
  return s;
}

export function imprimirInforme(s, { dryRun = false, todos = false, out = console.log } = {}) {
  const fecha = new Date(s.ahora).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
  const modoTxt = dryRun ? 'DRY-RUN (no se guarda ni se envía nada)' : 'REAL';
  out(`\nCazachollos · modo ${s.modo}${s.respaldo ? ' (respaldo)' : ''} · ${modoTxt} · ${fecha}`);
  out(`Almacén: ${s.almacen}\n`);
  if (s.saltado) {
    out(`⏭  ${s.saltado}\n`);
    return;
  }

  out('Fuentes:');
  for (const f of s.resultados) {
    const detalle = Object.entries(f.informe ?? {})
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ');
    if (f.ok) out(`  ✔ ${f.fuente.padEnd(12)} ${String(f.deals.length).padStart(3)} leídos${detalle ? ` (${detalle})` : ''} · ${(f.ms / 1000).toFixed(1)} s`);
    else out(`  ✘ ${f.fuente.padEnd(12)} FALLÓ: ${f.error}${f.bloqueo ? ' (parece un bloqueo)' : ''}`);
  }
  for (const id of s.desactivadas ?? []) out(`  ⛔ ${id.padEnd(12)} desactivada (nos bloqueaba)`);
  if (s.resultados.length === 0 && !(s.desactivadas ?? []).length) out('  (ninguna fuente activa para este modo)');

  out(
    `\nResultado: ${s.todos.length} chollos distintos · ${s.chollos.length} cumplen las reglas de la web · ` +
      `${s.chollazos.length} chollazos · ${s.escrituras.creados} nuevos ${dryRun ? 'se guardarían' : 'guardados'} · ` +
      `${s.escrituras.actualizados} ${dryRun ? 'se actualizarían' : 'actualizados'} · ${s.peticiones} peticiones HTTP\n`,
  );

  const chollos = s.enviados.filter((e) => e.deal);
  out(`${dryRun ? 'Avisaría' : 'Avisado'} por Telegram (${chollos.length})${s.silencio ? ' — horas de silencio activas' : ''}:`);
  if (chollos.length === 0) out('  (nada en esta ronda)');
  for (const e of chollos) out(`  ${emoji(e.deal, e.tipo)} ${lineaDeal(e.deal, { motivos: true })}\n        ${e.deal.url}`);
  if (s.resumen?.length) out(`  ➕ ${s.resumen.length} más en un único mensaje resumen`);
  if (s.tope?.length) out(`  🛑 ${s.tope.length} sin avisar: ya se llegó al máximo diario`);
  if (s.silenciados?.length) out(`  🌙 ${s.silenciados.length} a la cola del resumen de la mañana`);
  if (s.sembrados?.length) out(`  🌱 Primera ejecución de la fuente: ${s.sembrados.length} chollazos marcados como vistos, sin avisar`);
  for (const e of s.enviados.filter((x) => x.tipo === 'sistema')) out(`  🔧 ${e.texto.replace(/<[^>]+>/g, '').split('\n')[0]}`);
  for (const e of s.errores) out(`  ✘ ${e}`);

  if (dryRun) {
    const n = todos ? s.chollos.length : 15;
    const web = s.chollos.filter((d) => !d.esChollazo);
    out(`\nCumplen las reglas de la web pero no avisan (${web.length}${web.length > n ? `, enseño los ${n} mejores` : ''}):`);
    for (const d of web.slice(0, n)) out(`  ${lineaDeal(d)}`);
    if (s.casi.length) {
      out(`\nCasi chollazos, frenados por una regla de "nunca" (${s.casi.length}${s.casi.length > 8 ? ', enseño 8' : ''}):`);
      for (const d of s.casi.slice(0, 8)) out(`  ${lineaDeal(d, { motivos: true, bloqueos: true })}`);
    }
  }
  out('');
}

function recortar(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function edad(min) {
  if (min < 60) return `${min} min`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h`;
  return `${Math.round(min / 1440)} d`;
}
