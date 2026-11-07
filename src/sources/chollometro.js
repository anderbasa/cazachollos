// Fuente principal: Chollometro.
//
// Cada listado (nuevos, subiendo, gratis…) se pide UNA vez por ejecución:
//   1. Página de listado: trae todos los datos en JSON embebido (atributos data-vue3),
//      incluidos precio anterior, envío, temperatura, cupón y si está caducado.
//   2. Si falla o viene vacía, su RSS, que solo trae título, precio, tienda, categoría e imagen.
// Nunca se abre cada chollo uno a uno. /search está prohibido en su robots.txt: no se usa.
import { XMLParser } from 'fast-xml-parser';
import { mapearCategoria } from '../config.js';
import { crearDeal } from '../deal.js';
import { detectarPalabras, parsePrecio } from '../text.js';

const BASE = 'https://www.chollometro.com';
const IMG = 'https://static.chollometro.com';
const FUENTE = 'chollometro';

export async function fetch(ctx) {
  const { opciones, modo, http, log, config, informe } = ctx;
  const ahora = ctx.ahora ?? Date.now();
  const listados = (opciones.listados ?? []).filter((l) => !l.modos || l.modos.includes(modo));
  const porId = new Map();
  const fallos = [];

  for (const l of listados) {
    let deals;
    try {
      deals = parsearListadoHtml(await http.texto(l.html, { accept: 'text/html' }), { config, origen: l.nombre, ahora });
      if (deals.length === 0) throw new Error('el listado no trae chollos (¿ha cambiado la web?)');
    } catch (e) {
      log.aviso(`chollometro/${l.nombre}: el listado falló (${e.message}); pruebo con el RSS`);
      try {
        deals = parsearRss(await http.texto(l.rss, { accept: 'application/rss+xml, text/xml' }), { config, origen: `${l.nombre}-rss` });
      } catch (e2) {
        fallos.push({ listado: l.nombre, error: e2.message, bloqueo: Boolean(e.bloqueo || e2.bloqueo) });
        continue;
      }
    }
    if (informe) informe[l.nombre] = deals.length;
    for (const d of deals) {
      const previo = porId.get(d.id);
      // Si sale en dos listados, nos quedamos con el que trae más datos (HTML antes que RSS)
      if (!previo || (previo.extra.rss && !d.extra.rss)) porId.set(d.id, d);
    }
  }

  if (listados.length > 0 && fallos.length === listados.length) {
    const err = new Error(`todos los listados fallaron: ${fallos.map((f) => `${f.listado} (${f.error})`).join(', ')}`);
    err.bloqueo = fallos.some((f) => f.bloqueo);
    throw err;
  }
  return [...porId.values()];
}

// ── Página de listado ────────────────────────────────────────────────────────

/** Extrae los hilos del JSON embebido. Devuelve Deals. */
export function parsearListadoHtml(html, { config, origen = 'listado', ahora = Date.now() } = {}) {
  const deals = [];
  for (const t of extraerHilos(html)) {
    const d = hiloADeal(t, { config, origen, ahora });
    if (d) deals.push(d);
  }
  return deals;
}

/** Objetos "thread" crudos tal como vienen en data-vue3='{"name":"ThreadMainListItemNormalizer",…}'. */
export function extraerHilos(html) {
  const hilos = [];
  for (const m of html.matchAll(/data-vue3='([^']*)'/g)) {
    if (!m[1].includes('ThreadMainListItemNormalizer')) continue;
    try {
      const j = JSON.parse(decodificarEntidades(m[1]));
      if (j?.name === 'ThreadMainListItemNormalizer' && j.props?.thread) hilos.push(j.props.thread);
    } catch {
      // Un hilo mal formado no tumba el listado
    }
  }
  return hilos;
}

export function hiloADeal(t, { config, origen, ahora = Date.now() }) {
  if (!t?.threadId || !t.title) return null;
  if (t.type !== 'Deal' && t.type !== 'Voucher') return null; // fuera debates
  if (t.isPinned) return null; // avisos fijados de la propia web

  const grupo = t.mainGroup ?? {};
  const etiquetas = detectarPalabras(t.title, grupo.threadGroupName);
  const precioAnterior = t.nextBestPrice > 0 ? t.nextBestPrice : null;
  let precio = t.type === 'Deal' && typeof t.price === 'number' ? t.price : null;
  // Precio 0 sin precio anterior ni "gratis" en el título = no tiene precio (recopilaciones, promos…)
  if (precio === 0 && precioAnterior == null && !etiquetas.has('GRATIS')) precio = null;
  if (precio === 0) etiquetas.add('GRATIS');

  const envio = t.shipping?.isFree ? 0 : t.shipping?.price > 0 ? t.shipping.price : null;
  const fin = typeof t.endDate === 'number' ? t.endDate : t.endDate?.timestamp;
  const caducado = Boolean(t.isExpired) || (t.status != null && t.status !== 'Activated') || (fin > 0 && fin * 1000 < ahora);
  // Para cupones el "descuento" es el del código (p. ej. -50 % con MAGIC)
  const descuento = precio == null && t.discountType === 'Percentage' && t.percentage > 0 ? t.percentage : undefined;

  return crearDeal({
    fuente: FUENTE,
    origen,
    idFuente: t.threadId,
    titulo: t.title,
    url: `${BASE}/${t.type === 'Voucher' ? 'cupones' : 'ofertas'}/${t.titleSlug}-${t.threadId}`,
    tienda: t.merchant?.merchantName ?? (t.linkHost ? t.linkHost.replace(/^www\./, '') : null),
    categoria: mapearCategoria(config, FUENTE, [grupo.threadGroupUrlName, grupo.threadGroupName]),
    categoriaFuente: grupo.threadGroupName ?? null,
    precio,
    precioAnterior,
    envio,
    descuento,
    cupon: t.voucherCode || null,
    temperatura: typeof t.temperature === 'number' ? Math.round(t.temperature * 10) / 10 : null,
    publicadoEn: t.publishedAt ? new Date(t.publishedAt * 1000).toISOString() : null,
    imagen: urlImagen(t.mainImage),
    caducado,
    local: Boolean(t.isLocal),
    verificado: true,
    fiable: true,
    etiquetas,
    extra: {
      tipo: t.type,
      comentarios: t.commentCount ?? null,
      hot: Boolean(t.isHot),
      dominio: t.linkHost ?? null,
    },
  });
}

function urlImagen(img) {
  if (!img?.path || !img?.name) return null;
  return `${IMG}/${img.path}/${img.name}/re/300x300/qt/60/${img.name}.jpg`;
}

function decodificarEntidades(s) {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&'); // siempre la última
}

// ── RSS (respaldo) ───────────────────────────────────────────────────────────

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (nombre) => nombre === 'item',
});

export function parsearRss(texto, { config, origen = 'rss' } = {}) {
  const items = xml.parse(texto)?.rss?.channel?.item ?? [];
  const deals = [];
  for (const it of items) {
    const link = String(it.link ?? it.guid ?? '');
    const id = link.match(/-(\d+)(?:[?#].*)?$/)?.[1];
    if (!id || !it.title) continue;
    const comercio = it['pepper:merchant'] ?? {};
    const categoria = typeof it.category === 'string' ? it.category : it.category?.['#text'];
    const etiquetas = detectarPalabras(it.title, categoria);
    let precio = parsePrecio(comercio.price);
    if (precio === 0 && !etiquetas.has('GRATIS')) precio = null;
    if (precio === 0) etiquetas.add('GRATIS');
    const img = it['media:content']?.url ?? it['media:thumbnail']?.url ?? null;
    deals.push(
      crearDeal({
        fuente: FUENTE,
        origen,
        idFuente: id,
        titulo: String(it.title),
        url: link,
        tienda: comercio.name ?? null,
        categoria: mapearCategoria(config, FUENTE, categoria),
        categoriaFuente: categoria ?? null,
        precio,
        publicadoEn: it.pubDate ? new Date(it.pubDate).toISOString() : null,
        imagen: img ? img.replace('/re/150x150/', '/re/300x300/') : null,
        verificado: true,
        fiable: true,
        etiquetas,
        extra: { rss: true },
      }),
    );
  }
  return deals;
}
