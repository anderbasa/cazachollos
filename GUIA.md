# Guía de puesta en marcha (fase 2)

Son 6 pasos y en total llevan unos 30-40 minutos. Hazlos en este orden. Lo que tienes que copiar
o escribir tal cual aparece `así`.

Vas a conseguir 3 claves. **Trátalas como contraseñas:** no las mandes por chat a nadie y no las
pegues en ningún sitio distinto del que dice la guía. El repositorio será público: las claves van
**solo** en los "secrets" de GitHub, que nadie más puede ver.

---

## Paso 1 · El bot de Telegram (5 min)

**1.1 · Crear el bot**

1. En Telegram, busca `@BotFather` (tiene la marca azul de verificado) y abre el chat.
2. Escribe `/newbot` y envíalo.
3. Te pide un **nombre** visible: escribe `Cazachollos`.
4. Te pide un **nombre de usuario**, que tiene que acabar en `bot` y no puede estar cogido. Prueba
   `cazachollos_ander_bot`. Si está cogido, prueba otro, por ejemplo `cazachollos_ab_bot`.
5. BotFather te responde con un mensaje que incluye una línea así:
   `123456789:AAH-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   Eso es el **token** (clave 1). Cópialo en un sitio seguro, por ejemplo una nota privada.

**1.2 · Sacar tu chat_id**

1. Toca el enlace `t.me/...` que te ha dado BotFather para abrir el chat con tu bot.
2. Pulsa **Iniciar** (o escribe `/start`) y luego escríbele cualquier cosa, por ejemplo `hola`.
3. En el navegador del ordenador, abre esta dirección cambiando `TU_TOKEN` por el token del paso 1.1
   (sin espacios; la palabra `bot` va pegada al token):
   `https://api.telegram.org/botTU_TOKEN/getUpdates`
4. Verás un texto como `{"ok":true,"result":[{"update_id":...,"message":{..."chat":{"id":987654321,...`
   El número que va justo después de `"chat":{"id":` es tu **chat_id** (clave 2). Cópialo.
   - Pulsa Ctrl+F y busca `"chat":{"id":` para encontrarlo. Ahí salen varios números parecidos
     (`update_id`, `message_id`…): solo vale el de `"chat"`, que es igual al de `"from":{"id":`.
   - Si coincide con el principio del token (lo que va antes de `:`), **no es ese**: es el del bot.
     Con ese número, la prueba del paso 5 da "chat not found".
   - Si ves `"result":[]`, escribe otro mensaje al bot y recarga la página.
   - Si ves `"ok":false`, el token está mal copiado.

---

## Paso 2 · Firebase (10 min)

**2.1 · Crear el proyecto**

1. Entra en https://console.firebase.google.com con tu cuenta de Google.
2. Pulsa **Crear un proyecto** (o "Empezar con un proyecto de Firebase").
3. Nombre: `cazachollos`. Google puede añadirle unas letras al final del identificador; es normal.
4. Si te pregunta por **Gemini** o **Google Analytics**, desactívalos: no hacen falta.
5. Pulsa **Crear proyecto** y espera. Se crea con el plan gratuito **Spark**, sin pedir tarjeta.
   Si en algún momento te pide tarjeta o "actualizar a Blaze", **no lo hagas**: no hace falta.

**2.2 · Crear la base de datos (Firestore)**

1. En el menú de la izquierda, abre **Compilación** (o "Build") → **Firestore Database**.
2. Pulsa **Crear base de datos**.
3. Si te pregunta la edición, elige **Standard**.
4. **Ubicación:** elige `europe-southwest1 (Madrid)`. Esto no se puede cambiar después.
5. Reglas: elige **Iniciar en modo de producción**. Así nadie puede leer nada desde fuera; el
   script entra con su propia clave. Las reglas para tu web las pondremos en la fase 4.
6. Pulsa **Crear**.

**2.3 · La clave del script (cuenta de servicio)**

1. Pulsa el engranaje ⚙️ de arriba a la izquierda → **Configuración del proyecto**.
2. Abre la pestaña **Cuentas de servicio**.
3. Pulsa **Generar nueva clave privada** → **Generar clave**. Se descarga un archivo `.json`.
   Eso es la **clave de Firebase** (clave 3). Da acceso total a tu base de datos: no la compartas.
4. Crea la carpeta `C:\Users\Ander\proyectos\cazachollos\.secrets`, mueve el archivo ahí y
   cámbiale el nombre a `firebase.json`. Esa carpeta nunca se sube a GitHub (está en `.gitignore`).
   Sirve para hacer pruebas en tu PC.

---

## Paso 3 · El repositorio en GitHub (2 min)

1. Entra en https://github.com/new (con tu cuenta `anderbasa`).
2. **Repository name:** `cazachollos`.
3. Marca **Public**. Hace falta para tener minutos de GitHub Actions ilimitados. El código se verá,
   pero las claves no, porque irán en los secrets.
4. **No** marques "Add a README", ni .gitignore, ni licencia: tiene que crearse vacío.
5. Pulsa **Create repository**.
6. **Avísame.** Entonces hago el primer commit y subo el código. Puede que se abra una ventana del
   navegador para que inicies sesión en GitHub: acéptala.

---

## Paso 4 · Guardar las 3 claves en GitHub (5 min)

Cuando el código ya esté subido. Hazlo enseguida: hasta que estén las claves, el respaldo de
GitHub fallará cada media hora (verás alguna ❌ roja en Actions y quizá un correo de GitHub;
es normal y se arregla solo en cuanto pongas los secrets).

1. Ve a https://github.com/anderbasa/cazachollos/settings/secrets/actions
   (o en el repo: **Settings** → **Secrets and variables** → **Actions**).
2. Pulsa **New repository secret** y crea estos tres. El nombre tiene que ser **exactamente** así,
   en mayúsculas:

| Name | Secret (lo que pegas) |
|---|---|
| `TELEGRAM_BOT_TOKEN` | El token del paso 1.1 |
| `TELEGRAM_CHAT_ID` | El número del paso 1.2 (solo el número; si lleva un `-` delante, inclúyelo) |
| `FIREBASE_SERVICE_ACCOUNT` | **Todo** el contenido del archivo `firebase.json`: ábrelo con el Bloc de notas, pulsa Ctrl+A y luego Ctrl+C, y pégalo. Empieza por `{` y acaba por `}` |

Ojo con el portapapeles: si copias el nombre (`FIREBASE_SERVICE_ACCOUNT`) después de copiar la
clave, al pegar en "Secret" pegarás el nombre. Escribe los nombres a mano y pega solo el contenido.

---

## Paso 5 · Primera prueba (2 min)

1. Ve a https://github.com/anderbasa/cazachollos/actions
2. A la izquierda, pulsa **Cazachollos**.
3. A la derecha, pulsa **Run workflow** → en "Qué ejecutar" elige `prueba` → **Run workflow**.
4. Al minuto o así debería salir un ✅ verde y llegarte a Telegram el mensaje
   **"Cazachollos está conectado"**.
   - Si sale una ❌ roja, entra en la ejecución: en el apartado **Annotations** sale qué secret
     falla y por qué (sin enseñar su contenido). Por ejemplo, "FIREBASE_SERVICE_ACCOUNT no es un
     JSON válido… NO empieza por {" o "chat not found" (chat_id equivocado, ver paso 1.2).
     Corrige el secret con el lápiz ✏️ y lanza otra vez con **Run workflow**: "Re-run" repite
     el código antiguo.
5. Repite con `rapido`. Esta primera vez **no te avisará de nada a propósito**: es la "siembra",
   que guarda lo que hay ahora para no mandarte de golpe todo lo de las últimas horas. En Firebase →
   Firestore Database deberías ver aparecer las colecciones `deals`, `estado` y `ejecuciones`.
6. Lanza también una vez `lento` (siembra de la categoría gratis).

---

## Paso 6 · El despertador: cron-job.org (10-15 min)

GitHub tiene su propio programador, pero puede retrasarse horas, así que el que manda es
cron-job.org (gratis). El de GitHub queda como respaldo.

**6.1 · Token de GitHub para cron-job.org**

1. Ve a https://github.com/settings/personal-access-tokens/new
   (o tu foto, arriba a la derecha → **Settings** → **Developer settings** → **Personal access
   tokens** → **Fine-grained tokens** → **Generate new token**).
2. **Token name:** `cron-job.org cazachollos`.
3. **Expiration:** elige la fecha más lejana que te deje (normalmente 1 año). **Apúntala en tu
   calendario con un recordatorio una semana antes:** ese día tendrás que crear otro y cambiarlo
   en cron-job.org. Si no, el bot dejará de funcionar sin avisar (solo quedaría el respaldo de GitHub).
4. **Repository access:** **Only select repositories** → elige `anderbasa/cazachollos`.
5. **Permissions** → **Repository permissions** → busca **Actions** → **Read and write**
   (en la versión nueva: **+ Add permissions** → Actions → Read and write).
   No toques nada más; "Metadata: Read-only" se añade sola.
6. Pulsa **Generate token** y copia el token (empieza por `github_pat_`). **Solo se ve una vez.**
   Este token vive solo en cron-job.org: no hace falta guardarlo en ningún otro sitio.

Si luego cron-job.org da **403**, casi seguro es este permiso: en
https://github.com/settings/personal-access-tokens abre el token → **Edit** → pon Actions en
**Read and write** → **Update**. El token sigue siendo el mismo; no hay que tocar cron-job.org.

**6.2 · Cuenta en cron-job.org** (los nombres son los de la web en castellano)

1. Entra en https://cron-job.org → **Registrarse**, crea la cuenta (gratis) y confirma el correo.

**6.3 · El primer trabajo**

**Cronjobs** → **Crear cronjob**.

Pestaña **Común**:
- **Título:** `Cazachollos rápido`
- **URL:** `https://api.github.com/repos/anderbasa/cazachollos/actions/workflows/ejecutar.yml/dispatches`
- **Habilitar job:** activado.
- **Horario de ejecución:** **Cada 10 minutos**.
- **Notificaciones** → marca **cuando la ejecución del cronjob falle**.

Pestaña **Avanzado**:
- **Zona horaria:** `Europe/Madrid`
- **Encabezados** (Clave → Valor), cuatro:
  - `Authorization` → `Bearer github_pat_...` (la palabra `Bearer`, un espacio y tu token)
  - `Accept` → `application/vnd.github+json`
  - `X-GitHub-Api-Version` → `2022-11-28`
  - `Content-Type` → `application/json` (si sale el aviso «¿Enviar datos JSON?», el botón
    «Agregar encabezado Content-Type ahora» lo añade solo)
- **Método de solicitud:** `POST`
- **Cuerpo de la solicitud:** `{"ref":"main","inputs":{"modo":"rapido"}}`

Pulsa **Crear** (o **Guardar**).

**6.4 · Los otros tres: con «Clonar»**

En la lista, menú `⋯` del trabajo rápido → **Clonar** → **Editar** la copia y cambia solo el
título, el horario y la palabra del modo en el cuerpo:

| Título | Horario de ejecución | Cuerpo de la solicitud |
|---|---|---|
| `Cazachollos lento` | Cada 1 hora | `{"ref":"main","inputs":{"modo":"lento"}}` |
| `Cazachollos búsqueda` | Cada 6 horas | `{"ref":"main","inputs":{"modo":"busqueda"}}` |
| `Cazachollos limpieza` | Todos los días a las 04:30 | `{"ref":"main","inputs":{"modo":"limpieza"}}` |

**6.5 · Comprobar**

En cada trabajo: **Ejecución de prueba** → **Iniciar ejecución de prueba**. La **Respuesta** tiene
que ser **204** (GitHub ha aceptado la orden) y en la pestaña Actions del repo aparece la ejecución.

- **401:** el token está mal copiado o falta la palabra `Bearer `.
- **403:** el token no tiene permiso de Actions (Read and write); ver el final de 6.1.
  El **Cuerpo de respuesta** lo confirma: «Resource not accessible by personal access token».
- **404:** la URL está mal escrita, o el token no tiene acceso al repositorio `cazachollos`.
- **422:** el cuerpo de la solicitud está mal escrito (revisa comillas y llaves).

---

## Cuando caduque el token de GitHub (una vez al año)

1. Crea uno nuevo igual que en 6.1 (o en el token viejo, **Regenerate token**).
2. En cron-job.org, en **cada uno de los 4 trabajos**: **Editar** → **Avanzado** → encabezado
   `Authorization` → pon `Bearer ` + el token nuevo → **Guardar**.
3. Haz una **Ejecución de prueba** en uno: tiene que salir 204.

---

## Para probar en tu PC (opcional)

Con `firebase.json` en `.secrets`, crea en la carpeta del proyecto un archivo `.env` con esta línea
(o pídemelo y lo creo yo; no es una clave, solo la ruta):

```
FIREBASE_SERVICE_ACCOUNT_FILE=.secrets/firebase.json
```

Así, `npm run dry` lee el estado real de Firestore, sin escribir nada, y te enseña qué avisaría ahora
mismo de verdad.

---

# Fase 4 · La web

## Paso 7 · Activar el inicio de sesión con Google en Firebase (2 min)

1. Entra en https://console.firebase.google.com → proyecto **cazachollos**.
2. Menú de la izquierda: **Authentication** (dentro de **Compilación**, de **Build** o de
   **Seguridad**, según la versión de la consola). Pulsa **Comenzar** si te lo pide.
3. Pestaña **Método de inicio de sesión** → en la lista, **Google**.
4. Activa el interruptor **Habilitar**.
5. **Correo electrónico de asistencia:** elige `anderbasa07@gmail.com`.
6. Pulsa **Guardar**.

## Paso 8 · Publicar la web en GitHub Pages (2 min)

1. Ve a https://github.com/anderbasa/cazachollos/settings/pages
2. En **Build and deployment** → **Source**: deja **Deploy from a branch**.
3. En **Branch**: elige `main` y, al lado, la carpeta **`/docs`**. Pulsa **Save**.
4. Al cabo de un minuto, la web estará en **https://anderbasa.github.io/cazachollos/**

## Paso 9 · Primera entrada y app en el iPhone

1. En el iPhone, abre **https://anderbasa.github.io/cazachollos/** en **Safari**.
2. Pulsa **Entrar con Google** y elige `anderbasa07@gmail.com`.
3. La primera vez, la web dirá que tu cuenta aún no tiene permiso: es normal. Las reglas de la base
   de datos se cierran con tu número de usuario (UID), y ese número solo existe después de entrar
   una vez. Desde el PC: `npm run reglas` (o pídemelo). Después recarga la web.
4. Para tenerla como app: botón **Compartir** (el cuadrado con la flecha) → **Añadir a pantalla de
   inicio** → **Añadir**. Ábrela desde el icono y vuelve a entrar con Google (la app del icono no
   comparte la sesión con Safari).
