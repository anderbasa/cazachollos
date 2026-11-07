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

---

## Paso 5 · Primera prueba (2 min)

1. Ve a https://github.com/anderbasa/cazachollos/actions
2. A la izquierda, pulsa **Cazachollos**.
3. A la derecha, pulsa **Run workflow** → en "Qué ejecutar" elige `prueba` → **Run workflow**.
4. Al minuto o así debería salir un ✅ verde y llegarte a Telegram el mensaje
   **"Cazachollos está conectado"**.
   - Si sale una ❌ roja, entra en la ejecución y mira el último paso, "Cazachollos": dice qué
     falla (por ejemplo "Faltan TELEGRAM_BOT_TOKEN"). Normalmente es un secret mal copiado.
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
5. **Permissions** → **Repository permissions** → busca **Actions** → **Read and write**.
   No toques nada más; "Metadata: Read-only" se añade sola.
6. Pulsa **Generate token** y copia el token (empieza por `github_pat_`). **Solo se ve una vez.**
   Este token vive solo en cron-job.org: no hace falta guardarlo en ningún otro sitio.

**6.2 · Cuenta en cron-job.org**

1. Entra en https://cron-job.org → **Sign up**, crea la cuenta (gratis) y confirma el correo.
2. En **Settings** (tu cuenta), pon la zona horaria `Europe/Madrid`.

**6.3 · Crear los 4 trabajos**

Pulsa **Create cronjob** y rellena:

- **Title:** `Cazachollos rápido`
- **URL:** `https://api.github.com/repos/anderbasa/cazachollos/actions/workflows/ejecutar.yml/dispatches`
- **Execution schedule:** cada 10 minutos (Every 10 minutes)
- Abre la pestaña **Advanced**:
  - **Request method:** `POST`
  - **Request headers:** añade estas 4 cabeceras (Key → Value):
    - `Authorization` → `Bearer github_pat_...` (la palabra `Bearer`, un espacio y tu token)
    - `Accept` → `application/vnd.github+json`
    - `X-GitHub-Api-Version` → `2022-11-28`
    - `Content-Type` → `application/json`
  - **Request body:** `{"ref":"main","inputs":{"modo":"rapido"}}`
- **Notifications:** activa que te avise por correo si falla.
- Guarda (**Create**).

Luego crea otros tres iguales (si ves la opción de copiar o duplicar, úsala) cambiando solo el
título, la frecuencia y la palabra del modo en el body:

| Title | Frecuencia | Request body |
|---|---|---|
| `Cazachollos lento` | Cada hora | `{"ref":"main","inputs":{"modo":"lento"}}` |
| `Cazachollos búsqueda` | Cada 6 horas | `{"ref":"main","inputs":{"modo":"busqueda"}}` |
| `Cazachollos limpieza` | Cada día a las 04:30 | `{"ref":"main","inputs":{"modo":"limpieza"}}` |

**6.4 · Comprobar**

En cada trabajo, pulsa **Test run** (o "Run now"). Tiene que responder **204** (sin contenido);
eso significa que GitHub ha aceptado la orden. En la pestaña Actions del repo verás aparecer la
ejecución.

- **401:** el token está mal copiado o falta la palabra `Bearer `.
- **403:** el token no tiene permiso de Actions (Read and write).
- **404:** la URL está mal escrita, o el token no tiene acceso al repositorio `cazachollos`.
- **422:** el body está mal escrito (revisa comillas y llaves).

---

## Para probar en tu PC (opcional)

Con `firebase.json` en `.secrets`, crea en la carpeta del proyecto un archivo `.env` con esta línea
(o pídemelo y lo creo yo; no es una clave, solo la ruta):

```
FIREBASE_SERVICE_ACCOUNT_FILE=.secrets/firebase.json
```

Así, `npm run dry` lee el estado real de Firestore, sin escribir nada, y te enseña qué avisaría ahora
mismo de verdad.
