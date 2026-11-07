import assert from 'node:assert/strict';
import { test } from 'node:test';
import { anotacionGithub, leerSecretos } from '../src/entorno.js';

const CLAVE = JSON.stringify({ type: 'service_account', project_id: 'demo-123', private_key: '-----BEGIN PRIVATE KEY-----\nSECRETISIMO\n-----END PRIVATE KEY-----\n', client_email: 'x@demo-123.iam.gserviceaccount.com' });
const TOKEN = '8123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw';

test('secrets correctos', () => {
  const s = leerSecretos({ FIREBASE_SERVICE_ACCOUNT: `  ${CLAVE}\n`, TELEGRAM_BOT_TOKEN: ` ${TOKEN} `, TELEGRAM_CHAT_ID: '987654321\n' });
  assert.deepEqual(s.problemas, []);
  assert.equal(s.firebase.project_id, 'demo-123');
  assert.equal(s.token, TOKEN);
  assert.equal(s.chatId, '987654321');
});

test('un JSON mal pegado no enseña ni un trozo de la clave', () => {
  const roto = CLAVE.slice(0, -5);
  const s = leerSecretos({ FIREBASE_SERVICE_ACCOUNT: roto });
  assert.equal(s.firebase, null);
  assert.equal(s.problemas.length, 1);
  assert.match(s.problemas[0], /no es un JSON válido.*NO acaba por \}/);
  assert.ok(!s.problemas[0].includes('SECRETISIMO') && !s.problemas[0].includes('demo-123'));
});

test('pegar el nombre en vez del contenido se detecta', () => {
  const s = leerSecretos({ FIREBASE_SERVICE_ACCOUNT: 'FIREBASE_SERVICE_ACCOUNT' });
  assert.match(s.problemas[0], /NO empieza por \{/);
});

test('JSON que no es una cuenta de servicio', () => {
  const s = leerSecretos({ FIREBASE_SERVICE_ACCOUNT: '{"apiKey":"x"}' });
  assert.match(s.problemas[0], /no es una clave de cuenta de servicio/);
});

test('token y chat_id: arregla lo típico y avisa de lo raro sin enseñarlo', () => {
  assert.equal(leerSecretos({ TELEGRAM_BOT_TOKEN: `bot${TOKEN}` }).token, TOKEN, 'quita el "bot" de la URL');
  assert.equal(leerSecretos({ TELEGRAM_CHAT_ID: '987654321,' }).chatId, '987654321', 'quita la coma de getUpdates');
  assert.equal(leerSecretos({ TELEGRAM_CHAT_ID: '-1001234567890' }).chatId, '-1001234567890', 'grupos: número negativo');
  const raro = leerSecretos({ TELEGRAM_BOT_TOKEN: 'TELEGRAM_BOT_TOKEN', TELEGRAM_CHAT_ID: 'mi chat' });
  assert.equal(raro.token, null);
  assert.equal(raro.chatId, null);
  assert.equal(raro.problemas.length, 2);
  assert.match(raro.problemas[0], /no tiene los dos puntos/);
  const conEspacio = leerSecretos({ TELEGRAM_BOT_TOKEN: '8123456789:AAHdqTcvCH1v GWJxfSeofSAs0K5PALDsaw' });
  assert.match(conEspacio.problemas[0], /espacios/);
  assert.ok(!conEspacio.problemas[0].includes('AAH'));
});

test('anotación de GitHub en una sola línea', () => {
  assert.equal(anotacionGithub('error', 'a\nb 100%'), '::error title=Cazachollos::a%0Ab 100%25');
});
