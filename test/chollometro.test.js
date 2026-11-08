// Tests con páginas reales guardadas el 7/11/2026 (test/fixtures/chollometro).
// Si Chollometro cambia el formato, estos tests son los primeros en fallar:
// vuelve a descargar las páginas y compara.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { cargarConfig } from '../src/config.js';
import { CATEGORIAS } from '../src/deal.js';
import { HttpError } from '../src/http.js';
import { fetch as fetchChollometro, hiloADeal, parsearListadoHtml, parsearRss } from '../src/sources/chollometro.js';

const config = cargarConfig();
const fixture = (n) => readFileSync(new URL(`./fixtures/chollometro/${n}`, import.meta.url), 'utf8');
const ahora = Date.parse('2026-11-07T11:00:00Z');
const listado = (n) => parsearListadoHtml(fixture(`${n}.html`), { config, origen: n, ahora });
const porTitulo = (deals, t) => deals.find((d) => d.titulo.startsWith(t));

for (const n of ['nuevos', 'subiendo', 'gratis', 'destacados']) {
  test(`el listado ${n} sigue teniendo el formato esperado`, () => {
    const deals = listado(n);
    assert.equal(deals.length, 30, 'cada página de listado trae 30 chollos');
    for (const d of deals) {
      assert.match(d.id, /^[0-9a-f]{20}$/);
      assert.ok(d.titulo.length > 3);
      assert.match(d.url, /^https:\/\/www\.chollometro\.com\/(ofertas|cupones)\/.+-\d+$/);
      assert.ok(CATEGORIAS.includes(d.categoria));
      assert.equal(typeof d.temperatura, 'number', 'todas traen temperatura');
      assert.match(d.publicadoEn, /^2026-/);
      if (d.imagen) assert.match(d.imagen, /^https:\/\/static\.chollometro\.com\/.+\.jpg$/);
      assert.equal(d.verificado, true);
    }
    const conAnterior = deals.filter((d) => d.precioAnterior != null).length;
    assert.ok(conAnterior >= 15, `al menos la mitad trae precio anterior (trae ${conAnterior})`);
    const conImagen = deals.filter((d) => d.imagen).length;
    assert.ok(conImagen >= 25, `casi todos traen imagen (traen ${conImagen})`);
  });
}

test('lee todos los campos de un chollo normal', () => {
  const d = porTitulo(listado('nuevos'), 'NIKE AIR FORCE 1 - Zapatillas piel');
  assert.equal(d.idFuente, '2058623');
  assert.equal(d.url, 'https://www.chollometro.com/ofertas/nike-air-force-1-zapatillas-piel-blanco-tallas-35-a-45-2058623');
  assert.equal(d.precio, 54.9);
  assert.equal(d.precioAnterior, 129.95);
  assert.equal(d.envio, 3.95);
  assert.equal(d.precioEfectivo, 58.85);
  assert.equal(d.descuento, 55, 'el descuento se calcula con el envío incluido');
  assert.equal(d.tienda, 'Privé by Zalando');
  assert.equal(d.categoria, 'moda');
  assert.equal(d.categoriaFuente, 'Moda y accesorios');
  assert.equal(d.publicadoEn, '2026-11-07T10:51:01.000Z');
  assert.equal(d.imagen, 'https://static.chollometro.com/threads/raw/9ejCh/2058623_1/re/300x300/qt/60/2058623_1.jpg');
  assert.equal(d.caducado, false);
});

test('un juego gratis de Epic', () => {
  const d = porTitulo(listado('gratis'), 'Epic Games regala Flotsam');
  assert.equal(d.precio, 0);
  assert.equal(d.precioAnterior, 23);
  assert.equal(d.descuento, 100);
  assert.equal(d.categoria, 'videojuegos');
  assert.ok(d.etiquetas.includes('GRATIS'));
});

test('marca lo que no es producto físico y las recopilaciones', () => {
  const todos = ['nuevos', 'subiendo', 'gratis', 'destacados'].flatMap(listado);
  const con = (t) => porTitulo(todos, t).etiquetas;
  assert.ok(con('Epic Games regala Flotsam').includes('DIGITAL'));
  assert.ok(con('Plugin Vst BRIGADE GRATIS').includes('DIGITAL'));
  assert.ok(con('1 mes GRATIS de Duolingo').includes('NO_FISICO'), 'categoría Viajes');
  assert.ok(con('Peluches Disney Store').includes('CUPON'));
  assert.ok(con('Recopilatorio de decoración y luces de Navidad en Aldi').includes('RECOPILACION'));
  assert.ok(con('Synonyms, MSafe - Pro, Evertale').includes('RECOPILACION'), 'lista de apps gratis');
  assert.equal(porTitulo(todos, 'Hugo Boss - Hugo Man Eau de Toilette').categoria, 'belleza');
  const nike = con('NIKE AIR FORCE 1 - Zapatillas piel');
  for (const e of ['DIGITAL', 'NO_FISICO', 'CUPON', 'RECOPILACION']) assert.ok(!nike.includes(e));
});

test('un cupón va a /cupones/ y trae su código', () => {
  const d = porTitulo(listado('gratis'), 'Peluches Disney Store');
  assert.match(d.url, /^https:\/\/www\.chollometro\.com\/cupones\//);
  assert.equal(d.cupon, 'MAGIC');
  assert.equal(d.precio, null);
  assert.equal(d.descuento, 50);
});

test('precio 0 sin "gratis" ni precio anterior no es gratis (recopilaciones)', () => {
  // Caso real visto en Chollometro el 7/11/2026 (página 2 de destacados)
  const hilo = {
    threadId: '2057000',
    titleSlug: 'mega-recopilacion-productos-reacondicionados-amazon',
    title: 'Mega Recopilación Productos Reacondicionados Amazon',
    type: 'Deal',
    status: 'Activated',
    price: 0,
    nextBestPrice: 0,
    temperature: 2148,
    mainGroup: { threadGroupName: 'Hogar, vivienda y oficina', threadGroupUrlName: 'hogar-y-jardin' },
  };
  const d = hiloADeal(hilo, { config, origen: 'test', ahora });
  assert.equal(d.precio, null);
  assert.ok(!d.etiquetas.includes('GRATIS'));
  assert.equal(d.categoria, 'hogar');
});

test('detecta caducados y chollos locales', () => {
  const todos = ['nuevos', 'subiendo', 'gratis', 'destacados'].flatMap(listado);
  assert.ok(todos.some((d) => d.caducado && d.etiquetas.includes('CADUCADO')));
  const aldi = porTitulo(todos, 'Recopilatorio de decoración y luces de Navidad en Aldi');
  assert.equal(aldi.local, true);
});

test('RSS de respaldo: menos datos, pero los básicos', () => {
  const deals = parsearRss(fixture('nuevos.xml'), { config });
  assert.equal(deals.length, 30);
  const d = deals[0];
  assert.equal(d.idFuente, '2058623');
  assert.equal(d.precio, 54.9);
  assert.equal(d.tienda, 'Privé by Zalando');
  assert.equal(d.categoria, 'moda');
  assert.equal(d.precioAnterior, null);
  assert.equal(d.temperatura, null);
  assert.equal(d.extra.rss, true);
  // mismo id que el mismo chollo leído del listado, para poder fusionarlos
  assert.equal(d.id, porTitulo(listado('nuevos'), 'NIKE AIR FORCE 1 - Zapatillas piel').id);
  assert.ok(parsearRss(fixture('gratis.xml'), { config }).length > 0);
});

// http falso: sirve fixtures o falla según la URL
function httpFalso(respuestas) {
  return {
    peticiones: 0,
    async texto(url) {
      this.peticiones++;
      const r = respuestas[url];
      if (r instanceof Error) throw r;
      if (r == null) throw new HttpError('HTTP 404', 404, url);
      return r;
    },
  };
}
const log = { aviso() {}, info() {}, error() {} };
const opciones = {
  listados: [
    { nombre: 'nuevos', modos: ['rapido'], html: 'https://x/nuevos', rss: 'https://x/rss/nuevos' },
    { nombre: 'gratis', modos: ['lento'], html: 'https://x/gratis', rss: 'https://x/rss/gratis' },
  ],
};

test('si el listado falla, usa el RSS; solo pide los listados del modo', async () => {
  const http = httpFalso({ 'https://x/nuevos': new HttpError('HTTP 403', 403, 'https://x/nuevos'), 'https://x/rss/nuevos': fixture('nuevos.xml') });
  const informe = {};
  const deals = await fetchChollometro({ opciones, modo: 'rapido', http, log, config, informe, ahora });
  assert.equal(deals.length, 30);
  assert.ok(deals.every((d) => d.extra.rss));
  assert.deepEqual(informe, { nuevos: 30 });
  assert.equal(http.peticiones, 2);
});

test('si todo falla, lanza un error y dice si parece un bloqueo', async () => {
  const http = httpFalso({ 'https://x/nuevos': new HttpError('HTTP 403', 403, 'https://x/nuevos') });
  await assert.rejects(fetchChollometro({ opciones, modo: 'rapido', http, log, config, ahora }), (e) => e.bloqueo === true);
});

test('un listado HTML vacío (web cambiada) también cae al RSS', async () => {
  const http = httpFalso({ 'https://x/gratis': '<html>nada</html>', 'https://x/rss/gratis': fixture('gratis.xml') });
  const deals = await fetchChollometro({ opciones, modo: 'lento', http, log, config, ahora });
  assert.ok(deals.length > 0 && deals.every((d) => d.extra.rss));
});
