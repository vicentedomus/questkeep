/**
 * tiendas.js
 * Módulo standalone de Generación de Tiendas — QuestKeep
 *
 * Replica el comportamiento del macro de Foundry VTT sin dependencias externas.
 *
 * Uso básico:
 *   import { getBurgs, getTiendasDeBurg, generarItems } from './tiendas.js';
 *
 *   const burgs = getBurgs();                          // Lista todos los burgs
 *   const tiendas = getTiendasDeBurg('Evermere');      // Tiendas con magic items
 *   const items = generarItems('Evermere', 'Herrero'); // Genera el inventario
 */

// ─── DATOS DE BURGS ───────────────────────────────────────────────────────────

const BURGS = [
  { burg: "Evermere",      categoria: "macropolis" },
  { burg: "Nudadh",        categoria: "ciudad"     },
  { burg: "Hun",           categoria: "pueblo"     },
  { burg: "Dobsil",        categoria: "pueblo"     },
  { burg: "Xarthar",       categoria: "ciudad"     },
  { burg: "Moria",         categoria: "macropolis" },
  { burg: "Rockwood",      categoria: "macropolis" },
  { burg: "Duskairn",      categoria: "macropolis" },
  { burg: "Khaz-Alcity",   categoria: "macropolis" },
  { burg: "Olarvale",      categoria: "ciudad"     },
  { burg: "Nyfasemel",     categoria: "ciudad"     },
  { burg: "Batan",         categoria: "pueblo"     },
  { burg: "Sleh",          categoria: "pueblo"     },
  { burg: "Selunevile",    categoria: "pueblo"     },
  { burg: "Mylathlin",     categoria: "pueblo"     },
  { burg: "Shimber",       categoria: "pueblo"     },
  { burg: "Bahía Tormenta",categoria: "pueblo"     },
  { burg: "Ravenwood",     categoria: "aldea"      },
  { burg: "Oasis",         categoria: "pueblo"     },
  { burg: "Ashenport",     categoria: "pueblo"     },
  { burg: "Witham",        categoria: "pueblo"     },
  { burg: "Walworth",      categoria: "pueblo"     },
  { burg: "Sherston",      categoria: "pueblo"     },
  { burg: "Felmeley",      categoria: "pueblo"     },
  { burg: "Kindaraba",     categoria: "ciudad"     },
  { burg: "Buru",          categoria: "pueblo"     },
  { burg: "Driz",          categoria: "pueblo"     },
  { burg: "Thres",         categoria: "aldea"      },
  { burg: "Gobok",         categoria: "pueblo"     },
  { burg: "Aghaz",         categoria: "pueblo"     },
  { burg: "Lefran",        categoria: "ciudad"     },
  { burg: "Saikhan",       categoria: "pueblo"     },
  { burg: "Mad'hun",       categoria: "pueblo"     },
  { burg: "Halalmud",      categoria: "pueblo"     },
  { burg: "Dos Ríos",      categoria: "pueblo"     },
  { burg: "Pan",           categoria: "pueblo"     },
];

// ─── ESTABLECIMIENTOS POR BURG ────────────────────────────────────────────────

const ESTABLECIMIENTOS = [
  { burg: "Evermere",       tipo: "Taberna"                },
  { burg: "Evermere",       tipo: "Comercio General"       },
  { burg: "Evermere",       tipo: "Temple"                 },
  { burg: "Evermere",       tipo: "Herrero"                },
  { burg: "Evermere",       tipo: "Alquimista"             },
  { burg: "Evermere",       tipo: "Burdel"                 },
  { burg: "Evermere",       tipo: "Tienda Objetos Mágicos" },
  { burg: "Evermere",       tipo: "Librería"               },
  { burg: "Evermere",       tipo: "Cazador"                },
  { burg: "Evermere",       tipo: "Gremio"                 },
  { burg: "Nudadh",         tipo: "Taberna"                },
  { burg: "Nudadh",         tipo: "Comercio General"       },
  { burg: "Nudadh",         tipo: "Templo"                 },
  { burg: "Nudadh",         tipo: "Herrero"                },
  { burg: "Nudadh",         tipo: "Burdel"                 },
  { burg: "Nudadh",         tipo: "Tienda Objetos Mágicos" },
  { burg: "Nudadh",         tipo: "Librería"               },
  { burg: "Nudadh",         tipo: "Gremio"                 },
  { burg: "Hun",            tipo: "Taberna"                },
  { burg: "Hun",            tipo: "Comercio General"       },
  { burg: "Hun",            tipo: "Burdel"                 },
  { burg: "Hun",            tipo: "Tienda Objetos Mágicos" },
  { burg: "Hun",            tipo: "Gremio"                 },
  { burg: "Dobsil",         tipo: "Taberna"                },
  { burg: "Dobsil",         tipo: "Comercio General"       },
  { burg: "Dobsil",         tipo: "Tienda Objetos Mágicos" },
  { burg: "Dobsil",         tipo: "Cazador"                },
  { burg: "Dobsil",         tipo: "Gremio"                 },
  { burg: "Xarthar",        tipo: "Taberna"                },
  { burg: "Xarthar",        tipo: "Comercio General"       },
  { burg: "Xarthar",        tipo: "Herrero"                },
  { burg: "Xarthar",        tipo: "Tienda Objetos Mágicos" },
  { burg: "Xarthar",        tipo: "Librería"               },
  { burg: "Xarthar",        tipo: "Cazador"                },
  { burg: "Xarthar",        tipo: "Gremio"                 },
  { burg: "Moria",          tipo: "Taberna"                },
  { burg: "Moria",          tipo: "Comercio General"       },
  { burg: "Moria",          tipo: "Templo"                 },
  { burg: "Moria",          tipo: "Herrero"                },
  { burg: "Moria",          tipo: "Alquimista"             },
  { burg: "Moria",          tipo: "Burdel"                 },
  { burg: "Moria",          tipo: "Tienda Objetos Mágicos" },
  { burg: "Moria",          tipo: "Librería"               },
  { burg: "Moria",          tipo: "Cazador"                },
  { burg: "Moria",          tipo: "Gremio"                 },
  { burg: "Rockwood",       tipo: "Taberna"                },
  { burg: "Rockwood",       tipo: "Comercio General"       },
  { burg: "Rockwood",       tipo: "Templo"                 },
  { burg: "Rockwood",       tipo: "Herrero"                },
  { burg: "Rockwood",       tipo: "Alquimista"             },
  { burg: "Rockwood",       tipo: "Burdel"                 },
  { burg: "Rockwood",       tipo: "Tienda Objetos Mágicos" },
  { burg: "Rockwood",       tipo: "Librería"               },
  { burg: "Rockwood",       tipo: "Cazador"                },
  { burg: "Rockwood",       tipo: "Gremio"                 },
  { burg: "Duskairn",       tipo: "Taberna"                },
  { burg: "Duskairn",       tipo: "Comercio General"       },
  { burg: "Duskairn",       tipo: "Templo"                 },
  { burg: "Duskairn",       tipo: "Herrero"                },
  { burg: "Duskairn",       tipo: "Alquimista"             },
  { burg: "Duskairn",       tipo: "Burdel"                 },
  { burg: "Duskairn",       tipo: "Tienda Objetos Mágicos" },
  { burg: "Duskairn",       tipo: "Librería"               },
  { burg: "Duskairn",       tipo: "Cazador"                },
  { burg: "Duskairn",       tipo: "Gremio"                 },
  { burg: "Khaz-Alcity",    tipo: "Taberna"                },
  { burg: "Khaz-Alcity",    tipo: "Comercio General"       },
  { burg: "Khaz-Alcity",    tipo: "Templo"                 },
  { burg: "Khaz-Alcity",    tipo: "Herrero"                },
  { burg: "Khaz-Alcity",    tipo: "Alquimista"             },
  { burg: "Khaz-Alcity",    tipo: "Burdel"                 },
  { burg: "Khaz-Alcity",    tipo: "Tienda Objetos Mágicos" },
  { burg: "Khaz-Alcity",    tipo: "Librería"               },
  { burg: "Khaz-Alcity",    tipo: "Cazador"                },
  { burg: "Khaz-Alcity",    tipo: "Gremio"                 },
  { burg: "Olarvale",       tipo: "Taberna"                },
  { burg: "Olarvale",       tipo: "Comercio General"       },
  { burg: "Olarvale",       tipo: "Templo"                 },
  { burg: "Olarvale",       tipo: "Herrero"                },
  { burg: "Olarvale",       tipo: "Alquimista"             },
  { burg: "Olarvale",       tipo: "Burdel"                 },
  { burg: "Olarvale",       tipo: "Tienda Objetos Mágicos" },
  { burg: "Olarvale",       tipo: "Librería"               },
  { burg: "Olarvale",       tipo: "Cazador"                },
  { burg: "Olarvale",       tipo: "Gremio"                 },
  { burg: "Nyfasemel",      tipo: "Taberna"                },
  { burg: "Nyfasemel",      tipo: "Comercio General"       },
  { burg: "Nyfasemel",      tipo: "Templo"                 },
  { burg: "Nyfasemel",      tipo: "Burdel"                 },
  { burg: "Nyfasemel",      tipo: "Tienda Objetos Mágicos" },
  { burg: "Nyfasemel",      tipo: "Librería"               },
  { burg: "Nyfasemel",      tipo: "Cazador"                },
  { burg: "Nyfasemel",      tipo: "Gremio"                 },
  { burg: "Batan",          tipo: "Taberna"                },
  { burg: "Batan",          tipo: "Comercio General"       },
  { burg: "Batan",          tipo: "Burdel"                 },
  { burg: "Batan",          tipo: "Tienda Objetos Mágicos" },
  { burg: "Batan",          tipo: "Gremio"                 },
  { burg: "Sleh",           tipo: "Taberna"                },
  { burg: "Sleh",           tipo: "Comercio General"       },
  { burg: "Sleh",           tipo: "Templo"                 },
  { burg: "Sleh",           tipo: "Tienda Objetos Mágicos" },
  { burg: "Sleh",           tipo: "Librería"               },
  { burg: "Sleh",           tipo: "Gremio"                 },
  { burg: "Selunevile",     tipo: "Taberna"                },
  { burg: "Selunevile",     tipo: "Comercio General"       },
  { burg: "Selunevile",     tipo: "Templo"                 },
  { burg: "Selunevile",     tipo: "Alquimista"             },
  { burg: "Selunevile",     tipo: "Librería"               },
  { burg: "Selunevile",     tipo: "Cazador"                },
  { burg: "Mylathlin",      tipo: "Taberna"                },
  { burg: "Mylathlin",      tipo: "Comercio General"       },
  { burg: "Mylathlin",      tipo: "Alquimista"             },
  { burg: "Mylathlin",      tipo: "Tienda Objetos Mágicos" },
  { burg: "Mylathlin",      tipo: "Cazador"                },
  { burg: "Shimber",        tipo: "Taberna"                },
  { burg: "Shimber",        tipo: "Comercio General"       },
  { burg: "Shimber",        tipo: "Alquimista"             },
  { burg: "Shimber",        tipo: "Cazador"                },
  { burg: "Shimber",        tipo: "Gremio"                 },
  { burg: "Bahía Tormenta", tipo: "Taberna"                },
  { burg: "Bahía Tormenta", tipo: "Comercio General"       },
  { burg: "Bahía Tormenta", tipo: "Herrero"                },
  { burg: "Bahía Tormenta", tipo: "Alquimista"             },
  { burg: "Bahía Tormenta", tipo: "Gremio"                 },
  { burg: "Ravenwood",      tipo: "Taberna"                },
  { burg: "Ravenwood",      tipo: "Comercio General"       },
  { burg: "Ravenwood",      tipo: "Herrero"                },
  { burg: "Oasis",          tipo: "Taberna"                },
  { burg: "Oasis",          tipo: "Comercio General"       },
  { burg: "Oasis",          tipo: "Templo"                 },
  { burg: "Oasis",          tipo: "Alquimista"             },
  { burg: "Oasis",          tipo: "Librería"               },
  { burg: "Oasis",          tipo: "Cazador"                },
  { burg: "Ashenport",      tipo: "Taberna"                },
  { burg: "Ashenport",      tipo: "Comercio General"       },
  { burg: "Ashenport",      tipo: "Burdel"                 },
  { burg: "Ashenport",      tipo: "Cazador"                },
  { burg: "Ashenport",      tipo: "Gremio"                 },
  { burg: "Witham",         tipo: "Taberna"                },
  { burg: "Witham",         tipo: "Comercio General"       },
  { burg: "Witham",         tipo: "Herrero"                },
  { burg: "Witham",         tipo: "Tienda Objetos Mágicos" },
  { burg: "Witham",         tipo: "Gremio"                 },
  { burg: "Walworth",       tipo: "Taberna"                },
  { burg: "Walworth",       tipo: "Comercio General"       },
  { burg: "Walworth",       tipo: "Herrero"                },
  { burg: "Walworth",       tipo: "Burdel"                 },
  { burg: "Walworth",       tipo: "Tienda Objetos Mágicos" },
  { burg: "Sherston",       tipo: "Taberna"                },
  { burg: "Sherston",       tipo: "Comercio General"       },
  { burg: "Sherston",       tipo: "Alquimista"             },
  { burg: "Sherston",       tipo: "Cazador"                },
  { burg: "Sherston",       tipo: "Gremio"                 },
  { burg: "Felmeley",       tipo: "Taberna"                },
  { burg: "Felmeley",       tipo: "Comercio General"       },
  { burg: "Felmeley",       tipo: "Alquimista"             },
  { burg: "Felmeley",       tipo: "Tienda Objetos Mágicos" },
  { burg: "Felmeley",       tipo: "Gremio"                 },
  { burg: "Kindaraba",      tipo: "Taberna"                },
  { burg: "Kindaraba",      tipo: "Comercio General"       },
  { burg: "Kindaraba",      tipo: "Herrero"                },
  { burg: "Kindaraba",      tipo: "Burdel"                 },
  { burg: "Kindaraba",      tipo: "Tienda Objetos Mágicos" },
  { burg: "Kindaraba",      tipo: "Librería"               },
  { burg: "Kindaraba",      tipo: "Cazador"                },
  { burg: "Buru",           tipo: "Taberna"                },
  { burg: "Buru",           tipo: "Comercio General"       },
  { burg: "Buru",           tipo: "Burdel"                 },
  { burg: "Buru",           tipo: "Librería"               },
  { burg: "Buru",           tipo: "Cazador"                },
  { burg: "Driz",           tipo: "Taberna"                },
  { burg: "Driz",           tipo: "Comercio General"       },
  { burg: "Driz",           tipo: "Alquimista"             },
  { burg: "Driz",           tipo: "Burdel"                 },
  { burg: "Driz",           tipo: "Tienda Objetos Mágicos" },
  { burg: "Thres",          tipo: "Taberna"                },
  { burg: "Thres",          tipo: "Comercio General"       },
  { burg: "Thres",          tipo: "Cazador"                },
  { burg: "Gobok",          tipo: "Taberna"                },
  { burg: "Gobok",          tipo: "Comercio General"       },
  { burg: "Gobok",          tipo: "Alquimista"             },
  { burg: "Gobok",          tipo: "Burdel"                 },
  { burg: "Gobok",          tipo: "Cazador"                },
  { burg: "Aghaz",          tipo: "Taberna"                },
  { burg: "Aghaz",          tipo: "Comercio General"       },
  { burg: "Aghaz",          tipo: "Herrero"                },
  { burg: "Aghaz",          tipo: "Alquimista"             },
  { burg: "Aghaz",          tipo: "Burdel"                 },
  { burg: "Lefran",         tipo: "Taberna"                },
  { burg: "Lefran",         tipo: "Comercio General"       },
  { burg: "Lefran",         tipo: "Herrero"                },
  { burg: "Lefran",         tipo: "Alquimista"             },
  { burg: "Lefran",         tipo: "Burdel"                 },
  { burg: "Lefran",         tipo: "Librería"               },
  { burg: "Lefran",         tipo: "Cazador"                },
  { burg: "Saikhan",        tipo: "Taberna"                },
  { burg: "Saikhan",        tipo: "Comercio General"       },
  { burg: "Saikhan",        tipo: "Librería"               },
  { burg: "Saikhan",        tipo: "Cazador"                },
  { burg: "Saikhan",        tipo: "Gremio"                 },
  { burg: "Mad'hun",        tipo: "Taberna"                },
  { burg: "Mad'hun",        tipo: "Comercio General"       },
  { burg: "Mad'hun",        tipo: "Templo"                 },
  { burg: "Mad'hun",        tipo: "Alquimista"             },
  { burg: "Mad'hun",        tipo: "Librería"               },
  { burg: "Mad'hun",        tipo: "Gremio"                 },
  { burg: "Halalmud",       tipo: "Taberna"                },
  { burg: "Halalmud",       tipo: "Comercio General"       },
  { burg: "Halalmud",       tipo: "Templo"                 },
  { burg: "Halalmud",       tipo: "Alquimista"             },
  { burg: "Halalmud",       tipo: "Burdel"                 },
  { burg: "Halalmud",       tipo: "Tienda Objetos Mágicos" },
  { burg: "Dos Ríos",       tipo: "Taberna"                },
  { burg: "Dos Ríos",       tipo: "Comercio General"       },
  { burg: "Dos Ríos",       tipo: "Herrero"                },
  { burg: "Dos Ríos",       tipo: "Alquimista"             },
  { burg: "Dos Ríos",       tipo: "Gremio"                 },
  { burg: "Pan",            tipo: "Taberna"                },
  { burg: "Pan",            tipo: "Comercio General"       },
  { burg: "Pan",            tipo: "Herrero"                },
  { burg: "Pan",            tipo: "Tienda Objetos Mágicos" },
  { burg: "Pan",            tipo: "Librería"               },
];

// ─── CATEGORÍAS DE ÍTEMS POR TIENDA ──────────────────────────────────────────

const CATEGORIAS_POR_TIENDA = {
  "Alquimista":             ["Potions", "Rings"],
  "Cazador":                ["Weapons", "Potions", "Staves"],
  "Herrero":                ["Weapons", "Armor", "Rods"],
  "Librería":               ["Wondrous Items", "Wands"],
  "Tienda Objetos Mágicos": ["Rings", "Rods", "Staves", "Wands", "Wondrous Items"],
};

// ─── REGLAS POR CATEGORÍA DE BURG ─────────────────────────────────────────────

const REGLAS_POR_CATEGORIA = {
  aldea: {
    cantidad: 1,
    probabilidades: [{ rareza: "Common", peso: 100 }],
    costoMax: 100,
  },
  pueblo: {
    cantidad: 2,
    probabilidades: [{ rareza: "Common", peso: 50 }, { rareza: "Uncommon", peso: 50 }],
    costoMax: 500,
  },
  ciudad: {
    cantidad: 3,
    probabilidades: [{ rareza: "Common", peso: 20 }, { rareza: "Uncommon", peso: 60 }, { rareza: "Rare", peso: 20 }],
    costoMax: 5000,
  },
  macropolis: {
    cantidad: 4,
    probabilidades: [{ rareza: "Uncommon", peso: 60 }, { rareza: "Rare", peso: 30 }, { rareza: "Very Rare", peso: 10 }],
    costoMax: 50000,
  },
};

// ─── PRECIO BASE POR RAREZA ───────────────────────────────────────────────────

const PRECIO_POR_RAREZA = {
  Common:    100,
  Uncommon:  500,
  Rare:      5000,
  "Very Rare": 50000,
};

// ─── TABLAS DE ÍTEMS MÁGICOS ──────────────────────────────────────────────────
// Nota: "Common Rings" y "Common Rods" no existen en las tablas del mundo.
// Si una tirada los requiere, se devuelve null y se informa al llamante.

const TABLAS_ITEMS = {
  "Common Potions":       ["Potion of Climbing", "Potion of Comprehension"],
  "Common Weapons":       ["Moon-Touched Sword", "Silvered Weapon", "Sylvan Talon", "Walloping Ammunition"],
  "Common Armor":         ["Armor of Gleaming", "Cast-Off Armor", "Smoldering Armor", "Shield of Expression"],
  "Common Staves":        ["Staff of Adornment", "Staff of Birdcalls", "Staff of Flowers"],
  "Common Wands":         ["Wand of Conducting", "Wand of Pyrotechnics"],
  "Common Wondrous Items":["Bead of Nourishment", "Boots of False Tracks", "Candle of the Deep", "Clockwork Amulet", "Cloak of Billowing"],

  "Uncommon Potions":       ["Oil of Slipperiness", "Philter of Love", "Potion of Animal Friendship", "Potion of Fire Breath", "Potion of Growth", "Potion of Poison", "Potion of Pugilism", "Potion of Resistance", "Potion of Water Breathing"],
  "Uncommon Rings":         ["Ring of Jumping", "Ring of Mind Shielding", "Ring of Swimming", "Ring of Warmth", "Ring of Water Walking"],
  "Uncommon Weapons":       ["Adamantine Weapon", "Ammunition +1", "Javelin of Lightning", "Sword of Vengeance", "Trident of Fish Command", "Weapon +1", "Weapon of Warning"],
  "Uncommon Armor":         ["Adamantine Armor", "Mariner's Armor", "Mithral Armor", "Shield +1", "Sentinel Shield"],
  "Uncommon Rods":          ["Immovable Rod"],
  "Uncommon Staves":        ["Staff of the Adder", "Staff of the Python"],
  "Uncommon Wands":         ["Wand of Magic Detection", "Wand of Magic Missiles", "Wand of Secrets", "Wand of Web", "Wand of the War Mage +1"],
  "Uncommon Wondrous Items":["Alchemy Jug", "Amulet of Proof Against Detection and Location", "Bag of Holding", "Bag of Tricks", "Boots of Elvenkind"],

  "Rare Potions":       ["Elixir of Health", "Oil of Etherealness", "Potion of Clairvoyance", "Potion of Diminution", "Potion of Gaseous Form", "Potion of Heroism", "Potion of Invisibility", "Potion of Invulnerability", "Potion of Mind Reading"],
  "Rare Rings":         ["Ring of Animal Influence", "Ring of Evasion", "Ring of Feather Falling", "Ring of Free Action", "Ring of Protection", "Ring of Resistance", "Ring of Spell Storing", "Ring of the Ram", "Ring of X-Ray Vision"],
  "Rare Weapons":       ["Ammunition +2", "Berserker Axe", "Dagger of Venom", "Dragon Slayer", "Flame Tongue", "Giant Slayer", "Mace of Disruption", "Mace of Smiting", "Mace of Terror", "Sun Blade", "Sword of Life Stealing", "Sword of Wounding", "Vicious Weapon", "Weapon +2"],
  "Rare Armor":         ["Armor +1", "Armor of Resistance", "Armor of Vulnerability", "Arrow-Catching Shield", "Shield of Missile Attraction", "Shield +2", "Elven Chain", "Glamoured Studded Leather"],
  "Rare Rods":          ["Rod of Rulership", "Tentacle Rod"],
  "Rare Staves":        ["Staff of Charming", "Staff of Healing", "Staff of Swarming Insects", "Staff of the Woodlands", "Staff of Withering"],
  "Rare Wands":         ["Wand of Binding", "Wand of Enemy Detection", "Wand of Fear", "Wand of Fireballs", "Wand of Lightning Bolts", "Wand of Paralysis", "Wand of the War Mage +2", "Wand of Wonder"],
  "Rare Wondrous Items":["Amulet of Health", "Bag of Beans", "Bag of Devouring", "Bead of Force", "Belt of Dwarvenkind"],

  "Very Rare Potions":       ["Oil of Sharpness", "Potion of Flying", "Potion of Greater Invisibility", "Potion of Longevity", "Potion of Speed", "Potion of Vitality"],
  "Very Rare Rings":         ["Ring of Regeneration", "Ring of Shooting Stars", "Ring of Telekinesis"],
  "Very Rare Weapons":       ["Ammunition +3", "Ammunition of Slaying", "Dancing Sword", "Dwarven Thrower", "Energy Bow", "Executioner's Axe", "Frost Brand", "Lute of Thunderous Thumping", "Nine Lives Stealer", "Oathbow", "Quarterstaff of the Acrobat", "Scimitar of Speed", "Sword of Sharpness", "Thunderous Greatclub", "Weapon +3"],
  "Very Rare Armor":         ["Armor +2", "Animated Shield", "Demon Armor", "Dragon Scale Mail", "Dwarven Plate", "Shield +3", "Shield of the Cavalier", "Spellguard Shield"],
  "Very Rare Rods":          ["Rod of Absorption", "Rod of Alertness", "Rod of Security"],
  "Very Rare Staves":        ["Staff of Fire", "Staff of Frost", "Staff of Power", "Staff of Striking", "Staff of Thunder and Lightning"],
  "Very Rare Wands":         ["Wand of Polymorph", "Wand of the War Mage +3"],
  "Very Rare Wondrous Items":["Amulet of the Planes", "Bag of Devouring", "Bag of Tricks (Gray)", "Bag of Beans", "Candle of Invocation"],
};

// ─── UTILIDADES ───────────────────────────────────────────────────────────────

function elegirAleatorio(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function sortearRareza(probabilidades) {
  const tirada = Math.random() * 100;
  let acumulado = 0;
  for (const { rareza, peso } of probabilidades) {
    acumulado += peso;
    if (tirada <= acumulado) return rareza;
  }
  return probabilidades[probabilidades.length - 1].rareza;
}

// ─── API PÚBLICA ──────────────────────────────────────────────────────────────

/**
 * Devuelve la lista de nombres de todos los burgs.
 * @returns {string[]}
 */
function getBurgs() {
  return BURGS.map(b => b.burg);
}

/**
 * Devuelve la categoría de un burg ("aldea", "pueblo", "ciudad", "macropolis").
 * @param {string} burgName
 * @returns {string | null}
 */
function getCategoriaBurg(burgName) {
  return BURGS.find(b => b.burg === burgName)?.categoria ?? null;
}

/**
 * Devuelve las tiendas de un burg que venden ítems mágicos.
 * @param {string} burgName
 * @returns {string[]}
 */
function getTiendasDeBurg(burgName) {
  const tiposConMagic = new Set(Object.keys(CATEGORIAS_POR_TIENDA));
  return [...new Set(
    ESTABLECIMIENTOS
      .filter(e => e.burg === burgName && tiposConMagic.has(e.tipo))
      .map(e => e.tipo)
  )];
}

/**
 * Genera el inventario de una tienda en un burg.
 *
 * @param {string} burgName
 * @param {string} tienda - Tipo de tienda (e.g. "Herrero")
 * @returns {{
 *   burg: string,
 *   categoria: string,
 *   tienda: string,
 *   costoMax: number,
 *   items: Array<{ nombre: string, rareza: string, precio: number } | { error: string, rareza: string }>
 * }}
 */
function generarItems(burgName, tienda) {
  const burgInfo = BURGS.find(b => b.burg === burgName);
  if (!burgInfo) throw new Error(`Burg no encontrado: ${burgName}`);

  const categorias = CATEGORIAS_POR_TIENDA[tienda];
  if (!categorias) throw new Error(`Tienda no reconocida: ${tienda}`);

  const reglas = REGLAS_POR_CATEGORIA[burgInfo.categoria];
  const items = [];

  for (let i = 0; i < reglas.cantidad; i++) {
    const rareza = sortearRareza(reglas.probabilidades);

    // Solo elegir entre categorías que tienen tabla para esta rareza
    const categoriasDisponibles = categorias.filter(cat => TABLAS_ITEMS[`${rareza} ${cat}`]);

    if (categoriasDisponibles.length === 0) {
      // Ninguna categoría de esta tienda tiene tabla para esta rareza
      // Fallback: retirar al siguiente nivel de rareza disponible con tabla
      const fallback = ["Common", "Uncommon", "Rare", "Very Rare"];
      let itemGenerado = null;
      for (const r of fallback) {
        const cats = categorias.filter(cat => TABLAS_ITEMS[`${r} ${cat}`]);
        if (cats.length > 0) {
          const categoria = elegirAleatorio(cats);
          itemGenerado = {
            nombre: elegirAleatorio(TABLAS_ITEMS[`${r} ${categoria}`]),
            rareza: r,
            precio: PRECIO_POR_RAREZA[r],
            nota: `Rareza ajustada (no hay tabla ${rareza} para esta tienda)`,
          };
          break;
        }
      }
      if (itemGenerado) items.push(itemGenerado);
    } else {
      const categoria = elegirAleatorio(categoriasDisponibles);
      items.push({
        nombre: elegirAleatorio(TABLAS_ITEMS[`${rareza} ${categoria}`]),
        rareza,
        precio: PRECIO_POR_RAREZA[rareza],
      });
    }
  }

  return {
    burg: burgName,
    categoria: burgInfo.categoria,
    tienda,
    costoMax: reglas.costoMax,
    items,
  };
}
