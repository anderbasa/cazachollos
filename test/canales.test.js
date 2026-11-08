// Canales de Telegram, con páginas reales guardadas el 8/11/2026 (test/fixtures/telegram).
// Si Telegram o un canal cambian el formato, estos tests son los primeros en fallar.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { cargarConfig } from '../src/config.js';
import { crearDeal, idDeal } from '../src/deal.js';
import { ejecutarModo } from '../src/motor.js';
import { fusionarDeals } from '../src/pipeline.js';
import { fetch as fetchTelegram, mensajeADeal, parsearPagina } from '../src/sources/telegram.js';
import { crearStoreMemoria } from '../src/store/memoria.js';
import { crearTelegramSimulado } from '../src/telegram.js';

const config = cargarConfig();
const CANALES = ['chollos', 'descuentos', 'chollometro', 'canaldechollos', 'gangagato'];
const pagina = (c) => readFileSync(new URL(`./fixtures/telegram/${c}.html`, import.meta.url), 'utf8');
const mensajes = (c) => parsearPagina(pagina(c));
const msg = (c, re) => mensajes(c).find((m) => re.test(m.texto));
const log = { aviso() {}, info() {}, error() {} };

for (const c of CANALES) {
  test(`@${c}: la vista web sigue teniendo el formato esperado`, () => {
    const ms = mensajes(c);
    assert.equal(ms.length, 20, 'cada página trae 20 mensajes');
    for (const m of ms) {
      assert.ok(m.id > 0);
      assert.match(m.fecha, /^2026-/);
      assert.ok(m.texto.length > 10);
    }
    const deals = ms.map((m) => mensajeADeal(m, { canal: c }, { config })).filter(Boolean);
    assert.ok(deals.length >= 18, `casi todos se convierten en chollo (${deals.length})`);
    assert.ok(deals.filter((d) => d.precio != null).length >= 14, 'casi todos traen precio');
  });
}

test('red Chollometro: mismo id que el chollo de Chollometro, precios y tienda', () => {
  const d = mensajeADeal(msg('chollos', /Citizen Tsuyosa/), { canal: 'chollos', editores: true }, { config });
  assert.equal(d.fuente, 'chollometro');
  assert.equal(d.idFuente, '2059884');
  assert.equal(d.id, idDeal('chollometro', '2059884'));
  assert.equal(d.titulo, 'Citizen Tsuyosa 60 automático 40 mm, calibre 8310, zafiro');
  assert.equal(d.precio, 265.68);
  assert.equal(d.precioAnterior, 369);
  assert.equal(d.tienda, 'Amazon');
  assert.equal(d.categoria, 'moda');
  assert.equal(d.verificado, false);
  assert.equal(d.extra.parcial, true);
  assert.ok(d.etiquetas.includes('EDITORES') && d.etiquetas.includes('EN_TELEGRAM'));
  assert.deepEqual(d.fuentes, ['telegram']);
});

test('@gangagato: el id es el producto de Amazon, para no repetirlo', () => {
  const d = mensajeADeal(msg('gangagato', /SIMPVALE/), { canal: 'gangagato' }, { config });
  assert.equal(d.fuente, 'telegram');
  assert.equal(d.idFuente, 'amazon:B07X4F1XHZ');
  assert.equal(d.precio, 9.79);
  assert.equal(d.precioAnterior, 25.99);
  assert.equal(d.tienda, 'Amazon');
  assert.equal(d.categoria, 'hogar');
  assert.match(d.url, /^https:\/\/www\.amazon\.es\/dp\/B07X4F1XHZ/);
  assert.ok(d.etiquetas.includes('SIN_VERIFICAR'));
});

test('@canaldechollos: cupón, precios y enlace al producto', () => {
  const d = mensajeADeal(msg('canaldechollos', /Kobra 4/), { canal: 'canaldechollos' }, { config });
  assert.equal(d.titulo, 'Impresora 3D Kobra 4 + 20Kg Filamento PLA');
  assert.equal(d.precio, 240);
  assert.equal(d.precioAnterior, 400);
  assert.equal(d.cupon, 'IFPHVE9N');
  assert.equal(d.tienda, 'AliExpress');
  assert.equal(d.categoria, 'tecnologia');
  assert.equal(d.url, 'https://c.michollo.to/F6O4w');
});

test('@chollometro: tienda = último hashtag y categoría por el enlace de su categoría', () => {
  const m = msg('chollometro', /Hoka Bondi 7/);
  const d = mensajeADeal(m, { canal: 'chollometro' }, { config });
  assert.equal(d.tienda, 'FootLocker');
  assert.equal(d.categoria, 'moda');
  assert.equal(d.fuente, 'telegram', 'sin resolver el enlace corto no se sabe el chollo');
  const resuelto = { ...m, enlaces: [...m.enlaces, 'https://www.chollometro.com/ofertas/hoka-bondi-7-hombre-zapatillas-2059820?utm_source=telegram'] };
  assert.equal(mensajeADeal(resuelto, { canal: 'chollometro' }, { config }).id, idDeal('chollometro', '2059820'));
});

test('AGOTADO marca el chollo como caducado', () => {
  const d = mensajeADeal(msg('chollos', /AGOTADO[\s\S]*Jordan Zion/), { canal: 'chollos' }, { config });
  assert.equal(d.caducado, true);
  assert.ok(d.etiquetas.includes('CADUCADO'));
});

function httpFalso(paginas, redirecciones = {}) {
  const pedidas = [];
  return {
    pedidas,
    peticiones: 0,
    async texto(url) {
      pedidas.push(url);
      const canal = url.match(/t\.me\/s\/([^?]+)/)?.[1];
      if (!(canal in paginas)) throw new Error('HTTP 500');
      return paginas[canal];
    },
    async redireccion(url) {
      pedidas.push(url);
      return redirecciones[url] ?? null;
    },
  };
}

test('solo procesa lo nuevo y recuerda el último mensaje de cada canal', async () => {
  const ultimoGanga = Math.max(...mensajes('gangagato').map((m) => m.id));
  const http = httpFalso({ gangagato: pagina('gangagato'), canaldechollos: pagina('canaldechollos') });
  const cambiosEstado = {};
  const informe = {};
  const deals = await fetchTelegram({
    opciones: { canales: [{ canal: 'gangagato' }, { canal: 'canaldechollos' }] },
    http,
    log,
    config,
    informe,
    estado: { ultimos: { gangagato: ultimoGanga - 3, canaldechollos: 1 } },
    cambiosEstado,
  });
  assert.equal(informe.gangagato, 3, 'de @gangagato solo los 3 nuevos');
  assert.equal(cambiosEstado.ultimos.gangagato, ultimoGanga);
  assert.ok(deals.filter((d) => d.extra.canal === 'gangagato').length <= 3);
  assert.ok(http.pedidas.some((u) => u.includes('canaldechollos?before=')), 'hueco grande → pide la página anterior');
});

test('un canal que falla no para a los demás; si fallan todos, error', async () => {
  const http = httpFalso({ gangagato: pagina('gangagato') });
  const cambiosEstado = {};
  const deals = await fetchTelegram({ opciones: { canales: [{ canal: 'roto' }, { canal: 'gangagato' }] }, http, log, config, cambiosEstado });
  assert.ok(deals.length > 0);
  assert.equal(cambiosEstado.canales.roto.fallos, 1);
  assert.equal(cambiosEstado.ultimos.roto, undefined);
  await assert.rejects(fetchTelegram({ opciones: { canales: [{ canal: 'roto' }] }, http, log, config, cambiosEstado: {} }));
});

test('resuelve los enlaces cortos de @chollometro para cruzar con Chollometro', async () => {
  const m = msg('chollometro', /Hoka Bondi 7/);
  const corto = m.enlaces.find((u) => u.includes('chollo.to/hn0v7'));
  const http = httpFalso({ chollometro: pagina('chollometro') }, { [corto]: 'https://www.chollometro.com/ofertas/hoka-bondi-7-hombre-2059820?utm_source=telegram' });
  const deals = await fetchTelegram({ opciones: { canales: [{ canal: 'chollometro' }] }, http, log, config, cambiosEstado: {} });
  assert.ok(deals.some((d) => d.id === idDeal('chollometro', '2059820')));
});

test('fusión: manda el dato de Chollometro y el canal solo añade su señal', () => {
  const listado = crearDeal({ fuente: 'chollometro', idFuente: '2059884', titulo: 'Citizen Tsuyosa 60', url: 'https://www.chollometro.com/ofertas/citizen-2059884', categoria: 'moda', precio: 265.68, precioAnterior: 369, envio: 0, temperatura: 660, verificado: true, fiable: true, imagen: 'https://static.chollometro.com/x.jpg' });
  const canal = mensajeADeal(msg('chollos', /Citizen Tsuyosa/), { canal: 'chollos', editores: true }, { config });
  for (const f of [fusionarDeals(listado, canal), fusionarDeals(canal, listado)]) {
    assert.equal(f.verificado, true);
    assert.equal(f.temperatura, 660);
    assert.equal(f.url, listado.url);
    assert.equal(f.imagen, listado.imagen);
    assert.ok(f.etiquetas.includes('EDITORES'));
    assert.ok(!f.etiquetas.includes('SIN_VERIFICAR'));
    assert.deepEqual(f.fuentes.sort(), ['chollometro', 'telegram']);
    assert.equal(f.extra.parcial, false);
  }
});

test('un mensaje parcial nunca pisa un chollo de Chollometro ya guardado', async () => {
  const canal = mensajeADeal(msg('chollos', /Citizen Tsuyosa/), { canal: 'chollos' }, { config });
  const store = crearStoreMemoria({
    estado: { chollometro: { sembrado: true, recientes: { [canal.id]: { t: 660, p: 265.68, c: 0, b: 3, s: 0, n: 0, v: 1 } } }, telegram: { sembrado: true } },
    deals: { [canal.id]: { id: canal.id, temperatura: 660, verificado: true } },
  });
  const salida = await ejecutarModo({
    modo: 'rapido',
    config,
    http: { peticiones: 0 },
    log,
    store,
    telegram: crearTelegramSimulado(),
    ahora: Date.parse('2026-11-08T21:00:00Z'),
    fuentes: [{ id: 'telegram', opciones: {}, modulo: { fetch: async () => [canal] } }],
  });
  assert.equal(salida.escrituras.actualizados, 0);
  assert.equal(store.db.deals.get(canal.id).temperatura, 660);
  assert.equal(store.db.deals.get(canal.id).verificado, true);
});

test('sin verificar y canal no fiable: puede entrar en la web pero nunca avisa', () => {
  const d = mensajeADeal(msg('gangagato', /SIMPVALE/), { canal: 'gangagato', fiable: false }, { config });
  assert.equal(d.verificado, false);
  assert.equal(d.fiable, false);
});
