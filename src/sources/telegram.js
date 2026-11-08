// Canales públicos de Telegram, leídos desde su vista web https://t.me/s/<canal>
// (sin cuenta ni API; solo funciona si el canal tiene la vista previa activada).
//
// - Guarda el último mensaje leído por canal (estado/telegram → ultimos) y solo procesa lo nuevo
//   (más los que se marquen después como AGOTADO, para actualizar su estado).
// - Si el mensaje enlaza a Chollometro, el chollo lleva el mismo id que el de Chollometro: se
//   fusiona con él y no se avisa dos veces. Si no, entra como SIN VERIFICAR y solo avisa si el
//   canal es "fiable: true" en config.yml.
// - Mensajes de Amazon: el id es el código del producto (ASIN), así el mismo producto publicado
//   otra vez (o en otro canal) es el mismo chollo.
import { categorizarPorTitulo } from '../categorizar.js';
import { crearDeal } from '../deal.js';
import { detectarPalabras, detectarTipo, extraerPrecios, normalizarClave } from '../text.js';
import { createHash } from 'node:crypto';

const FUENTE = 'telegram';

export async function fetch(ctx) {
  const { opciones, http, log, estado, cambiosEstado, informe } = ctx;
  const canales = opciones.canales ?? [];
  const ultimosPrevios = estado?.ultimos ?? {};
  const ultimos = { ...ultimosPrevios };
  const salud = { ...(estado?.canales ?? {}) };
  const deals = [];
  const fallos = [];

  for (const c of canales) {
    try {
      const previo = ultimosPrevios[c.canal] ?? 0;
      let mensajes = parsearPagina(await http.texto(`https://t.me/s/${c.canal}`, { accept: 'text/html' }));
      if (mensajes.length === 0) throw new Error('la vista web no trae mensajes (¿canal cerrado o sin vista previa?)');
      // Si todos los de la página son nuevos, puede haber un hueco: se piden páginas anteriores
      for (let p = 0; p < (opciones.paginas_extra ?? 2) && previo > 0 && Math.min(...mensajes.map((m) => m.id)) > previo + 1; p++) {
        const antes = Math.min(...mensajes.map((m) => m.id));
        mensajes = [...parsearPagina(await http.texto(`https://t.me/s/${c.canal}?before=${antes}`, { accept: 'text/html' })), ...mensajes];
      }
      const aProcesar = mensajes.filter((m) => m.id > previo || m.agotado); // ya leído, salvo que ahora diga AGOTADO
      // @chollometro solo trae un enlace corto chollo.to → se mira a qué chollo lleva (sin seguirlo).
      // Primero los más recientes, con un tope por ejecución.
      const conCorto = aProcesar
        .filter((m) => m.id > previo && !m.enlaces.some((u) => RE_CHOLLOMETRO.test(u)) && m.enlaces.some((u) => RE_CORTO.test(u)))
        .sort((a, b) => b.id - a.id)
        .slice(0, opciones.max_enlaces_cortos ?? 15);
      for (const m of conCorto) {
        const corto = m.enlaces.find((u) => RE_CORTO.test(u));
        try {
          const destino = await http.redireccion(corto);
          if (destino) m.enlaces.push(destino);
        } catch (e) {
          log.aviso(`telegram/@${c.canal}: no pude resolver ${corto} (${e.message})`);
        }
      }
      let nuevos = 0;
      for (const m of aProcesar) {
        const d = mensajeADeal(m, c, ctx);
        if (d) deals.push(d);
        if (m.id > previo) nuevos++;
      }
      ultimos[c.canal] = Math.max(previo, ...mensajes.map((m) => m.id));
      salud[c.canal] = { fallos: 0, ultimoError: null };
      if (informe) informe[c.canal] = nuevos;
    } catch (e) {
      const f = (salud[c.canal]?.fallos ?? 0) + 1;
      salud[c.canal] = { fallos: f, ultimoError: String(e.message).slice(0, 200) };
      fallos.push({ canal: c.canal, error: e.message, bloqueo: Boolean(e.bloqueo) });
      log.aviso(`telegram/@${c.canal}: ${e.message}`);
      if (informe) informe[c.canal] = 'error';
    }
  }

  if (cambiosEstado) Object.assign(cambiosEstado, { ultimos, canales: salud });
  if (canales.length > 0 && fallos.length === canales.length) {
    const err = new Error(`todos los canales fallaron: ${fallos.map((f) => `@${f.canal} (${f.error})`).join(', ')}`);
    err.bloqueo = fallos.some((f) => f.bloqueo);
    throw err;
  }
  return deals;
}

// ── Página de un canal ───────────────────────────────────────────────────────

/** Mensajes de la vista web: { id, canal, fecha, texto, enlaces, imagen, agotado }. */
export function parsearPagina(html) {
  const out = [];
  for (const bloque of html.split('tgme_widget_message_wrap').slice(1)) {
    const post = bloque.match(/data-post="([^"/]+)\/(\d+)"/);
    if (!post) continue;
    const html_ = (bloque.match(/tgme_widget_message_text js-message_text"[^>]*>([\s\S]*?)<\/div>/) ?? [])[1] ?? '';
    if (!html_) continue; // mensajes sin texto (solo foto, encuestas…)
    const enlaces = [...html_.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => decodificar(m[1])).filter((u) => /^https?:\/\//.test(u));
    const texto = aTexto(html_);
    const fotos = [...bloque.matchAll(/tgme_widget_message_(?:photo_wrap|link_preview_image)[^>]*background-image:url\('([^']+)'\)/g)].map((m) => m[1]);
    const imagenOculta = enlaces.find((u) => /\.(png|jpe?g|webp)(\?|$)/i.test(u));
    out.push({
      id: Number(post[2]),
      canal: post[1],
      fecha: (bloque.match(/<time datetime="([^"]+)"/) ?? [])[1] ?? null,
      texto,
      enlaces,
      imagen: imagenOculta ?? fotos[0] ?? null,
      agotado: /(^|\n)\s*(❌\s*)?AGOTAD[OA]\b/i.test(texto) || /\b(ya no est[aá] disponible|sin stock)\b/i.test(texto.slice(0, 120)),
    });
  }
  return out;
}

function aTexto(html) {
  return decodificar(
    html
      .replace(/<i class="emoji"[^>]*><b>([^<]*)<\/b><\/i>/g, '$1')
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodificar(s) {
  return s.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

// ── Mensaje → Deal ───────────────────────────────────────────────────────────

const RE_CHOLLOMETRO = /chollometro\.com\/(?:thread\/|(?:ofertas|cupones)\/[^?#\s]*-)(\d+)/;
const RE_CORTO = /^https?:\/\/chollo\.to\/\w+$/;
const RE_ASIN = /amazon\.[a-z.]+\/(?:[^\s?#]*\/)?(?:dp|gp\/product)\/([A-Z0-9]{10})/;
const RE_CUPON = /CUP[OÓ]N:?\s*([A-Z0-9][A-Z0-9_-]{3,})/;

export function mensajeADeal(m, canal, { config } = {}) {
  const lineas = m.texto.split('\n').map((l) => l.trim()).filter(Boolean);
  const titulo = extraerTitulo(lineas);
  if (!titulo) return null;
  // Precios: solo de la cabecera del mensaje (antes de la descripción ✨ y de los enlaces)
  const fin = lineas.findIndex((l, i) => i > 0 && /^(✨|➡|🔰|🛡|🔗|https?:)/u.test(l));
  const cabecera = lineas.slice(0, fin > 0 ? fin : 4).join('\n');
  const { precio, precioAnterior, porcentaje } = extraerPrecios(cabecera);
  const etiquetas = detectarPalabras(titulo, cabecera);
  for (const e of detectarTipo(titulo)) etiquetas.add(e);
  etiquetas.add('EN_TELEGRAM');
  if (canal.editores) etiquetas.add('EDITORES');

  // Primer enlace que lleva al producto (ni a Telegram, ni a una imagen, ni a un cupón, ni a la portada)
  const enlaceProducto = m.enlaces.find((u) => !/t\.me\/|\.(png|jpe?g|webp)(\?|$)|\/CUPON\/|^https?:\/\/(www\.)?michollo\.com\/?$/i.test(u));
  const post = `https://t.me/${canal.canal}/${m.id}`;
  const idChollometro = m.enlaces.map((u) => u.match(RE_CHOLLOMETRO)?.[1]).find(Boolean);
  const asin = m.enlaces.map((u) => u.match(RE_ASIN)?.[1]).find(Boolean);

  // Cabecera = líneas antes del título 🔹 (ahí van los hashtags: #Zapatoshombre #FootLocker)
  const iTitulo = lineas.findIndex((l) => /^(🔹|🛍)/u.test(l));
  const hashtags = lineas.slice(0, iTitulo > 0 ? iTitulo : 1).join(' ');
  // La categoría de Chollometro que enlaza @chollometro ("…/categorias/zapatos-hombre") ayuda a clasificar
  const slugCategoria = m.enlaces.map((u) => u.match(/chollometro\.com\/categorias\/([a-z0-9-]+)/)?.[1]).find(Boolean);
  const pistaCategoria = slugCategoria ? slugCategoria.replace(/-/g, ' ') : '';
  let precioFinal = precio === 0 && !etiquetas.has('GRATIS') ? null : precio;
  if (precioFinal == null && etiquetas.has('GRATIS') && !etiquetas.has('CON_COMPRA')) precioFinal = 0;

  const comun = {
    titulo,
    tienda: tiendaDe(hashtags, enlaceProducto),
    categoria: categorizarPorTitulo(`${titulo} · ${pistaCategoria}`),
    categoriaFuente: slugCategoria ?? null,
    precio: precioFinal,
    precioAnterior,
    descuento: precioAnterior == null && porcentaje != null ? porcentaje : undefined,
    cupon: m.texto.match(RE_CUPON)?.[1] ?? null,
    publicadoEn: m.fecha ? new Date(m.fecha).toISOString() : null,
    imagen: m.imagen,
    caducado: m.agotado,
    verificado: false,
    fiable: Boolean(canal.fiable),
    etiquetas,
    fuentes: [FUENTE],
    extra: { canal: canal.canal, post, mensaje: m.id },
  };

  if (idChollometro) {
    // Mismo id que el chollo de Chollometro: se fusiona con él si sale en sus listados
    return crearDeal({ ...comun, fuente: 'chollometro', origen: `telegram/@${canal.canal}`, idFuente: idChollometro, url: `https://www.chollometro.com/thread/${idChollometro}`, extra: { ...comun.extra, parcial: true } });
  }
  const idFuente = asin ? `amazon:${asin}` : `titulo:${huella(titulo)}`;
  return crearDeal({ ...comun, fuente: FUENTE, origen: `@${canal.canal}`, idFuente, url: enlaceProducto ?? post });
}

/** El título: la línea con 🔹 (Chollometro, Michollo) o con 🛍️ (GangaGato), sin el precio. */
export function extraerTitulo(lineas) {
  let l = lineas.find((x) => /^🔹/u.test(x)) ?? lineas.find((x) => /^🛍/u.test(x));
  if (!l) l = lineas.find((x) => !/^#|^(❌\s*)?AGOTAD/i.test(x) && x.replace(/[^\p{L}]/gu, '').length > 10);
  if (!l) return null;
  return l
    .replace(/^[\p{Extended_Pictographic}️‍\s]+/u, '')
    .replace(/\s+(solo|sólo|por|a|desde)\s+\d[\d.,]*\s?€.*$/i, '')
    .replace(/[\p{Extended_Pictographic}️‍]+.*$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tienda: el último hashtag de la cabecera (#Amazon, #PrivébyZalando) o el dominio del enlace. */
function tiendaDe(cabecera, enlace) {
  const tag = [...(cabecera ?? '').matchAll(/#([\p{L}\d]+)/gu)].at(-1)?.[1];
  if (tag) return tag;
  try {
    const host = new URL(enlace).hostname.replace(/^www\./, '');
    if (/amazon\./.test(host)) return 'Amazon';
    if (/aliexpress\./.test(host)) return 'AliExpress';
    return host;
  } catch {
    return null;
  }
}

/** Huella estable de un título para reconocer el mismo producto publicado otra vez. */
function huella(titulo) {
  const palabras = normalizarClave(titulo).split('-').filter((p) => p.length > 2).slice(0, 10);
  return createHash('sha1').update(palabras.join(' ')).digest('hex').slice(0, 16);
}
