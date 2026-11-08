// Dibuja los iconos de la app (PNG) sin dependencias: un "%" blanco sobre un degradado cálido.
//   npm run iconos
// Las formas se calculan con funciones de distancia y antialiasing, píxel a píxel.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const C1 = [255, 122, 47]; // naranja
const C2 = [232, 23, 59]; // rojo

function dibujar(tam, { margen = 0 } = {}) {
  const px = Buffer.alloc(tam * tam * 4);
  // Coordenadas en [0,1]; el glifo se encoge con el margen (zona segura de los iconos "maskable")
  const s = 1 - 2 * margen;
  const T = (x, y) => [margen + x * s, margen + y * s];
  const [a1x, a1y] = T(0.33, 0.33);
  const [a2x, a2y] = T(0.67, 0.67);
  const R = 0.1 * s;
  const G = 0.072 * s; // grosor del aro
  const [b1x, b1y] = T(0.3, 0.75);
  const [b2x, b2y] = T(0.7, 0.25);
  const RB = 0.042 * s; // grosor de la barra
  const paso = 1 / tam;

  const aro = (x, y, cx, cy) => Math.abs(Math.hypot(x - cx, y - cy) - R) - G / 2;
  const barra = (x, y) => {
    const vx = b2x - b1x;
    const vy = b2y - b1y;
    const t = Math.max(0, Math.min(1, ((x - b1x) * vx + (y - b1y) * vy) / (vx * vx + vy * vy)));
    return Math.hypot(x - (b1x + t * vx), y - (b1y + t * vy)) - RB;
  };

  for (let j = 0; j < tam; j++) {
    for (let i = 0; i < tam; i++) {
      const x = (i + 0.5) / tam;
      const y = (j + 0.5) / tam;
      const t = Math.min(1, Math.max(0, (x + y) / 2));
      const fondo = C1.map((c, k) => c + (C2[k] - c) * t);
      // Brillo suave arriba a la izquierda
      const brillo = Math.max(0, 1 - Math.hypot(x - 0.15, y - 0.1) / 0.9) * 22;
      const d = Math.min(aro(x, y, a1x, a1y), aro(x, y, a2x, a2y), barra(x, y));
      const cobertura = Math.max(0, Math.min(1, 0.5 - d / paso));
      const o = (j * tam + i) * 4;
      for (let k = 0; k < 3; k++) px[o + k] = Math.round(Math.min(255, fondo[k] + brillo) * (1 - cobertura) + 255 * cobertura);
      px[o + 3] = 255;
    }
  }
  return png(tam, tam, px);
}

function png(w, h, rgba) {
  const filas = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(filas, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bits
  ihdr[9] = 6; // RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), trozo('IHDR', ihdr), trozo('IDAT', deflateSync(filas, { level: 9 })), trozo('IEND', Buffer.alloc(0))]);
}

const TABLA = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = TABLA[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function trozo(tipo, datos) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([len, cuerpo, crc]);
}

const dir = fileURLToPath(new URL('../docs/icons/', import.meta.url));
writeFileSync(`${dir}icon-192.png`, dibujar(192));
writeFileSync(`${dir}icon-512.png`, dibujar(512));
writeFileSync(`${dir}maskable-512.png`, dibujar(512, { margen: 0.1 }));
writeFileSync(`${dir}apple-touch-icon.png`, dibujar(180));
writeFileSync(`${dir}favicon-64.png`, dibujar(64));
console.log('✔ iconos en docs/icons/');
