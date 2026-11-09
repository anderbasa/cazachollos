// Utilidades de la web: formato español, fechas relativas y escape de HTML.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function euros(n) {
  if (n == null) return '';
  if (n === 0) return 'Gratis';
  return n.toLocaleString('es-ES', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + ' €';
}

export function hace(ms, ahora = Date.now()) {
  if (ms == null) return '';
  const min = Math.max(0, Math.round((ahora - ms) / 60000));
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

export function horaCorta(ms) {
  if (ms == null) return '—';
  return new Date(ms).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Mililitros de un perfume en el título ("100ml", "125 ML"), o null. Igual que src/perfumes.js. */
export function mililitros(titulo) {
  const m = String(titulo ?? '').match(/(\d{1,4}(?:[.,]\d)?)\s?ml\b/i);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  return n >= 5 && n <= 1000 ? n : null;
}

/** Sin tildes y en minúsculas, para buscar. */
export const normalizar = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Mezcla profunda: lo de "encima" pisa a "base" donde existe (igual que el script). */
export function fusionar(base, encima) {
  if (encima == null) return base;
  if (Array.isArray(base) || Array.isArray(encima) || typeof base !== 'object' || typeof encima !== 'object') return encima;
  const out = { ...base };
  for (const [k, v] of Object.entries(encima)) out[k] = k in base ? fusionar(base[k], v) : v;
  return out;
}

/** Fechas de Firestore (Timestamp) → milisegundos, en el primer y segundo nivel. */
export function aPlano(obj) {
  if (obj == null || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v.toMillis === 'function') out[k] = v.toMillis();
    else if (v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).some((x) => x && typeof x.toMillis === 'function')) out[k] = aPlano(v);
    else out[k] = v;
  }
  return out;
}

/** localStorage que nunca rompe la app (modo privado, iPhone sin espacio…). */
export const guardado = {
  leer(clave, porDefecto) {
    try {
      const v = localStorage.getItem(clave);
      return v == null ? porDefecto : JSON.parse(v);
    } catch {
      return porDefecto;
    }
  },
  escribir(clave, valor) {
    try {
      localStorage.setItem(clave, JSON.stringify(valor));
    } catch {
      // da igual: es solo comodidad
    }
  },
};
