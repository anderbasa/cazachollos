// Cazachollos web: login, listas (Chollos, Perfumes, Favoritos), filtros, ajustes y estado.
import { CORREO } from './config.js';
import { crearDatos, esDemo } from './datos.js';
import { CATEGORIAS, FUENTES, UMBRALES } from './defectos.js';
import { pintarAjustes } from './ajustes.js';
import { pintarEstado } from './estado.js';
import { esc, euros, fusionar, guardado, hace, mililitros, normalizar } from './util.js';

const $ = (s) => document.querySelector(s);
const FILTROS_VACIOS = { categorias: [], fuente: 'todas', soloChollazos: false, soloGratis: false, verOcultos: false, descuentoMin: 0, texto: '' };
const LISTAS = ['chollos', 'perfumes', 'favoritos'];
// Órdenes de cada lista (el primero es el de por defecto)
const MODOS = {
  chollos: [
    ['mejores', 'Mejores'],
    ['ultimos', 'Últimos'],
  ],
  perfumes: [
    ['descuento', 'Descuento'],
    ['votos', 'Más votados'],
    ['recientes', 'Recientes'],
  ],
};
const TIPOS_PERFUME = [
  ['disenador', 'Diseñador'],
  ['nicho', 'Nicho'],
  ['arabe', 'Árabes'],
  ['otro', 'Otros'],
];

const st = {
  datos: null,
  pestana: 'chollos',
  modos: { chollos: 'mejores', perfumes: 'descuento', ...guardado.leer('modos', {}) },
  tipoPerfume: '',
  filtros: { ...FILTROS_VACIOS, ...guardado.leer('filtros', {}), texto: '' },
  deals: [],
  hayMas: false,
  cargando: false,
  ajustesRemotos: null,
  ultimaCarga: 0,
};
const umbrales = () => fusionar(UMBRALES, st.ajustesRemotos);

// ── Arranque y login ─────────────────────────────────────────────────────────

async function iniciar() {
  try {
    st.datos = await crearDatos();
  } catch (e) {
    return mostrarLogin(`No se pudo cargar: ${e.message}`);
  }
  st.datos.alCambiarUsuario(async (usuario, error) => {
    if (error) return mostrarLogin(mensajeError(error));
    if (!usuario) return mostrarLogin();
    if (usuario.email !== CORREO) {
      await st.datos.salir();
      return mostrarLogin(`La cuenta ${usuario.email} no tiene acceso. Entra con ${CORREO}.`);
    }
    entrarEnApp();
  });
  $('#btn-entrar').addEventListener('click', async () => {
    $('#login-error').hidden = true;
    try {
      await st.datos.entrar();
    } catch (e) {
      mostrarLogin(mensajeError(e));
    }
  });
  if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

function mostrarLogin(error) {
  $('#arranque').hidden = true;
  $('#app').hidden = true;
  $('#login').hidden = false;
  const p = $('#login-error');
  p.hidden = !error;
  p.textContent = error ?? '';
}

function mensajeError(e) {
  const codigos = {
    'auth/popup-closed-by-user': 'Has cerrado la ventana de Google antes de terminar.',
    'auth/unauthorized-domain': 'Este dominio aún no está autorizado en Firebase (Authentication → Dominios autorizados).',
    'auth/operation-not-allowed': 'El inicio de sesión con Google no está activado en Firebase.',
    'auth/network-request-failed': 'Sin conexión. Prueba otra vez.',
    'permission-denied': 'Tu cuenta aún no tiene permiso para leer los datos (faltan las reglas con tu UID).',
  };
  return codigos[e?.code] ?? e?.message ?? String(e);
}

async function entrarEnApp() {
  $('#arranque').hidden = true;
  $('#login').hidden = true;
  $('#app').hidden = false;
  if (esDemo) document.title = 'Cazachollos (demo)';
  prepararControles();
  try {
    st.ajustesRemotos = await st.datos.ajustes();
    pintarChips();
    $('[data-pestana=perfumes]').hidden = !umbrales().perfumes?.activa;
  } catch (e) {
    if (e?.code === 'permission-denied') return mostrarVacio('🔒', mensajeError(e));
  }
  cambiarPestana(st.pestana);
}

// ── Pestañas ─────────────────────────────────────────────────────────────────

const TITULOS = { chollos: 'Chollos', perfumes: 'Perfumes', favoritos: 'Favoritos', ajustes: 'Ajustes', estado: 'Estado' };

function cambiarPestana(p) {
  st.pestana = p;
  document.querySelectorAll('.pestanas button').forEach((b) => b.setAttribute('aria-current', b.dataset.pestana === p ? 'page' : 'false'));
  $('#titulo').textContent = TITULOS[p];
  const esLista = LISTAS.includes(p);
  $('#controles').hidden = !esLista;
  $('#btn-filtros').hidden = !esLista;
  $('#vista-lista').hidden = !esLista;
  $('#vista-ajustes').hidden = p !== 'ajustes';
  $('#vista-estado').hidden = p !== 'estado';
  $('#segmentado').hidden = !MODOS[p];
  window.scrollTo({ top: 0 });
  if (esLista) {
    pintarSegmentado();
    pintarChips();
    cargarLista();
  }
  if (p === 'ajustes')
    pintarAjustes($('#vista-ajustes'), {
      datos: st.datos,
      remotos: st.ajustesRemotos,
      alGuardar: (r) => {
        st.ajustesRemotos = r;
        st.filtros.categorias = st.filtros.categorias.filter((c) => (umbrales().categorias_activas ?? []).includes(c));
        $('[data-pestana=perfumes]').hidden = !umbrales().perfumes?.activa;
        pintarChips();
      },
      aviso: toast,
    });
  if (p === 'estado') pintarEstado($('#vista-estado'), { datos: st.datos, umbrales: umbrales(), aviso: toast });
}

// ── Lista ────────────────────────────────────────────────────────────────────

async function cargarLista({ mas = false } = {}) {
  if (st.cargando) return;
  st.cargando = true;
  if (!mas) {
    $('#lista').innerHTML = esqueleto();
    $('#vacio').hidden = true;
  }
  try {
    let nuevos;
    const modo = st.modos.chollos;
    if (st.pestana === 'favoritos') nuevos = await st.datos.favoritos();
    else if (st.pestana === 'perfumes') nuevos = await st.datos.perfumes();
    else if (modo === 'mejores') nuevos = await st.datos.mejores(48);
    else nuevos = await st.datos.ultimos(mas ? st.deals.at(-1)?.publicadoEn : null, 60);
    st.hayMas = st.pestana === 'chollos' && modo === 'ultimos' && nuevos.length === 60;
    st.deals = mas ? [...st.deals, ...nuevos] : nuevos;
    st.ultimaCarga = Date.now();
    if (st.pestana === 'perfumes') pintarChips(); // con los números de cada tipo
    pintarLista();
  } catch (e) {
    mostrarVacio('⚠️', mensajeError(e));
  } finally {
    st.cargando = false;
  }
}

function visibles() {
  const f = st.filtros;
  const u = umbrales();
  const activas = new Set(u.categorias_activas ?? Object.keys(CATEGORIAS));
  const texto = normalizar(f.texto.trim());
  const enFavoritos = st.pestana === 'favoritos';
  const enPerfumes = st.pestana === 'perfumes';
  const lista = st.deals.filter(
    (d) =>
      (enFavoritos || (d.esChollo !== false && !d.filtrado && (enPerfumes || activas.has(d.categoria)))) &&
      (!enPerfumes || (!d.caducado && (!st.tipoPerfume || tipoPerfume(d) === st.tipoPerfume))) &&
      (f.verOcultos || enFavoritos || !d.oculto) &&
      (enPerfumes || f.categorias.length === 0 || f.categorias.includes(d.categoria)) &&
      (f.fuente === 'todas' || (d.fuentes ?? [d.fuente]).includes(f.fuente)) &&
      (!f.soloChollazos || d.esChollazo || ['telegram', 'resumen'].includes(d.via)) &&
      (!f.soloGratis || d.gratis) &&
      (!f.descuentoMin || (d.descuento ?? 0) >= f.descuentoMin) &&
      (!texto || normalizar(`${d.titulo} ${d.tienda ?? ''}`).includes(texto)),
  );
  const porFecha = (a, b) => (b.publicadoEn ?? 0) - (a.publicadoEn ?? 0);
  const porNota = (a, b) => (b.puntuacion ?? 0) - (a.puntuacion ?? 0);
  const caducadosAlFinal = (a, b) => Number(Boolean(a.caducado)) - Number(Boolean(b.caducado));
  if (enPerfumes) {
    const m = st.modos.perfumes;
    if (m === 'descuento') return lista.sort((a, b) => (b.descuento ?? -1) - (a.descuento ?? -1) || porNota(a, b));
    if (m === 'votos') return lista.sort((a, b) => (b.temperatura ?? 0) - (a.temperatura ?? 0) || porNota(a, b));
    return lista.sort(porFecha);
  }
  if (!enFavoritos && st.modos.chollos === 'mejores') return lista.sort((a, b) => caducadosAlFinal(a, b) || porNota(a, b) || porFecha(a, b));
  return lista.sort(porFecha);
}

const tipoPerfume = (d) => TIPOS_PERFUME.find(([t]) => d.etiquetas?.includes(`PERFUME_${t.toUpperCase()}`))?.[0] ?? 'otro';

function pintarLista() {
  const lista = visibles();
  $('#lista').innerHTML = lista.map(fila).join('');
  $('#btn-mas').hidden = !st.hayMas;
  const total = st.deals.length;
  const n = lista.length;
  const resumen =
    st.pestana === 'favoritos'
      ? `${n} favorito${n === 1 ? '' : 's'}`
      : st.pestana === 'perfumes'
        ? `${n} perfume${n === 1 ? '' : 's'} en oferta, de -${umbrales().perfumes?.descuento_minimo ?? 30} % o muy votados`
        : st.modos.chollos === 'mejores'
          ? `${n} chollos de las últimas 48 h`
          : `${n} de los ${total} más recientes`;
  $('#resumen').textContent = resumen;
  if (n === 0) {
    const hayFiltros = contarFiltros() > 0 || st.filtros.texto || st.tipoPerfume;
    const textos = {
      favoritos: 'Aún no tienes favoritos. Pulsa la estrella de un chollo para guardarlo aquí.',
      perfumes: 'Todavía no hay perfumes en oferta. El bot revisa los perfumes de Chollometro cada hora.',
    };
    mostrarVacio(st.pestana === 'favoritos' ? '☆' : '🔍', hayFiltros ? 'Nada con estos filtros.' : (textos[st.pestana] ?? 'Todavía no hay chollos en este rango.'));
  } else {
    $('#vacio').hidden = true;
  }
}

function mostrarVacio(icono, texto) {
  $('#lista').innerHTML = '';
  const v = $('#vacio');
  v.hidden = false;
  v.innerHTML = `<span class="vacio-icono">${icono}</span><p>${esc(texto)}</p>`;
}

const esqueleto = () => Array.from({ length: 6 }, () => '<li class="fila esqueleto"><div class="foto"></div><div class="cuerpo"><p></p><p></p><p></p></div></li>').join('');

function precioHtml(d) {
  if (d.gratis) return `<b class="precio">Gratis</b>${d.precioAnterior ? ` <s>${euros(d.precioAnterior)}</s>` : ''}`;
  const partes = [];
  if (d.precioEfectivo != null) partes.push(`<b class="precio">${euros(d.precioEfectivo)}</b>`);
  if (d.precioAnterior != null) partes.push(`<s>${euros(d.precioAnterior)}</s>`);
  if (d.descuento) partes.push(`<span class="dto">-${d.descuento} %</span>`);
  if (d.cupon) partes.push(`<span class="cupon">${esc(d.cupon)}</span>`);
  return partes.join(' ') || '<span class="sin-precio">Sin precio</span>';
}

function etiquetas(d) {
  const t = [];
  const e = new Set(d.etiquetas ?? []);
  if (e.has('ERROR_DE_PRECIO')) t.push(['error', '🚨 Error de precio']);
  if (d.gratis) t.push(['gratis', '🎁 Gratis']);
  if (d.esChollazo || ['telegram', 'resumen'].includes(d.via)) t.push(['chollazo', d.via === 'telegram' || d.via === 'resumen' ? '🔔 Avisado' : '🔥 Chollazo']);
  if (e.has('EDITORES')) t.push(['editores', '⭐ Selección']);
  if (e.has('PERFUME') && st.pestana === 'perfumes') {
    const tipo = { disenador: 'Diseñador', nicho: 'Nicho', arabe: 'Árabe' }[tipoPerfume(d)];
    if (tipo) t.push(['perfume', tipo]);
  }
  if (e.has('SIN_VERIFICAR')) t.push(['sinver', '⚠️ Sin verificar']);
  if (d.caducado) t.push(['caducado', 'Caducado']);
  return t;
}

function fila(d) {
  const nota = d.puntuacion ?? 0;
  const nivel = nota >= 70 ? 'alta' : nota >= 50 ? 'media' : 'baja';
  const tags = etiquetas(d);
  // Perfumes: tamaño y precio por 100 ml, para comparar frascos distintos
  const ml = d.etiquetas?.includes('PERFUME') ? mililitros(d.titulo) : null;
  const porCien = ml && d.precioEfectivo > 0 ? `${euros(Math.round((d.precioEfectivo / ml) * 10000) / 100)}/100 ml` : '';
  const meta = [esc(d.tienda ?? ''), hace(d.publicadoEn), d.temperatura != null ? `${Math.round(d.temperatura)}°` : ''].filter(Boolean).join(' · ');
  const metaPerfume = ml ? `<p class="meta perfume">${ml} ml${porCien ? ` · <b>${porCien}</b>` : ''}${st.pestana === 'perfumes' ? '' : ' · 🧴'}</p>` : '';
  return `<li class="fila${d.caducado ? ' caducada' : ''}${d.oculto ? ' oculta' : ''}" data-id="${esc(d.id)}">
    <a class="fila-enlace" href="${esc(d.url)}" target="_blank" rel="noopener">
      <div class="foto">${d.imagen ? `<img src="${esc(d.imagen)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</div>
      <div class="cuerpo">
        <p class="titulo">${esc(d.titulo)}</p>
        <p class="precios">${precioHtml(d)}</p>
        ${metaPerfume}
        <p class="meta">${meta}</p>
        ${tags.length ? `<p class="tags">${tags.map(([c, txt]) => `<span class="tag ${c}">${txt}</span>`).join('')}</p>` : ''}
      </div>
    </a>
    <div class="lado">
      <span class="nota ${nivel}" aria-label="Puntuación ${nota} de 100">${nota}</span>
      <button type="button" class="accion${d.favorito ? ' activa' : ''}" data-accion="favorito" aria-pressed="${Boolean(d.favorito)}" aria-label="${d.favorito ? 'Quitar de favoritos' : 'Guardar en favoritos'}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z" /></svg>
      </button>
      <button type="button" class="accion" data-accion="oculto" aria-label="${d.oculto ? 'Volver a mostrar' : 'Ocultar'}">
        <svg viewBox="0 0 24 24" aria-hidden="true">${d.oculto ? '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>' : '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.8M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'}</svg>
      </button>
    </div>
  </li>`;
}

async function accion(id, campo) {
  const d = st.deals.find((x) => x.id === id);
  if (!d) return;
  const valor = !d[campo];
  d[campo] = valor; // al momento; si falla se deshace
  pintarLista();
  if (campo === 'oculto' && valor) toast('Chollo ocultado', { deshacer: () => accion(id, 'oculto') });
  try {
    await st.datos.marcar(id, campo, valor);
  } catch (e) {
    d[campo] = !valor;
    pintarLista();
    toast(`No se pudo guardar: ${mensajeError(e)}`);
  }
}

// ── Filtros ──────────────────────────────────────────────────────────────────

function prepararControles() {
  if (prepararControles.hecho) return;
  prepararControles.hecho = true;

  document.querySelectorAll('.pestanas button').forEach((b) => b.addEventListener('click', () => cambiarPestana(b.dataset.pestana)));
  $('#segmentado').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-modo]');
    if (!b) return;
    st.modos[st.pestana] = b.dataset.modo;
    guardado.escribir('modos', st.modos);
    pintarSegmentado();
    // Los perfumes ya están todos cargados: solo cambia el orden
    if (st.pestana === 'perfumes') pintarLista();
    else cargarLista();
  });

  $('#lista').addEventListener('click', (ev) => {
    const boton = ev.target.closest('[data-accion]');
    if (!boton) return;
    ev.preventDefault();
    accion(boton.closest('.fila').dataset.id, boton.dataset.accion);
  });
  $('#btn-mas').addEventListener('click', () => cargarLista({ mas: true }));
  $('#btn-recargar').addEventListener('click', () => (st.pestana === 'estado' || st.pestana === 'ajustes' ? cambiarPestana(st.pestana) : cargarLista()));
  $('#buscar').addEventListener('input', (e) => {
    st.filtros.texto = e.target.value;
    pintarLista();
  });

  // Chips de categoría (solo las activas en Ajustes) y globo con el número de filtros
  pintarChips();
  $('#num-filtros').hidden = contarFiltros() === 0;
  $('#num-filtros').textContent = contarFiltros();
  $('#chips').addEventListener('click', (ev) => {
    const tipo = ev.target.closest('[data-tipo]');
    if (tipo) {
      st.tipoPerfume = tipo.dataset.tipo;
      pintarChips();
      pintarLista();
      return;
    }
    const b = ev.target.closest('[data-cat]');
    if (!b) return;
    const c = b.dataset.cat;
    st.filtros.categorias = c === '' ? [] : st.filtros.categorias.includes(c) ? st.filtros.categorias.filter((x) => x !== c) : [...st.filtros.categorias, c];
    guardarFiltros();
  });

  // Hoja de filtros
  const hoja = $('#hoja-filtros');
  $('#btn-filtros').addEventListener('click', () => {
    sincronizarHoja();
    hoja.showModal();
  });
  hoja.addEventListener('click', (ev) => {
    if (ev.target === hoja) hoja.close(); // tocar fuera cierra
  });
  hoja.querySelectorAll('[data-filtro]').forEach((i) =>
    i.addEventListener('change', () => {
      st.filtros[i.dataset.filtro] = i.checked;
      guardarFiltros();
    }),
  );
  $('#dto-min').addEventListener('input', (e) => {
    st.filtros.descuentoMin = Number(e.target.value);
    $('#dto-valor').textContent = `${e.target.value} %`;
    guardarFiltros();
  });
  const fuentes = { todas: 'Todas', chollometro: FUENTES.chollometro ?? 'Chollometro', telegram: FUENTES.telegram ?? 'Telegram' };
  $('#filtro-fuente').innerHTML = Object.entries(fuentes).map(([id, n]) => `<button type="button" data-fuente="${id}">${esc(n)}</button>`).join('');
  $('#filtro-fuente').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-fuente]');
    if (!b) return;
    st.filtros.fuente = b.dataset.fuente;
    sincronizarHoja();
    guardarFiltros();
  });
  $('#btn-limpiar-filtros').addEventListener('click', () => {
    st.filtros = { ...FILTROS_VACIOS, texto: st.filtros.texto };
    sincronizarHoja();
    guardarFiltros();
  });

  // Al volver a la app tras un rato, recarga
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - st.ultimaCarga > 5 * 60_000 && LISTAS.includes(st.pestana)) cargarLista();
  });
  // Los "hace X min" se refrescan solos
  setInterval(() => {
    if (LISTAS.includes(st.pestana)) pintarLista();
  }, 60_000);
}

function pintarSegmentado() {
  const modos = MODOS[st.pestana];
  if (!modos) return;
  $('#segmentado').innerHTML = modos.map(([id, txt]) => `<button type="button" role="tab" data-modo="${id}" aria-selected="${st.modos[st.pestana] === id}">${txt}</button>`).join('');
}

function pintarChips() {
  if (st.pestana === 'perfumes') {
    // Tipos de perfume, con cuántos hay de cada uno
    const cuenta = (t) => st.deals.filter((d) => d.etiquetas?.includes('PERFUME') && !d.caducado && !d.oculto && tipoPerfume(d) === t).length;
    $('#chips').innerHTML = [
      `<button type="button" class="chip" data-tipo="" aria-pressed="${!st.tipoPerfume}">Todos</button>`,
      ...TIPOS_PERFUME.map(([t, txt]) => `<button type="button" class="chip" data-tipo="${t}" aria-pressed="${st.tipoPerfume === t}">${txt}${st.deals.length ? ` <small>${cuenta(t)}</small>` : ''}</button>`),
    ].join('');
    return;
  }
  const activas = umbrales().categorias_activas ?? Object.keys(CATEGORIAS);
  const corto = { tecnologia: 'Tecnología', hogar: 'Hogar', moda: 'Moda', belleza: 'Belleza', videojuegos: 'Videojuegos', otros: 'Otros' };
  const sel = st.filtros.categorias;
  $('#chips').innerHTML = [`<button type="button" class="chip" data-cat="" aria-pressed="${sel.length === 0}">Todo</button>`, ...activas.map((c) => `<button type="button" class="chip" data-cat="${c}" aria-pressed="${sel.includes(c)}">${esc(corto[c] ?? CATEGORIAS[c] ?? c)}</button>`)].join('');
}

function sincronizarHoja() {
  const f = st.filtros;
  document.querySelectorAll('#hoja-filtros [data-filtro]').forEach((i) => (i.checked = Boolean(f[i.dataset.filtro])));
  $('#dto-min').value = f.descuentoMin;
  $('#dto-valor').textContent = `${f.descuentoMin} %`;
  document.querySelectorAll('#filtro-fuente [data-fuente]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.fuente === f.fuente)));
}

function contarFiltros() {
  const f = st.filtros;
  return [f.soloChollazos, f.soloGratis, f.verOcultos, f.descuentoMin > 0, f.fuente !== 'todas'].filter(Boolean).length;
}

function guardarFiltros() {
  const { texto, ...resto } = st.filtros;
  guardado.escribir('filtros', resto);
  const n = contarFiltros();
  $('#num-filtros').hidden = n === 0;
  $('#num-filtros').textContent = n;
  pintarChips();
  pintarLista();
}

// ── Aviso (toast) ────────────────────────────────────────────────────────────

let temporizador;
function toast(texto, { deshacer } = {}) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(texto)}</span>${deshacer ? '<button type="button">Deshacer</button>' : ''}`;
  t.hidden = false;
  t.classList.add('visible');
  if (deshacer)
    t.querySelector('button').addEventListener('click', () => {
      deshacer();
      t.classList.remove('visible');
    });
  clearTimeout(temporizador);
  temporizador = setTimeout(() => t.classList.remove('visible'), 4000);
}

iniciar();
