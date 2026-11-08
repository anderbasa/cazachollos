import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { categorizarPorTitulo } from '../src/categorizar.js';
import { cargarConfig, mapearCategoria } from '../src/config.js';
import { extraerHilos } from '../src/sources/chollometro.js';

test('casos con trampa', () => {
  const casos = {
    'HUAWEI Watch GT 7 46mm, Pantalla AMOLED': 'tecnologia',
    'Casio W-218h-1avef Youth Reloj Para Hombre': 'moda',
    'Plancha de pelo Rowenta Wet & Dry Pro': 'belleza',
    'Philips Secador de pelo 2300 W': 'belleza',
    'Bosch Serie 6 Secadora con bomba de calor 9 kg': 'hogar',
    'Logitech G Pro X Auriculares Gaming para PC/PS/Xbox': 'tecnologia',
    'Mando inalámbrico 8BitDo Pro 2 para Switch': 'videojuegos',
    'Zapatillas adidas Originals Tokyo W crema piel': 'moda',
    'LEGO Ideas Cámara Polaroid OneStep SX-70 (21345)': 'otros',
    'Butaca sofá cama SOLO (mostaza)': 'hogar',
    'Einhell taladro percutor 18V con batería y cargador': 'hogar',
    'Freidora de aire Ninja Double Stack XL 9,5L con termómetro': 'hogar',
    'Jean Paul Gaultier Le Male 125ml': 'belleza',
    'Funda Reforzada para Samsung Galaxy A05s': 'tecnologia',
    'Escapada 5 días a Granada con vuelos y hotel · billetes de avion': 'otros',
  };
  for (const [titulo, cat] of Object.entries(casos)) assert.equal(categorizarPorTitulo(titulo), cat, titulo);
});

// Medido con los títulos reales de Chollometro (donde sabemos la categoría): si baja de aquí,
// algún cambio en las reglas ha empeorado la clasificación.
test('acierta la mayoría con títulos reales y casi nunca se equivoca de categoría', () => {
  const config = cargarConfig();
  let ok = 0;
  let n = 0;
  let cruzados = 0;
  for (const f of ['nuevos', 'subiendo', 'gratis', 'destacados']) {
    for (const t of extraerHilos(readFileSync(new URL(`./fixtures/chollometro/${f}.html`, import.meta.url), 'utf8'))) {
      const real = mapearCategoria(config, 'chollometro', [t.mainGroup?.threadGroupUrlName, t.mainGroup?.threadGroupName]);
      const pred = categorizarPorTitulo(t.title);
      n++;
      if (pred === real) ok++;
      else if (pred !== 'otros' && real !== 'otros') cruzados++;
    }
  }
  // (con estos 120 da ~74 %; con los 495 títulos reales guardados en Firestore el 8/11/2026, 83 %)
  assert.ok(ok / n >= 0.7, `aciertos ${ok}/${n}`);
  assert.ok(cruzados / n <= 0.03, `categoría equivocada ${cruzados}/${n}`);
});
