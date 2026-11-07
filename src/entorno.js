// Lee y comprueba los secrets SIN revelarlos nunca: los mensajes de error solo describen la forma
// (longitud, si empieza por "{"…), porque en GitHub Actions los logs de este repo son públicos.
// Ojo: JSON.parse de Node incluye un trozo del texto en su error; por eso aquí nunca se propaga.
import { readFileSync } from 'node:fs';

export function leerSecretos(env = process.env) {
  const problemas = [];

  // Firebase: JSON entero en FIREBASE_SERVICE_ACCOUNT, o ruta en FIREBASE_SERVICE_ACCOUNT_FILE (local)
  let firebase = null;
  const crudo = env.FIREBASE_SERVICE_ACCOUNT?.trim();
  const ruta = env.FIREBASE_SERVICE_ACCOUNT_FILE?.trim();
  let texto = crudo || null;
  if (!texto && ruta) {
    try {
      texto = readFileSync(ruta, 'utf8').trim();
    } catch {
      problemas.push(`No encuentro el archivo de la clave de Firebase (${ruta}).`);
    }
  }
  if (texto) {
    let j = null;
    try {
      j = JSON.parse(texto);
    } catch {
      problemas.push(
        `FIREBASE_SERVICE_ACCOUNT no es un JSON válido: tiene ${texto.length} caracteres, ` +
          `${texto.startsWith('{') ? 'empieza' : 'NO empieza'} por { y ${texto.endsWith('}') ? 'acaba' : 'NO acaba'} por }. ` +
          'Vuelve a pegar el contenido entero del archivo .json.',
      );
    }
    if (j) {
      const faltan = ['type', 'project_id', 'private_key', 'client_email'].filter((k) => !j[k]);
      if (faltan.length || j.type !== 'service_account') {
        problemas.push(`FIREBASE_SERVICE_ACCOUNT es un JSON, pero no es una clave de cuenta de servicio (falta: ${faltan.join(', ') || 'type=service_account'}).`);
      } else {
        firebase = j;
      }
    }
  }

  // Telegram
  let token = env.TELEGRAM_BOT_TOKEN?.trim() || null;
  if (token) {
    token = token.replace(/^bot(?=\d)/, ''); // por si se pegó con el "bot" de la URL
    if (!/^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(token)) {
      const pistas = [`tiene ${token.length} caracteres`];
      if (/\s/.test(token)) pistas.push('contiene espacios o saltos de línea');
      if (!token.includes(':')) pistas.push('no tiene los dos puntos ":"');
      problemas.push(`TELEGRAM_BOT_TOKEN no tiene forma de token (número:letras): ${pistas.join(', ')}.`);
      token = null;
    }
  }

  let chatId = env.TELEGRAM_CHAT_ID?.trim() || null;
  if (chatId) {
    chatId = chatId.replace(/^[\s"',:]+|[\s"',}]+$/g, ''); // comillas o comas copiadas de getUpdates
    if (!/^-?\d{4,}$/.test(chatId)) {
      problemas.push(`TELEGRAM_CHAT_ID no es solo un número (tiene ${chatId.length} caracteres). Debe ser algo como 987654321.`);
      chatId = null;
    }
  }

  return { firebase, token, chatId, problemas, hayFirebase: Boolean(texto || ruta) };
}

/** Línea ::error:: para que GitHub la enseñe como anotación (visible sin entrar en el log). */
export function anotacionGithub(nivel, mensaje) {
  const m = String(mensaje).slice(0, 500).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  return `::${nivel} title=Cazachollos::${m}`;
}
