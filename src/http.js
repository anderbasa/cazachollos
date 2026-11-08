// Cliente HTTP educado: User-Agent fijo, pausa entre peticiones a la misma web,
// reintentos con espera creciente y espera larga ante 429/403. Nada de ráfagas.

export class HttpError extends Error {
  constructor(mensaje, status, url) {
    super(mensaje);
    this.name = 'HttpError';
    this.status = status;
    // Solo host + ruta: nunca la query (podría llevar claves) ni la URL completa en los logs
    this.donde = safeWhere(url);
    // 403/429 repetidos = la web nos está bloqueando
    this.bloqueo = status === 403 || status === 429;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function crearHttp(cfg = {}) {
  const userAgent = cfg.user_agent;
  const timeoutMs = (cfg.timeout_segundos ?? 20) * 1000;
  const pausaMs = cfg.pausa_entre_peticiones_ms ?? 2500;
  const reintentos = cfg.reintentos ?? 2;
  const ultimaPorHost = new Map();
  let peticiones = 0;

  function espera(intento, status) {
    // 403/429: 10 s, 30 s · resto: 3 s, 9 s
    const base = status === 403 || status === 429 ? 10_000 : 3_000;
    return base * 3 ** intento;
  }

  async function pedir(url, { accept = '*/*', json = false, headers = {}, soloRedireccion = false } = {}) {
    const host = new URL(url).host;
    for (let intento = 0; ; intento++) {
      const falta = (ultimaPorHost.get(host) ?? 0) + pausaMs - Date.now();
      if (falta > 0) await sleep(falta);
      ultimaPorHost.set(host, Date.now());
      peticiones++;
      let res;
      try {
        res = await fetch(url, {
          headers: { 'User-Agent': userAgent, Accept: accept, 'Accept-Language': 'es-ES,es;q=0.9', ...headers },
          signal: AbortSignal.timeout(timeoutMs),
          redirect: soloRedireccion ? 'manual' : 'follow',
        });
      } catch (e) {
        if (intento >= reintentos) throw new HttpError(`sin respuesta (${e.name})`, 0, url);
        await sleep(espera(intento, 0));
        continue;
      }
      if (soloRedireccion && res.status >= 300 && res.status < 400) return res.headers.get('location');
      if (res.ok) return soloRedireccion ? null : json ? res.json() : res.text();
      const reintentable = [403, 429, 500, 502, 503, 504].includes(res.status);
      if (!reintentable || intento >= reintentos) throw new HttpError(`HTTP ${res.status}`, res.status, url);
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(retryAfter > 0 ? Math.min(retryAfter * 1000, 60_000) : espera(intento, res.status));
    }
  }

  return {
    texto: (url, opts) => pedir(url, opts),
    json: (url, opts) => pedir(url, { accept: 'application/json', ...opts, json: true }),
    /** A dónde redirige un enlace corto, sin seguirlo (null si no redirige). */
    redireccion: (url, opts) => pedir(url, { ...opts, soloRedireccion: true }),
    get peticiones() {
      return peticiones;
    },
  };
}

function safeWhere(url) {
  try {
    const u = new URL(url);
    return u.host + u.pathname.replace(/bot[^/]+/, 'bot***');
  } catch {
    return '?';
  }
}
