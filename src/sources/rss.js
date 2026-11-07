// Fuente genérica para el RSS de otra web española de chollos (se configura en config.yml).
// Saca precios del título y la descripción. Lo que venga de aquí entra como SIN VERIFICAR
// salvo que la entrada de config diga "verificado: true".
import { XMLParser } from 'fast-xml-parser';
import { crearDeal } from '../deal.js';
import { detectarPalabras, extraerPrecios } from '../text.js';

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (n) => n === 'item' || n === 'entry',
});

export async function fetch(ctx) {
  const { opciones, http, fuente } = ctx;
  if (!opciones.url) throw new Error(`la fuente ${fuente} no tiene url`);
  return parsearFeed(await http.texto(opciones.url, { accept: 'application/rss+xml, application/atom+xml, text/xml' }), {
    fuente,
    opciones,
  });
}

export function parsearFeed(texto, { fuente, opciones = {} }) {
  const doc = xml.parse(texto);
  const items = doc?.rss?.channel?.item ?? doc?.feed?.entry ?? [];
  const out = [];
  for (const it of items) {
    const titulo = texto_(it.title);
    const url = typeof it.link === 'string' ? it.link : it.link?.href ?? texto_(it.guid);
    if (!titulo || !url) continue;
    const descripcion = limpiarHtml(texto_(it.description ?? it.summary ?? it['content:encoded']));
    const { precio, precioAnterior, porcentaje } = extraerPrecios(`${titulo} · ${descripcion}`);
    const etiquetas = detectarPalabras(titulo, descripcion.slice(0, 300));
    const fecha = it.pubDate ?? it.published ?? it.updated;
    out.push(
      crearDeal({
        fuente,
        idFuente: texto_(it.guid) || url,
        titulo,
        url,
        categoria: opciones.categoria ?? 'otros',
        precio,
        precioAnterior,
        descuento: precioAnterior == null && porcentaje != null ? porcentaje : undefined,
        publicadoEn: fecha ? new Date(fecha).toISOString() : null,
        imagen: it['media:content']?.url ?? it.enclosure?.url ?? null,
        verificado: Boolean(opciones.verificado),
        fiable: Boolean(opciones.fiable),
        etiquetas,
      }),
    );
  }
  return out;
}

function texto_(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  return String(v['#text'] ?? '').trim();
}

function limpiarHtml(s) {
  return s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
