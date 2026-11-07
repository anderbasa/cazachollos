import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cargarConfig } from '../src/config.js';
import { crearDeal } from '../src/deal.js';
import { mensajeChollo } from '../src/mensajes.js';
import { puntuar } from '../src/scorer.js';
import { crearTelegram } from '../src/telegram.js';

const config = cargarConfig();
const ahora = Date.parse('2026-11-07T12:00:00Z');
const deal = (o = {}) => {
  const d = crearDeal({
    fuente: 'chollometro',
    idFuente: 1,
    titulo: 'Monitor <4K> & más',
    url: 'https://www.chollometro.com/ofertas/monitor-1',
    tienda: 'Amazon',
    categoria: 'tecnologia',
    precio: 40,
    precioAnterior: 100,
    envio: 0,
    temperatura: 412,
    publicadoEn: new Date(ahora - 60 * 60_000).toISOString(),
    imagen: 'https://static.chollometro.com/x.jpg',
    verificado: true,
    fiable: true,
    ...o,
  });
  return { ...d, ...puntuar(d, config.umbrales, ahora) };
};

test('formato del aviso: precios, tienda, categoría, fuente y escapado HTML', () => {
  const m = mensajeChollo(deal(), { config });
  assert.match(m.texto, /^🔥 <b>CHOLLAZO<\/b>/);
  assert.match(m.texto, /<b>Monitor &lt;4K&gt; &amp; más<\/b>/);
  assert.match(m.texto, /<s>100 €<\/s> → <b>40 €<\/b> · <b>-60 %<\/b>/);
  assert.match(m.texto, /🏪 Amazon · Tecnología e informática/);
  assert.match(m.texto, /🌡️ 412°.*Chollometro/);
  assert.match(m.texto, /💡 -60 % con 412°/);
  assert.equal(m.foto, 'https://static.chollometro.com/x.jpg');
  assert.deepEqual(m.boton, { texto: 'Ver chollo', url: 'https://www.chollometro.com/ofertas/monitor-1' });
});

test('emoji distinto para error de precio, gratis y sin verificar; envío y cupón', () => {
  assert.match(mensajeChollo(deal({ etiquetas: ['ERROR_DE_PRECIO'] }), { config }).texto, /^🚨 <b>ERROR DE PRECIO/);
  assert.match(mensajeChollo(deal({ precio: 0, precioAnterior: 30, etiquetas: ['GRATIS'] }), { config }).texto, /^🎁 <b>GRATIS[\s\S]*<s>30 €<\/s> → <b>GRATIS<\/b>/);
  assert.match(mensajeChollo(deal({ verificado: false }), { config }).texto, /^⚠️ <b>SIN VERIFICAR/);
  const conEnvio = mensajeChollo(deal({ envio: 3.95, cupon: 'MAGIC' }), { config }).texto;
  assert.match(conEnvio, /\(con 3,95 € de envío\)/);
  assert.match(conEnvio, /Cupón: <code>MAGIC<\/code>/);
});

function fetchFalso(respuestas) {
  const llamadas = [];
  const f = async (url, init) => {
    const metodo = url.split('/').pop();
    llamadas.push({ url, metodo, cuerpo: JSON.parse(init.body) });
    const r = respuestas[metodo] ?? { status: 200, json: { ok: true, result: {} } };
    return { status: r.status, json: async () => r.json };
  };
  f.llamadas = llamadas;
  return f;
}

test('si Telegram no puede bajar la foto, manda el mensaje sin foto', async () => {
  const f = fetchFalso({ sendPhoto: { status: 400, json: { ok: false, description: 'Bad Request: wrong type of the web page content' } } });
  const t = crearTelegram({ token: '123:SECRETO', chatId: '999', fetchImpl: f, pausaMs: 0 });
  await t.enviarChollo(deal(), { config });
  assert.deepEqual(
    f.llamadas.map((l) => l.metodo),
    ['sendPhoto', 'sendMessage'],
  );
  assert.equal(f.llamadas[1].cuerpo.chat_id, '999');
  assert.equal(f.llamadas[1].cuerpo.parse_mode, 'HTML');
});

test('los errores nunca llevan el token ni el chat_id', async () => {
  const f = fetchFalso({ sendMessage: { status: 401, json: { ok: false, description: 'Unauthorized' } } });
  const t = crearTelegram({ token: '123:SECRETO', chatId: '999', fetchImpl: f, pausaMs: 0 });
  await assert.rejects(t.enviarTexto('hola'), (e) => {
    assert.equal(e.message, 'Telegram sendMessage: 401 Unauthorized');
    assert.ok(!e.message.includes('SECRETO') && !e.message.includes('999'));
    return true;
  });
  const sinRed = crearTelegram({
    token: '123:SECRETO',
    chatId: '999',
    pausaMs: 0,
    fetchImpl: async () => {
      throw new TypeError('fetch failed https://api.telegram.org/bot123:SECRETO/sendMessage');
    },
  });
  await assert.rejects(sinRed.enviarTexto('hola'), (e) => !e.message.includes('SECRETO'));
});

test('sin token o sin chat_id no hay bot', () => {
  assert.equal(crearTelegram({ token: '', chatId: '1' }), null);
  assert.equal(crearTelegram({ token: 'x', chatId: undefined }), null);
});
