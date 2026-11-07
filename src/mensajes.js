// Textos de Telegram (HTML). Solo datos públicos de los chollos.
import { formatoEuros } from './text.js';

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const recortar = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export function cabecera(d, tipo) {
  if (tipo === 'rebaja') return '📉 <b>HA BAJADO AÚN MÁS</b>';
  if (d.etiquetas.includes('ERROR_DE_PRECIO')) return '🚨 <b>ERROR DE PRECIO</b>';
  if (d.gratis) return '🎁 <b>GRATIS</b>';
  if (d.etiquetas.includes('SIN_VERIFICAR')) return '⚠️ <b>SIN VERIFICAR</b>';
  return '🔥 <b>CHOLLAZO</b>';
}

/** Mensaje de un chollazo: { texto, foto, boton }. El texto cabe en un pie de foto (≤ 1024). */
export function mensajeChollo(d, { tipo = 'nuevo', antes = null, config } = {}) {
  const nombreCat = config?.categorias?.nombres?.[d.categoria] ?? d.categoria;
  const nombreFuente = config?.fuentes?.[d.fuente]?.nombre ?? d.fuente;
  const lineas = [cabecera(d, tipo), `<b>${esc(recortar(d.titulo, 200))}</b>`, ''];

  let precio;
  if (d.gratis) precio = d.precioAnterior ? `💶 <s>${formatoEuros(d.precioAnterior)}</s> → <b>GRATIS</b>` : '💶 <b>GRATIS</b>';
  else if (d.precioEfectivo == null) precio = d.descuento != null ? `💶 <b>-${d.descuento} %</b>` : null;
  else if (d.precioAnterior != null) precio = `💶 <s>${formatoEuros(d.precioAnterior)}</s> → <b>${formatoEuros(d.precioEfectivo)}</b> · <b>-${d.descuento} %</b>`;
  else precio = `💶 <b>${formatoEuros(d.precioEfectivo)}</b>`;
  if (precio) {
    if (d.envio > 0) precio += ` (con ${formatoEuros(d.envio)} de envío)`;
    lineas.push(precio);
  }
  if (tipo === 'rebaja' && antes != null) lineas.push(`↘️ Te avisé a ${formatoEuros(antes)}`);
  lineas.push(`🏪 ${esc(d.tienda ?? '¿tienda?')} · ${esc(nombreCat)}`);
  const temp = d.temperatura != null ? `🌡️ ${Math.round(d.temperatura)}°${d.velocidad >= 1 ? ` (${String(d.velocidad).replace('.', ',')}°/min)` : ''} · ` : '';
  lineas.push(`${temp}${esc(nombreFuente)}`);
  if (d.cupon) lineas.push(`🏷️ Cupón: <code>${esc(d.cupon)}</code>`);
  if (d.motivos?.length) lineas.push(`💡 ${esc(d.motivos.join(' · '))}`);

  return { texto: lineas.join('\n').slice(0, 1024), foto: d.imagen ?? null, boton: { texto: 'Ver chollo', url: d.url } };
}

export function lineaCorta(d) {
  const precio = d.gratis ? 'GRATIS' : d.precioEfectivo != null ? `${formatoEuros(d.precioEfectivo)}${d.descuento != null ? ` (-${d.descuento} %)` : ''}` : d.descuento != null ? `-${d.descuento} %` : '';
  return `• <a href="${esc(d.url)}">${esc(recortar(d.titulo, 80))}</a>${precio ? ` — ${precio}` : ''}`;
}

export function mensajeResumen(deals, max) {
  return [`➕ <b>${deals.length} chollazo${deals.length === 1 ? '' : 's'} más</b> (en esta ronda ya van ${max} avisos):`, '', ...deals.slice(0, 25).map(lineaCorta)].join('\n');
}

export function mensajeTope(max) {
  return `🛑 Hoy ya van <b>${max} avisos</b>, el máximo diario. Los chollazos que salgan hasta medianoche solo estarán en la web.`;
}

export function mensajeCola(cola) {
  return [`🌙 <b>Mientras dormías</b> (${cola.length}):`, '', ...cola.slice(0, 25).map(lineaCorta)].join('\n');
}

export function mensajeFuenteFalla(nombre, desdeMs, ahora, error) {
  return `⚠️ La fuente <b>${esc(nombre)}</b> lleva ${duracion(ahora - desdeMs)} fallando.\n<code>${esc(String(error).slice(0, 200))}</code>`;
}

export function mensajeFuenteDesactivada(nombre, error) {
  return `🚫 <b>${esc(nombre)}</b> me está bloqueando y la he desactivado para no insistir.\n<code>${esc(String(error).slice(0, 200))}</code>\nSe reactiva desde Ajustes en la web (o en Firestore: estado/… → desactivada = false).`;
}

export function mensajeFuenteRecuperada(nombre) {
  return `✅ La fuente <b>${esc(nombre)}</b> vuelve a funcionar.`;
}

function duracion(ms) {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h`;
  return `${Math.round(min / 1440)} días`;
}
