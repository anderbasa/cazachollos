// Carga config.yml. En la fase 2 se superpone config/umbrales de Firestore (editable desde la web).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { CATEGORIAS } from './deal.js';
import { normalizarClave } from './text.js';

const RUTA = fileURLToPath(new URL('../config.yml', import.meta.url));

export function cargarConfig(ruta = RUTA) {
  const config = parse(readFileSync(ruta, 'utf8'));
  validar(config);
  return config;
}

/** Mezcla profunda: lo remoto pisa a lo local solo donde existe. Las listas se sustituyen. */
export function fusionar(base, encima) {
  if (encima == null) return base;
  if (Array.isArray(base) || Array.isArray(encima) || typeof base !== 'object' || typeof encima !== 'object') return encima;
  const out = { ...base };
  for (const [k, v] of Object.entries(encima)) out[k] = k in base ? fusionar(base[k], v) : v;
  return out;
}

/**
 * Umbrales efectivos = config.yml + lo editado en la web (config/umbrales). Si lo de la web no es
 * válido (un número que no es número, una categoría desconocida…), se ignora entero y se avisa:
 * el bot sigue funcionando con config.yml en vez de romperse.
 */
export function umbralesEfectivos(config, remotos, log) {
  if (!remotos) return config.umbrales;
  const u = fusionar(config.umbrales, remotos);
  try {
    validarUmbrales(u);
    return u;
  } catch (e) {
    log?.aviso(`Ajustes de la web no válidos (${e.message}); uso los de config.yml`);
    return config.umbrales;
  }
}

export function validarUmbrales(u) {
  const num = (v, donde, min = 0, max = 100000) => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(`${donde} no es un número válido`);
  };
  for (const grupo of ['web', 'aviso']) for (const cat of CATEGORIAS) num(u?.[grupo]?.[cat], `umbrales.${grupo}.${cat}`, 0, 100);
  if (u.categorias_activas != null) {
    if (!Array.isArray(u.categorias_activas) || u.categorias_activas.some((c) => !CATEGORIAS.includes(c))) throw new Error('categorias_activas no es válido');
  }
  num(u.votos?.temperatura, 'votos.temperatura');
  num(u.nunca?.precio_original_minimo, 'nunca.precio_original_minimo');
  num(u.avisos?.max_por_dia, 'avisos.max_por_dia', 0, 500);
  num(u.avisos?.max_por_ejecucion, 'avisos.max_por_ejecucion', 0, 100);
  if (u.silencio?.activo && !(/^\d\d:\d\d$/.test(u.silencio.desde) && /^\d\d:\d\d$/.test(u.silencio.hasta))) throw new Error('silencio: horas no válidas');
  if (u.perfumes != null) num(u.perfumes.descuento_minimo, 'perfumes.descuento_minimo', 0, 100);
}

function validar(c) {
  const u = c.umbrales;
  validarUmbrales(u);
  if (!c.http?.user_agent) throw new Error('config: falta http.user_agent');
  for (const [id, f] of Object.entries(c.fuentes ?? {})) {
    if (!f.modulo) throw new Error(`config: la fuente ${id} no tiene "modulo"`);
  }
}

/** Mapa de categorías de una fuente → una de las cinco ("otros" si no aparece). */
export function mapearCategoria(config, fuente, valores) {
  const mapa = config.categorias?.[fuente] ?? {};
  for (const v of [valores].flat()) {
    const cat = mapa[normalizarClave(v)];
    if (cat && CATEGORIAS.includes(cat)) return cat;
  }
  return 'otros';
}
