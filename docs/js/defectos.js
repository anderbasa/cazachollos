// GENERADO por "npm run web:defectos" a partir de config.yml. No lo edites a mano.
export const UMBRALES = {
  "categorias_activas": [
    "moda",
    "tecnologia",
    "hogar",
    "belleza"
  ],
  "solo_productos_fisicos": true,
  "excluir_recopilaciones": true,
  "bonus_editores": 10,
  "web": {
    "tecnologia": 40,
    "videojuegos": 50,
    "hogar": 40,
    "moda": 50,
    "belleza": 50,
    "otros": 50
  },
  "web_temperatura_minima": 300,
  "aviso": {
    "tecnologia": 50,
    "videojuegos": 50,
    "hogar": 50,
    "moda": 50,
    "belleza": 50,
    "otros": 50
  },
  "votos": {
    "temperatura": 300,
    "velocidad": 10,
    "velocidad_temperatura_minima": 100,
    "minutos_minimos": 10
  },
  "siempre": {
    "error_de_precio": true,
    "gratis": true,
    "juegos_gratis": true,
    "temperatura_rapida": [
      {
        "grados": 1000,
        "minutos": 120
      },
      {
        "grados": 300,
        "minutos": 30
      }
    ]
  },
  "nunca": {
    "precio_original_minimo": 15,
    "locales": true
  },
  "avisos": {
    "max_por_ejecucion": 10,
    "max_por_dia": 40,
    "rebaja_minima_pct": 5,
    "rebaja_espera_horas": 3,
    "max_por_chollo": 3
  },
  "silencio": {
    "activo": false,
    "desde": "23:00",
    "hasta": "08:00"
  },
  "juegos": {
    "plataformas": [
      "steam",
      "epic-games-store",
      "gog"
    ],
    "avisar_tipos": [
      "game"
    ],
    "web_tipos": [
      "game",
      "loot",
      "beta"
    ]
  }
};

export const CATEGORIAS = {
  "tecnologia": "Tecnología e informática",
  "videojuegos": "Videojuegos y juegos gratis",
  "hogar": "Hogar, electrodomésticos y bricolaje",
  "moda": "Moda y deporte",
  "belleza": "Salud y belleza",
  "otros": "Otros"
};

export const FUENTES = {
  "chollometro": "Chollometro",
  "telegram": "Telegram",
  "gamerpower": "GamerPower",
  "busqueda": "Búsqueda web"
};
