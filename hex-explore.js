/**
 * hex-explore.js — Sistema de exploracion y encuentros para dnd-halo
 *
 * Basado en exploracion-hexes.js (Foundry VTT standalone).
 * Adaptado como script global (no ES module) para integrarse con app.js.
 */

const HexExplore = (() => {

  // --- Mapeo biomas SVG (FMG) -> biomas de encuentros ---
  const BIOME_MAP = {
    'Grassland':                  'grassland',
    'Temperate deciduous forest': 'forest',
    'Temperate rainforest':       'forest',
    'Tundra':                     'tundra',
    'Taiga':                      'taiga',
    'Wetland':                    'wetland',
    'Hot desert':                 'desert',
    'Cold desert':                'desert',
    'Volcano':                    'volcano',
    'Glacier':                    'glacier',
  };

  // --- Tablas de encuentros ---

  const TABLAS = {
    climaInclemente: [
      "**Lluvia Torrencial**: Desventaja en pruebas de Percepcion (vista) y Supervivencia. Terreno dificil en exteriores.",
      "**Vientos Violentos**: Armas a distancia inefectivas mas alla de 30 pies. Desventaja en tiradas de vuelo.",
      "**Niebla Densa**: Visibilidad reducida a 10 pies. Ataques a mas de 10 pies tienen desventaja.",
      "**Frio Cortante**: Sin ropa adecuada, CON save DC 12 cada hora o +1 nivel de agotamiento.",
      "**Calor Abrumador**: CON save DC 12 cada hora o desventaja en todas las tiradas fisicas hasta descansar.",
      "**Tormenta con Relampagos**: 10% por hora de que un rayo caiga en el area (4d6 lightning damage, DEX save DC 14).",
    ],

    encuentrosSociales: [
      "Comerciante errante - Alquimista",
      "Comerciante errante - Cazador",
      "Comerciante errante - Comercio General",
      "Comerciante errante - Herrero",
      "Comerciante errante - Libreria",
      "Comerciante errante - Taberna",
      "Comerciante errante - Templo",
      "Comerciante errante - Tienda de Objetos Magicos",
      "Cartografo Exhausto",
      "Recaudador de Impuestos Errante",
      "Granja Local",
      "Jugadores Ambulantes",
      "Viajero Errante",
    ],

    encuentrosCombate: {
      desert: [
        "2 Dust Mephits", "1 Giant Lizard + 1 Jackal", "1 Giant Hyena",
        "1 Thri-kreen Scout", "2 Giant Hyenas", "1 Yuan-ti Broodguard",
        "1 Giant Scorpion", "1 Gnoll Hunter + 1 Dust Mephit", "1 Lamia Scout",
        "1 Fire Snake Pack", "1 Wight Caravan Leader", "1 Basilisk",
        "1 Salamander Outrider", "2 Thri-kreen Scouts", "1 Mummy Guard",
      ],
      forest: [
        "2 Twig Blights", "1 Giant Weasel", "1 Sprite + 1 Giant Wolf Spider",
        "1 Dryad", "1 Giant Owl + 1 Twig Blight", "2 Needle Blights",
        "1 Owlbear Cub", "1 Vine Blight + 1 Twig Blight", "1 Ettercap",
        "1 Green Hag (disguised)", "1 Giant Ape Scout", "1 Swarm of Wasps",
        "1 Treant Sapling", "1 Shadow Mastiff Pack", "1 Assassin Vine",
      ],
      glacier: [
        "1 Ice Mephit", "2 Snowy Owls", "1 Winter Wolf Cub",
        "1 Harpy + 1 Snowy Owl", "2 Ice Mephits", "1 Snow Leopard",
        "1 Remorhaz Hatchling", "1 White Dragon Wyrmling", "1 Yeti",
        "1 Ice Troll Scout", "1 Frost Giant Youth", "1 Winter Wolf",
        "1 Ice Elemental", "2 Snow Leopards + 1 Harpy",
      ],
      grassland: [
        "2 Blood Hawks", "3 Twig Blights", "1 Cockatrice",
        "2 Gnoll Witherlings", "1 Gnoll Scout", "2 Cockatrices",
        "1 Giant Boar", "1 Gnoll Hunter", "1 Centaur",
        "2 Gnoll Hunters", "1 Gnoll Flesh Gnawer", "1 Centaur Warden",
        "1 Gnoll Pack Lord", "1 Cyclops Oracle",
      ],
      taiga: [
        "1 Giant Weasel", "2 Twig Blights", "1 Dryad",
        "2 Giant Owls", "1 Owlbear Cub", "2 Needle Blights",
        "1 Bugbear", "1 Myconid Adult", "1 Centaur",
        "1 Gnoll Hunter + 1 Bugbear", "1 Treant Sapling", "1 Green Hag",
        "1 Owlbear", "1 Centaur Warden", "1 Gnoll Pack Lord + 1 Bugbear",
      ],
      tundra: [
        "2 Goats", "1 Ice Mephit + 1 Snowy Owl", "1 Bandit Captain",
        "1 Harpy", "1 Winter Wolf Cub", "2 Snow Leopards",
        "1 Yeti", "1 Giant Eagle Mount", "1 Ice Troll Scout",
        "1 Chimera Fragment", "1 Stone Giant Messenger", "1 Roc Juvenile",
        "1 Winter Wolf Cub + 2 Goats", "1 Stone Giant + 1 Gargoyle",
      ],
      volcano: [
        "2 Fire Mephits", "1 Fire Snake", "1 Azer Scout",
        "1 Ember Hulkling", "1 Salamander Spawnling", "1 Hell Hound",
        "1 Ember Wight", "2 Fire Snakes", "1 Salamander Outrider",
        "1 Efreeti Minion", "1 Young Red Dragon Wyrmling", "1 Fire Elemental",
        "1 Salamander", "1 Magma Giant Scout",
      ],
      wetland: [
        "2 Giant Frogs", "1 Mud Mephit + 1 Swarm of Insects",
        "1 Will-o'-Wisp", "1 Giant Toad", "1 Boggard Brute",
        "1 Yuan-ti Pureblood", "1 Lizardfolk Shaman", "1 Swamp Hag",
        "1 Giant Crocodile", "1 Black Dragon Wyrmling", "2 Will-o'-Wisps",
        "1 Hydra Spawnling", "1 Ancient Leech Swarm",
      ],
    },
  };

  // --- Utilidades ---

  function roll(sides) {
    return Math.floor(Math.random() * sides) + 1;
  }

  function elegirAleatorio(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Convierte nombre de bioma SVG a clave de encuentros.
   */
  function svgBiomeToKey(svgBiome) {
    return BIOME_MAP[svgBiome] || null;
  }

  /**
   * Ejecuta una tirada de exploracion de hex.
   * @param {string|null} svgBiome - Nombre del bioma del SVG (ej: 'Grassland')
   * @returns {{ roll, tipo, resultado, bioma }}
   */
  function explorar(svgBiome) {
    const tirada = roll(100);
    const biomeKey = svgBiomeToKey(svgBiome);

    if (tirada <= 60) {
      return { roll: tirada, tipo: 'nada', resultado: null, bioma: biomeKey };
    }
    if (tirada <= 80) {
      return { roll: tirada, tipo: 'clima', resultado: elegirAleatorio(TABLAS.climaInclemente), bioma: biomeKey };
    }
    if (tirada <= 90) {
      return { roll: tirada, tipo: 'social', resultado: elegirAleatorio(TABLAS.encuentrosSociales), bioma: biomeKey };
    }
    // Combate (91-100)
    if (biomeKey && TABLAS.encuentrosCombate[biomeKey]) {
      return { roll: tirada, tipo: 'combate', resultado: elegirAleatorio(TABLAS.encuentrosCombate[biomeKey]), bioma: biomeKey };
    }
    return { roll: tirada, tipo: 'combate', resultado: 'Encuentro de combate (bioma desconocido)', bioma: null };
  }

  // --- Multiplicadores de velocidad por bioma ---
  const BIOME_SPEED_MULT = {
    'Grassland':                  1,
    'Temperate deciduous forest': 1.5,
    'Temperate rainforest':       1.5,
    'Tundra':                     1.5,
    'Taiga':                      1.5,
    'Wetland':                    2,
    'Hot desert':                 2,
    'Cold desert':                1.5,
    'Volcano':                    2,
    'Glacier':                    2,
  };

  const HEX_DISTANCE = 24; // millas por hex
  const DEFAULT_SPEED = 24; // millas por dia (a pie, velocidad normal)

  /**
   * Calcula el tiempo de viaje para un hex.
   * @param {string} svgBiome - Nombre del bioma SVG
   * @param {number} speed - Velocidad en millas/dia
   * @returns {{ days: number, hours: number, multiplier: number }}
   */
  function travelTime(svgBiome, speed) {
    const mult = BIOME_SPEED_MULT[svgBiome] || 1;
    const effectiveSpeed = speed || DEFAULT_SPEED;
    const days = (HEX_DISTANCE / effectiveSpeed) * mult;
    const fullDays = Math.floor(days);
    const hours = Math.round((days - fullDays) * 24);
    return { days, fullDays, hours, multiplier: mult };
  }

  /**
   * Formatea el tiempo de viaje a texto legible.
   */
  function formatTravelTime(tt) {
    if (tt.days <= 0) return 'instantáneo';
    if (tt.fullDays === 0) return `${tt.hours}h`;
    if (tt.hours === 0) return `${tt.fullDays} día${tt.fullDays > 1 ? 's' : ''}`;
    return `${tt.fullDays}d ${tt.hours}h`;
  }

  return {
    BIOME_MAP,
    BIOME_SPEED_MULT,
    HEX_DISTANCE,
    DEFAULT_SPEED,
    TABLAS,
    explorar,
    svgBiomeToKey,
    travelTime,
    formatTravelTime,
  };
})();
