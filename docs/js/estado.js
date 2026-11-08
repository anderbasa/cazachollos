// Pantalla de Estado: cómo va el bot (últimas rondas, fuentes, canales, avisos de hoy).
import { FUENTES } from './defectos.js';
import { esc, hace, horaCorta } from './util.js';

const MODOS = { rapido: 'Rápido · cada 10 min', lento: 'Lento · cada hora', busqueda: 'Búsqueda · cada 6 h', limpieza: 'Limpieza · cada día' };
const MARGEN = { rapido: 25, lento: 90, busqueda: 400, limpieza: 1600 }; // minutos antes de dar la alarma

export async function pintarEstado(el, { datos, umbrales, aviso }) {
  el.innerHTML = '<p class="cargando">Cargando…</p>';
  let r;
  try {
    r = await datos.estado();
  } catch (e) {
    el.innerHTML = `<div class="vacio"><span class="vacio-icono">⚠️</span><p>${esc(e.message)}</p></div>`;
    return;
  }
  const g = r.estados._global ?? {};
  const hoy = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(Date.now());
  const avisosHoy = g.dia === hoy ? (g.avisosHoy ?? 0) : 0;
  const max = umbrales.avisos?.max_por_dia ?? 40;
  const fuentes = Object.entries(r.estados).filter(([id]) => id !== '_global');

  el.innerHTML = `
    <p class="grupo-titulo">Hoy</p>
    <div class="grupo">
      <div class="fila-ajuste"><span>Avisos enviados</span><b>${avisosHoy} de ${max}</b></div>
      <div class="barra-progreso"><i style="width:${Math.min(100, (avisosHoy / max) * 100)}%"></i></div>
      ${g.dia === hoy && g.topeAvisado ? '<p class="nota-roja">Hoy se ha llegado al máximo: el resto de chollazos solo están en la web.</p>' : ''}
      ${(g.cola?.length ?? 0) > 0 ? `<div class="fila-ajuste"><span>En cola por las horas de silencio</span><b>${g.cola.length}</b></div>` : ''}
    </div>

    <p class="grupo-titulo">Rondas del bot</p>
    <div class="grupo">
      ${Object.entries(MODOS)
        .map(([m, nombre]) => {
          const ult = g.ultimaPorModo?.[m];
          const tarde = ult == null || Date.now() - ult > MARGEN[m] * 60_000;
          return `<div class="fila-ajuste"><span>${nombre}</span><span class="${tarde ? 'mal' : 'bien'}">${ult ? hace(ult) : 'nunca'}</span></div>`;
        })
        .join('')}
    </div>

    <p class="grupo-titulo">Fuentes</p>
    <div class="grupo">
      ${fuentes.map(([id, e]) => filaFuente(id, e)).join('') || '<p class="grupo-nota">Aún no hay datos.</p>'}
    </div>

    ${r.estados.telegram?.canales ? `<p class="grupo-titulo">Canales de Telegram</p><div class="grupo">${Object.entries(r.estados.telegram.canales).map(([c, s]) => `<div class="fila-ajuste"><span>@${esc(c)}</span><span class="${s.fallos ? 'mal' : 'bien'}">${s.fallos ? `falla (${s.fallos})` : 'bien'}</span></div>${s.ultimoError ? `<p class="grupo-nota">${esc(s.ultimoError)}</p>` : ''}`).join('')}</div>` : ''}

    <p class="grupo-titulo">Búsquedas web este mes</p>
    <div class="grupo"><div class="fila-ajuste"><span>Tavily</span><b>${r.uso ? `${r.uso.busquedas ?? 0} de 900` : 'aún no activas (fase 5)'}</b></div></div>

    <p class="grupo-titulo">Últimas rondas</p>
    <div class="grupo tabla">
      ${r.ejecuciones
        .map(
          (x) => `<div class="fila-ejecucion">
            <span>${horaCorta(x.inicio)}</span>
            <span>${esc(x.modo)}${x.respaldo ? ' (resp.)' : ''}</span>
            <span title="leídos · nuevos · avisos">${x.leidos ?? 0} · ${x.nuevos ?? 0} · ${x.avisos ?? 0}</span>
            <span class="${x.errores?.length ? 'mal' : 'bien'}">${x.errores?.length ? '⚠️' : '✓'}</span>
          </div>`,
        )
        .join('')}
    </div>
    <p class="grupo-nota">leídos · nuevos guardados · avisos enviados</p>`;

  el.querySelectorAll('[data-reactivar]').forEach((b) =>
    b.addEventListener('click', async () => {
      await datos.reactivar(b.dataset.reactivar);
      aviso('Se reactivará en la próxima ronda');
      b.disabled = true;
    }),
  );
}

function filaFuente(id, e) {
  const nombre = FUENTES[id] ?? id;
  let estado;
  if (e.desactivada) estado = `<span class="mal">desactivada</span> <button type="button" class="boton-mini" data-reactivar="${esc(id)}">Reactivar</button>`;
  else if (e.fallosSeguidos > 0) estado = `<span class="mal">falla (${e.fallosSeguidos})</span>`;
  else estado = `<span class="bien">bien · ${e.ultimaOk ? hace(e.ultimaOk) : '—'}</span>`;
  return `<div class="fila-ajuste"><span>${esc(nombre)}</span><span>${estado}</span></div>${e.ultimoError ? `<p class="grupo-nota">${esc(e.ultimoError)}</p>` : ''}`;
}
