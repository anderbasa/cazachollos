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
import { cargarConfig, umbralesEfectivos } from './config.js';
import { recalcularGuardados } from './recalcular.js';
import { anotacionGithub, leerSecretos } from './entorno.js';
import { crearHttp } from './http.js';
import { ejecutarModo } from './motor.js';
import { imprimirInforme } from './report.js';
import { crearStore } from './store/index.js';
import { crearTelegram, crearTelegramSimulado } from './telegram.js';

const MODOS = ['rapido', 'lento', 'busqueda', 'limpieza', 'prueba', 'recalcular'];

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
  const secretos = leerSecretos();
  for (const p of secretos.problemas) avisoGithub('error', p);
  if (modo === 'prueba') return prueba({ secretos, dryRun });
  if (!dryRun && secretos.problemas.length) throw new Error(secretos.problemas.join(' · '));

  const store = await crearStore({ dryRun, credenciales: secretos.firebase });

  if (modo === 'limpieza' || modo === 'recalcular') {
    // Vuelve a puntuar lo guardado con los ajustes actuales (lo que ya no interesa sale de la web).
    // Borrar lo de más de 30 días llega en la fase 6.
    if (!dryRun && modo === 'limpieza') await store.marcarInicio('limpieza', Date.now());
    const umbrales = umbralesEfectivos(config, await store.leerUmbrales(), log);
    await recalcularGuardados({ store, config: { ...config, umbrales }, log, dryRun });
    return;
  }

  const telegramReal = crearTelegram({ token: secretos.token, chatId: secretos.chatId });
  if (!dryRun && !telegramReal) throw new Error('Faltan los secrets TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID.');

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

/** Comprueba cada pieza por separado y dice exactamente cuál falla (sin enseñar ninguna clave). */
async function prueba({ secretos, dryRun }) {
  const fallos = [];
  const paso = async (nombre, fn) => {
    try {
      const r = await fn();
      log.info(`✔ ${nombre}${r ? `: ${r}` : ''}`);
      return true;
    } catch (e) {
      fallos.push(`${nombre}: ${e.message}`);
      log.error(`${nombre}: ${e.message}`);
      avisoGithub('error', `${nombre}: ${e.message}`);
      return false;
    }
  };
  for (const p of secretos.problemas) fallos.push(p);

  if (!secretos.hayFirebase) fallos.push('Falta el secret FIREBASE_SERVICE_ACCOUNT.');
  else if (secretos.firebase) {
    await paso('Firebase', async () => {
      const store = await crearStore({ dryRun: true, credenciales: secretos.firebase });
      await store.leerGlobal();
      return `conecta con el proyecto ${secretos.firebase.project_id}`;
    });
  }

  if (!process.env.TELEGRAM_BOT_TOKEN?.trim()) fallos.push('Falta el secret TELEGRAM_BOT_TOKEN.');
  if (!process.env.TELEGRAM_CHAT_ID?.trim()) fallos.push('Falta el secret TELEGRAM_CHAT_ID.');
  const telegram = crearTelegram({ token: secretos.token, chatId: secretos.chatId });
  if (secretos.token) {
    const tg = crearTelegram({ token: secretos.token, chatId: secretos.chatId ?? '0' });
    await paso('Token de Telegram', async () => `es del bot @${await tg.quienSoy()}`);
  }
  if (telegram && !dryRun) {
    await paso('Mensaje de prueba', async () => {
      await telegram.enviarTexto('✅ <b>Cazachollos está conectado.</b>\nFirestore y Telegram funcionan. A partir de ahora solo te escribiré cuando haya algo bestia.');
      return 'enviado, mira tu Telegram';
    });
  }

  if (fallos.length) throw new Error(`La prueba ha fallado (${fallos.length}): ${fallos.join(' · ')}`);
  log.info(dryRun ? '(dry-run: no envío el mensaje de prueba)' : '✔ Todo conectado.');
}

function avisoGithub(nivel, mensaje) {
  if (process.env.GITHUB_ACTIONS === 'true') console.log(anotacionGithub(nivel, mensaje));
}

main().catch((e) => {
  log.error(e.message);
  avisoGithub('error', e.message);
  process.exitCode = 1;
});
