# Datos de Cazachollos (Firestore)

Esquema **versión 1**. Pensado para ser estable: otras herramientas (por ejemplo el briefing semanal)
pueden leerlo con una cuenta de servicio de solo lectura. Si un campo cambia de significado, se sube
`version` en los documentos y se anota aquí.

Fechas: `Timestamp` de Firestore (UTC). Dinero: euros con decimales (`number`). Porcentajes: enteros 0–100.

## `deals/{id}` — un documento por chollo

`id` = primeros 20 caracteres hex de `sha1("<fuente>:<idFuente>")`. Estable: el mismo chollo siempre
tiene el mismo id. Solo se guardan los chollos que entran en la web (`esChollo`).

| Campo | Tipo | Qué es |
|---|---|---|
| `version` | number | Versión del esquema (1) |
| `id` | string | El id del documento |
| `fuente` | string | Id de la fuente en `config.yml` (`chollometro`, `telegram`, `gamerpower`, `busqueda`…) |
| `origen` | string | Detalle: listado (`nuevos`, `subiendo`, `gratis`, `nuevos-rss`…) o canal |
| `fuentes` | string[] | Todas las fuentes que lo han visto (se fusionan en un solo registro) |
| `idFuente` | string | Identificador en la fuente (en Chollometro, el número del hilo) |
| `titulo` | string | |
| `url` | string | Enlace a la ficha del chollo |
| `tienda` | string \| null | |
| `categoria` | string | `tecnologia` · `videojuegos` · `hogar` · `moda` · `belleza` · `otros` (desde el 8/11/2026 solo se guardan las de `categorias_activas`: moda, tecnología, hogar y belleza) |
| `categoriaFuente` | string \| null | Categoría original de la fuente |
| `precio` | number \| null | Precio (0 = gratis; null = sin precio) |
| `precioAnterior` | number \| null | Precio de referencia que da la fuente |
| `envio` | number \| null | Gastos de envío (0 = gratis; null = desconocido) |
| `precioEfectivo` | number \| null | `precio + envio` |
| `descuento` | number \| null | % sobre el precio efectivo |
| `cupon` | string \| null | Código de cupón |
| `temperatura` | number \| null | Grados en Chollometro **en la última escritura** (no en tiempo real: se actualiza al cruzar 100/300/500/1.000/2.000/5.000°) |
| `velocidad` | number \| null | Grados por minuto desde la publicación, en la última escritura |
| `publicadoEn` | Timestamp \| null | Cuándo se publicó en la fuente |
| `dia` | string | `AAAA-MM-DD` (Europe/Madrid) de la publicación; para consultas por día |
| `vistoEn` | Timestamp | Cuándo lo vio Cazachollos por primera vez |
| `actualizadoEn` | Timestamp | Última escritura del script |
| `imagen` | string \| null | URL de la imagen |
| `caducado` | boolean | Caducado o agotado |
| `local` | boolean | Solo en tiendas físicas o zonas concretas |
| `verificado` | boolean | Datos de una fuente fiable (Chollometro, GamerPower) |
| `gratis` | boolean | Precio 0 verificado (no cuenta "gratis con compra" ni pruebas) |
| `etiquetas` | string[] | `ERROR_DE_PRECIO`, `GRATIS` (palabra clave), `SIN_VERIFICAR`, `CADUCADO`, `LOCAL`, `CON_COMPRA`, `PRUEBA`, `REGALO`, `CIEN_POR_CIEN`, `JUEGO_COMPLETO`, y de tipo: `DIGITAL` (plugins, apps, cursos, suscripciones…), `NO_FISICO` (servicios, viajes, tarifas), `CUPON` (cupón genérico de tienda), `RECOPILACION` (lista de varios productos) |
| `puntuacion` | number | 0–100, para ordenar "Mejores" |
| `esChollo` | boolean | Cumple las reglas de la web |
| `esChollazo` | boolean | Cumple las reglas de aviso |
| `motivos` | string[] | Por qué es (o sería) chollazo |
| `bloqueos` | string[] | Qué regla de "nunca" impide avisar |
| `notificado` | boolean | Ya se avisó (o se decidió no avisar, ver `via`) |
| `notificadoEn` | Timestamp \| null | |
| `precioNotificado` | number \| null | Precio efectivo en el último aviso (para avisar de nuevas rebajas) |
| `avisos` | number | Cuántos mensajes se han enviado de este chollo |
| `via` | string \| null | Cómo se marcó: `telegram`, `resumen`, `siembra` (primera ejecución, sin aviso), `silencio` (fue al resumen de la mañana), `tope` (se superó el máximo diario) |
| `extra` | map | Datos propios de la fuente (no estables) |
| `favorito` | boolean | **Lo escribe la web**, nunca el script |
| `oculto` | boolean | **Lo escribe la web**, nunca el script |

## `estado/{fuente}` — un documento por fuente

Una sola escritura por ejecución y fuente.

| Campo | Qué es |
|---|---|
| `sembrado` | `true` tras la primera ejecución correcta (en esa no se avisa de nada) |
| `ultimaEjecucion`, `ultimaOk`, `ultimoFallo` | Timestamps |
| `fallosSeguidos`, `bloqueosSeguidos` | Contadores; vuelven a 0 al ir bien |
| `fallandoDesde` | Timestamp del primer fallo de la racha actual |
| `ultimoError` | Texto corto (sin datos personales) |
| `alertaEnviada` | Ya se avisó por Telegram de que falla |
| `desactivada` | `true` si nos bloqueó varias veces; no se vuelve a pedir hasta reactivarla |
| `recientes` | Mapa compacto `{ [dealId]: { t, p, c, b, s, n, pn, tn, na, v } }` de los chollos guardados vistos en las últimas 72 h: temperatura, precio efectivo, caducado (0/1), banda de temperatura, chollazo (0/1), avisado (0/1), precio avisado, minuto del último aviso, mensajes enviados y último minuto visto (minutos desde 1970). Sirve para escribir un chollo solo cuando cambia algo relevante. |

## `estado/_global`

| Campo | Qué es |
|---|---|
| `dia` | `AAAA-MM-DD` (Europe/Madrid) del contador de avisos |
| `avisosHoy` | Avisos individuales enviados hoy (máximo `max_por_dia`) |
| `topeAvisado` | Ya se envió hoy el mensaje de "tope alcanzado" |
| `ultimaPorModo` | `{ rapido, lento, busqueda, limpieza }` → Timestamp de la última ejecución (para el respaldo) |
| `cola` | Chollazos guardados durante las horas de silencio, para el resumen de la mañana |

## `ejecuciones/{id}` — registro de cada ejecución (se guarda 7 días)

`id` = `AAAA-MM-DDTHH-MM-SS-mmmZ_<modo>`. Campos: `modo`, `respaldo`, `inicio`, `fin`, `ms`,
`fuentes` (`{ [id]: { ok, leidos, error } }`), `leidos`, `nuevos`, `actualizados`, `avisos`,
`resumen`, `silenciados`, `errores` (textos cortos), `peticiones`.

## `uso/{AAAA-MM}` — contador de búsquedas web (fase 5)

`busquedas` (total del mes), `porDia` (`{ "07": 12, … }`).

## `config/umbrales` — ajustes editables desde la web (fase 4)

Mismo formato que `umbrales:` en `config.yml`. Solo hace falta guardar lo que cambia; el script lo
mezcla con los valores por defecto en cada ejecución.

## Cuotas del plan Spark (estimación diaria)

Límites gratuitos por proyecto y día: 50.000 lecturas, 20.000 escrituras, 20.000 borrados.

| Qué | Lecturas | Escrituras |
|---|---|---|
| 144 ejecuciones rápidas (global, umbrales, estado de 1–2 fuentes; global + estado + registro) | ~600 | ~600 |
| 24 lentas + 4 de búsqueda + 1 de limpieza | ~120 | ~90 |
| ~80 ejecuciones de respaldo que no hacen nada (1 lectura) | ~80 | 0 |
| Chollos nuevos que entran en la web (~500/día) | 0 | ~500 |
| Cambios relevantes de esos chollos (precio, caducado, banda de temperatura) | 0 | ~800 |
| Avisos (transacción para no avisar dos veces, ~15/día) | ~30 | ~30 |
| Web (abrir el feed ~20 veces al día, 50 chollos cada vez) | ~1.000 | ~20 |
| **Total** | **~1.900 (4 %)** | **~2.000 (10 %)** |

Borrados: la limpieza diaria borra unos 500 chollos de más de 30 días y ~170 registros de ejecución.
Almacenamiento: 30 días × ~500 chollos × ~2 KB ≈ 30 MB (el límite gratis es 1 GB).
