// Publica firestore.rules en el proyecto, con el UID de tu cuenta de Google.
//   npm run reglas
// El UID se busca por el correo (la cuenta tiene que haber entrado en la web al menos una vez).
// Si todavía no existe, las reglas se publican "cerradas" (nadie puede leer) y te lo dice.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getSecurityRules } from 'firebase-admin/security-rules';
import { leerSecretos } from '../src/entorno.js';

const raiz = fileURLToPath(new URL('..', import.meta.url));
process.chdir(raiz);
const CORREO = 'anderbasa07@gmail.com';

const { firebase, problemas } = leerSecretos({ FIREBASE_SERVICE_ACCOUNT_FILE: '.secrets/firebase.json' });
if (!firebase) throw new Error(problemas.join(' · ') || 'Falta .secrets/firebase.json');
const app = initializeApp({ credential: cert(firebase), projectId: firebase.project_id });

let uid = null;
try {
  uid = (await getAuth(app).getUserByEmail(CORREO)).uid;
} catch (e) {
  if (e.code !== 'auth/user-not-found' && e.code !== 'auth/configuration-not-found') throw e;
}

const plantilla = readFileSync('firestore.rules', 'utf8');
const fuente = plantilla.replace('__UID__', uid ?? '__nadie__');
const ruleset = await getSecurityRules(app).releaseFirestoreRulesetFromSource(fuente);
console.log(`✔ Reglas publicadas en ${firebase.project_id} (${ruleset.name.split('/').pop()})`);
console.log(uid ? `  Acceso solo para ${CORREO} (UID ${uid.slice(0, 6)}…)` : `  Cerradas: ${CORREO} aún no ha entrado nunca. Entra una vez en la web y vuelve a ejecutar "npm run reglas".`);
