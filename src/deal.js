// Modelo Deal normalizado: todas las fuentes producen esto y el puntuador solo entiende esto.
// El esquema completo está documentado en DATA.md (fase 2).
import { createHash } from 'node:crypto';

export const CATEGORIAS = ['tecnologia', 'videojuegos', 'hogar', 'moda', 'belleza', 'otros'];

/** id estable: hash de fuente + identificador en la fuente (20 caracteres hex). */
export function idDeal(fuente, idFuente) {
  return createHash('sha1').update(`${fuente}:${idFuente}`).digest('hex').slice(0, 20);
}

/**
 * ¿Ha bajado lo bastante desde el último aviso como para volver a avisar?
 * Estricto (<) y nunca si ya se avisó a 0 €: lo gratis no puede "bajar más".
 * (Con "<=", algo gratis contaba como rebajado en cada ejecución: así se repitieron 71 avisos.)
 */
export function esRebaja(precioNuevo, precioAvisado, pct) {
  if (!(precioAvisado > 0) || precioNuevo == null) return false;
  return precioNuevo < precioAvisado * (1 - pct / 100) - 0.005;
}

/** Descuento (%) sobre el precio efectivo (precio + envío). null si no se puede calcular. */
export function calcularDescuento(precio, precioAnterior, envio) {
  if (precio == null || !(precioAnterior > 0)) return null;
  const efectivo = precio + (envio ?? 0);
  return Math.max(0, Math.round((1 - efectivo / precioAnterior) * 100));
}

/**
 * Crea un Deal con valores por defecto y campos derivados.
 * Campos obligatorios: fuente, idFuente, titulo, url.
 */
export function crearDeal(c) {
  for (const k of ['fuente', 'idFuente', 'titulo', 'url']) {
    if (c[k] == null || c[k] === '') throw new Error(`Deal sin ${k}`);
  }
  if (c.categoria && !CATEGORIAS.includes(c.categoria)) throw new Error(`Categoría desconocida: ${c.categoria}`);
  const precio = numOrNull(c.precio);
  const precioAnterior = numOrNull(c.precioAnterior);
  const envio = numOrNull(c.envio);
  const descuento = c.descuento ?? calcularDescuento(precio, precioAnterior, envio);
  const etiquetas = new Set(c.etiquetas ?? []);
  if (!(c.verificado ?? false)) etiquetas.add('SIN_VERIFICAR');
  if (c.caducado) etiquetas.add('CADUCADO');
  if (c.local) etiquetas.add('LOCAL');
  return {
    id: idDeal(c.fuente, c.idFuente),
    fuente: c.fuente, // id de la fuente en config.yml (chollometro, telegram…): decide el id y el estado
    origen: c.origen ?? c.fuente, // detalle: listado, canal…
    fuentes: [...new Set(c.fuentes ?? [c.fuente])], // todas las que lo han visto (se unen al fusionar)
    idFuente: String(c.idFuente),
    titulo: String(c.titulo).trim(),
    url: c.url,
    tienda: c.tienda ?? null,
    categoria: c.categoria ?? 'otros',
    categoriaFuente: c.categoriaFuente ?? null,
    precio,
    precioAnterior,
    envio, // 0 = gratis · null = desconocido
    precioEfectivo: precio == null ? null : round2(precio + (envio ?? 0)),
    descuento, // % entero sobre el precio efectivo
    cupon: c.cupon || null,
    temperatura: numOrNull(c.temperatura),
    publicadoEn: c.publicadoEn ?? null, // ISO 8601
    imagen: c.imagen ?? null,
    caducado: Boolean(c.caducado),
    local: Boolean(c.local),
    verificado: c.verificado ?? false, // datos comprobados en una fuente fiable (Chollometro, GamerPower)
    fiable: c.fiable ?? false, // la fuente puede avisar aunque no esté verificado
    // Visibles: ERROR_DE_PRECIO, GRATIS, SIN_VERIFICAR, CADUCADO, LOCAL.
    // Internas: CON_COMPRA, PRUEBA, REGALO, CIEN_POR_CIEN, JUEGO_COMPLETO.
    etiquetas: [...etiquetas].sort(),
    extra: c.extra ?? {},
  };
}

function numOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
