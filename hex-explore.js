/**
 * hex-explore.js — Sistema de exploracion y encuentros para dnd-halo
 *
 * Encuentros aleatorios escalados por Tier of Play (D&D 5e DMG).
 * Monstruos de combate se obtienen de DATA.monstruos (Supabase),
 * con fallback a tablas hardcodeadas si no hay datos.
 */

const HexExplore = (() => {

  // =====================================================================
  // MAPEO BIOMAS SVG -> ENTORNO SUPABASE
  // =====================================================================

  // Bioma SVG (FMG) -> entornos que se buscan en la columna `entorno` de monstruos
  const BIOME_TO_ENV = {
    'Grassland':                  ['Grassland'],
    'Temperate deciduous forest': ['Forest'],
    'Temperate rainforest':       ['Forest'],
    'Tundra':                     ['Hill', 'Arctic'],
    'Taiga':                      ['Forest', 'Hill'],
    'Wetland':                    ['Swamp'],
    'Hot desert':                 ['Desert'],
    'Cold desert':                ['Desert', 'Arctic'],
    'Volcano':                    ['Mountain'],
    'Glacier':                    ['Arctic'],
  };

  // =====================================================================
  // RANGOS DE CR POR TIER
  // =====================================================================

  const TIER_CR = [
    { min: 0,  max: 2,  bossMax: 4  },   // Tier 1
    { min: 2,  max: 7,  bossMax: 10 },   // Tier 2
    { min: 6,  max: 14, bossMax: 17 },   // Tier 3
    { min: 12, max: 21, bossMax: 30 },   // Tier 4
  ];

  // =====================================================================
  // TABLAS DE PROBABILIDAD POR TIER (d100)
  // =====================================================================

  const TIER_TABLES = [
    // Tier 1 — Civilizado
    { nada: 50, clima: 20, social: 15, señal: 7, combate: 8 },
    // Tier 2 — Frontera
    { nada: 35, clima: 20, social: 15, señal: 10, combate: 20 },
    // Tier 3 — Tierra salvaje
    { nada: 20, clima: 20, social: 10, señal: 15, combate: 35 },
    // Tier 4 — Territorio prohibido
    { nada: 10, clima: 15, social: 5, señal: 15, combate: 55 },
  ];

  // =====================================================================
  // TABLAS DE CONTENIDO (clima, social, señales)
  // =====================================================================

  const TABLAS = {
    clima: [
      "**Lluvia Torrencial**: Desventaja en pruebas de Percepcion (vista) y Supervivencia. Terreno dificil en exteriores.",
      "**Vientos Violentos**: Armas a distancia inefectivas mas alla de 30 pies. Desventaja en tiradas de vuelo.",
      "**Niebla Densa**: Visibilidad reducida a 10 pies. Ataques a mas de 10 pies tienen desventaja.",
      "**Frio Cortante**: Sin ropa adecuada, CON save DC 12 cada hora o +1 nivel de agotamiento.",
      "**Calor Abrumador**: CON save DC 12 cada hora o desventaja en todas las tiradas fisicas hasta descansar.",
      "**Tormenta con Relampagos**: 10% por hora de que un rayo caiga en el area (4d6 lightning damage, DEX save DC 14).",
    ],

    social: {
      // Tier 1-2: encuentros sociales comunes
      low: [
        "Comerciante errante — Alquimista",
        "Comerciante errante — Cazador",
        "Comerciante errante — Comercio General",
        "Comerciante errante — Herrero",
        "Comerciante errante — Libreria",
        "Comerciante errante — Taberna ambulante",
        "Comerciante errante — Templo itinerante",
        "Cartografo exhausto buscando indicaciones",
        "Recaudador de impuestos errante con escolta",
        "Granja local — campesinos pidiendo ayuda",
        "Jugadores ambulantes montando espectaculo",
        "Viajero errante con rumores de la region",
        "Caravana de refugiados huyendo de algo",
        "Patrulla de la guardia local en ronda",
        "Peregrinos camino a un templo lejano",
      ],
      // Tier 3-4: encuentros sociales raros y poderosos
      high: [
        "Aventureros rivales buscando el mismo objetivo",
        "Emisario de un señor de la guerra con propuesta",
        "Druida antiguo que ofrece una vision a cambio de un favor",
        "Espiritu atrapado que suplica ser liberado",
        "Mercader extraplanar con articulos imposibles",
        "Grupo de cazadores de monstruos rastreando algo enorme",
        "Hechicero ermitaño que advierte de un peligro inminente",
        "Mensajero herido con informacion critica",
      ],
    },

    señal: {
      // Señales genéricas por tier
      low: [
        "Huellas enormes frescas en el barro",
        "Arboles con marcas de garras a gran altura",
        "Restos de una fogata reciente — alguien acampo aqui",
        "Cadaver de un animal grande, parcialmente devorado",
        "Olor fuerte a azufre en el aire",
        "Ruidos distantes: aullidos, gruñidos o algo arrastrándose",
        "Tela de araña gigante entre los arboles",
        "Huesos viejos esparcidos por el suelo",
        "Marcas de batalla recientes: flechas, sangre seca",
        "Zona de vegetacion muerta en circulo perfecto",
      ],
      high: [
        "El suelo tiembla ritmicamente — algo ENORME se mueve bajo tierra",
        "Cielo oscurecido por la sombra de una criatura voladora colosal",
        "Runas arcanas talladas en las rocas, aun brillando debilmente",
        "Zona donde la magia no funciona — campo antimagia residual",
        "Cadaveres de criaturas poderosas, derrotadas por algo aun peor",
        "Portal inestable que parpadea entre este plano y otro",
        "Obelisco antiguo que emite un zumbido ensordecedor",
        "Niebla con forma que susurra nombres de los aventureros",
      ],
    },
  };

  // =====================================================================
  // COMPOSICION DE ENCUENTROS DE COMBATE
  // =====================================================================

  // Plantillas de composicion por tier
  const COMBAT_TEMPLATES = [
    // Tier 1 — grupos de debiles o 1 criatura media
    [
      { label: '{n} {name}',             count: () => roll(4) + 1, crKey: 'low'  },
      { label: '1 {name}',               count: () => 1,           crKey: 'mid'  },
      { label: '{n} {name}',             count: () => roll(3) + 1, crKey: 'mid'  },
    ],
    // Tier 2 — jefe + minions o grupo medio
    [
      { label: '1 {name} + {n} {minion}', count: () => 1,           crKey: 'high', minions: true },
      { label: '{n} {name}',              count: () => roll(4) + 1, crKey: 'mid'  },
      { label: '1 {name}',                count: () => 1,           crKey: 'high' },
    ],
    // Tier 3 — solo fuerte o jefe + lugartenientes
    [
      { label: '1 {name}',                count: () => 1,           crKey: 'high' },
      { label: '1 {name} + {n} {minion}', count: () => 1,           crKey: 'high', minions: true },
      { label: '{n} {name}',              count: () => roll(2),     crKey: 'mid'  },
    ],
    // Tier 4 — legendario o multi-boss
    [
      { label: '1 {name}',                count: () => 1,           crKey: 'boss' },
      { label: '1 {name} + {n} {minion}', count: () => 1,           crKey: 'boss', minions: true },
      { label: '{n} {name}',              count: () => roll(2),     crKey: 'high' },
    ],
  ];

  // =====================================================================
  // FALLBACK — Tablas hardcodeadas (si DATA.monstruos no esta disponible)
  // =====================================================================

  const FALLBACK_COMBAT = {
    desert: [
      "2 Dust Mephits", "1 Giant Lizard + 1 Jackal", "1 Giant Hyena",
      "1 Giant Scorpion", "1 Basilisk", "1 Mummy Guard",
    ],
    forest: [
      "2 Twig Blights", "1 Giant Wolf Spider", "1 Dryad",
      "1 Owlbear Cub", "1 Ettercap", "1 Green Hag (disguised)",
    ],
    glacier: [
      "1 Ice Mephit", "1 Winter Wolf Cub", "1 Yeti",
      "1 Remorhaz Hatchling", "1 White Dragon Wyrmling",
    ],
    grassland: [
      "2 Blood Hawks", "1 Cockatrice", "1 Gnoll Scout",
      "1 Giant Boar", "1 Centaur",
    ],
    taiga: [
      "1 Giant Weasel", "1 Dryad", "1 Bugbear",
      "1 Owlbear", "1 Green Hag",
    ],
    tundra: [
      "1 Ice Mephit", "1 Harpy", "1 Winter Wolf Cub",
      "1 Yeti", "1 Ice Troll Scout",
    ],
    volcano: [
      "2 Fire Mephits", "1 Fire Snake", "1 Hell Hound",
      "1 Salamander", "1 Fire Elemental",
    ],
    wetland: [
      "2 Giant Frogs", "1 Will-o'-Wisp", "1 Giant Crocodile",
      "1 Lizardfolk Shaman", "1 Black Dragon Wyrmling",
    ],
  };

  // Mapeo biomas SVG -> clave fallback
  const BIOME_FALLBACK_MAP = {
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

  // =====================================================================
  // UTILIDADES
  // =====================================================================

  function roll(sides) {
    return Math.floor(Math.random() * sides) + 1;
  }

  function pick(arr) {
    if (!arr || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * Parsea el CR de texto a numero.
   * "5 (XP 1,800; PB +3)" -> 5
   * "1/4 (XP 50; PB +2)" -> 0.25
   */
  function parseCR(crText) {
    if (!crText) return null;
    const raw = crText.split(' ')[0].split('(')[0].trim();
    if (raw === '1/8') return 0.125;
    if (raw === '1/4') return 0.25;
    if (raw === '1/2') return 0.5;
    const n = parseFloat(raw);
    return isNaN(n) ? null : n;
  }

  /**
   * Filtra monstruos de DATA.monstruos por bioma SVG y rango de CR.
   */
  function filterMonsters(svgBiome, crMin, crMax) {
    if (typeof DATA === 'undefined' || !DATA.monstruos || DATA.monstruos.length === 0) return [];

    const envKeys = BIOME_TO_ENV[svgBiome] || [];

    return DATA.monstruos.filter(m => {
      const cr = parseCR(m.cr);
      if (cr === null) return false;
      if (cr < crMin || cr > crMax) return false;

      // Entorno "Any" siempre aplica
      const entorno = m.entorno || '';
      if (entorno === 'Any') return true;

      // Verificar si alguno de los entornos del bioma aparece en el campo
      return envKeys.some(env => entorno.includes(env));
    });
  }

  // =====================================================================
  // GENERADOR DE ENCUENTROS DE COMBATE
  // =====================================================================

  /**
   * Genera un encuentro de combate basado en el tier y bioma.
   * @param {number} tierIdx - Indice del tier (0-3)
   * @param {string} svgBiome - Bioma del SVG
   * @returns {string} Descripcion del encuentro
   */
  function generateCombat(tierIdx, svgBiome) {
    const crRange = TIER_CR[tierIdx];
    const templates = COMBAT_TEMPLATES[tierIdx];
    const template = pick(templates);

    // Rangos de CR segun la clave del template
    const crRanges = {
      low:  { min: crRange.min,                         max: Math.max(crRange.min, crRange.max * 0.3) },
      mid:  { min: crRange.min + (crRange.max - crRange.min) * 0.2, max: crRange.max * 0.7 },
      high: { min: crRange.max * 0.5,                   max: crRange.max },
      boss: { min: crRange.max * 0.7,                   max: crRange.bossMax },
    };

    const range = crRanges[template.crKey];
    const candidates = filterMonsters(svgBiome, range.min, range.max);

    if (candidates.length === 0) {
      // Fallback a tablas hardcodeadas
      const fallbackKey = BIOME_FALLBACK_MAP[svgBiome];
      const fallbackList = fallbackKey && FALLBACK_COMBAT[fallbackKey];
      return fallbackList ? pick(fallbackList) : 'Encuentro de combate (bioma desconocido)';
    }

    const main = pick(candidates);
    const n = template.count();
    let result = template.label
      .replace('{n}', n)
      .replace('{name}', main.nombre);

    // Si tiene minions, buscar criaturas de CR mas bajo
    if (template.minions) {
      const minionRange = crRanges.low || { min: 0, max: crRange.max * 0.25 };
      const minionCandidates = filterMonsters(svgBiome, minionRange.min, minionRange.max);
      if (minionCandidates.length > 0) {
        const minion = pick(minionCandidates);
        const minionCount = roll(3) + 1;
        result = result
          .replace('{n}', minionCount)
          .replace('{minion}', minion.nombre);
      } else {
        result = result.replace(' + {n} {minion}', '');
      }
    }

    // Agregar CR entre parentesis para referencia del DM
    const mainCR = parseCR(main.cr);
    result += ` (CR ${mainCR})`;

    return result;
  }

  // =====================================================================
  // API PRINCIPAL
  // =====================================================================

  /**
   * Ejecuta una tirada de exploracion de hex.
   * @param {string|null} svgBiome - Nombre del bioma del SVG
   * @param {number} tierIdx - Indice del tier (0-3). Default 0.
   * @returns {{ roll, tipo, resultado, bioma, tier }}
   */
  function explorar(svgBiome, tierIdx) {
    tierIdx = Math.max(0, Math.min(3, tierIdx || 0));
    const tirada = roll(100);
    const table = TIER_TABLES[tierIdx];

    // Determinar tipo segun rangos acumulativos
    let tipo, resultado;
    const cumNada   = table.nada;
    const cumClima  = cumNada + table.clima;
    const cumSocial = cumClima + table.social;
    const cumSeñal  = cumSocial + table.señal;

    if (tirada <= cumNada) {
      tipo = 'nada';
      resultado = null;
    } else if (tirada <= cumClima) {
      tipo = 'clima';
      resultado = pick(TABLAS.clima);
    } else if (tirada <= cumSocial) {
      tipo = 'social';
      const pool = tierIdx <= 1 ? TABLAS.social.low : TABLAS.social.high;
      resultado = pick(pool);
    } else if (tirada <= cumSeñal) {
      tipo = 'señal';
      const pool = tierIdx <= 1 ? TABLAS.señal.low : TABLAS.señal.high;
      resultado = pick(pool);
    } else {
      tipo = 'combate';
      resultado = generateCombat(tierIdx, svgBiome);
    }

    return { roll: tirada, tipo, resultado, bioma: svgBiome, tier: tierIdx + 1 };
  }

  // =====================================================================
  // VELOCIDAD DE VIAJE (sin cambios)
  // =====================================================================

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

  const HEX_DISTANCE = 24;
  const DEFAULT_SPEED = 24;

  function travelTime(svgBiome, speed) {
    const mult = BIOME_SPEED_MULT[svgBiome] || 1;
    const effectiveSpeed = speed || DEFAULT_SPEED;
    const days = (HEX_DISTANCE / effectiveSpeed) * mult;
    const fullDays = Math.floor(days);
    const hours = Math.round((days - fullDays) * 24);
    return { days, fullDays, hours, multiplier: mult };
  }

  function formatTravelTime(tt) {
    if (tt.days <= 0) return 'instantáneo';
    if (tt.fullDays === 0) return `${tt.hours}h`;
    if (tt.hours === 0) return `${tt.fullDays} día${tt.fullDays > 1 ? 's' : ''}`;
    return `${tt.fullDays}d ${tt.hours}h`;
  }

  // =====================================================================

  return {
    BIOME_TO_ENV,
    TIER_CR,
    TIER_TABLES,
    TABLAS,
    explorar,
    filterMonsters,
    parseCR,
    travelTime,
    formatTravelTime,
    BIOME_SPEED_MULT,
    HEX_DISTANCE,
    DEFAULT_SPEED,
  };
})();
