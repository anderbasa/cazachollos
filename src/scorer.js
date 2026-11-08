// Puntuador único: decide si un Deal entra en la web (chollo) y si avisa por Telegram (chollazo).
//
// Orden de las reglas:
//   0. Filtros de interés (categoría activa, solo productos físicos, sin recopilaciones): si no
//      pasa, no entra ni en la web ni en el bot.
//   1. "nunca" (caducado, local, sin verificar, sin precio, precio original bajo, el envío se come
//      el descuento) gana siempre: si salta alguna, no se avisa.
//   2. "siempre" (error de precio, gratis verificado, temperatura muy alta en poco tiempo).
//   3. Normal: descuento ≥ umbral de aviso de su categoría Y validación de la comunidad (votos).
//
// La puntuación 0–100 es para ordenar la vista "Mejores" de la web:
//   descuento (hasta 50) + temperatura (hasta 30) + velocidad (hasta 20), con suelos para lo
//   gratis, los errores de precio y los chollazos, y penalización si no está verificado o caducó.

export function puntuar(deal, u, ahora = Date.now()) {
  const tags = new Set(deal.etiquetas);
  const cat = deal.categoria;
  const T = deal.temperatura;
  const d = deal.descuento;
  const edadMin = deal.publicadoEn ? Math.max(0, (ahora - Date.parse(deal.publicadoEn)) / 60000) : null;
  const velocidad = T != null && edadMin != null ? T / Math.max(1, edadMin) : null;

  const esGratis = tags.has('GRATIS') && deal.precio === 0 && !tags.has('CON_COMPRA') && !tags.has('PRUEBA');
  const juegoCompleto = esGratis && tags.has('JUEGO_COMPLETO');
  const errorPrecio = tags.has('ERROR_DE_PRECIO');

  const porTemperatura = T != null && T >= u.votos.temperatura;
  const porVelocidad =
    velocidad != null &&
    edadMin >= u.votos.minutos_minimos &&
    T >= (u.votos.velocidad_temperatura_minima ?? 0) &&
    velocidad >= u.votos.velocidad;
  const votos = porTemperatura || porVelocidad;
  const textoVotos = porTemperatura ? `${Math.round(T)}°` : porVelocidad ? `${velocidad.toFixed(1)}°/min` : '';

  // 0 · Filtros de interés
  const filtros = [];
  if (u.categorias_activas && !u.categorias_activas.includes(cat)) filtros.push(`categoría ${cat} desactivada`);
  if (u.solo_productos_fisicos) {
    if (tags.has('DIGITAL')) filtros.push('no es un producto físico (digital)');
    else if (tags.has('NO_FISICO')) filtros.push('no es un producto físico (servicio, viaje o tarifa)');
    else if (tags.has('CUPON')) filtros.push('cupón genérico de tienda');
  }
  if (u.excluir_recopilaciones && tags.has('RECOPILACION')) filtros.push('recopilación de varios productos');

  // 1 · Nunca
  const bloqueos = [...filtros];
  if (deal.caducado) bloqueos.push('caducado o agotado');
  if (u.nunca.locales && deal.local) bloqueos.push('solo en tiendas físicas o zonas concretas');
  if (!deal.verificado && !deal.fiable) bloqueos.push('sin verificar y la fuente no es fiable');
  if (deal.precio == null && !errorPrecio) bloqueos.push('sin precio');
  const minimo = u.nunca.precio_original_minimo;
  if (deal.precioAnterior != null && deal.precioAnterior < minimo && !(juegoCompleto && u.siempre.juegos_gratis)) {
    bloqueos.push(`precio original menor de ${minimo} €`);
  }
  if (deal.precio != null && deal.precioAnterior != null && deal.precio < deal.precioAnterior && deal.precioEfectivo >= deal.precioAnterior) {
    bloqueos.push('el envío se come el descuento');
  }

  // 2 · Siempre
  const siempre = [];
  if (u.siempre.error_de_precio && errorPrecio) siempre.push('error de precio');
  if (u.siempre.gratis && esGratis) {
    // Gratis con valor conocido, juego completo, o (si no sabemos lo que vale) validado por votos
    if (juegoCompleto && u.siempre.juegos_gratis) siempre.push('juego completo gratis');
    else if (deal.precioAnterior != null) siempre.push('gratis');
    else if (votos) siempre.push(`gratis con ${textoVotos}`);
  }
  for (const r of u.siempre.temperatura_rapida ?? []) {
    if (T != null && edadMin != null && T >= r.grados && edadMin <= r.minutos) {
      siempre.push(`${Math.round(T)}° en ${Math.round(edadMin)} min`);
      break;
    }
  }

  // 3 · Normal
  const filtrado = filtros.length > 0;
  const motivos = filtrado ? [] : [...siempre]; // lo filtrado no es "casi chollazo": no interesa
  const umbralAviso = u.aviso[cat] ?? u.aviso.otros;
  const porDescuento = d != null && d >= umbralAviso && votos;
  if (porDescuento && !filtrado) motivos.push(`-${d} % con ${textoVotos}`);

  const esChollazo = bloqueos.length === 0 && motivos.length > 0;

  const umbralWeb = Math.min(u.web[cat] ?? u.web.otros, umbralAviso);
  const esChollo =
    !filtrado &&
    (esChollazo ||
      esGratis ||
      errorPrecio ||
      (d != null && d >= umbralWeb) ||
      (T != null && T >= u.web_temperatura_minima));

  // Puntuación 0–100
  let p = 0;
  if (d != null) p += 0.5 * Math.min(d, 100);
  if (T != null && T > 0) p += 30 * Math.min(1, Math.log10(1 + T / 50) / Math.log10(1 + 2000 / 50));
  if (velocidad != null && velocidad > 0 && edadMin >= u.votos.minutos_minimos) p += 20 * Math.min(1, velocidad / 10);
  if (esGratis) p = Math.max(p, juegoCompleto || (deal.precioAnterior ?? 0) >= minimo ? 90 : 70);
  if (errorPrecio) p = Math.max(p, 85);
  if (esChollazo) p = Math.max(p, 70);
  if (!deal.verificado) p *= 0.85;
  // Lo han elegido los editores de @chollos / @descuentos: suma puntos (no cuenta como votos)
  if (tags.has('EDITORES')) p += u.bonus_editores ?? 10;
  if (deal.caducado) p *= 0.5;

  return {
    puntuacion: Math.round(Math.min(100, Math.max(0, p))),
    esChollo,
    esChollazo,
    gratis: esGratis,
    filtrado, // no pasa los filtros de interés: ni web ni bot
    velocidad: velocidad == null ? null : Math.round(velocidad * 10) / 10,
    edadMinutos: edadMin == null ? null : Math.round(edadMin),
    motivos, // por qué es chollazo (o lo sería)
    bloqueos, // por qué no se avisa aunque lo parezca
  };
}
