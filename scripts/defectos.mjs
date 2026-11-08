// Genera docs/js/defectos.js con los valores por defecto de config.yml, para que la pantalla de
// Ajustes de la web enseñe exactamente lo que usa el bot. Un test comprueba que no se desincroniza.
//   npm run web:defectos
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cargarConfig } from '../src/config.js';

export function contenidoDefectos(config = cargarConfig()) {
  const fuentes = Object.fromEntries(Object.entries(config.fuentes).map(([id, f]) => [id, f.nombre ?? id]));
  return `// GENERADO por "npm run web:defectos" a partir de config.yml. No lo edites a mano.
export const UMBRALES = ${JSON.stringify(config.umbrales, null, 2)};

export const CATEGORIAS = ${JSON.stringify(config.categorias.nombres, null, 2)};

export const FUENTES = ${JSON.stringify(fuentes, null, 2)};
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const destino = fileURLToPath(new URL('../docs/js/defectos.js', import.meta.url));
  writeFileSync(destino, contenidoDefectos());
  console.log('✔ docs/js/defectos.js actualizado');
}
