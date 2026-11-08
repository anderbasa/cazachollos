// Motor de una ejecución completa:
//   1. Respaldo: si el modo se ejecutó hace poco (cron-job.org va bien), no hace nada.
//   2. Lee umbrales editados en la web y el estado de cada fuente.
//   3. Recoge y puntúa (pipeline.js).
//   4. Compara con el estado: solo escribe chollos nuevos o con cambios relevantes.
//   5. Avisos: nunca dos veces el mismo; antispam (10 por ronda, 40 al día), silencio, resumen.
//   6. Salud de las fuentes: un aviso si fallan 3 veces seguidas, otro al recuperarse.
//   7. Guarda estado y un registro de la ejecución.
import { umbralesEfectivos } from './config.js';
import { mensajeCola, mensajeFuenteDesactivada, mensajeFuenteFalla, mensajeFuenteRecuperada, mensajeResumen, mensajeTope } from './mensajes.js';
import { esRebaja } from './deal.js';
import { diaLocal, ejecutar, esUrgente, estaEnSilencio, ordenarAvisos } from './pipeline.js';
import { modosDe } from './sources/index.js';

const BANDAS = [100, 300, 500, 1000, 2000, 5000];
/** Banda de temperatura: solo se reescribe un chollo cuando cruza una de estas marcas. */
export const banda = (t) => (t == null ? -1 : BANDAS.filter((b) => t >= b).length);
const minutosEpoch = (ms) => Math.floor(ms / 60_000);

function entrada(d, previa, ahoraMin) {
  return {
    t: d.temperatura == null ? null : Math.round(d.temperatura),
    p: d.precioEfectivo,
    c: d.caducado ? 1 : 0,
    b: banda(d.temperatura),
    s: d.esChollazo ? 1 : 0,
    n: previa?.n ?? 0,
    pn: previa?.pn ?? null,
    tn: previa?.tn ?? null,
    na: previa?.na ?? 0,
    v: ahoraMin,
  };
}

export function cambioRelevante(e, d) {
  if (Math.abs((e.p ?? -1) - (d.precioEfectivo ?? -1)) >= 0.01) return 'precio';
  if (e.c !== (d.caducado ? 1 : 0)) return 'caducado';
  if (e.s !== (d.esChollazo ? 1 : 0)) return 'umbral';
  if (e.b !== banda(d.temperatura)) return 'temperatura';
  return null;
}

/** Documento de Firestore para un chollo (sin favorito/oculto: esos son de la web). */
export function docDeDeal(d, ahora, zona, nuevo) {
  const doc = {
    version: 1,
    id: d.id,
    fuente: d.fuente,
    origen: d.origen,
    fuentes: d.fuentes ?? [d.fuente],
    idFuente: d.idFuente,
    titulo: d.titulo,
    url: d.url,
    tienda: d.tienda,
    categoria: d.categoria,
    categoriaFuente: d.categoriaFuente,
    precio: d.precio,
    precioAnterior: d.precioAnterior,
    envio: d.envio,
    precioEfectivo: d.precioEfectivo,
    descuento: d.descuento,
    cupon: d.cupon,
    temperatura: d.temperatura,
    velocidad: d.velocidad,
    publicadoEn: d.publicadoEn,
    dia: diaLocal(d.publicadoEn ? Date.parse(d.publicadoEn) : ahora, zona),
    imagen: d.imagen,
    caducado: d.caducado,
    local: d.local,
    verificado: d.verificado,
    gratis: d.gratis,
    etiquetas: d.etiquetas,
    puntuacion: d.puntuacion,
    esChollo: d.esChollo,
    esChollazo: d.esChollazo,
    filtrado: Boolean(d.filtrado),
    motivos: d.motivos,
    bloqueos: d.bloqueos,
    extra: d.extra,
    actualizadoEn: ahora,
  };
  if (nuevo) Object.assign(doc, { vistoEn: ahora, notificado: false, notificadoEn: null, precioNotificado: null, avisos: 0, via: null });
  return doc;
}

const corto = (d) => ({ id: d.id, titulo: d.titulo, url: d.url, precioEfectivo: d.precioEfectivo, descuento: d.descuento, gratis: d.gratis });

export async function ejecutarModo(opts) {
  const { modo, http, log, store, telegram, respaldo = false, ahora = Date.now(), fuentes: fuentesInyectadas } = opts;
  let config = opts.config;
  const zona = config.zona_horaria ?? 'Europe/Madrid';
  const salida = { modo, ahora, respaldo, almacen: store.tipo, enviados: [], errores: [], escrituras: { creados: 0, actualizados: 0 } };

  // 1 · Respaldo
  const g = await store.leerGlobal();
  const minRespaldo = config.modos?.[modo]?.respaldo_si_mas_de_min;
  const ultima = g.ultimaPorModo?.[modo];
  if (respaldo && minRespaldo && ultima && ahora - ultima < minRespaldo * 60_000) {
    salida.saltado = `el modo ${modo} se ejecutó hace ${Math.round((ahora - ultima) / 60_000)} min: cron-job.org funciona, el respaldo no hace nada`;
    return salida;
  }
  await store.marcarInicio(modo, ahora);

  // 2 · Umbrales de la web y estado
  const remotos = await store.leerUmbrales();
  if (remotos) config = { ...config, umbrales: umbralesEfectivos(config, remotos, log) };
  const u = config.umbrales;
  const cfgEstado = config.estado ?? {};
  const nombre = (id) => config.fuentes?.[id]?.nombre ?? id;

  const ids = fuentesInyectadas
    ? fuentesInyectadas.map((f) => f.id)
    : Object.entries(config.fuentes ?? {})
        .filter(([, f]) => f.activa && modosDe(f).includes(modo))
        .map(([id]) => id);
  const estados = await store.leerEstados(ids);
  // Reactivar desde la web (pantalla Estado): config/umbrales.reactivar.<fuente> = momento en ms
  const reactivadas = ids.filter((id) => estados[id]?.desactivada && (u.reactivar?.[id] ?? 0) > (estados[id].desactivadaEn ?? 0));
  for (const id of reactivadas) estados[id] = { ...estados[id], desactivada: false, bloqueosSeguidos: 0, fallosSeguidos: 0, alertaEnviada: false };
  salida.reactivadas = reactivadas;
  salida.desactivadas = ids.filter((id) => estados[id]?.desactivada);
  const solo = ids.filter((id) => !salida.desactivadas.includes(id));

  // 3 · Recoger y puntuar
  const r = await ejecutar({ modo, config, http, log, ahora, solo, fuentes: fuentesInyectadas, estados });
  Object.assign(salida, { resultados: r.resultados, todos: r.todos, chollos: r.chollos, chollazos: r.chollazos, casi: r.casi, peticiones: r.peticiones });

  // 4 · Comparar con el estado
  const ahoraMin = minutosEpoch(ahora);
  const maxPorChollo = u.avisos.max_por_chollo ?? 3;
  const esperaRebajaMin = (u.avisos.rebaja_espera_horas ?? 3) * 60;
  const porFuente = {};
  const pf = (id) => (porFuente[id] ??= { recientes: {}, borrar: [], campos: {} });
  const crear = [];
  const actualizar = [];
  const candidatos = [];
  const okIds = new Set(r.resultados.filter((x) => x.ok).map((x) => x.fuente));

  for (const d of r.todos) {
    const est = estados[d.fuente];
    const e = est?.recientes?.[d.id];
    // Un canal que enlaza a un chollo de Chollometro ya guardado no aporta nada: nunca se pisan
    // los datos completos del listado (temperatura, envío…) con los parciales del mensaje.
    if (e && d.extra?.parcial) continue;
    if (!e) {
      if (!d.esChollo || d.caducado) continue; // solo se guarda lo que entra en la web
      crear.push(d);
      pf(d.fuente).recientes[d.id] = entrada(d, null, ahoraMin);
    } else {
      pf(d.fuente).recientes[d.id] = entrada(d, e, ahoraMin);
      if (cambioRelevante(e, d)) actualizar.push(d);
    }
    // Primera ejecución correcta de una fuente: se guarda todo pero no se avisa (no hay historial).
    // sinSiembra: dry-run sin Firestore, para ver qué avisaría "en régimen normal".
    const siembra = !opts.sinSiembra && !est?.sembrado;
    if (d.esChollazo && e?.n !== 1) {
      candidatos.push({ d, tipo: 'nuevo', siembra });
    } else if (
      d.esChollazo &&
      e?.n === 1 &&
      esRebaja(d.precioEfectivo, e.pn, u.avisos.rebaja_minima_pct) &&
      (e.na ?? 1) < maxPorChollo &&
      ahoraMin - (e.tn ?? 0) >= esperaRebajaMin
    ) {
      candidatos.push({ d, tipo: 'rebaja', antes: e.pn, siembra: false });
    }
  }
  // Olvidar lo que no aparece en ningún listado desde hace tiempo (solo si la fuente respondió)
  const olvidarMin = (cfgEstado.olvidar_tras_horas ?? 72) * 60;
  for (const id of okIds) {
    for (const [dealId, e] of Object.entries(estados[id]?.recientes ?? {})) {
      if (!pf(id).recientes[dealId] && ahoraMin - (e.v ?? 0) > olvidarMin) pf(id).borrar.push(dealId);
    }
  }

  // Escribir chollos
  await Promise.all(
    crear.map(async (d) => {
      const creado = await store.crearDeal(docDeDeal(d, ahora, zona, true));
      if (!creado) await store.actualizarDeal(d.id, docDeDeal(d, ahora, zona, false)); // ya existía (estado olvidado)
      salida.escrituras.creados++;
    }),
  );
  await Promise.all(
    actualizar.map(async (d) => {
      await store.actualizarDeal(d.id, docDeDeal(d, ahora, zona, false));
      salida.escrituras.actualizados++;
    }),
  );

  // 5 · Avisos
  const dia = diaLocal(ahora, zona);
  // n: avisado · pn: precio avisado · tn: minuto del último aviso · na: mensajes enviados de este chollo
  const marcarEntrada = (d, { enviado = false } = {}) => {
    const e = pf(d.fuente).recientes[d.id];
    Object.assign(e, { n: 1, pn: d.precioEfectivo, tn: ahoraMin, na: (e.na ?? 0) + (enviado ? 1 : 0) });
  };
  const opcionesRebaja = { maxAvisos: maxPorChollo, esperaMs: esperaRebajaMin * 60_000 };
  const silencio = estaEnSilencio(u.silencio, ahora, zona);
  salida.silencio = silencio;

  const sembrados = candidatos.filter((c) => c.siembra);
  const resto = candidatos.filter((c) => !c.siembra);
  const silenciados = resto.filter((c) => silencio && !esUrgente(c.d));
  const aEnviar = ordenarAvisos(resto.filter((c) => !(silencio && !esUrgente(c.d))));

  for (const c of sembrados) {
    await store.marcarAvisado(c.d.id, { ahora, precio: c.d.precioEfectivo, via: 'siembra' });
    marcarEntrada(c.d);
  }
  salida.sembrados = sembrados.map((c) => c.d);

  let cola = [...(g.cola ?? [])];
  const colaAntes = cola.length;
  for (const c of silenciados) {
    await store.marcarAvisado(c.d.id, { ahora, precio: c.d.precioEfectivo, via: 'silencio' });
    marcarEntrada(c.d);
    cola.push(corto(c.d));
  }
  salida.silenciados = silenciados.map((c) => c.d);

  const maxRonda = u.avisos.max_por_ejecucion;
  const maxDia = u.avisos.max_por_dia;
  const quiero = Math.min(aEnviar.length, maxRonda);
  const cupo = quiero > 0 ? await store.reservarCupo(dia, quiero, maxDia) : { k: 0, avisosHoy: 0, topeAvisado: false };
  const enviar = aEnviar.slice(0, cupo.k);
  const sobran = aEnviar.slice(cupo.k);

  let enviados = 0;
  for (const c of enviar) {
    const rebaja = c.tipo === 'rebaja' ? { rebajaPct: u.avisos.rebaja_minima_pct, ...opcionesRebaja } : {};
    const previo = await store.reclamarAviso(c.d.id, { ahora, precio: c.d.precioEfectivo, via: 'telegram', ...rebaja });
    if (!previo) continue; // otra ejecución ya lo avisó (o la rebaja no cumple las condiciones)
    try {
      await telegram.enviarChollo(c.d, { tipo: c.tipo, antes: c.antes, config });
      enviados++;
      marcarEntrada(c.d, { enviado: true });
      salida.enviados.push({ tipo: c.tipo, deal: c.d });
    } catch (e) {
      salida.errores.push(e.message);
      await store.liberarAviso(c.d.id, previo);
    }
  }
  if (cupo.k > enviados) await store.devolverCupo(dia, cupo.k - enviados);

  salida.resumen = [];
  if (sobran.length) {
    if (cupo.avisosHoy >= maxDia) {
      // Tope diario: un único mensaje al día; el resto, solo web
      for (const c of sobran) {
        await store.marcarAvisado(c.d.id, { ahora, precio: c.d.precioEfectivo, via: 'tope' });
        marcarEntrada(c.d);
      }
      salida.tope = sobran.map((c) => c.d);
      if (!cupo.topeAvisado) {
        try {
          await telegram.enviarTexto(mensajeTope(maxDia));
          await store.marcarTope(dia);
          salida.enviados.push({ tipo: 'tope' });
        } catch (e) {
          salida.errores.push(e.message);
        }
      }
    } else {
      // Tope de la ronda: lo que sobra, en un único resumen
      const reclamados = [];
      for (const c of sobran) {
        const previo = await store.reclamarAviso(c.d.id, { ahora, precio: c.d.precioEfectivo, via: 'resumen' });
        if (previo) reclamados.push({ c, previo });
      }
      if (reclamados.length) {
        try {
          await telegram.enviarTexto(mensajeResumen(reclamados.map((x) => x.c.d), maxRonda));
          for (const { c } of reclamados) marcarEntrada(c.d, { enviado: true });
          salida.resumen = reclamados.map((x) => x.c.d);
          salida.enviados.push({ tipo: 'resumen', n: reclamados.length });
        } catch (e) {
          salida.errores.push(e.message);
          for (const { c, previo } of reclamados) await store.liberarAviso(c.d.id, previo);
        }
      }
    }
  }

  // Resumen de la mañana
  if (!silencio && cola.length) {
    try {
      await telegram.enviarTexto(mensajeCola(cola));
      salida.enviados.push({ tipo: 'cola', n: cola.length });
      cola = [];
    } catch (e) {
      salida.errores.push(e.message);
    }
  }
  if (cola.length !== colaAntes) await store.guardarCola(cola.slice(-50));

  // 6 · Salud de las fuentes
  for (const res of r.resultados) {
    const est = estados[res.fuente] ?? {};
    const campos = pf(res.fuente).campos;
    Object.assign(campos, res.cambiosEstado ?? {}); // lo que la fuente quiere recordar (último mensaje leído…)
    campos.ultimaEjecucion = ahora;
    if (reactivadas.includes(res.fuente)) Object.assign(campos, { desactivada: false, bloqueosSeguidos: 0, alertaEnviada: false });
    if (res.ok) {
      Object.assign(campos, { sembrado: true, ultimaOk: ahora, fallosSeguidos: 0, bloqueosSeguidos: 0, ultimoError: null, fallandoDesde: null });
      if (est.alertaEnviada) {
        campos.alertaEnviada = false;
        await avisoSistema(telegram, mensajeFuenteRecuperada(nombre(res.fuente)), salida);
      }
    } else {
      const fallos = (est.fallosSeguidos ?? 0) + 1;
      const bloqueos = res.bloqueo ? (est.bloqueosSeguidos ?? 0) + 1 : 0;
      const desde = est.fallandoDesde ?? ahora;
      Object.assign(campos, { fallosSeguidos: fallos, bloqueosSeguidos: bloqueos, ultimoError: String(res.error).slice(0, 300), ultimoFallo: ahora, fallandoDesde: desde });
      if (bloqueos >= (cfgEstado.desactivar_tras_bloqueos ?? 3)) {
        Object.assign(campos, { desactivada: true, desactivadaEn: ahora, alertaEnviada: true });
        await avisoSistema(telegram, mensajeFuenteDesactivada(nombre(res.fuente), res.error), salida);
      } else if (fallos >= (cfgEstado.alerta_tras_fallos ?? 3) && !est.alertaEnviada) {
        campos.alertaEnviada = true;
        await avisoSistema(telegram, mensajeFuenteFalla(nombre(res.fuente), desde, ahora, res.error), salida);
      }
    }
  }

  // 7 · Guardar estado y registro
  for (const [id, cambios] of Object.entries(porFuente)) await store.guardarEstado(id, cambios);

  salida.fin = Date.now();
  const idEjec = `${new Date(ahora).toISOString().replace(/[:.]/g, '-')}_${modo}`;
  await store.registrarEjecucion(idEjec, {
    modo,
    respaldo,
    inicio: ahora,
    fin: salida.fin,
    ms: salida.fin - ahora,
    fuentes: Object.fromEntries(r.resultados.map((x) => [x.fuente, { ok: x.ok, leidos: x.deals?.length ?? 0, error: x.error ?? null }])),
    leidos: r.todos.length,
    nuevos: salida.escrituras.creados,
    actualizados: salida.escrituras.actualizados,
    avisos: enviados,
    resumen: salida.resumen.length,
    silenciados: salida.silenciados.length,
    errores: salida.errores.slice(0, 10),
    peticiones: r.peticiones,
  });
  return salida;
}

async function avisoSistema(telegram, html, salida) {
  try {
    await telegram.enviarTexto(html);
    salida.enviados.push({ tipo: 'sistema', texto: html });
  } catch (e) {
    salida.errores.push(e.message);
  }
}
