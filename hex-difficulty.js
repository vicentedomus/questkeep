/**
 * hex-difficulty.js — Sistema de dificultad radial para hexcrawl
 *
 * La dificultad de cada hex depende de la distancia a la ciudad mas cercana,
 * normalizada por el radio de seguridad segun categoria del poblado.
 *
 * 4 zonas alineadas con los Tiers of Play de D&D (DMG):
 *   Tier 1 (Lvl 1-4)  — Tierras civilizadas
 *   Tier 2 (Lvl 5-10) — Frontera
 *   Tier 3 (Lvl 11-16) — Tierra salvaje
 *   Tier 4 (Lvl 17-20) — Territorio prohibido
 */

const HexDifficulty = (() => {

  // --- Radios de seguridad por categoria de poblado ---
  const SAFETY_RADIUS = {
    'macropolis': 4,
    'ciudad':     3,
    'pueblo':     1,
    'aldea':      1,
  };

  // --- Thresholds de ratio (dist/radius) para asignar tier ---
  // ratio <= T1 -> Tier 1, <= T2 -> Tier 2, <= T3 -> Tier 3, else Tier 4
  const TIER_THRESHOLDS = [0.30, 0.80, 1.10];

  // --- Tiers con metadata ---
  const TIERS = [
    { tier: 1, name: 'Tierras civilizadas', levels: '1-4',   color: 'rgba(80, 200, 120, 0.30)' },
    { tier: 2, name: 'Frontera',            levels: '5-10',  color: 'rgba(200, 190, 50, 0.30)' },
    { tier: 3, name: 'Tierra salvaje',      levels: '11-16', color: 'rgba(210, 120, 40, 0.30)' },
    { tier: 4, name: 'Territorio prohibido', levels: '17-20', color: 'rgba(160, 50, 180, 0.30)' },
  ];

  // --- Cache de posiciones de ciudades (hex coords) ---
  let cityHexCache = null;

  /**
   * Pre-computa las posiciones hex de todas las ciudades del SVG.
   */
  function buildCityCache(mapSvgEl) {
    cityHexCache = [];
    if (!mapSvgEl || typeof HexGrid === 'undefined') return;

    const labelLayer = mapSvgEl.querySelector('#burgLabels');
    if (!labelLayer) return;

    const catMap = {};
    if (typeof BURGS !== 'undefined') {
      for (const b of BURGS) {
        catMap[b.burg.toLowerCase()] = b.categoria;
      }
    }

    const seen = new Set();
    labelLayer.querySelectorAll('text[data-id]').forEach(t => {
      const name = (t.childNodes[0] || t).textContent.trim();
      if (!name || seen.has(name.toLowerCase())) return;
      seen.add(name.toLowerCase());

      const x = parseFloat(t.getAttribute('x'));
      const y = parseFloat(t.getAttribute('y'));
      if (isNaN(x) || isNaN(y)) return;

      const hex = HexGrid.svgToHex(x, y);
      const categoria = catMap[name.toLowerCase()] || 'pueblo';
      const radius = SAFETY_RADIUS[categoria] || 1;

      cityHexCache.push({
        name,
        q: hex.q,
        r: hex.r,
        categoria,
        radius,
      });
    });
  }

  /**
   * Calcula el tier de dificultad de un hex (0-3, mapeado a Tiers 1-4).
   * @param {number} q - Coordenada axial q
   * @param {number} r - Coordenada axial r
   * @returns {{ tier: number, name: string, levels: string, color: string, nearestCity: string|null, distance: number|null }}
   */
  function getDifficulty(q, r) {
    if (!cityHexCache) return { ...TIERS[3], nearestCity: null, distance: null };

    let bestTierIdx = 3;
    let nearestCity = null;
    let nearestDist = null;

    for (const city of cityHexCache) {
      const dist = HexGrid.hexDistance(q, r, city.q, city.r);

      let tierIdx;
      if (dist === 0) {
        tierIdx = 0;
      } else {
        const ratio = dist / city.radius;
        if (ratio <= TIER_THRESHOLDS[0]) tierIdx = 0;
        else if (ratio <= TIER_THRESHOLDS[1]) tierIdx = 1;
        else if (ratio <= TIER_THRESHOLDS[2]) tierIdx = 2;
        else tierIdx = 3;
      }

      if (tierIdx < bestTierIdx) {
        bestTierIdx = tierIdx;
        nearestCity = city.name;
        nearestDist = dist;
      }
    }

    return {
      ...TIERS[bestTierIdx],
      nearestCity,
      distance: nearestDist,
    };
  }

  /**
   * Retorna la metadata de un tier (0-3).
   */
  function getTierInfo(tierIdx) {
    return TIERS[Math.max(0, Math.min(3, tierIdx))];
  }

  return {
    SAFETY_RADIUS,
    TIER_THRESHOLDS,
    TIERS,
    buildCityCache,
    getDifficulty,
    getTierInfo,
    get cityCache() { return cityHexCache; },
  };
})();
