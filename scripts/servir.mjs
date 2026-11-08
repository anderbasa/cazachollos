// Servidor local para probar la web:  npm run web  →  http://localhost:5180/
// Con ?demo usa una copia de los datos (salida/demo.json, que no se sube al repo) en vez de Firebase,
// para probar la web sin iniciar sesión. Para generar la copia (solo lectura): npm run web -- --exportar
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const docs = join(raiz, 'docs');
const demo = join(raiz, 'salida', 'demo.json');
const PUERTO = Number(process.env.PORT ?? 5180);
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };

if (process.argv.includes('--exportar')) {
  await exportarDemo();
  process.exit(0);
}

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/__demo/datos.json') {
    if (!existsSync(demo)) return enviar(res, 404, 'Falta salida/demo.json: npm run web -- --exportar');
    res.writeHead(200, { 'Content-Type': TIPOS['.json'], 'Cache-Control': 'no-store' });
    return createReadStream(demo).pipe(res);
  }
  let ruta = normalize(join(docs, decodeURIComponent(url.pathname)));
  if (!ruta.startsWith(docs)) return enviar(res, 403, 'No');
  if (existsSync(ruta) && statSync(ruta).isDirectory()) ruta = join(ruta, 'index.html');
  if (!existsSync(ruta)) return enviar(res, 404, 'No existe');
  res.writeHead(200, { 'Content-Type': TIPOS[extname(ruta)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(ruta).pipe(res);
}).listen(PUERTO, () => console.log(`Cazachollos web en http://localhost:${PUERTO}/  (demo: http://localhost:${PUERTO}/?demo)`));

function enviar(res, codigo, texto) {
  res.writeHead(codigo, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(texto);
}

/** Copia de solo lectura de Firestore para la demo local (chollos de las últimas 72 h, estado y ejecuciones). */
async function exportarDemo() {
  process.chdir(raiz);
  const { leerSecretos } = await import('../src/entorno.js');
  const { cert, initializeApp } = await import('firebase-admin/app');
  const { getFirestore, Timestamp } = await import('firebase-admin/firestore');
  const db = getFirestore(initializeApp({ credential: cert(leerSecretos({ FIREBASE_SERVICE_ACCOUNT_FILE: '.secrets/firebase.json' }).firebase) }));
  const plano = (o) => JSON.parse(JSON.stringify(o, (k, v) => (v && typeof v === 'object' && '_seconds' in v ? v._seconds * 1000 + Math.round((v._nanoseconds ?? 0) / 1e6) : v)));
  const desde = Timestamp.fromMillis(Date.now() - 72 * 3600_000);
  const deals = (await db.collection('deals').where('publicadoEn', '>=', desde).get()).docs.map((d) => plano(d.data()));
  const estado = Object.fromEntries((await db.collection('estado').get()).docs.map((d) => [d.id, plano({ ...d.data(), recientes: undefined })]));
  const ejecuciones = (await db.collection('ejecuciones').orderBy('inicio', 'desc').limit(12).get()).docs.map((d) => ({ id: d.id, ...plano(d.data()) }));
  const umbrales = (await db.doc('config/umbrales').get()).data() ?? null;
  mkdirSync(join(raiz, 'salida'), { recursive: true });
  writeFileSync(demo, JSON.stringify({ exportado: Date.now(), deals, estado, ejecuciones, umbrales: umbrales && plano(umbrales) }));
  console.log(`✔ salida/demo.json: ${deals.length} chollos, ${Object.keys(estado).length} estados, ${ejecuciones.length} ejecuciones`);
}
