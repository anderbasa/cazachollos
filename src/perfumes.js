// Detecta perfumes en el título y su tipo: diseñador, nicho o árabe.
// Un perfume se reconoce por palabras inequívocas (perfume, eau de parfum, EDP, EDT, parfum, colonia…)
// o por una marca de perfumes junto a un tamaño en ml ("Lattafa Asad 100ml").
// Lo que huele pero no es perfume (ambientador, after shave, gel, desodorante…) no cuenta, salvo
// que también diga EDP/EDT/perfume (estuches: "Le Male EDT + gel de ducha").

const L = (s) => new RegExp(String.raw`(?<![\p{L}\p{N}])(` + s + String.raw`)(?![\p{L}\p{N}])`, 'iu');

const FUERTE = L(`perfumes?|eau de (parfum|toilette|cologne)|edp|edt|extrait( de parfum)?|parfum|agua de colonia|colonias?|agua fresca|body mist|bruma corporal`);
const DEBIL = L(`fragancias?`);
const NO_ES = L(`ambientador(es)?|difusor(es)?|mikados?|velas?|inciensos?|detergentes?|suavizantes?|desodorantes?|gel(es)?( de (ducha|ba[nñ]o))?|champ[uú]s?|jab[oó]n(es)?|cremas?|after ?shaves?|b[aá]lsamos?|loci[oó]n(es)?|perfumador(es)?|ambientaci[oó]n|wc|coches?|c[aá]psulas|pastillas`);
const SOLO_PERFUME = L(`perfumes?|eau de (parfum|toilette|cologne)|edp|edt|extrait|parfum`);
const ML = /(\d{1,4}(?:[.,]\d)?)\s?ml\b/i;

// Marcas por tipo (las más habituales en las ofertas españolas)
const ARABES = L(`lattafa|armaf|afnan|rasasi|al haramain|ajmal|swiss arabian|french avenue|maison alhambra|fragrance world|rayhaan|paris corner|arabiyat|ard al zaafaran|zimaya|khadlaj|nabeel|asdaaf|al wataniah|emir|riiffs|orientica|alhambra|bharara|club de nuit|khamrah|asad|yara|hawas|odyssey|ana abiyedh|badee al oud|qaed al fursan|fakhar|sabah al ward`);
const NICHO = L(`creed|aventus|maison francis kurkdjian|kurkdjian|mfk|baccarat rouge|byredo|le labo|diptyque|parfums de marly|marly|initio|xerjoff|amouage|nishane|montale|mancera|memo paris|penhaligon'?s|acqua di parma|jo malone|serge lutens|fr[eé]d[eé]ric malle|kilian|by kilian|tiziana terenzi|atelier cologne|juliette has a gun|replica|maison margiela|nasomatto|orto parisi|escentric molecules|molecule 01|ex nihilo|goldfield & banks|eight & bob|carner barcelona|histoires de parfums|l'artisan parfumeur|annick goutal|goutal|clean reserve|zadig|bdk parfums|vilhelm|tom ford private|roja|clive christian|parfums de nicolai|lorenzo villoresi|profumum`);
const DISENADOR = L(`dior|chanel|yves saint laurent|ysl|giorgio armani|armani|emporio armani|paco rabanne|rabanne|jean paul gaultier|gaultier|jpg|carolina herrera|ch men|hugo boss|boss|hugo|versace|dolce (&|y|and) gabbana|d&g|prada|givenchy|lanc[oô]me|calvin klein|ck one|ck be|tommy hilfiger|montblanc|mont blanc|azzaro|narciso rodriguez|valentino|burberry|guerlain|herm[eè]s|tom ford|mugler|thierry mugler|kenzo|issey miyake|davidoff|bvlgari|bulgari|lacoste|viktor (&|and) rolf|jimmy choo|coach|marc jacobs|loewe|chlo[eé]|moschino|rochas|nina ricci|cacharel|adolfo dom[ií]nguez|massimo dutti|zara|elizabeth arden|estee lauder|est[eé]e lauder|clinique|ralph lauren|polo blue|polo red|police|guess|benetton|antonio banderas|banderas|tous|loewe|cartier|bvlgari|salvatore ferragamo|ferragamo|michael kors|abercrombie|hollister|diesel|joop|mercedes-benz|replay|scalpers|desigual|agatha ruiz|amouage`);
// Equivalencias y marcas blancas (Yodeyma, Saphir, Instituto Español…) se quedan en "otros"
const MARCAS = new RegExp([ARABES.source, NICHO.source, DISENADOR.source].join('|'), 'iu');

/** ¿Es un perfume? */
export function esPerfume(titulo) {
  const t = String(titulo ?? '').replace(/\s+/g, ' ');
  if (NO_ES.test(t) && !SOLO_PERFUME.test(t)) return false;
  if (FUERTE.test(t)) return true;
  const tieneMl = ML.test(t);
  if (DEBIL.test(t) && (tieneMl || MARCAS.test(t))) return true;
  return tieneMl && MARCAS.test(t);
}

/** Tipo de perfume: 'arabe' | 'nicho' | 'disenador' | 'otro'. Árabe y nicho antes que diseñador. */
export function tipoPerfume(titulo) {
  const t = String(titulo ?? '').replace(/\s+/g, ' ');
  if (ARABES.test(t)) return 'arabe';
  if (NICHO.test(t)) return 'nicho';
  if (DISENADOR.test(t)) return 'disenador';
  return 'otro';
}

/** Mililitros del frasco ("100ml", "125 ML", "7,5 ml"), o null. */
export function mililitros(titulo) {
  const m = String(titulo ?? '').match(ML);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  return n >= 5 && n <= 1000 ? n : null;
}

/** Etiquetas para un perfume: PERFUME + PERFUME_<TIPO>. Vacío si no es perfume. */
export function etiquetasPerfume(titulo) {
  if (!esPerfume(titulo)) return [];
  return ['PERFUME', `PERFUME_${tipoPerfume(titulo).toUpperCase()}`];
}
