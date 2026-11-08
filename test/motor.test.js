import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cargarConfig, fusionar } from '../src/config.js';
import { crearDeal } from '../src/deal.js';
import { ejecutarModo } from '../src/motor.js';
import { crearStoreMemoria } from '../src/store/memoria.js';
import { soloLectura } from '../src/store/index.js';
import { crearTelegramSimulado } from '../src/telegram.js';

const config = cargarConfig();
const T0 = Date.parse('2026-11-07T12:00:00Z'); // 13:00 en Madrid
const MIN = 60_000;
const log = { aviso() {}, info() {}, error() {} };

// Por defecto, un chollazo: -60 % con 400°
const chollo = (id, o = {}) =>
  crearDeal({
    fuente: 'chollometro',
    idFuente: id,
    titulo: `Chollo ${id}`,
    url: `https://www.chollometro.com/ofertas/chollo-${id}`,
    tienda: 'Tienda',
    categoria: 'tecnologia',
    precio: 40,
    precioAnterior: 100,
    envio: 0,
    temperatura: 400,
    publicadoEn: new Date(T0 - 120 * MIN).toISOString(),
    verificado: true,
    fiable: true,
    ...o,
  });
const tibio = (id, o = {}) => chollo(id, { temperatura: 50, ...o }); // solo web

const sembrado = (extra = {}) => crearStoreMemoria({ estado: { chollometro: { sembrado: true, recientes: {} }, ...extra } });

async function correr({ store, telegram = crearTelegramSimulado(), deals = [], ahora = T0, respaldo = false, cfg = config, fallo }) {
  const fetch = fallo
    ? async () => {
        const e = new Error(fallo.msg ?? 'HTTP 500');
        e.bloqueo = Boolean(fallo.bloqueo);
        throw e;
      }
    : async () => deals.map((d) => structuredClone(d));
  const salida = await ejecutarModo({
    modo: 'rapido',
    config: cfg,
    http: { peticiones: 0 },
    log,
    store,
    telegram,
    respaldo,
    ahora,
    fuentes: [{ id: 'chollometro', opciones: {}, modulo: { fetch } }],
  });
  return { salida, telegram };
}
const chollosEnviados = (t) => t.enviados.filter((m) => m.tipo === 'chollo');
const textos = (t) => t.enviados.filter((m) => m.tipo === 'texto').map((m) => m.texto);

test('primera ejecución: guarda lo de la web pero no avisa de nada', async () => {
  const store = crearStoreMemoria();
  const { telegram, salida } = await correr({ store, deals: [chollo(1), tibio(2), chollo(3, { precio: 90, temperatura: 10 })] });
  assert.equal(telegram.enviados.length, 0);
  assert.equal(store.db.deals.size, 2, 'el 3 no cumple las reglas de la web');
  assert.equal(store.db.deals.get(chollo(1).id).via, 'siembra');
  assert.equal(store.db.estado.get('chollometro').sembrado, true);
  assert.equal(Object.keys(store.db.estado.get('chollometro').recientes).length, 2);
  assert.equal(salida.sembrados.length, 1);
});

test('avisa una vez y nunca dos', async () => {
  const store = sembrado();
  const a = await correr({ store, deals: [chollo(1)] });
  assert.equal(chollosEnviados(a.telegram).length, 1);
  const doc = store.db.deals.get(chollo(1).id);
  assert.equal(doc.notificado, true);
  assert.equal(doc.via, 'telegram');
  assert.equal(doc.precioNotificado, 40);

  const b = await correr({ store, deals: [chollo(1)], ahora: T0 + 10 * MIN });
  assert.equal(b.telegram.enviados.length, 0);
  assert.equal(b.salida.escrituras.actualizados, 0, 'sin cambios relevantes no escribe');
  assert.equal(store.db.estado.get('_global').avisosHoy, 1);
});

test('vuelve a avisar si baja al menos un 5 % más (y han pasado 3 h)', async () => {
  const store = sembrado();
  await correr({ store, deals: [chollo(1, { precio: 40 })] });
  const b = await correr({ store, deals: [chollo(1, { precio: 39 })], ahora: T0 + 4 * 60 * MIN });
  assert.equal(b.telegram.enviados.length, 0, '-2,5 % no basta');
  const pronto = await correr({ store, deals: [chollo(1, { precio: 37 })], ahora: T0 + 60 * MIN });
  assert.equal(pronto.telegram.enviados.length, 0, 'a la hora del primer aviso, todavía no');
  const c = await correr({ store, deals: [chollo(1, { precio: 37 })], ahora: T0 + 4 * 60 * MIN });
  const [m] = chollosEnviados(c.telegram);
  assert.ok(m, 'avisa de la rebaja');
  assert.match(m.texto, /HA BAJADO AÚN MÁS/);
  assert.match(m.texto, /Te avisé a 40 €/);
  assert.equal(store.db.deals.get(chollo(1).id).precioNotificado, 37);
});

test('como mucho 3 mensajes del mismo chollo, aunque siga bajando', async () => {
  const store = sembrado();
  let enviados = 0;
  for (const [i, precio] of [40, 36, 32, 28, 24].entries()) {
    const { telegram } = await correr({ store, deals: [chollo(1, { precio })], ahora: T0 + i * 4 * 60 * MIN });
    enviados += chollosEnviados(telegram).length;
  }
  assert.equal(enviados, 3);
});

// El fallo del 7/11/2026: algo gratis (0 €) "bajaba" a 0 € en cada ejecución → 71 avisos repetidos
test('lo gratis nunca se repite como "ha bajado aún más"', async () => {
  const gratis = (id) => chollo(id, { precio: 0, precioAnterior: 30, etiquetas: ['GRATIS'] });
  for (const inicio of ['siembra', 'aviso']) {
    const store = inicio === 'siembra' ? crearStoreMemoria() : sembrado();
    let mensajes = 0;
    for (let h = 0; h < 30; h++) {
      const { telegram } = await correr({ store, deals: [gratis(1)], ahora: T0 + h * 60 * MIN });
      mensajes += telegram.enviados.length;
    }
    assert.equal(mensajes, inicio === 'siembra' ? 0 : 1, `empezando por ${inicio}`);
  }
});

test('solo reescribe un chollo cuando cambia algo relevante', async () => {
  const store = sembrado();
  const paso = async (o, min) => (await correr({ store, deals: [tibio(1, o)], ahora: T0 + min * MIN })).salida.escrituras;
  assert.deepEqual(await paso({ temperatura: 50 }, 0), { creados: 1, actualizados: 0 });
  assert.deepEqual(await paso({ temperatura: 80 }, 10), { creados: 0, actualizados: 0 }, 'misma banda de temperatura');
  assert.deepEqual(await paso({ temperatura: 120 }, 20), { creados: 0, actualizados: 1 }, 'cruza 100°');
  assert.deepEqual(await paso({ temperatura: 120, precio: 35 }, 30), { creados: 0, actualizados: 1 }, 'cambia el precio');
  assert.deepEqual(await paso({ temperatura: 120, precio: 35, caducado: true }, 40), { creados: 0, actualizados: 1 }, 'caduca');
  assert.equal(store.db.deals.get(tibio(1).id).caducado, true);
});

test('un chollo que se calienta más tarde avisa en ese momento', async () => {
  const store = sembrado();
  const a = await correr({ store, deals: [tibio(1)] });
  assert.equal(a.telegram.enviados.length, 0);
  const b = await correr({ store, deals: [chollo(1, { temperatura: 400 })], ahora: T0 + 10 * MIN });
  assert.equal(chollosEnviados(b.telegram).length, 1);
});

test('antispam: 10 por ronda y el resto en un único resumen', async () => {
  const store = sembrado();
  const deals = Array.from({ length: 12 }, (_, i) => chollo(100 + i, { temperatura: 400 + i }));
  const { telegram } = await correr({ store, deals });
  assert.equal(chollosEnviados(telegram).length, 10);
  const resumen = textos(telegram);
  assert.equal(resumen.length, 1);
  assert.match(resumen[0], /2 chollazos más/);
  assert.ok([...store.db.deals.values()].every((d) => d.notificado));
  assert.equal(store.db.estado.get('_global').avisosHoy, 10, 'el resumen no cuenta para el máximo diario');
});

test('tope diario: un aviso de tope al día y el resto solo a la web', async () => {
  const store = sembrado({ _global: { dia: '2026-11-07', avisosHoy: 38 } });
  const a = await correr({ store, deals: [1, 2, 3, 4, 5].map((i) => chollo(i)) });
  assert.equal(chollosEnviados(a.telegram).length, 2);
  assert.equal(textos(a.telegram).length, 1);
  assert.match(textos(a.telegram)[0], /máximo diario/);
  assert.equal([...store.db.deals.values()].filter((d) => d.via === 'tope').length, 3);

  const b = await correr({ store, deals: [6, 7].map((i) => chollo(i)), ahora: T0 + 10 * MIN });
  assert.equal(b.telegram.enviados.length, 0, 'no repite el mensaje de tope');

  const c = await correr({ store, deals: [chollo(8)], ahora: Date.parse('2026-11-08T09:00:00Z') });
  assert.equal(chollosEnviados(c.telegram).length, 1, 'al día siguiente el contador vuelve a empezar');
});

test('horas de silencio: lo gratis pasa; lo demás, al resumen de la mañana', async () => {
  const cfg = { ...config, umbrales: fusionar(config.umbrales, { silencio: { activo: true, desde: '23:00', hasta: '08:00' } }) };
  const store = sembrado();
  const noche = Date.parse('2026-11-07T00:30:00Z'); // 01:30 en Madrid
  const gratis = chollo(2, { precio: 0, precioAnterior: 30, etiquetas: ['GRATIS'], publicadoEn: new Date(noche - 60 * MIN).toISOString() });
  const normal = chollo(1, { publicadoEn: new Date(noche - 60 * MIN).toISOString() });
  const a = await correr({ store, deals: [normal, gratis], ahora: noche, cfg });
  assert.deepEqual(
    chollosEnviados(a.telegram).map((m) => m.deal.id),
    [gratis.id],
  );
  assert.equal(store.db.estado.get('_global').cola.length, 1);

  const manana = Date.parse('2026-11-07T08:00:00Z'); // 09:00 en Madrid
  const b = await correr({ store, deals: [], ahora: manana, cfg });
  assert.equal(textos(b.telegram).length, 1);
  assert.match(textos(b.telegram)[0], /Mientras dormías/);
  assert.equal(store.db.estado.get('_global').cola.length, 0);
});

test('fuente que falla: un único aviso a la 3.ª vez y otro al recuperarse', async () => {
  const store = sembrado();
  const avisos = [];
  for (let i = 0; i < 4; i++) {
    const { telegram } = await correr({ store, fallo: { msg: 'HTTP 500' }, ahora: T0 + i * 10 * MIN });
    avisos.push(...textos(telegram));
  }
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /Chollometro.*lleva 20 min fallando/s);
  const est = store.db.estado.get('chollometro');
  assert.equal(est.fallosSeguidos, 4);
  assert.equal(est.alertaEnviada, true);

  const { telegram } = await correr({ store, deals: [tibio(1)], ahora: T0 + 40 * MIN });
  assert.match(textos(telegram)[0], /vuelve a funcionar/);
  assert.equal(store.db.estado.get('chollometro').fallosSeguidos, 0);
});

test('si nos bloquea 3 veces seguidas, la fuente se desactiva y no se vuelve a pedir', async () => {
  const store = sembrado();
  for (let i = 0; i < 3; i++) await correr({ store, fallo: { msg: 'HTTP 403', bloqueo: true }, ahora: T0 + i * 10 * MIN });
  assert.equal(store.db.estado.get('chollometro').desactivada, true);
  let pedida = false;
  const salida = await ejecutarModo({
    modo: 'rapido',
    config,
    http: { peticiones: 0 },
    log,
    store,
    telegram: crearTelegramSimulado(),
    ahora: T0 + 30 * MIN,
    fuentes: [{ id: 'chollometro', opciones: {}, modulo: { fetch: async () => ((pedida = true), []) } }],
  });
  assert.equal(pedida, false);
  assert.deepEqual(salida.desactivadas, ['chollometro']);
});

test('el respaldo no hace nada si cron-job.org ha ejecutado el modo hace poco', async () => {
  const store = sembrado();
  await correr({ store, deals: [tibio(1)] });
  const a = await correr({ store, deals: [chollo(2)], ahora: T0 + 5 * MIN, respaldo: true });
  assert.match(a.salida.saltado, /cron-job\.org funciona/);
  assert.equal(a.telegram.enviados.length, 0);
  const b = await correr({ store, deals: [chollo(2)], ahora: T0 + 20 * MIN, respaldo: true });
  assert.equal(b.salida.saltado, undefined);
  assert.equal(chollosEnviados(b.telegram).length, 1);
});

test('si Telegram falla, no se marca como avisado y se reintenta en la siguiente', async () => {
  const store = sembrado();
  const a = await correr({ store, deals: [chollo(1)], telegram: crearTelegramSimulado({ fallarCon: 'Telegram sendPhoto: 502' }) });
  assert.equal(a.salida.errores.length, 1);
  assert.equal(store.db.deals.get(chollo(1).id).notificado, false);
  assert.equal(store.db.estado.get('_global').avisosHoy, 0, 'devuelve el cupo');
  const b = await correr({ store, deals: [chollo(1)], ahora: T0 + 10 * MIN });
  assert.equal(chollosEnviados(b.telegram).length, 1);
});

test('si otra ejecución ya lo avisó, no se repite (aunque el estado no lo sepa)', async () => {
  const d = chollo(1);
  const store = sembrado();
  store.db.deals.set(d.id, { id: d.id, notificado: true, via: 'telegram', favorito: true });
  const { telegram } = await correr({ store, deals: [d] });
  assert.equal(telegram.enviados.length, 0);
  assert.equal(store.db.deals.get(d.id).favorito, true, 'no pisa lo que escribe la web');
});

test('olvida lo que no aparece en ningún listado desde hace más de 72 h', async () => {
  const viejo = Math.floor((T0 - 73 * 60 * MIN) / MIN);
  const store = crearStoreMemoria({ estado: { chollometro: { sembrado: true, recientes: { abc: { v: viejo, n: 1 }, def: { v: Math.floor(T0 / MIN) - 60, n: 0 } } } } });
  await correr({ store, deals: [tibio(1)] });
  const rec = store.db.estado.get('chollometro').recientes;
  assert.equal(rec.abc, undefined);
  assert.ok(rec.def);
  assert.ok(rec[tibio(1).id]);
});

test('dry-run con Firestore: lee el estado real pero no escribe nada', async () => {
  const real = sembrado();
  const antes = JSON.stringify([...real.db.estado.entries()]);
  const { telegram } = await correr({ store: soloLectura(real), deals: [chollo(1), tibio(2)] });
  assert.equal(chollosEnviados(telegram).length, 1, 'enseña lo que avisaría');
  assert.equal(real.db.deals.size, 0);
  assert.equal(JSON.stringify([...real.db.estado.entries()]), antes);
  assert.equal(real.db.ejecuciones.size, 0);
});

test('registra cada ejecución', async () => {
  const store = sembrado();
  await correr({ store, deals: [chollo(1), tibio(2)] });
  const [[id, e]] = [...store.db.ejecuciones.entries()];
  assert.match(id, /^2026-11-07T12-00-00-000Z_rapido$/);
  assert.equal(e.nuevos, 2);
  assert.equal(e.avisos, 1);
  assert.deepEqual(e.fuentes.chollometro, { ok: true, leidos: 2, error: null });
});
