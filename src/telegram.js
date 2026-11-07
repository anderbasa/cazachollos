// Bot de Telegram (solo enviar; sin comandos). El token y el chat_id NUNCA se imprimen:
// los errores solo llevan el método y la descripción que devuelve Telegram.
import { mensajeChollo } from './mensajes.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function crearTelegram({ token, chatId, fetchImpl = globalThis.fetch, pausaMs = 1100 } = {}) {
  if (!token || !chatId) return null;
  let ultimo = 0;

  async function llamar(metodo, cuerpo, reintento = true) {
    const falta = ultimo + pausaMs - Date.now();
    if (falta > 0) await sleep(falta); // Telegram: ~1 mensaje por segundo al mismo chat
    ultimo = Date.now();
    let res;
    try {
      res = await fetchImpl(`https://api.telegram.org/bot${token}/${metodo}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, ...cuerpo }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      throw new Error(`Telegram ${metodo}: sin respuesta (${e.name})`);
    }
    const j = await res.json().catch(() => ({}));
    if (j.ok) return j.result;
    const espera = j.parameters?.retry_after;
    if (res.status === 429 && reintento && espera && espera <= 30) {
      await sleep(espera * 1000);
      return llamar(metodo, cuerpo, false);
    }
    const err = new Error(`Telegram ${metodo}: ${res.status} ${j.description ?? ''}`.trim());
    err.status = res.status;
    throw err;
  }

  const teclado = (boton) => (boton ? { reply_markup: { inline_keyboard: [[{ text: boton.texto, url: boton.url }]] } } : {});

  return {
    real: true,
    async enviarChollo(d, opts) {
      const m = mensajeChollo(d, opts);
      if (m.foto) {
        try {
          return await llamar('sendPhoto', { photo: m.foto, caption: m.texto, parse_mode: 'HTML', ...teclado(m.boton) });
        } catch (e) {
          if (e.status !== 400) throw e; // foto que Telegram no puede descargar → va sin foto
        }
      }
      return llamar('sendMessage', { text: m.texto, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...teclado(m.boton) });
    },
    async enviarTexto(html) {
      return llamar('sendMessage', { text: html.slice(0, 4096), parse_mode: 'HTML', link_preview_options: { is_disabled: true } });
    },
    /** Comprueba el token sin enviar nada: devuelve el @usuario del bot. */
    async quienSoy() {
      const r = await llamar('getMe', {});
      return r.username;
    },
  };
}

/** Para dry-run y tests: guarda los mensajes en vez de enviarlos. */
export function crearTelegramSimulado({ fallarCon } = {}) {
  const enviados = [];
  return {
    real: false,
    enviados,
    async enviarChollo(d, opts) {
      if (fallarCon) throw new Error(fallarCon);
      enviados.push({ tipo: 'chollo', deal: d, ...mensajeChollo(d, opts) });
    },
    async enviarTexto(html) {
      if (fallarCon) throw new Error(fallarCon);
      enviados.push({ tipo: 'texto', texto: html });
    },
    async quienSoy() {
      return 'simulado';
    },
  };
}
