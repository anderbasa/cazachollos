// Utilidades de texto: precios en formato español, claves normalizadas y palabras clave.
import { etiquetasPerfume } from './perfumes.js';

/** "1.234,56 €" → 1234.56 · "54,90€" → 54.9 · "19.99€" → 19.99 · "GRATIS" → null */
export function parsePrecio(texto) {
  if (texto == null) return null;
  if (typeof texto === 'number') return Number.isFinite(texto) ? texto : null;
  const limpio = String(texto).replace(/[^\d.,]/g, '');
  if (!/\d/.test(limpio)) return null;
  let n;
  const ultPunto = limpio.lastIndexOf('.');
  const ultComa = limpio.lastIndexOf(',');
  if (ultPunto >= 0 && ultComa >= 0) {
    // El último separador es el decimal
    const dec = ultComa > ultPunto ? ',' : '.';
    const miles = dec === ',' ? '.' : ',';
    n = Number(limpio.split(miles).join('').replace(dec, '.'));
  } else if (ultComa >= 0) {
    n = Number(limpio.replace(/\./g, '').replace(',', '.'));
  } else if (ultPunto >= 0) {
    // "1.234" son miles; "19.99" es decimal
    const tras = limpio.length - ultPunto - 1;
    n = tras === 3 ? Number(limpio.replace(/\./g, '')) : Number(limpio);
  } else {
    n = Number(limpio);
  }
  return Number.isFinite(n) ? n : null;
}

/** "Hogar, vivienda y oficina" → "hogar-vivienda-y-oficina" */
export function normalizarClave(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const RE_ERROR_PRECIO = /\b(errore?s? (de|en el|del) precio|precio err[oó]neo|bug de precio|price error|pricing error)\b/i;
// "envío gratis" y similares no hacen gratis el producto
const RE_ENVIO_GRATIS = /\b(env[ií]os?|gastos de env[ií]o|entrega|devoluci[oó]n(es)?)\s+(\w+\s+)?(gratis|gratuit[oa]s?)\b/gi;
// (sin "free": en títulos españoles suele ser "sugar free", "DRM-free"…)
const RE_GRATIS = /\b(gratis|gratuit[oa]s?|regalan?)\b|(^|[^\d.,])0\s?€|\b0,00\s?€/i;
const RE_CON_COMPRA = /\b(con (la |tu )?compra|al comprar|por (la )?compra|compras? (superior|m[ií]nima|de m[aá]s)|pedidos? (superior|m[ií]nimo|de m[aá]s)|si compras|llévate|llevate|2x1|3x2)\b/i;
const RE_PRUEBA = /\b(prueba gratis|gratis (durante|por) \d+|\d+ (d[ií]as?|semanas?|mes(es)?|a[nñ]os?) gratis|durante \d+ (d[ií]as|semanas|mes(es)?)|periodo de prueba|pase de \d+|pase \d+|muestras? gratis)\b/i;
// "-100 %", "100 % de descuento", "100 % gratis"… pero no "100 % algodón"
const RE_CIEN = /(-\s?100\s?%|\b100\s?%\s?(de\s)?(descuento|dto\.?|gratis|off|reembolso))/i;
const RE_REGALO = /\b(de regalo|regalo|regala)\b/i;

// Lo que no es un producto físico. Cuidado con los falsos positivos: "reloj digital", "Kindle",
// "Steam Deck", "plancha Steam Force", "licencia oficial" (merchandising) sí son físicos.
const RE_DIGITAL = new RegExp(
  [
    String.raw`\bplugins?\b`,
    String.raw`\bvst\b`,
    String.raw`\bsoftware\b`,
    String.raw`\blicencias?\s+(de\s+(uso|por vida|\d+)|completa|anual|vitalicia|perpetua|windows|office)`,
    String.raw`\b(windows|office)\s+\d*\s*(pro|home|hogar)?\s*(key|clave|licencia)`,
    // "1 año de suscripción", "suscripción anual"… pero no "cámara con suscripción incluida"
    String.raw`\b\d+\s*(mes|meses|año|años)\s+de\s+suscripci[oó]n`,
    String.raw`\bsuscripci[oó]n\s+(anual|mensual|trimestral|de\s+\d+|gratis|premium)`,
    String.raw`^\s*suscripci[oó]n\b`,
    String.raw`\be-?books?\b`,
    String.raw`\bkindle unlimited\b`,
    String.raw`\baudible\b`,
    String.raw`\bcursos?\b`,
    String.raw`\budemy\b`,
    String.raw`\bwebinars?\b`,
    String.raw`\bepic games\b`,
    String.raw`\bgog(\.com)?\b`,
    String.raw`\bprime gaming\b`,
    String.raw`\bgame ?pass\b`,
    String.raw`\b(ps|playstation) plus\b`,
    String.raw`\bdlc\b`,
    String.raw`\bvpn\b`,
    String.raw`\bantivirus\b`,
    String.raw`\b(netflix|spotify|dazn|youtube premium|crunchyroll|filmin|hbo max)\b`,
    String.raw`\b(disney|apple tv|movistar|paramount)\s?\+`,
    String.raw`\b(c[oó]digo|versi[oó]n|edici[oó]n|formato)\s+digital\b`,
    String.raw`\|\s*digital\b`,
    String.raw`\b(apps?|aplicaci[oó]n(es)?)\b`,
    String.raw`\((android|ios)(\s*[/,y]\s*(android|ios))?\)`,
    String.raw`\b(recursos|assets)\s+gratis`,
  ].join('|'),
  'i',
);
// Listas de varios productos ("Recopilación de… desde 7,99 €") en vez de un chollo concreto
const RE_RECOPILACION = /\b(recopilaci[oó]n|recopilatorio|mega ?recopilaci[oó]n|selecci[oó]n de|top \d+ (de )?(chollos|ofertas)|resumen (semanal|diario|de la semana)|ofertas en)\b/i;

/** Detecta etiquetas a partir de título (y opcionalmente descripción/categoría). */
export function detectarPalabras(...textos) {
  const t = textos.filter(Boolean).join(' · ');
  const sinEnvio = t.replace(RE_ENVIO_GRATIS, ' ');
  const etiquetas = new Set();
  if (RE_ERROR_PRECIO.test(t)) etiquetas.add('ERROR_DE_PRECIO');
  if (RE_GRATIS.test(sinEnvio) || RE_CIEN.test(t)) etiquetas.add('GRATIS');
  if (RE_CIEN.test(t)) etiquetas.add('CIEN_POR_CIEN');
  if (RE_REGALO.test(t)) etiquetas.add('REGALO');
  if (etiquetas.has('GRATIS') || etiquetas.has('REGALO')) {
    if (RE_CON_COMPRA.test(t)) etiquetas.add('CON_COMPRA');
    if (RE_PRUEBA.test(t)) etiquetas.add('PRUEBA');
  }
  return etiquetas;
}

/** Etiquetas de "qué es": DIGITAL (no físico), RECOPILACION y PERFUME (+ su tipo). Solo mira el título. */
export function detectarTipo(titulo) {
  const etiquetas = new Set();
  if (RE_DIGITAL.test(titulo)) etiquetas.add('DIGITAL');
  if (RE_RECOPILACION.test(titulo)) etiquetas.add('RECOPILACION');
  for (const e of etiquetasPerfume(titulo)) etiquetas.add(e);
  return etiquetas;
}

// Importe en euros: "1.234,56 €", "54,90€", "19.99 euros"
const IMPORTE = String.raw`(\d[\d.,]*\d|\d)\s?(?:€|euros?\b|eur\b)`;
const RE_ANTERIOR = new RegExp(String.raw`\b(?:antes|pvp(?: normal| recomendado)?|precio (?:habitual|original|normal|anterior)|era)\s*:?\s*\+?\s*` + IMPORTE, 'i');
const RE_ACTUAL = new RegExp(String.raw`\b(?:ahora|solo|sólo|por|oferta|precio final)\s*:?\s*` + IMPORTE, 'i');
const RE_IMPORTE = new RegExp(IMPORTE, 'gi');
const RE_PORCENTAJE = /-\s?(\d{1,3})\s?%/;

/**
 * Saca precios de un texto libre (mensajes de Telegram, RSS de otras webs):
 * "✅ 95,00 € (antes 159,00 €)", "solo 2,6€ (PVP: 8,9€)", "Antes: 44,95€ / Oferta 29,90€ (-33%)".
 */
export function extraerPrecios(texto) {
  const t = String(texto ?? '');
  const mAnt = t.match(RE_ANTERIOR);
  const precioAnterior = mAnt ? parsePrecio(mAnt[1]) : null;
  let precio = null;
  const mAct = t.replace(mAnt?.[0] ?? '\u0000', ' ').match(RE_ACTUAL);
  if (mAct) precio = parsePrecio(mAct[1]);
  if (precio == null) {
    // Primer importe que no sea el precio anterior
    for (const m of t.matchAll(RE_IMPORTE)) {
      if (mAnt && m.index >= mAnt.index && m.index < mAnt.index + mAnt[0].length) continue;
      precio = parsePrecio(m[1]);
      break;
    }
  }
  const mPct = t.match(RE_PORCENTAJE);
  const porcentaje = mPct ? Number(mPct[1]) : null;
  return { precio, precioAnterior, porcentaje };
}

/** Formato corto para consola y Telegram: 1234.5 → "1.234,50 €" */
export function formatoEuros(n) {
  if (n == null) return '—';
  if (n === 0) return '0 €';
  return n.toLocaleString('es-ES', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + ' €';
}
