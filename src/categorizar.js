// Deduce la categoría por palabras del título, para fuentes que no la traen (canales de Telegram).
// Las reglas van de lo más concreto a lo más general: la primera que encaja gana.
// Medido contra 495 títulos reales de Chollometro (donde la categoría se conoce): ver test.
// Trampas conocidas: "reloj inteligente" es tecnología pero "reloj Casio" es moda; "secador" es
// belleza pero "secadora" es hogar; "auriculares gaming" es tecnología pero "mando PS5" es
// videojuegos; "zapatillas color crema" es moda, no cosmética; "LEGO cámara" es un juguete.

// Límites de palabra que entienden tildes: con \b, "sofá" o "café" nunca encajaban
const R = (s) => new RegExp(String.raw`(?<![\p{L}\p{N}])(` + s + String.raw`)(?![\p{L}\p{N}])`, 'iu');

const REGLAS = [
  // Juguetes antes que nada: "LEGO … cámara", "Playmobil barco con cañones móviles"
  ['otros', R(`lego|playmobil|juguetes?|teledirigid[oa]|peluches?|mu[nñ]ecas?|puzzles?|juegos? de mesa|hot wheels|barbie|funko|nerf|pa[nñ]ales|carrito de beb[eé]|silla de coche|chupetes?`)],

  // Ropa y calzado inequívocos (antes que belleza: "zapatillas crema")
  ['moda', R(`zapatillas?|sneakers?|deportivas|botas|botines|sandalias|chanclas|zapatos?|mocasines|trainers|camisetas?|t-?shirts?|camisas?|sudaderas?|hoodie|jerseys?|pullover|cardigan|rebeca|chaquetas?|jacket|abrigos?|parkas?|plum[ií]feros?|chalecos?|cazadoras?|bomber|blazer|americanas?|chubasquero|impermeable|cortavientos|forro polar|pantal[oó]n(es)?|vaqueros|jeans|chinos|leggings|mallas|ch[aá]ndal|shorts?|bermudas|vestidos?|faldas?|pijamas?|calcetines|calzoncillos|b[oó]xers?|sujetador|bikini|ba[nñ]ador`)],

  // Periféricos "gaming" (auriculares, ratón, monitor…) son tecnología aunque digan PS5 o Xbox
  ['tecnologia', R(`auriculares|headset|cascos (gaming|inal[aá]mbricos|bluetooth|over-ear|con micro)|rat[oó]n|teclado|monitor|webcam|micr[oó]fono|alfombrilla|silla gaming|fundas?|carcasas?|protector de pantalla|cristal templado para`)],

  // Videojuegos (desactivados por defecto, pero hay que reconocerlos para descartarlos)
  ['videojuegos', R(`ps[45]|playstation|xbox|nintendo|switch 2|switch oled|(edition|edici[oó]n|code in a box|juego)\s+(para\s+)?switch|switch\s+-|steam deck|videojuegos?|juegos? (de|para) (pc|ps[45]|xbox|switch)|mandos?( inal[aá]mbricos?)? (ps[45]|xbox|switch|8bitdo|pro|dualsense)|dualsense|consolas?|amiibo|juegos? pc|pc steam`)],

  // Herramientas y bricolaje antes que tecnología ("taladro con batería y cargador")
  ['hogar', R(`taladros?|atornillador|destornilladores?|amoladora|radial|sierras?|lijadora|cepilladora|soldador|multiherramienta|herramientas?|malet[ií]n|caja de herramientas|llaves? (de vaso|allen|inglesa)|escalera|regletas?|alargadera|bricolaje|jard[ií]n|cortac[eé]sped|desbrozadora|manguera|motosierra|hidrolimpiadora|ventilador|fan|calculadora`)],

  // Tecnología
  ['tecnologia', R(`smartwatch|reloj(es)? inteligentes?|smartband|pulsera (de actividad|inteligente)|apple watch|galaxy watch|watch gt|watch fit|amazfit|garmin|fitbit|airpods|galaxy buds|redmi buds|earbuds|altavoz|altavoces|barra de sonido|soundbar|televisor|smart ?tv|oled|qled|port[aá]til|laptop|ordenador|sobremesa|mini ?pc|tablet|ipad|iphone|smartphone|m[oó]vil(es)?|galaxy [asz]\d+\w*|redmi|poco [fmx]\d|pixel \d|oneplus|realme|honor magic|motorola|kindle|e-?reader|echo (dot|show|pop)|alexa|fire tv|chromecast|google tv|router|repetidor|wifi|mesh|nas|ssd|nvme|disco duro|pendrive|memoria usb|microsd|tarjeta (de memoria|sd|gr[aá]fica)|rtx \d+|radeon|procesador|ryzen|intel core|placa base|fuente( de alimentaci[oó]n)?|ram ddr\d|ddr[45]|caja pc|semitorre|torre (pc|gaming|atx)|rack|webcam|c[aá]maras? (de fotos|deportivas?|instant[aá]neas?|de vigilancia|ip|de seguridad)|gopro|dji|drones?|proyector|impresora|impresi[oó]n 3d|cargador|powerbank|bater[ií]a externa|hub usb|cables? (usb|hdmi|de red)|usb-c|hdmi|adaptador (usb|hdmi|wifi|bluetooth)|enchufe inteligente|bombilla inteligente|transmisor|tocadiscos|pilas|bater[ií]as (aa|aaa|recargables)|sai|tpv`)],

  // Salud y belleza
  ['belleza', R(`perfumes?|eau de (parfum|toilette|cologne)|edp|edt|colonia|fragancia|cremas?|cream|moisturi[sz]ing|lotion|s[eé]rum|maquillaje|pintalabios|labial|lipstick|m[aá]scara de pesta[nñ]as|r[ií]mel|sombra de ojos|bronceador|bronzer|protector solar|after sun|champ[uú]|acondicionador|mascarilla|gel de (ducha|ba[nñ]o)|desodorante|cepillos? (de dientes|el[eé]ctricos?|dental(es)?|para el pelo|de pelo)|esparadrapo|tiritas|botiqu[ií]n|oral-?b|sonicare|irrigador|dent[ií]frico|pasta de dientes|enjuague|listerine|afeitadora|maquinilla|recortadora|depiladora|ipl|secador( de pelo)?|plancha de pelo|rizador|moldeador|cosm[eé]tica|limpiador facial|t[oó]nico|loci[oó]n|manicura|esmalte|tinte|parches|granos|acn[eé]|vitaminas?|suplementos?|col[aá]geno|magnesio|tensi[oó]metro|nebulizador|inhalador|masajeador|pistola de masaje|cerave|la roche|nivea|l'?or[eé]al|neutrogena|isdin|rimmel|maybelline|catrice|the ordinary|shiseido|lanc[oô]me|clinique|est[eé]e lauder|paco rabanne|rabanne|hugo boss|carolina herrera|dior|chanel|armani|givenchy|jean paul gaultier|jpg|le male|lattafa|eight & bob|elizabeth arden|calvin klein (eternity|ck one)`)],

  // Hogar, electrodomésticos, menaje y oficina
  ['hogar', R(`robot (aspirador|friegasuelos|de cocina)|aspirador(a)?|escoba el[eé]ctrica|friegasuelos|vaporeta|freidora|air ?fryer|microondas|horno|cafetera|m[aá]quina de caf[eé]|caf[eé] espresso|tostadora|hervidor|batidora|licuadora|exprimidor|thermomix|ollas?|sart[eé]n|sartenes|cazo|bater[ií]a de cocina|cuchillos?|vajilla|vasos|tazas?|menaje|tupper|nevera|frigor[ií]fico|congelador|lavadora|secadora|lavavajillas|vitrocer[aá]mica|placa de inducci[oó]n|campana extractora|plancha (de vapor|de ropa)|centro de planchado|calefactor|radiador|estufa|aire acondicionado|deshumidificador|humidificador|purificador|termo el[eé]ctrico|colch[oó]n|almohadas?|n[oó]rdico|edred[oó]n|s[aá]banas|ropa de cama|mantas?|toallas?|cortinas?|visillos|alfombras?|l[aá]mparas?|bombillas?|plaf[oó]n|tira led|muebles?|estanter[ií]a|sillas?|sill[oó]n|sof[aá]|mesas?|escritorio|armario|c[oó]moda|zapatero|organizador|joyero|cubo de basura|salero|pimentero|especiero|espejos?|butacas?|cojines?|percheros?|cerradura|caja fuerte|alarma|timbre|termostato|barbacoa|piscina|rotuladores?|libretas?|cuadernos?|bol[ií]grafos?|cinta adhesiva|papeler[ií]a|oficina|archivador|grapadora|detergente|suavizante|fairy|finish`)],

  // Moda y deporte genéricos (lo último: "reloj", "mochila", "maleta"… son ambiguos)
  ['moda', R(`bolsos?|mochilas?|carteras?|tarjetero|monedero|ri[nñ]onera|maletas?|cintur[oó]n|gorras?|gorros?|bufandas?|guantes|gafas de sol|relojes?|reloj|pulseras?|collar|pendientes|anillos?|joyas?|ropa|nike|adidas|puma|new balance|asics|skechers|reebok|converse|vans|levi'?s|tommy hilfiger|calvin klein|lacoste|the north face|columbia|jack (and|&) jones|only|vero moda|zara|mango|pull ?& ?bear|bershka|decathlon|quechua|under armour|salomon|hoka|saucony|mizuno|joma|kappa|fila|champion|regatta|mandarina duck|casio|citizen|seiko|orient|tissot|timex|swatch|festina|lotus|fossil|ray-?ban|samsonite|bal[oó]n|raqueta|pala de p[aá]del|esterilla|mancuernas|pesas|bicicleta|patinete|casco|gimnasio|f[uú]tbol|buceo|nataci[oó]n|cron[oó]grafo|bulova|running|trekking|senderismo|camping|tienda de campa[nñ]a|saco de dormir|billar`)],

  // Otros (desactivados por defecto)
  ['otros', R(`billetes? de avi[oó]n|escapadas?|comida|alimentaci[oó]n|aceite de oliva|caf[eé] en grano|cerveza|vino|chocolate|supermercado|neum[aá]ticos?|coche|moto|aceite de motor|libros?|c[oó]mic|novela|cd|vinilo|blu-?ray|dvd|entradas?|viaje|vuelos?|hotel`)],
];

/** Categoría a partir del título; "otros" si no encaja ninguna regla. */
export function categorizarPorTitulo(titulo) {
  const t = String(titulo ?? '').replace(/\s+/g, ' '); // también espacios raros (NBSP)
  for (const [categoria, re] of REGLAS) if (re.test(t)) return categoria;
  return 'otros';
}
