// Pantalla de Ajustes: edita config/umbrales en Firestore. El bot lo lee en cada ronda y lo mezcla
// con config.yml; si algo no fuese válido, el bot lo ignora y sigue con config.yml.
import { CATEGORIAS, UMBRALES } from './defectos.js';
import { esc, fusionar } from './util.js';

const CORTO = { tecnologia: 'Tecnología', hogar: 'Hogar y bricolaje', moda: 'Moda y deporte', belleza: 'Salud y belleza', videojuegos: 'Videojuegos', otros: 'Otros' };

export function pintarAjustes(el, { datos, remotos, alGuardar, aviso }) {
  const u = fusionar(UMBRALES, remotos);
  const activas = new Set(u.categorias_activas ?? Object.keys(CATEGORIAS));
  const num = (ruta, valor, { min = 0, max = 100, paso = 5, sufijo = '' } = {}) =>
    `<span class="numero"><input type="number" inputmode="numeric" data-ruta="${ruta}" value="${esc(valor)}" min="${min}" max="${max}" step="${paso}" />${sufijo ? `<i>${sufijo}</i>` : ''}</span>`;
  const sw = (ruta, valor) => `<input type="checkbox" class="interruptor" data-ruta="${ruta}" ${valor ? 'checked' : ''} />`;

  el.innerHTML = `
    <form id="form-ajustes" class="ajustes" novalidate>
      <p class="grupo-titulo">Qué te interesa</p>
      <div class="grupo">
        ${Object.keys(CATEGORIAS)
          .map((c) => `<label class="fila-ajuste"><span>${esc(CORTO[c] ?? CATEGORIAS[c])}</span><input type="checkbox" class="interruptor" data-cat="${c}" ${activas.has(c) ? 'checked' : ''} /></label>`)
          .join('')}
      </div>
      <div class="grupo">
        <label class="fila-ajuste"><span>Solo productos físicos<small>Fuera apps, cursos, suscripciones, viajes, cupones…</small></span>${sw('solo_productos_fisicos', u.solo_productos_fisicos)}</label>
        <label class="fila-ajuste"><span>Quitar recopilaciones<small>"Recopilación de… desde 7,99 €"</small></span>${sw('excluir_recopilaciones', u.excluir_recopilaciones)}</label>
      </div>

      <p class="grupo-titulo">Descuento mínimo por categoría</p>
      <div class="grupo">
        <div class="fila-ajuste cabeza"><span></span><span class="col">Web</span><span class="col">Aviso</span></div>
        ${Object.keys(CATEGORIAS)
          .filter((c) => activas.has(c))
          .map((c) => `<div class="fila-ajuste"><span>${esc(CORTO[c] ?? c)}</span>${num(`web.${c}`, u.web[c], { sufijo: '%' })}${num(`aviso.${c}`, u.aviso[c], { sufijo: '%' })}</div>`)
          .join('')}
      </div>
      <p class="grupo-nota">Para avisar, además del descuento hace falta que la comunidad lo valide (temperatura o subida rápida).</p>

      <p class="grupo-titulo">Votos de la comunidad</p>
      <div class="grupo">
        <div class="fila-ajuste"><span>Temperatura mínima</span>${num('votos.temperatura', u.votos.temperatura, { max: 5000, paso: 50, sufijo: '°' })}</div>
        <div class="fila-ajuste"><span>O subida de al menos</span>${num('votos.velocidad', u.votos.velocidad, { max: 100, paso: 1, sufijo: '°/min' })}</div>
      </div>

      <p class="grupo-titulo">Nunca avisar</p>
      <div class="grupo">
        <div class="fila-ajuste"><span>Si el precio original es menor de</span>${num('nunca.precio_original_minimo', u.nunca.precio_original_minimo, { max: 1000, paso: 5, sufijo: '€' })}</div>
        <label class="fila-ajuste"><span>De chollos solo en tienda física o zona</span>${sw('nunca.locales', u.nunca.locales)}</label>
      </div>

      <p class="grupo-titulo">Cuántos avisos</p>
      <div class="grupo">
        <div class="fila-ajuste"><span>Máximo por ronda (10 min)</span>${num('avisos.max_por_ejecucion', u.avisos.max_por_ejecucion, { max: 100, paso: 1 })}</div>
        <div class="fila-ajuste"><span>Máximo al día</span>${num('avisos.max_por_dia', u.avisos.max_por_dia, { max: 500, paso: 5 })}</div>
      </div>

      <p class="grupo-titulo">Horas de silencio</p>
      <div class="grupo">
        <label class="fila-ajuste"><span>Activar<small>Los errores de precio y lo gratis llegan igual</small></span>${sw('silencio.activo', u.silencio.activo)}</label>
        <div class="fila-ajuste"><span>Desde</span><input type="time" data-ruta="silencio.desde" value="${esc(u.silencio.desde)}" /></div>
        <div class="fila-ajuste"><span>Hasta</span><input type="time" data-ruta="silencio.hasta" value="${esc(u.silencio.hasta)}" /></div>
      </div>

      <p id="ajustes-error" class="error" role="alert" hidden></p>
      <div class="botonera">
        <button type="submit" class="boton-principal">Guardar</button>
        <button type="button" id="btn-restaurar" class="boton-secundario">Volver a los valores de config.yml</button>
      </div>
      <p class="grupo-nota">${remotos ? 'Usando tus ajustes de la web.' : 'Usando los valores de config.yml.'} Los cambios se aplican en la siguiente ronda del bot (como mucho 10 minutos).</p>
    </form>`;

  const form = el.querySelector('#form-ajustes');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const err = el.querySelector('#ajustes-error');
    err.hidden = true;
    let nuevos;
    try {
      nuevos = leerFormulario(form, u);
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
      return;
    }
    try {
      await datos.guardarAjustes(nuevos);
      alGuardar(fusionar(remotos ?? {}, nuevos));
      aviso('Ajustes guardados');
      pintarAjustes(el, { datos, remotos: fusionar(remotos ?? {}, nuevos), alGuardar, aviso });
    } catch (e) {
      err.textContent = `No se pudo guardar: ${e.message}`;
      err.hidden = false;
    }
  });
  el.querySelector('#btn-restaurar').addEventListener('click', async () => {
    if (!confirm('¿Volver a los valores de config.yml? Se borran los ajustes guardados desde la web.')) return;
    await datos.borrarAjustes();
    alGuardar(null);
    aviso('Valores de config.yml restaurados');
    pintarAjustes(el, { datos, remotos: null, alGuardar, aviso });
  });
}

/** Lee el formulario y devuelve solo lo editable, validado (mismos límites que el bot). */
function leerFormulario(form, base) {
  const u = structuredClone({
    categorias_activas: base.categorias_activas,
    solo_productos_fisicos: base.solo_productos_fisicos,
    excluir_recopilaciones: base.excluir_recopilaciones,
    web: base.web,
    aviso: base.aviso,
    votos: base.votos,
    nunca: base.nunca,
    avisos: base.avisos,
    silencio: base.silencio,
  });
  u.categorias_activas = [...form.querySelectorAll('[data-cat]')].filter((i) => i.checked).map((i) => i.dataset.cat);
  if (u.categorias_activas.length === 0) throw new Error('Deja al menos una categoría activa.');
  for (const i of form.querySelectorAll('[data-ruta]')) {
    const ruta = i.dataset.ruta.split('.');
    let valor;
    if (i.type === 'checkbox') valor = i.checked;
    else if (i.type === 'number') {
      valor = Number(i.value);
      if (i.value === '' || !Number.isFinite(valor) || valor < Number(i.min) || valor > Number(i.max)) {
        throw new Error(`Revisa "${i.closest('.fila-ajuste')?.querySelector('span')?.textContent?.trim() ?? ruta.join('.')}": entre ${i.min} y ${i.max}.`);
      }
    } else valor = i.value;
    let o = u;
    for (const k of ruta.slice(0, -1)) o = o[k];
    o[ruta.at(-1)] = valor;
  }
  if (u.silencio.activo && !(/^\d\d:\d\d$/.test(u.silencio.desde) && /^\d\d:\d\d$/.test(u.silencio.hasta))) throw new Error('Pon las dos horas del silencio.');
  return u;
}
