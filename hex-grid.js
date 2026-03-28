/**
 * hex-grid.js — Sistema de coordenadas hexagonales para dnd-halo
 *
 * Basado en el patron SVG de Fantasy Map Generator:
 *   pattern: width=25, height=43.4, pointy-top
 *   patternTransform: scale(0.28)
 *   path vertices: (0,0) (12.5,7.2) (25,0) (12.5,21.7) (0,28.9) (25,28.9) (0,43.4) (25,43.4)
 *
 * El patron empieza con un VERTICE en (0,0), no un centro.
 * El primer centro de hex esta en (0, SIZE) en SVG coords.
 *
 * Usa coordenadas axiales (q, r) internamente.
 * Offset odd-r para almacenamiento/display (col, row).
 *
 * Referencia: https://www.redblobgames.com/grids/hexagons/
 */

const HexGrid = (() => {

  // --- Constantes derivadas del patron SVG ---
  // Los valores del path (7.2, 21.7, 28.9) dan las posiciones exactas de vertices.
  // size = distancia centro-a-vertice. Derivado de: 2*size = 28.9 - 0 (top vertex a bottom vertex)
  // => size_pre = 28.9 / 2 = 14.45 (pre-scale)
  const SCALE = 0.28;

  // Espaciado directo del patron (pixel-perfect con el tiling SVG)
  const HORIZ = 25 * SCALE;                          // 7.0 — distancia horizontal entre centros
  const VERT  = 21.7 * SCALE;                        // 6.076 — distancia vertical entre filas
  // 21.7 = pattern_h / 2 = distancia entre fila par e impar en el patron

  // Circumradius del hex (centro a vertice)
  const SIZE = 14.45 * SCALE;                        // 4.046

  // Dimensiones del hex
  const HEX_W = 2 * 12.5 * SCALE;                   // 7.0 — ancho (2 * media-anchura del path)
  const HEX_H = 2 * SIZE;                            // 8.092 — alto

  // Origen: el patron SVG empieza con un vertice top en (0,0).
  // El primer centro de hex esta en x=0, y=SIZE (un circumradius abajo del vertice top).
  const ORIGIN_X = 0;
  const ORIGIN_Y = SIZE;                              // ~4.046

  // Vertices del hex relativo al centro, derivados del path SVG (pre-scale).
  // Path vertices para hex centrado en (0, 14.45):
  //   top:    (0, 0)        -> rel (0, -14.45)
  //   top-R:  (12.5, 7.2)   -> rel (12.5, -7.25)
  //   bot-R:  (12.5, 21.7)  -> rel (12.5, 7.25)
  //   bot:    (0, 28.9)     -> rel (0, 14.45)
  //   bot-L:  (-12.5, 21.7) -> rel (-12.5, 7.25)
  //   top-L:  (-12.5, 7.2)  -> rel (-12.5, -7.25)
  const VERTEX_OFFSETS = [
    { dx:  0,            dy: -14.45 },   // top
    { dx:  12.5,         dy: -7.25  },   // top-right
    { dx:  12.5,         dy:  7.25  },   // bottom-right
    { dx:  0,            dy:  14.45 },   // bottom
    { dx: -12.5,         dy:  7.25  },   // bottom-left
    { dx: -12.5,         dy: -7.25  },   // top-left
  ].map(v => ({ dx: v.dx * SCALE, dy: v.dy * SCALE }));

  // --- Conversion: offset (col, row) <-> axial (q, r) ---
  // Odd-r offset: filas impares desplazadas +HORIZ/2 a la derecha.

  function offsetToAxial(col, row) {
    const q = col - Math.floor(row / 2);
    const r = row;
    return { q, r };
  }

  function axialToOffset(q, r) {
    const col = q + Math.floor(r / 2);
    const row = r;
    return { col, row };
  }

  // --- Conversion: axial (q, r) <-> SVG pixel (x, y) ---

  function axialToSvg(q, r) {
    const x = ORIGIN_X + (q + r * 0.5) * HORIZ;
    const y = ORIGIN_Y + r * VERT;
    return { x, y };
  }

  function svgToAxialFrac(x, y) {
    const ay = y - ORIGIN_Y;
    const ax = x - ORIGIN_X;
    const r = ay / VERT;
    const q = (ax / HORIZ) - r * 0.5;
    return { q, r };
  }

  // --- Redondeo de coordenadas fraccionales a hex mas cercano ---

  function axialRound(qFrac, rFrac) {
    const s = -qFrac - rFrac;
    let rq = Math.round(qFrac);
    let rr = Math.round(rFrac);
    let rs = Math.round(s);

    const dq = Math.abs(rq - qFrac);
    const dr = Math.abs(rr - rFrac);
    const ds = Math.abs(rs - s);

    if (dq > dr && dq > ds) {
      rq = -rr - rs;
    } else if (dr > ds) {
      rr = -rq - rs;
    }

    return { q: rq, r: rr };
  }

  // --- API publica ---

  /**
   * Convierte coordenadas SVG (x, y) al hex mas cercano.
   * Retorna { q, r } (axiales) y { col, row } (offset odd-r).
   */
  function svgToHex(x, y) {
    const frac = svgToAxialFrac(x, y);
    const ax = axialRound(frac.q, frac.r);
    const off = axialToOffset(ax.q, ax.r);
    return { q: ax.q, r: ax.r, col: off.col, row: off.row };
  }

  /**
   * Retorna el centro SVG de un hex dado en coordenadas axiales.
   */
  function hexCenter(q, r) {
    return axialToSvg(q, r);
  }

  /**
   * Retorna el centro SVG de un hex dado en coordenadas offset (col, row).
   */
  function hexCenterOffset(col, row) {
    const ax = offsetToAxial(col, row);
    return axialToSvg(ax.q, ax.r);
  }

  /**
   * Retorna los 6 vertices del hex (pointy-top) usando las posiciones
   * exactas del path SVG de FMG para alineacion pixel-perfect.
   */
  function hexVertices(q, r) {
    const center = axialToSvg(q, r);
    return VERTEX_OFFSETS.map(v => ({
      x: center.x + v.dx,
      y: center.y + v.dy,
    }));
  }

  /**
   * Retorna un string "points" listo para un <polygon> SVG.
   */
  function hexPolygonPoints(q, r) {
    return hexVertices(q, r).map(v => `${v.x},${v.y}`).join(' ');
  }

  /**
   * Retorna los 6 vecinos axiales de un hex.
   */
  function hexNeighbors(q, r) {
    const dirs = [
      { q: 1, r: 0 },  { q: 1, r: -1 }, { q: 0, r: -1 },
      { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
    ];
    return dirs.map(d => ({ q: q + d.q, r: r + d.r }));
  }

  /**
   * Retorna todos los hexes dentro de un radio (distancia Manhattan hex).
   * Radio 0 = solo el hex central. Radio 1 = hex + 6 vecinos, etc.
   */
  function hexesInRadius(q, r, radius) {
    const results = [];
    for (let dq = -radius; dq <= radius; dq++) {
      for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
        results.push({ q: q + dq, r: r + dr });
      }
    }
    return results;
  }

  /**
   * Distancia entre dos hexes (coordenadas axiales).
   */
  function hexDistance(q1, r1, q2, r2) {
    return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
  }

  /**
   * Key string para almacenar datos de un hex: "q,r"
   */
  function hexKey(q, r) {
    return `${q},${r}`;
  }

  /**
   * Parsea una key "q,r" a coordenadas axiales.
   */
  function parseHexKey(key) {
    const [q, r] = key.split(',').map(Number);
    return { q, r };
  }

  return {
    // Constantes
    SIZE, HEX_W, HEX_H, HORIZ, VERT, SCALE,
    ORIGIN_X, ORIGIN_Y,

    // Conversion coordenadas
    offsetToAxial, axialToOffset,
    svgToHex, hexCenter, hexCenterOffset,

    // Geometria
    hexVertices, hexPolygonPoints,

    // Vecinos y distancia
    hexNeighbors, hexesInRadius, hexDistance,

    // Keys
    hexKey, parseHexKey,
  };
})();
