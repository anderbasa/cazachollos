import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectarPalabras, detectarTipo, extraerPrecios, normalizarClave, parsePrecio } from '../src/text.js';

test('parsePrecio entiende el formato español y el inglés', () => {
  assert.equal(parsePrecio('54,90€'), 54.9);
  assert.equal(parsePrecio('1.234,56 €'), 1234.56);
  assert.equal(parsePrecio('19.99€'), 19.99);
  assert.equal(parsePrecio('1.234 €'), 1234);
  assert.equal(parsePrecio('30844€'), 30844);
  assert.equal(parsePrecio('0€'), 0);
  assert.equal(parsePrecio('GRATIS'), null);
  assert.equal(parsePrecio(null), null);
  assert.equal(parsePrecio(12.5), 12.5);
});

test('normalizarClave quita tildes y signos', () => {
  assert.equal(normalizarClave('Hogar, vivienda y oficina'), 'hogar-vivienda-y-oficina');
  assert.equal(normalizarClave('Electrónica'), 'electronica');
});

test('detecta error de precio', () => {
  assert.ok(detectarPalabras('¡ERROR DE PRECIO! Monitor 4K a 19 €').has('ERROR_DE_PRECIO'));
  assert.ok(detectarPalabras('Posible error en el precio de este portátil').has('ERROR_DE_PRECIO'));
  assert.ok(!detectarPalabras('Monitor 4K a 199 €').has('ERROR_DE_PRECIO'));
});

test('"envío gratis" no hace gratis el producto', () => {
  assert.ok(!detectarPalabras('Zapatillas Nike 40 € con envío gratis').has('GRATIS'));
  assert.ok(!detectarPalabras('Gastos de envío gratis en todo').has('GRATIS'));
  assert.ok(detectarPalabras('Epic Games regala Flotsam').has('GRATIS'));
  assert.ok(detectarPalabras('GRATIS :: Letter Quest | STEAM').has('GRATIS'));
});

test('"100 %" solo cuenta si es de descuento', () => {
  assert.ok(!detectarPalabras('Camiseta 100% algodón').has('GRATIS'));
  assert.ok(!detectarPalabras('Aceite MOTUL 7100 100% sintético').has('CIEN_POR_CIEN'));
  assert.ok(detectarPalabras('Vouchers 100% GRATIS para exámenes').has('CIEN_POR_CIEN'));
  assert.ok(detectarPalabras('Curso de Python -100%').has('GRATIS'));
});

test('distingue gratis con compra y pruebas', () => {
  const conCompra = detectarPalabras('The Ordinary: GRATIS Moisturizing Factors 100ml con compra de 20 €');
  assert.ok(conCompra.has('GRATIS') && conCompra.has('CON_COMPRA'));
  assert.ok(detectarPalabras('Turrón gratis (Compra superior 50€)').has('CON_COMPRA'));
  assert.ok(detectarPalabras('1 mes GRATIS de Duolingo').has('PRUEBA'));
  assert.ok(detectarPalabras('Pase 2 Semanas Gratis Gimnasios Basic Fit').has('PRUEBA'));
  assert.ok(detectarPalabras('100GB gratis para tu línea durante 30 días').has('PRUEBA'));
  assert.ok(!detectarPalabras('Epic Games regala Flotsam').has('PRUEBA'));
});

test('detecta lo digital sin confundir productos físicos (títulos reales)', () => {
  const digital = [
    'Plugin Vst BRIGADE GRATIS (Por tiempo limitado)',
    'Epic Games regala Flotsam',
    'Epic Games regala Chants of Sennaar (ANDROID/IOS)',
    'Selección de cursos online gratuitos',
    'Cursos online GRATUITOS por tiempo limitado [UDEMY]',
    '1 Año de Windscribe Pro VPN',
    'RIDE 4 - PS4 | Digital',
    'Sapiens. De animales a dioses. Yuval Harari. Ebook',
    'ID3 Genius Editor etiquetas de música licencia completa 1 año Gratis',
    'Dazn - NFL - Gratis Hoy',
    '1 año de suscripción a Amazon Music',
    'Recopilación Juegos y Apps',
  ];
  for (const t of digital) assert.ok(detectarTipo(t).has('DIGITAL'), t);
  const fisico = [
    'Kit de Ring Alarm L + Cámara interior (Indoor Camera 2ª gen) con suscripción a Ring Home',
    'Casio W-218h-1avef Youth Reloj digital para hombre',
    'Kindle Paperwhite 16 GB',
    'Valve Steam Deck OLED 512 GB',
    'Rowenta Steam Force plancha de vapor',
    'Camiseta Marvel licencia oficial',
    'Proyector Inteligente 1080P Nativo 800 ANSI, Android 14, Soporta 4K',
    'Logitech G Pro X Auriculares Gaming con Micrófono',
    'Philips Sonicare AdvancedClean, Cepillo de dientes eléctrico',
  ];
  for (const t of fisico) assert.ok(!detectarTipo(t).has('DIGITAL'), t);
});

test('detecta recopilaciones', () => {
  for (const t of [
    'Recopilación AMERICANAS y CHALECOS para HOMBRE desde 7,99€',
    'MEGA RECOPILACIÓN zapatos y sandalias de mujer desde 4,49€',
    'Recopilatorio de decoración y luces de Navidad en Aldi desde 1,99€',
    'Resumen semanal de Chollometro - 08 de Noviembre 2026',
    'Puesta a punto de belleza antes de las fiestas: ofertas en faciales, spa, masajes y más',
  ])
    assert.ok(detectarTipo(t).has('RECOPILACION'), t);
  assert.ok(!detectarTipo('Zapatillas Converse Chuck Taylor All Star Low').has('RECOPILACION'));
});

test('extraerPrecios entiende los formatos de los canales', () => {
  assert.deepEqual(extraerPrecios('✅ 95,00 € (antes 159,00 €)'), { precio: 95, precioAnterior: 159, porcentaje: null });
  assert.deepEqual(extraerPrecios('Pattex Power Tape solo 2,6€ ❗️💥 (PVP: 8,9€)'), { precio: 2.6, precioAnterior: 8.9, porcentaje: null });
  assert.deepEqual(extraerPrecios('❌ Antes: 44,95€ / 💰 Oferta 29,90€ (-33% 🔥)'), { precio: 29.9, precioAnterior: 44.95, porcentaje: 33 });
  assert.deepEqual(extraerPrecios('Jordan Zion 4 solo 51.9€❗️💥 (PVP: +149.99€)'), { precio: 51.9, precioAnterior: 149.99, porcentaje: null });
  assert.deepEqual(extraerPrecios('ACEITE OLEOESTRELLA POR 19,8€ ♦️ PVP normal: 31,6€'), { precio: 19.8, precioAnterior: 31.6, porcentaje: null });
  assert.deepEqual(extraerPrecios('Sin precios aquí'), { precio: null, precioAnterior: null, porcentaje: null });
});
