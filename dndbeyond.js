/**
 * dndbeyond.js — Integración con D&D Beyond (experimental)
 * Obtiene datos de personajes vía proxy de Supabase Edge Function
 * y renderiza una hoja de personaje enriquecida.
 */

const DDB_PROXY_URL = `${CONFIG.SUPABASE_URL}/functions/v1/dndbeyond-proxy`;

// Cache en memoria para evitar requests repetidos en la misma sesión
const _ddbCache = {};

// ── ABILITY SCORE IDS ────────────────────────────────────────────────
const ABILITY_NAMES = { 1: 'STR', 2: 'DEX', 3: 'CON', 4: 'INT', 5: 'WIS', 6: 'CHA' };

// ── FETCH ────────────────────────────────────────────────────────────

async function ddbFetchCharacter(characterId) {
  if (_ddbCache[characterId]) return _ddbCache[characterId];

  const res = await fetch(`${DDB_PROXY_URL}?id=${characterId}`, {
    headers: { 'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}` },
  });
  const json = await res.json();

  if (!res.ok || !json.success) {
    const msg = json.hint || json.detail || json.error || json.message || 'Error desconocido';
    throw new Error(msg);
  }

  const parsed = ddbParseCharacter(json.data);
  _ddbCache[characterId] = parsed;
  return parsed;
}

// ── PARSE ────────────────────────────────────────────────────────────

function ddbParseCharacter(d) {
  const totalLevel = (d.classes || []).reduce((sum, c) => sum + (c.level || 0), 0);

  // Ability scores: base + bonus + modifiers from race/class/feat/item
  const ABILITY_SUB = { 1:'strength-score', 2:'dexterity-score', 3:'constitution-score', 4:'intelligence-score', 5:'wisdom-score', 6:'charisma-score' };
  const allMods = Object.values(d.modifiers || {}).flat();

  const abilities = {};
  for (const stat of (d.stats || [])) {
    const id = stat.id;
    const base = stat.value || 10;
    const bonus = ((d.bonusStats || []).find(s => s.id === id) || {}).value || 0;
    const override = ((d.overrideStats || []).find(s => s.id === id) || {}).value;
    // Sum all modifier bonuses for this ability (race, class, feat, item)
    const modBonus = allMods
      .filter(m => m.type === 'bonus' && m.subType === ABILITY_SUB[id])
      .reduce((sum, m) => sum + (m.value || m.fixedValue || 0), 0);
    const total = override != null ? override : base + bonus + modBonus;
    const mod = Math.floor((total - 10) / 2);
    abilities[ABILITY_NAMES[id]] = { total, mod };
  }

  // HP calculation
  const conMod = abilities.CON ? abilities.CON.mod : 0;
  const baseHP = d.baseHitPoints || 0;
  const bonusHP = d.bonusHitPoints || 0;
  const overrideHP = d.overrideHitPoints;
  // Detect Tough feat (+2 HP per level) — not exposed as modifier in DDB API
  const allFeats = [
    ...((d.background?.definition?.grantedFeats) || []),
    ...((d.feats) || []),
    ...((d.options?.feat) || []),
  ];
  const hasTough = allFeats.some(f =>
    (f.name || f.definition?.name || '').toLowerCase() === 'tough'
  );
  const toughHP = hasTough ? 2 * totalLevel : 0;
  const maxHP = overrideHP != null ? overrideHP : baseHP + bonusHP + (conMod * totalLevel) + toughHP;
  const currentHP = maxHP - (d.removedHitPoints || 0);
  const tempHP = d.temporaryHitPoints || 0;

  // Classes
  const classes = (d.classes || []).map(c => ({
    name: c.definition ? c.definition.name : 'Unknown',
    subclass: c.subclassDefinition ? c.subclassDefinition.name : null,
    level: c.level || 0,
    hitDice: c.definition ? c.definition.hitDice : 0,
    hitDiceUsed: c.hitDiceUsed || 0,
  }));

  // Race
  const race = d.race ? (d.race.fullName || d.race.baseRaceName || 'Unknown') : 'Unknown';

  // AC — compute from equipped armor + DEX + shield + modifiers
  const ac = ddbComputeAC(d, abilities);

  // Proficiency bonus
  const profBonus = Math.ceil(totalLevel / 4) + 1;

  // Speeds
  const speeds = {};
  if (d.race && d.race.weightSpeeds && d.race.weightSpeeds.normal) {
    const ws = d.race.weightSpeeds.normal;
    if (ws.walk) speeds.walk = ws.walk;
    if (ws.fly) speeds.fly = ws.fly;
    if (ws.swim) speeds.swim = ws.swim;
    if (ws.climb) speeds.climb = ws.climb;
    if (ws.burrow) speeds.burrow = ws.burrow;
  }

  // Inventory — only equipped or notable items
  const equipment = (d.inventory || [])
    .filter(i => i.definition)
    .map(i => ({
      name: i.definition.name,
      type: i.definition.type || '',
      equipped: i.equipped,
      attuned: i.isAttuned,
      magic: i.definition.magic || false,
      quantity: i.quantity || 1,
    }));

  // Spells
  const spells = ddbParseSpells(d);

  // Spell slots
  const spellSlots = (d.spellSlots || [])
    .filter(s => s.level > 0 && s.available > 0)
    .map(s => ({
      level: s.level,
      used: s.used || 0,
      available: s.available,
    }));

  // Currencies
  const currencies = d.currencies || {};

  // Death saves
  const deathSaves = d.deathSaves || { failCount: 0, successCount: 0, isStabilized: false };

  // Avatar
  const avatar = d.decorations
    ? (d.decorations.avatarUrl || d.decorations.largeAvatarUrl || null)
    : null;

  // Traits
  const traits = d.traits || {};

  return {
    id: d.id,
    name: d.name || 'Unknown',
    avatar,
    race,
    classes,
    totalLevel,
    abilities,
    maxHP,
    currentHP,
    tempHP,
    ac,
    profBonus,
    speeds,
    equipment,
    spells,
    spellSlots,
    currencies,
    deathSaves,
    traits,
  };
}

function ddbComputeAC(d, abilities) {
  if (d.armorClass != null) return d.armorClass;

  const dexMod = abilities.DEX ? abilities.DEX.mod : 0;
  let baseAC = 10 + dexMod; // unarmored default
  let shieldBonus = 0;

  // D&D Beyond armorTypeId: 1=Light, 2=Medium, 3=Heavy, 4=Shield
  for (const item of (d.inventory || [])) {
    if (!item.equipped || !item.definition) continue;
    const def = item.definition;
    if (!def.armorClass) continue;

    if (def.armorTypeId === 4) {
      // Shield
      shieldBonus += def.armorClass;
    } else if (def.armorTypeId === 1) {
      // Light armor: AC + full DEX
      baseAC = def.armorClass + dexMod;
    } else if (def.armorTypeId === 2) {
      // Medium armor: AC + DEX (max 2)
      baseAC = def.armorClass + Math.min(dexMod, 2);
    } else if (def.armorTypeId === 3) {
      // Heavy armor: AC only
      baseAC = def.armorClass;
    }
  }

  // Add shield
  baseAC += shieldBonus;

  // Add AC bonuses from modifiers (feats like Heavily Armored, items, etc.)
  const allMods = Object.values(d.modifiers || {}).flat();
  const acBonus = allMods
    .filter(m => m.type === 'bonus' && (m.subType === 'armored-armor-class' || m.subType === 'armor-class'))
    .reduce((sum, m) => sum + (m.value || m.fixedValue || 0), 0);
  baseAC += acBonus;

  return baseAC;
}

function ddbParseSpells(d) {
  const seen = new Set();
  const all = [];

  function addSpell(s, source) {
    if (!s.definition) return;
    const key = s.definition.name + '|' + s.definition.level;
    if (seen.has(key)) return; // evitar duplicados entre spells y classSpells
    seen.add(key);
    all.push({
      name: s.definition.name,
      level: s.definition.level || 0,
      school: s.definition.school || '',
      prepared: s.prepared || s.alwaysPrepared || false,
      concentration: s.definition.concentration || false,
      ritual: s.definition.ritual || false,
      source,
    });
  }

  // spells.class/race/item/feat
  const spellSources = d.spells || {};
  for (const source of ['class', 'race', 'item', 'feat', 'background']) {
    const list = spellSources[source];
    if (!Array.isArray(list)) continue;
    for (const s of list) addSpell(s, source);
  }

  // classSpells — fuente principal de hechizos de clase
  for (const group of (d.classSpells || [])) {
    for (const s of (group.spells || [])) addSpell(s, 'class');
  }

  // Sort by level, then name
  all.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  return all;
}

// ── RENDER ───────────────────────────────────────────────────────────

function ddbRenderSheet(char) {
  const classStr = char.classes.map(c => {
    const sub = c.subclass ? ` (${escapeHtml(c.subclass)})` : '';
    return `${escapeHtml(c.name)}${sub} ${c.level}`;
  }).join(' / ');

  const abilitiesHtml = Object.entries(char.abilities).map(([name, a]) => `
    <div class="ddb-ability">
      <div class="ddb-ability-name">${name}</div>
      <div class="ddb-ability-mod">${a.mod >= 0 ? '+' : ''}${a.mod}</div>
      <div class="ddb-ability-score">${a.total}</div>
    </div>
  `).join('');

  const hpPercent = char.maxHP > 0 ? Math.max(0, (char.currentHP / char.maxHP) * 100) : 0;
  const hpColor = hpPercent > 60 ? 'var(--accent)' : hpPercent > 30 ? '#d4a017' : '#8b0000';

  const speedStr = Object.entries(char.speeds)
    .filter(([, v]) => v > 0)
    .map(([type, v]) => `${v}ft ${type}`)
    .join(', ');

  // Equipment — show equipped items first, then magic items
  const equippedItems = char.equipment.filter(e => e.equipped);
  const magicItems = char.equipment.filter(e => e.magic && !e.equipped);
  const equipHtml = equippedItems.length ? equippedItems.map(e =>
    `<span class="ddb-equip-item${e.magic ? ' ddb-magic' : ''}">${escapeHtml(e.name)}${e.attuned ? ' ✦' : ''}</span>`
  ).join('') : '<span class="ddb-empty">Ninguno</span>';

  // Spells by level
  let spellsHtml = '';
  if (char.spells.length) {
    const byLevel = {};
    for (const s of char.spells) {
      const key = s.level === 0 ? 'Cantrips' : `Nivel ${s.level}`;
      if (!byLevel[key]) byLevel[key] = [];
      byLevel[key].push(s);
    }
    spellsHtml = Object.entries(byLevel).map(([lvl, spells]) => `
      <div class="ddb-spell-level">
        <div class="ddb-spell-level-title">${lvl}</div>
        <div class="ddb-spell-list">${spells.map(s => {
          const tags = [];
          if (s.concentration) tags.push('C');
          if (s.ritual) tags.push('R');
          const tagStr = tags.length ? ` <span class="ddb-spell-tag">${tags.join(',')}</span>` : '';
          return `<span class="ddb-spell${s.prepared ? ' ddb-prepared' : ''}">${escapeHtml(s.name)}${tagStr}</span>`;
        }).join('')}</div>
      </div>
    `).join('');
  }

  // Spell slots
  let slotsHtml = '';
  if (char.spellSlots.length) {
    slotsHtml = `<div class="ddb-slots">${char.spellSlots.map(s => {
      const dots = [];
      for (let i = 0; i < s.available; i++) {
        dots.push(`<span class="ddb-slot${i < s.used ? ' ddb-slot-used' : ''}"></span>`);
      }
      return `<div class="ddb-slot-group"><span class="ddb-slot-label">${s.level}</span>${dots.join('')}</div>`;
    }).join('')}</div>`;
  }

  // Currencies
  const coins = [];
  const { pp = 0, gp = 0, ep = 0, sp = 0, cp = 0 } = char.currencies;
  if (pp) coins.push(`${pp} pp`);
  if (gp) coins.push(`${gp} gp`);
  if (ep) coins.push(`${ep} ep`);
  if (sp) coins.push(`${sp} sp`);
  if (cp) coins.push(`${cp} cp`);
  const coinsStr = coins.length ? coins.join(', ') : '0 gp';

  return `
    <div class="ddb-sheet">
      <div class="ddb-header">
        ${char.avatar ? `<img class="ddb-avatar" src="${char.avatar}" alt="${escapeHtml(char.name)}">` : ''}
        <div class="ddb-identity">
          <div class="ddb-name">${escapeHtml(char.name)}</div>
          <div class="ddb-subtitle">${escapeHtml(char.race)} — ${classStr}</div>
          <div class="ddb-level">Nivel ${char.totalLevel}</div>
        </div>
      </div>

      <div class="ddb-core-stats">
        <div class="ddb-stat-block">
          <div class="ddb-stat-label">AC</div>
          <div class="ddb-stat-value ddb-ac">${char.ac}</div>
        </div>
        <div class="ddb-stat-block">
          <div class="ddb-stat-label">HP</div>
          <div class="ddb-hp-bar">
            <div class="ddb-hp-fill" style="width:${hpPercent}%;background:${hpColor}"></div>
            <span class="ddb-hp-text">${char.currentHP}${char.tempHP ? `+${char.tempHP}` : ''} / ${char.maxHP}</span>
          </div>
        </div>
        <div class="ddb-stat-block">
          <div class="ddb-stat-label">Prof</div>
          <div class="ddb-stat-value">+${char.profBonus}</div>
        </div>
        <div class="ddb-stat-block">
          <div class="ddb-stat-label">Speed</div>
          <div class="ddb-stat-value ddb-speed">${speedStr || '30ft'}</div>
        </div>
      </div>

      <div class="ddb-abilities">${abilitiesHtml}</div>

      ${slotsHtml}

      <div class="ddb-section">
        <div class="ddb-section-title">Equipamiento</div>
        <div class="ddb-equip-grid">${equipHtml}</div>
        ${magicItems.length ? `<div class="ddb-equip-grid" style="margin-top:6px">${magicItems.map(e =>
          `<span class="ddb-equip-item ddb-magic">${escapeHtml(e.name)}</span>`).join('')}</div>` : ''}
      </div>

      ${spellsHtml ? `<div class="ddb-section"><div class="ddb-section-title">Hechizos</div>${spellsHtml}</div>` : ''}

      <div class="ddb-section">
        <div class="ddb-section-title">Monedas</div>
        <div class="ddb-coins">${coinsStr}</div>
      </div>
    </div>
  `;
}

// ── SYNC TO SUPABASE ──────────────────────────────────────────────────

/**
 * Guarda el snapshot de D&D Beyond en Supabase y actualiza campos básicos.
 * @param {string} sbId – UUID del personaje en Supabase (_sbid)
 * @param {object} char – objeto parseado de ddbParseCharacter()
 * @returns {boolean} true si se guardó correctamente
 */
async function ddbSyncToSupabase(sbId, char) {
  if (!sbId || !char) return false;

  const mainClass = char.classes[0] || {};
  const updates = {
    ddb_data: char,
    ddb_synced_at: new Date().toISOString(),
    clase: mainClass.name || undefined,
    subclase: mainClass.subclass || undefined,
    raza: char.race || undefined,
    nivel: char.totalLevel || undefined,
    ac: char.ac || undefined,
    hp_maximo: char.maxHP || undefined,
  };

  // Limpiar undefined
  Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k]);

  const { error } = await sbClient.from('personajes').update(updates).eq('id', sbId);
  if (error) {
    console.error('ddbSyncToSupabase error:', error);
    return false;
  }

  // Actualizar DATA.players en memoria
  const local = (DATA.players || []).find(p => p._sbid === sbId);
  if (local) Object.assign(local, updates);

  return true;
}

// ── UI: LOAD & SHOW IN MODAL ─────────────────────────────────────────

/**
 * Carga y renderiza la hoja D&D Beyond dentro de un contenedor.
 * @param {string} characterId – ID numérico de D&D Beyond
 * @param {HTMLElement} containerEl – elemento donde renderizar
 * @param {string} [sbId] – UUID de Supabase para auto-sync
 */
async function ddbLoadAndShow(characterId, containerEl, sbId) {
  containerEl.innerHTML = `
    <div class="ddb-loading">
      <div class="spinner" style="width:24px;height:24px;border-width:3px;margin:0 auto"></div>
      <div style="margin-top:8px;color:var(--text-dim);font-size:0.85rem">Cargando desde D&D Beyond...</div>
    </div>`;

  try {
    const char = await ddbFetchCharacter(characterId);
    containerEl.innerHTML = ddbRenderSheet(char);

    // Auto-sync a Supabase si tenemos el ID
    if (sbId) {
      const synced = await ddbSyncToSupabase(sbId, char);
      if (synced) {
        const ts = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
        containerEl.insertAdjacentHTML('beforeend',
          `<div class="ddb-sync-status">Sincronizado a las ${ts}</div>`);
      }
    }
  } catch (err) {
    containerEl.innerHTML = `
      <div class="ddb-error">
        <div style="font-weight:bold;margin-bottom:6px">No se pudo cargar el personaje</div>
        <div style="font-size:0.85rem;color:var(--text-dim)">${escapeHtml(err.message)}</div>
        <div style="font-size:0.8rem;margin-top:8px;color:var(--text-dim)">
          Aseg\u00farate de que el personaje est\u00e9 configurado como <strong>P\u00fablico</strong> en D&D Beyond.
        </div>
      </div>`;
  }
}

/**
 * Extrae el character ID numérico de una URL de D&D Beyond.
 * Soporta: https://www.dndbeyond.com/characters/123456789
 *          https://www.dndbeyond.com/profile/user/characters/123456789
 *          o simplemente el número
 */
function ddbExtractId(urlOrId) {
  if (!urlOrId) return null;
  const str = String(urlOrId).trim();
  // Pure number
  if (/^\d+$/.test(str)) return str;
  // URL patterns
  const match = str.match(/dndbeyond\.com\/(?:profile\/[^/]+\/)?characters\/(\d+)/);
  return match ? match[1] : null;
}
