// Carga config.yml. En la fase 2 se superpone config/umbrales de Firestore (editable desde la web).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { CATEGORIAS } from './deal.js';
import { normalizarClave } from './text.js';

const RUTA = fileURLToPath(new URL('../config.yml', import.meta.url));

export function cargarConfig(ruta = RUTA, umbralesRemotos = null) {
  const config = parse(readFileSync(ruta, 'utf8'));
  if (umbralesRemotos) config.umbrales = fusionar(config.umbrales, umbralesRemotos);
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

function validar(c) {
  const u = c.umbrales;
  for (const grupo of ['web', 'aviso']) {
    for (const cat of CATEGORIAS) {
      if (typeof u?.[grupo]?.[cat] !== 'number') throw new Error(`config: falta umbrales.${grupo}.${cat}`);
    }
  }
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
