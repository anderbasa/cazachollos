import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cargarConfig, fusionar, umbralesEfectivos } from '../src/config.js';
import { recalcularDoc, recalcularGuardados } from '../src/recalcular.js';
import { crearStoreMemoria } from '../src/store/memoria.js';

const config = cargarConfig();
const ahora = Date.parse('2026-11-08T21:00:00Z');
const doc = (o = {}) => ({
  id: 'x',
  fuente: 'chollometro',
  titulo: 'Zapatillas Nike Air Force 1',
  categoria: 'moda',
  categoriaFuente: 'Moda y accesorios',
  precio: 40,
  precioAnterior: 100,
  precioEfectivo: 40,
  descuento: 60,
  temperatura: 1200,
  publicadoEn: '2026-11-05T10:00:00.000Z',
  verificado: true,
  fiable: true,
  etiquetas: [],
  esChollo: true,
  esChollazo: true,
  ...o,
});

test('saca de la web lo que ya no interesa (videojuegos, digital)', () => {
  const juego = recalcularDoc(doc({ titulo: 'FINAL FANTASY VII REBIRTH', categoria: 'videojuegos', categoriaFuente: 'Gaming' }), config, ahora);
  assert.equal(juego.esChollo, false);
  assert.equal(juego.filtrado, true);
  const plugin = recalcularDoc(doc({ titulo: 'Plugin Vst BRIGADE GRATIS', categoria: 'tecnologia', categoriaFuente: 'Electrónica' }), config, ahora);
  assert.equal(plugin.esChollo, false);
  assert.ok(plugin.etiquetas.includes('DIGITAL'));
});

test('respeta lo que no cambia: un chollazo de hace días sigue siéndolo', () => {
  assert.equal(recalcularDoc(doc(), config, ahora), null, 'nada que escribir');
});

test('vuelve a la web si reactivas su categoría', () => {
  const conJuegos = { ...config, umbrales: fusionar(config.umbrales, { categorias_activas: [...config.umbrales.categorias_activas, 'videojuegos'] }) };
  const r = recalcularDoc(doc({ titulo: 'Mando 8BitDo Pro 2', categoria: 'videojuegos', categoriaFuente: 'Gaming', esChollo: false, esChollazo: false, filtrado: true }), conJuegos, ahora);
  assert.equal(r.esChollo, true);
  assert.equal(r.filtrado, false);
});

test('reasigna la categoría nueva "belleza" a lo de Salud y belleza', () => {
  const r = recalcularDoc(doc({ titulo: 'Jean Paul Gaultier Le Male 125ml', categoria: 'otros', categoriaFuente: 'Salud y belleza', esChollo: false, filtrado: true }), config, ahora);
  assert.equal(r.categoria, 'belleza');
  assert.equal(r.filtrado, false);
});

test('recalcula todo lo guardado y no toca favorito ni oculto', async () => {
  const store = crearStoreMemoria({ deals: { a: doc({ id: 'a', titulo: 'GTA Trilogy Switch', categoria: 'videojuegos', categoriaFuente: 'Gaming', favorito: true }), b: doc({ id: 'b' }) } });
  const r = await recalcularGuardados({ store, config, log: { info() {} }, ahora });
  assert.deepEqual(r, { total: 2, cambiados: 1, fuera: 1 });
  assert.equal(store.db.deals.get('a').esChollo, false);
  assert.equal(store.db.deals.get('a').favorito, true);
});

test('ajustes de la web no válidos: se ignoran y se usa config.yml', () => {
  const avisos = [];
  const log = { aviso: (m) => avisos.push(m) };
  assert.equal(umbralesEfectivos(config, { aviso: { moda: 'mucho' } }, log), config.umbrales);
  assert.equal(avisos.length, 1);
  assert.equal(umbralesEfectivos(config, { categorias_activas: ['moda', 'inventada'] }, log), config.umbrales);
  assert.equal(umbralesEfectivos(config, { aviso: { moda: 70 } }, log).aviso.moda, 70);
});
