#!/usr/bin/env node
// Punto de entrada.
//   node src/main.js --modo rapido --dry-run      → enseña qué guardaría y qué avisaría
//   node src/main.js --modo rapido                → de verdad (Firestore + Telegram)
//   node src/main.js --modo rapido --respaldo     → lo lanza el "schedule" de GitHub: no hace nada si cron-job.org va bien
//   node src/main.js --modo prueba                → comprueba Firestore y Telegram y manda un mensaje de prueba
// Variables: FIREBASE_SERVICE_ACCOUNT (o FIREBASE_SERVICE_ACCOUNT_FILE), TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
// En local se leen de un archivo .env en la carpeta del proyecto (no se sube al repo).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { cargarConfig } from './config.js';
import { crearHttp } from './http.js';
import { ejecutarModo } from './motor.js';
import { imprimirInforme } from './report.js';
import { crearStore } from './store/index.js';
import { crearTelegram, crearTelegramSimulado } from './telegram.js';

const MODOS = ['rapido', 'lento', 'busqueda', 'limpieza', 'prueba'];

const { values } = parseArgs({
  options: {
    modo: { type: 'string', default: 'rapido' },
    'dry-run': { type: 'boolean', default: false },
    respaldo: { type: 'boolean', default: false },
    todos: { type: 'boolean', default: false },
  },
});

const log = {
  info: (m) => console.log(m),
  aviso: (m) => console.warn(`⚠ ${m}`),
  error: (m) => console.error(`✘ ${m}`),
};

function cargarEnvLocal() {
  const ruta = fileURLToPath(new URL('../.env', import.meta.url));
  if (existsSync(ruta)) process.loadEnvFile(ruta);
}

async function main() {
  const modo = values.modo;
  const dryRun = values['dry-run'];
  if (!MODOS.includes(modo)) throw new Error(`Modo desconocido "${modo}". Usa: ${MODOS.join(', ')}`);
  cargarEnvLocal();

  const config = cargarConfig();
  const store = await crearStore({ dryRun });
  const telegramReal = crearTelegram({ token: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID });
  if (!dryRun && !telegramReal) throw new Error('Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID.');

  if (modo === 'prueba') return prueba({ store, telegram: telegramReal, dryRun });

  if (modo === 'limpieza') {
    // La limpieza de verdad (borrar lo de más de 30 días) llega en la fase 6.
    if (!dryRun) await store.marcarInicio('limpieza', Date.now());
    log.info('Modo limpieza: de momento solo deja constancia de que se ha ejecutado (fase 6).');
    return;
  }

  const telegram = dryRun ? crearTelegramSimulado() : telegramReal;
  const salida = await ejecutarModo({
    modo,
    config,
    http: crearHttp(config.http),
    log,
    store,
    telegram,
    respaldo: values.respaldo,
    sinSiembra: dryRun && store.tipo === 'memoria',
  });
  imprimirInforme(salida, { dryRun, todos: values.todos });
}

async function prueba({ store, telegram, dryRun }) {
  const g = await store.leerGlobal();
  log.info(`✔ Firestore (${store.tipo}${store.proyecto ? `, proyecto ${store.proyecto}` : ''}): leído estado/_global (${Object.keys(g).length} campos)`);
  if (!telegram) {
    log.aviso('Telegram sin configurar (faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID).');
    return;
  }
  const bot = await telegram.quienSoy();
  log.info(`✔ Telegram: el token es del bot @${bot}`);
  if (dryRun) return log.info('(dry-run: no envío el mensaje de prueba)');
  await telegram.enviarTexto('✅ <b>Cazachollos está conectado.</b>\nFirestore y Telegram funcionan. A partir de ahora solo te escribiré cuando haya algo bestia.');
  log.info('✔ Mensaje de prueba enviado. Mira tu Telegram.');
}

main().catch((e) => {
  log.error(e.message);
  process.exitCode = 1;
});
