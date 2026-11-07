# Cazachollos

Busca chollos 24/7 y avisa por Telegram **solo** cuando aparece algo bestia.

- **Chollo** → entra en la web, para curiosear.
- **Chollazo** → además llega a Telegram. Tiene que ser raro.

> Estado: **fase 2 de 6, en marcha**: guarda en Firestore, avisa por Telegram y se ejecuta en GitHub
> Actions (cron-job.org como despertador). Puesta en marcha paso a paso: **[GUIA.md](GUIA.md)**.
> El esquema de datos está en [DATA.md](DATA.md).

## Cómo funciona

```
cron-job.org ──POST──► GitHub Actions: ejecutar.yml (modo rapido · lento · busqueda · limpieza)
                          └─► node src/main.js → fuentes → puntuar → Firestore → Telegram
GitHub "schedule" ──► respaldo.yml: lo mismo, pero no hace nada si cron-job.org va bien
```

- **Nunca avisa dos veces del mismo chollo.** Si vuelve a bajar al menos un 5 %, avisa otra vez
  diciéndolo.
- **Primera ejecución de cada fuente = siembra:** guarda lo que hay y no avisa, para no mandarte
  de golpe todo lo de las últimas horas.
- **Antispam:** 10 avisos por ronda (el resto en un único resumen) y 40 al día (al llegar, un único
  aviso de "tope" y el resto solo a la web).
- Si una fuente falla 3 veces seguidas, un aviso; al recuperarse, otro. Si nos bloquea (403/429)
  3 veces seguidas, se desactiva y avisa.

## Probarlo en tu PC

Necesitas Node.js 22 o superior (ya lo tienes: `node --version`).

```bash
npm install
npm run dry          # modo rápido: Chollometro "nuevos" + "subiendo"
npm run dry:lento    # modo lento: Chollometro "gratis"
npm run prueba       # comprueba que Firestore y el token de Telegram funcionan (sin enviar nada)
npm test             # tests con páginas reales guardadas
```

`node src/main.js --modo rapido --dry-run --todos` enseña todos los chollos que entrarían en la web.

El modo `--dry-run` solo enseña por consola qué guardaría y qué avisaría. No escribe ni envía nada.
Si hay un `.env` con `FIREBASE_SERVICE_ACCOUNT_FILE=.secrets/firebase.json`, lee el estado real de
Firestore (sin escribir) y te enseña qué avisaría de verdad ahora mismo.

## Reglas actuales (config.yml)

| | Regla |
|---|---|
| Entra en la web | Descuento ≥ 40 % (tecnología, hogar) o ≥ 50 % (videojuegos, moda, otros), o gratis, o error de precio, o ≥ 300° |
| Avisa por descuento | ≥ 50 % **y** la comunidad lo valida: ≥ 300°, o ≥ 10°/min con ≥ 100° |
| Avisa siempre | Error de precio · gratis verificado · ≥ 1.000° en 2 h · ≥ 300° en 30 min |
| Nunca avisa | Precio original < 15 € · el envío se come el descuento · caducado/agotado · solo local · sin verificar de fuente no fiable |
| Antispam | 10 por ejecución, 40 al día; lo que sobra, en un único resumen |

El descuento siempre se calcula con el envío incluido. "Gratis" no cuenta si es "gratis con compra" ni
"1 mes gratis". Los umbrales se podrán cambiar desde la web (fase 4).

## Estructura

```
config.yml              umbrales, categorías, modos y fuentes
src/main.js             entrada (--modo rapido|lento|busqueda|limpieza|prueba, --dry-run, --respaldo)
src/motor.js            una ejecución: estado → recoger → escribir solo cambios → avisos → salud
src/pipeline.js         fuentes aisladas → puntuar → deduplicar
src/store/              Firestore (real), memoria (tests) y modo solo lectura (dry-run)
src/telegram.js         bot (solo envía); src/mensajes.js: textos de los avisos
.github/workflows/      ejecutar (cron-job.org), respaldo (schedule), motor (común), tests
src/scorer.js           puntuación 0–100 y reglas chollo/chollazo
src/deal.js             modelo Deal normalizado
src/http.js             peticiones educadas (User-Agent fijo, pausas, reintentos, backoff)
src/sources/            una fuente por módulo, todas con fetch() → [Deal]
  chollometro.js        listado con JSON embebido; si falla, su RSS
  rss.js                plantilla para el RSS de otra web de chollos
test/                   tests; test/fixtures guarda páginas reales de Chollometro
```

**Añadir una fuente:** crea `src/sources/<nombre>.js` que exporte `fetch(ctx)` y devuelva una lista
de `crearDeal({...})`, y añade una entrada en `fuentes:` de `config.yml`.

## Fases

1. ✅ Base: estructura, config, modelo, puntuador y Chollometro en dry-run
2. ✅ Avisos: Firestore, bot de Telegram, deduplicación, GitHub Actions y cron-job.org (en marcha desde el 7/11/2026)
3. Más fuentes: canales de Telegram y GamerPower
4. Web (PWA): login, feed, filtros, ajustes y estado
5. Búsquedas web: Tavily con límites duros
6. Pulido: limpieza diaria, alertas de fallo y guía completa
