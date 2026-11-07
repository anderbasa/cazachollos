// Registro de fuentes: lee config.yml y carga src/sources/<modulo>.js de las fuentes activas
// para el modo pedido. Añadir una fuente = crear su módulo + una entrada en config.yml.

export function modosDe(f) {
  if (Array.isArray(f.modos)) return f.modos;
  return [...new Set((f.listados ?? []).flatMap((l) => l.modos ?? []))];
}

export async function cargarFuentes(config, modo, { solo } = {}) {
  const out = [];
  for (const [id, f] of Object.entries(config.fuentes ?? {})) {
    if (solo && !solo.includes(id)) continue;
    if (!f.activa || !modosDe(f).includes(modo)) continue;
    if (!/^[a-z0-9-]+$/.test(f.modulo)) throw new Error(`Nombre de módulo no válido en ${id}: ${f.modulo}`);
    const modulo = await import(`./${f.modulo}.js`);
    if (typeof modulo.fetch !== 'function') throw new Error(`El módulo ${f.modulo} no exporta fetch()`);
    out.push({ id, opciones: f, modulo });
  }
  return out;
}
