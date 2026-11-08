import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { contenidoDefectos } from '../scripts/defectos.mjs';

const docs = (r) => new URL(`../docs/${r}`, import.meta.url);

test('docs/js/defectos.js está al día con config.yml (si falla: npm run web:defectos)', () => {
  assert.equal(readFileSync(docs('js/defectos.js'), 'utf8'), contenidoDefectos());
});

test('el service worker solo precarga archivos que existen', () => {
  const sw = readFileSync(docs('sw.js'), 'utf8');
  const lista = JSON.parse(sw.match(/const APP = (\[[^\]]+\])/)[1].replace(/'/g, '"'));
  for (const f of lista) if (f !== './') assert.ok(existsSync(docs(f)), f);
});

test('el manifiesto apunta a iconos que existen', () => {
  const m = JSON.parse(readFileSync(docs('manifest.webmanifest'), 'utf8'));
  for (const i of m.icons) assert.ok(existsSync(docs(i.src)), i.src);
  assert.equal(m.display, 'standalone');
});

test('las reglas de Firestore solo dejan escribir favorito/oculto y los ajustes', () => {
  const reglas = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  assert.match(reglas, /affectedKeys\(\)\.hasOnly\(\['favorito', 'oculto'\]\)/);
  assert.match(reglas, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
  assert.match(reglas, /__UID__/, 'el UID se rellena al publicar (npm run reglas)');
});
