import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cargarConfig, fusionar } from '../src/config.js';
import { crearDeal } from '../src/deal.js';
import { puntuar } from '../src/scorer.js';

const U = cargarConfig().umbrales;
const ahora = Date.parse('2026-11-07T12:00:00Z');
const hace = (min) => new Date(ahora - min * 60_000).toISOString();
let n = 0;
const deal = (o = {}) =>
  crearDeal({
    fuente: 'test',
    idFuente: ++n,
    titulo: 'Producto de prueba',
    url: 'https://example.invalid/x',
    categoria: 'tecnologia',
    precio: 40,
    precioAnterior: 100,
    envio: 0,
    temperatura: 50,
    publicadoEn: hace(120),
    verificado: true,
    ...o,
  });
const p = (d, u = U) => puntuar(d, u, ahora);

test('-60 % con temperatura alta → chollazo', () => {
  const r = p(deal({ temperatura: 350 }));
  assert.equal(r.esChollazo, true);
  assert.deepEqual(r.motivos, ['-60 % con 350°']);
});

test('-60 % sin votos → solo web', () => {
  const r = p(deal({ temperatura: 50 }));
  assert.equal(r.esChollazo, false);
  assert.equal(r.esChollo, true);
});

test('-60 % calentándose rápido → chollazo por velocidad', () => {
  const r = p(deal({ temperatura: 150, publicadoEn: hace(12) }));
  assert.equal(r.esChollazo, true);
  assert.match(r.motivos[0], /°\/min/);
});

test('la velocidad no cuenta en los primeros minutos ni con pocos grados', () => {
  assert.equal(p(deal({ temperatura: 150, publicadoEn: hace(5) })).esChollazo, false, 'solo 5 minutos');
  assert.equal(p(deal({ temperatura: 75, publicadoEn: hace(11) })).esChollazo, false, '75° en 11 min son pocos votos');
  assert.equal(p(deal({ temperatura: 131, publicadoEn: hace(25) })).esChollazo, false, '5°/min no basta');
});

test('-49 % con votos no avisa (umbral 50)', () => {
  assert.equal(p(deal({ precio: 51, temperatura: 900 })).esChollazo, false);
});

test('nunca avisa si el precio original es menor de 15 €', () => {
  const r = p(deal({ precio: 1, precioAnterior: 10, temperatura: 500 }));
  assert.equal(r.esChollazo, false);
  assert.match(r.bloqueos.join(), /precio original/);
});

test('nunca avisa si el envío se come el descuento', () => {
  const d = deal({ precio: 60, envio: 45, precioAnterior: 100, temperatura: 500 });
  assert.equal(d.descuento, 0);
  const r = p(d);
  assert.equal(r.esChollazo, false);
  assert.match(r.bloqueos.join(), /envío/);
});

test('nunca avisa de caducados ni locales', () => {
  assert.equal(p(deal({ temperatura: 500, caducado: true })).esChollazo, false);
  assert.equal(p(deal({ temperatura: 500, local: true })).esChollazo, false);
});

test('1.000° en las 2 primeras horas → chollazo aunque no haya descuento', () => {
  const sinDescuento = { precio: 100, precioAnterior: null };
  assert.equal(p(deal({ ...sinDescuento, temperatura: 1200, publicadoEn: hace(90) })).esChollazo, true);
  const tarde = p(deal({ ...sinDescuento, temperatura: 1200, publicadoEn: hace(300) }));
  assert.equal(tarde.esChollazo, false, 'tras 5 horas ya no cuenta');
  assert.equal(tarde.esChollo, true, 'pero entra en la web por temperatura');
});

test('300° en los primeros 30 minutos → chollazo', () => {
  assert.equal(p(deal({ precio: 100, precioAnterior: null, temperatura: 320, publicadoEn: hace(25) })).esChollazo, true);
});

test('error de precio → siempre avisa', () => {
  const r = p(deal({ precio: 10, precioAnterior: 50, temperatura: 0, etiquetas: ['ERROR_DE_PRECIO'] }));
  assert.equal(r.esChollazo, true);
  assert.ok(r.puntuacion >= 85);
});

test('gratis verificado → siempre avisa; con compra o prueba, no', () => {
  const gratis = { precio: 0, precioAnterior: 30, temperatura: 0, etiquetas: ['GRATIS'] };
  const r = p(deal(gratis));
  assert.equal(r.esChollazo, true);
  assert.equal(r.gratis, true);
  assert.ok(r.puntuacion >= 90);
  assert.equal(p(deal({ ...gratis, etiquetas: ['GRATIS', 'CON_COMPRA'] })).esChollazo, false);
  assert.equal(p(deal({ ...gratis, etiquetas: ['GRATIS', 'PRUEBA'] })).esChollazo, false);
});

test('gratis de poco valor no avisa, salvo juego completo (si los videojuegos están activos)', () => {
  const conJuegos = fusionar(U, { categorias_activas: [...U.categorias_activas, 'videojuegos'] });
  const juego = { categoria: 'videojuegos', precio: 0, precioAnterior: 7, temperatura: 0, etiquetas: ['GRATIS'] };
  assert.equal(p(deal(juego), conJuegos).esChollazo, false);
  assert.equal(p(deal({ ...juego, etiquetas: ['GRATIS', 'JUEGO_COMPLETO'] }), conJuegos).esChollazo, true);
});

test('categorías desactivadas: ni web ni bot (videojuegos y otros, por defecto)', () => {
  for (const categoria of ['videojuegos', 'otros']) {
    const r = p(deal({ categoria, precio: 10, temperatura: 900 }));
    assert.equal(r.esChollo, false, categoria);
    assert.equal(r.esChollazo, false, categoria);
    assert.equal(r.filtrado, true);
    assert.deepEqual(r.motivos, [], 'no sale como "casi chollazo"');
  }
  for (const categoria of ['moda', 'tecnologia', 'hogar', 'belleza']) assert.equal(p(deal({ categoria, temperatura: 400 })).esChollazo, true, categoria);
});

test('solo productos físicos y sin recopilaciones', () => {
  const caliente = { precio: 10, temperatura: 900 };
  for (const etiqueta of ['DIGITAL', 'NO_FISICO', 'CUPON', 'RECOPILACION']) {
    const r = p(deal({ ...caliente, etiquetas: [etiqueta] }));
    assert.equal(r.esChollo, false, etiqueta);
    assert.equal(r.esChollazo, false, etiqueta);
  }
  const todo = fusionar(U, { solo_productos_fisicos: false, excluir_recopilaciones: false });
  assert.equal(p(deal({ ...caliente, etiquetas: ['DIGITAL'] }), todo).esChollazo, true, 'se puede desactivar');
});

test('sin precio nunca avisa (salvo error de precio), aunque esté muy caliente', () => {
  const sinPrecio = { precio: null, precioAnterior: null, temperatura: 1500, publicadoEn: hace(60) };
  const r = p(deal(sinPrecio));
  assert.equal(r.esChollazo, false);
  assert.match(r.bloqueos.join(), /sin precio/);
  assert.equal(r.esChollo, true, 'en la web sí, por temperatura');
  assert.equal(p(deal({ ...sinPrecio, etiquetas: ['ERROR_DE_PRECIO'] })).esChollazo, true);
});

test('gratis sin precio conocido necesita votos', () => {
  const g = { precio: 0, precioAnterior: null, etiquetas: ['GRATIS'] };
  const frio = p(deal({ ...g, temperatura: 50 }));
  assert.equal(frio.esChollazo, false);
  assert.equal(frio.esChollo, true);
  assert.equal(p(deal({ ...g, temperatura: 400 })).esChollazo, true);
});

test('umbral de la web por categoría', () => {
  assert.equal(p(deal({ categoria: 'moda', precio: 55 })).esChollo, false, 'moda -45 % no entra');
  assert.equal(p(deal({ categoria: 'tecnologia', precio: 55 })).esChollo, true, 'tecnología -45 % entra');
});

test('sin verificar: entra en la web pero solo avisa si la fuente es fiable', () => {
  const d = deal({ verificado: false, precio: 30, temperatura: 500 });
  assert.ok(d.etiquetas.includes('SIN_VERIFICAR'));
  const r = p(d);
  assert.equal(r.esChollazo, false);
  assert.equal(r.esChollo, true);
  assert.equal(p(deal({ verificado: false, fiable: true, precio: 30, temperatura: 500 })).esChollazo, true);
});

test('la puntuación va de 0 a 100 y sube con el descuento', () => {
  const a = p(deal({ precio: 80, temperatura: 20 })).puntuacion;
  const b = p(deal({ precio: 60, temperatura: 20 })).puntuacion;
  const c = p(deal({ precio: 30, temperatura: 20 })).puntuacion;
  assert.ok(a < b && b < c, `${a} < ${b} < ${c}`);
  for (const x of [a, b, c, p(deal({ precio: 0, precioAnterior: 999, temperatura: 99999, publicadoEn: hace(11) })).puntuacion]) {
    assert.ok(x >= 0 && x <= 100);
  }
});

test('los umbrales editados desde la web se respetan', () => {
  const u = fusionar(U, { aviso: { moda: 80 } });
  assert.equal(u.aviso.tecnologia, 50, 'lo no editado se queda igual');
  assert.equal(p(deal({ categoria: 'moda', temperatura: 500 }), u).esChollazo, false);
  assert.equal(p(deal({ categoria: 'moda', temperatura: 500 })).esChollazo, true);
});
