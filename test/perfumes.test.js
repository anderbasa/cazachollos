import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { cargarConfig, fusionar } from '../src/config.js';
import { crearDeal } from '../src/deal.js';
import { esPerfume, mililitros, tipoPerfume } from '../src/perfumes.js';
import { puntuar } from '../src/scorer.js';
import { parsearListadoHtml } from '../src/sources/chollometro.js';

test('reconoce perfumes de todo tipo (títulos reales de Chollometro)', () => {
  const casos = {
    'JPG Le Male Elixir 125ml EDP + 2 Muestras': 'disenador',
    'Hugo Boss - Hugo Man Eau de Toilette | 200ml': 'disenador',
    'Ralph Lauren Polo Blue Eau de Parfum 75ml.': 'disenador',
    'Adolfo Dominguez Agua Fresca Lima Tonka Colonias para hombres. 200ml.': 'disenador',
    'Cacharel Amor Amor 100 ml.': 'disenador',
    'LATTAFA Asad Eau de Parfum para Hombre - 100ML.': 'arabe',
    'Armaf Club De Nuit Intense EDT para Hombre 105ml': 'arabe',
    'Lattafa Khamrah Qahwa Perfume Unisex 100ml': 'arabe',
    'Eight & Bob Champs de Provence Eau de Parfum 100ml.': 'nicho',
    'Creed Aventus 100 ml': 'nicho',
    'Parfums de Marly Layton EDP 125ml': 'nicho',
    'Perfume 15ml + 5 muestras Yodeyma GRATIS': 'otro',
  };
  for (const [titulo, tipo] of Object.entries(casos)) {
    assert.ok(esPerfume(titulo), titulo);
    assert.equal(tipoPerfume(titulo), tipo, titulo);
  }
});

test('no confunde lo que huele (o es de una marca de perfumes) con un perfume', () => {
  for (const t of [
    'Lauren Ralph Lauren. Vestido largo asimétrico.',
    'Davidoff COOL WATER MAN After Shave ; Con fragancia de notas marinas',
    'Ambientador Air Wick con fragancia de lavanda, 3 recambios',
    'Pack 3 desodorantes Hugo Boss 150ml',
    'PUMA Mochila Individual de fútbol para Hombre',
    'Réplica Visor de Cíclope Marvel Legends X-Men',
    'Gel de ducha Nivea 750ml',
  ])
    assert.ok(!esPerfume(t), t);
  assert.ok(esPerfume('Estuche Le Male EDT 125ml + gel de ducha 75ml'), 'un estuche con EDT sí es perfume');
});

test('mililitros del frasco', () => {
  assert.equal(mililitros('Lattafa Asad 100ML'), 100);
  assert.equal(mililitros('Hugo Man EDT 7,5 ml'), 7.5);
  assert.equal(mililitros('Calvin Klein Ck Be EDT 50ml. (100ml por 16,95)'), 50);
  assert.equal(mililitros('Perfume sin tamaño'), null);
});

test('la página de perfumes de Chollometro se convierte en perfumes etiquetados', () => {
  const config = cargarConfig();
  const deals = parsearListadoHtml(readFileSync(new URL('./fixtures/chollometro/perfumes.html', import.meta.url), 'utf8'), { config, origen: 'perfumes', ahora: Date.parse('2026-11-08T21:00:00Z') });
  assert.equal(deals.length, 30);
  const perfumes = deals.filter((d) => d.etiquetas.includes('PERFUME'));
  assert.ok(perfumes.length >= 24, `perfumes: ${perfumes.length}`);
  assert.ok(perfumes.every((d) => d.etiquetas.some((e) => e.startsWith('PERFUME_'))));
  assert.ok(!deals.find((d) => d.titulo.startsWith('Lauren Ralph Lauren. Vestido')).etiquetas.includes('PERFUME'));
});

test('perfumes: entran en la web desde -30 %, pero avisan como el resto (-50 % y votos)', () => {
  const u = cargarConfig().umbrales;
  const ahora = Date.parse('2026-11-08T21:00:00Z');
  const perfume = (o) =>
    crearDeal({ fuente: 'chollometro', idFuente: 1, titulo: 'Boss The Scent Parfum 100 ml', url: 'https://x.invalid', categoria: 'belleza', precio: 60, precioAnterior: 100, envio: 0, temperatura: 50, publicadoEn: new Date(ahora - 3600_000).toISOString(), verificado: true, fiable: true, etiquetas: ['PERFUME', 'PERFUME_DISENADOR'], ...o });
  const p = (d, uu = u) => puntuar(d, uu, ahora);
  assert.equal(p(perfume()).esChollo, true, '-40 % entra en la web');
  assert.equal(p(perfume({ precio: 75 })).esChollo, false, '-25 % no entra');
  assert.equal(p(perfume({ precio: 75, temperatura: 400 })).esChollo, true, '-25 % muy votado sí entra');
  assert.equal(p(perfume({ temperatura: 400 })).esChollazo, false, '-40 % con votos no avisa (belleza pide -50 %)');
  assert.equal(p(perfume({ precio: 45, temperatura: 400 })).esChollazo, true, '-55 % con votos avisa');
  const sinBelleza = fusionar(u, { categorias_activas: ['moda'] });
  assert.equal(p(perfume(), sinBelleza).esChollo, true, 'la sección de perfumes no depende de la categoría belleza');
  const sinSeccion = fusionar(u, { perfumes: { activa: false } });
  assert.equal(p(perfume(), sinSeccion).esChollo, false, 'sin sección, vuelve a pedir el -50 % de belleza');
});

test('nunca avisa de lo publicado hace más de 48 h (evita avisos en bloque de listados viejos)', () => {
  const u = cargarConfig().umbrales;
  const ahora = Date.parse('2026-11-08T21:00:00Z');
  const deal = (horas) => crearDeal({ fuente: 'chollometro', idFuente: horas, titulo: 'Zapatillas Nike', url: 'https://x.invalid', categoria: 'moda', precio: 30, precioAnterior: 100, envio: 0, temperatura: 900, publicadoEn: new Date(ahora - horas * 3600_000).toISOString(), verificado: true, fiable: true });
  assert.equal(puntuar(deal(47), u, ahora).esChollazo, true);
  const viejo = puntuar(deal(72), u, ahora);
  assert.equal(viejo.esChollazo, false);
  assert.match(viejo.bloqueos.join(), /más de 48 h/);
  assert.equal(viejo.esChollo, true, 'en la web sigue');
});
