import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { cargarConfig } from '../src/config.js';
import { diaLocal, ejecutar, estaEnSilencio, ordenarAvisos } from '../src/pipeline.js';

const config = cargarConfig();

test('orden de avisos: errores de precio y gratis primero, luego puntuación', () => {
  const d = (id, puntuacion, extra = {}) => ({ id, puntuacion, temperatura: 0, etiquetas: [], gratis: false, ...extra });
  const lista = [d('a', 90), d('b', 70, { gratis: true }), d('c', 60, { etiquetas: ['ERROR_DE_PRECIO'] }), d('e', 95)];
  assert.deepEqual(
    ordenarAvisos(lista).map((x) => x.id),
    ['b', 'c', 'e', 'a'],
  );
});

test('horas de silencio: cruzan medianoche', () => {
  const s = { activo: true, desde: '23:00', hasta: '08:00' };
  assert.equal(estaEnSilencio(s, Date.parse('2026-11-07T00:30:00Z')), true, '01:30 en Madrid');
  assert.equal(estaEnSilencio(s, Date.parse('2026-11-07T12:00:00Z')), false, '13:00 en Madrid');
  assert.equal(estaEnSilencio({ ...s, activo: false }, Date.parse('2026-11-07T00:30:00Z')), false);
  assert.equal(estaEnSilencio({ activo: true, desde: '14:00', hasta: '16:00' }, Date.parse('2026-11-07T14:30:00Z')), true, '15:30 en Madrid');
});

test('día local en Madrid', () => {
  assert.equal(diaLocal(Date.parse('2026-11-07T23:30:00Z')), '2026-11-08');
  assert.equal(diaLocal(Date.parse('2026-11-07T10:00:00Z')), '2026-11-07');
});

test('una fuente que falla no para a las demás', async () => {
  const cfg = structuredClone(config);
  cfg.fuentes = {
    rota: { modulo: 'rss', activa: true, modos: ['rapido'], url: 'https://x/rota' },
    buena: { modulo: 'chollometro', activa: true, listados: [{ nombre: 'nuevos', modos: ['rapido'], html: 'https://x/nuevos', rss: 'https://x/rss' }] },
    apagada: { modulo: 'chollometro', activa: false, modos: ['rapido'] },
  };
  const html = readFileSync(new URL('./fixtures/chollometro/nuevos.html', import.meta.url), 'utf8');
  const http = {
    peticiones: 0,
    async texto(url) {
      if (url === 'https://x/nuevos') return html;
      throw new Error('caída');
    },
  };
  const log = { aviso() {}, info() {}, error() {} };
  const r = await ejecutar({ modo: 'rapido', config: cfg, http, log, ahora: Date.parse('2026-11-07T11:00:00Z') });
  assert.deepEqual(
    r.resultados.map((x) => [x.fuente, x.ok]),
    [
      ['rota', false],
      ['buena', true],
    ],
  );
  assert.equal(r.todos.length, 30);
  assert.ok(r.chollos.length > 0);
  assert.ok(r.chollos.every((d) => typeof d.puntuacion === 'number'));
});
