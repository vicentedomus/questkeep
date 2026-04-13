/**
 * test-preparador-ai.mjs — Test script for generate-session-plan Edge Function
 *
 * Usage: node test-preparador-ai.mjs
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// ── CONFIG ──────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://dwmzchtqjcblupmmklcl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3bXpjaHRxamNibHVwbW1rbGNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMTI2NjMsImV4cCI6MjA4OTU4ODY2M30.MCYuO-O60I5heT0MzXeF8euTMFKEENFkm_QsAfinGDc';
const ENDPOINT = `${SUPABASE_URL}/functions/v1/generate-session-plan`;

// ── LOAD LOCAL DATA FOR CONTEXT ─────────────────────────────────────────
const dataDir = join(import.meta.dirname, 'data');

function loadJson(filename) {
  try {
    return JSON.parse(readFileSync(join(dataDir, filename), 'utf-8'));
  } catch {
    console.warn(`  [WARN] No se pudo leer ${filename}, usando array vacío`);
    return [];
  }
}

const npcs = loadJson('npcs.json');
const lugares = loadJson('lugares.json');
const quests = loadJson('quests.json');
const players = loadJson('players.json');
const ciudades = loadJson('ciudades.json');

// ── BUILD CAMPAIGN CONTEXT (simplified version of planear.js) ───────────
function buildTestContext() {
  const parts = [];

  // Party
  const pjs = (players || []).filter(p => p.es_pj);
  if (pjs.length) {
    parts.push('## Party');
    pjs.forEach(p => {
      parts.push(`- ${p.nombre} (${p.raza} ${p.clase}, nivel ${p.nivel || '?'}) — Jugador: ${p.jugador || '?'}`);
    });
  }

  // Quests
  if (quests.length) {
    parts.push('\n## Quests');
    quests.slice(0, 5).forEach(q => {
      parts.push(`- ${q.nombre} [${q.estado || '?'}]: ${q.resumen || 'Sin resumen'}`);
    });
  }

  // NPCs
  if (npcs.length) {
    parts.push('\n## NPCs');
    npcs.slice(0, 10).forEach(n => {
      parts.push(`- ${n.nombre} (${n.raza || '?'}, ${n.tipo_npc || n.rol || '?'}) — ${n.descripcion || 'Sin descripción'}`);
    });
  }

  // Ciudades
  if (ciudades.length) {
    parts.push('\n## Ciudades');
    ciudades.slice(0, 5).forEach(c => {
      parts.push(`- ${c.nombre}: ${c.descripcion || 'Sin descripción'}`);
    });
  }

  // Lugares
  if (lugares.length) {
    parts.push('\n## Lugares');
    lugares.slice(0, 5).forEach(l => {
      parts.push(`- ${l.nombre} (${l.tipo || '?'}) — ${l.region || '?'}`);
    });
  }

  return parts.join('\n');
}

// ── SAMPLE FORM DATA ────────────────────────────────────────────────────
const samplePersonajes = (players || []).filter(p => p.es_pj).slice(0, 4).map(p => ({
  nombre: p.nombre,
  raza: p.raza,
  clase: p.clase,
  nivel: p.nivel,
  jugador: p.jugador,
}));

// If no PJs in data, use fallback fixtures
const personajes = samplePersonajes.length > 0 ? samplePersonajes : [
  { nombre: "Tino", raza: "Humano", clase: "Paladín", nivel: 5, jugador: "Jugador1" },
  { nombre: "Caco", raza: "Mediano", clase: "Pícaro", nivel: 5, jugador: "Jugador2" },
  { nombre: "Leo", raza: "Elfo", clase: "Mago", nivel: 5, jugador: "Jugador3" },
  { nombre: "Enoch", raza: "Tiefling", clase: "Brujo", nivel: 5, jugador: "Jugador4" },
];

const sampleNpcs = npcs.slice(0, 3).map(n => ({
  nombre: n.nombre,
  raza: n.raza,
  tipo_npc: n.tipo_npc || n.rol,
  descripcion: n.descripcion,
}));

const sampleLugares = lugares.slice(0, 2).map(l => ({
  nombre: l.nombre,
  tipo: l.tipo,
  region: l.region,
}));

const formData = {
  personajes,
  strong_start_hint: "Los personajes llegan a la ciudad después de la batalla",
  escenas_hint: "Investigar el mercado, reunirse con el gremio",
  secretos_hint: "El alcalde está corrompido",
  npcs_seleccionados: sampleNpcs,
  lugares_seleccionados: sampleLugares,
  items_seleccionados: [],
  monstruos_seleccionados: [
    { nombre: "Bandido", cr: "1/8" },
    { nombre: "Espectro", cr: "1" },
  ],
  bloque_objetivo: null, // null = generate all blocks
};

// ── VALIDATION ──────────────────────────────────────────────────────────
const EXPECTED_BLOCKS = {
  bloque_strong_start: 'string',
  bloque_escenas: 'array',
  bloque_secretos: 'array',
  bloque_npcs: 'array',
  bloque_locaciones: 'array',
  bloque_tesoros: 'array',
  bloque_monstruos: 'array',
};

function validateResponse(data) {
  const errors = [];

  for (const [key, expectedType] of Object.entries(EXPECTED_BLOCKS)) {
    if (!(key in data)) {
      errors.push(`Falta bloque: ${key}`);
      continue;
    }
    if (expectedType === 'string' && typeof data[key] !== 'string') {
      errors.push(`${key} debería ser string, es ${typeof data[key]}`);
    }
    if (expectedType === 'array' && !Array.isArray(data[key])) {
      errors.push(`${key} debería ser array, es ${typeof data[key]}`);
    }
  }

  // Validate array sizes
  if (Array.isArray(data.bloque_escenas) && data.bloque_escenas.length < 3) {
    errors.push(`bloque_escenas tiene solo ${data.bloque_escenas.length} items (mínimo 3)`);
  }
  if (Array.isArray(data.bloque_secretos) && data.bloque_secretos.length < 5) {
    errors.push(`bloque_secretos tiene solo ${data.bloque_secretos.length} items (mínimo 5)`);
  }
  if (Array.isArray(data.bloque_npcs) && data.bloque_npcs.length < 3) {
    errors.push(`bloque_npcs tiene solo ${data.bloque_npcs.length} items (mínimo 3)`);
  }

  // Validate escena structure
  if (Array.isArray(data.bloque_escenas)) {
    for (const [i, e] of data.bloque_escenas.entries()) {
      if (!e.titulo) errors.push(`bloque_escenas[${i}] falta titulo`);
      if (!e.descripcion) errors.push(`bloque_escenas[${i}] falta descripcion`);
      if (!e.tipo) errors.push(`bloque_escenas[${i}] falta tipo`);
      if (e.tension === undefined) errors.push(`bloque_escenas[${i}] falta tension`);
    }
  }

  // Validate NPC structure
  if (Array.isArray(data.bloque_npcs)) {
    for (const [i, n] of data.bloque_npcs.entries()) {
      if (!n.nombre) errors.push(`bloque_npcs[${i}] falta nombre`);
      if (!n.rol) errors.push(`bloque_npcs[${i}] falta rol`);
      if (!n.motivacion) errors.push(`bloque_npcs[${i}] falta motivacion`);
    }
  }

  // Validate secreto structure
  if (Array.isArray(data.bloque_secretos)) {
    for (const [i, s] of data.bloque_secretos.entries()) {
      if (!s.secreto) errors.push(`bloque_secretos[${i}] falta secreto`);
      if (!s.pista) errors.push(`bloque_secretos[${i}] falta pista`);
    }
  }

  return errors;
}

// ── MAIN ────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Test: generate-session-plan Edge Function ===\n');

  const campaignContext = buildTestContext();
  console.log(`Contexto de campaña: ${campaignContext.length} caracteres`);
  console.log(`Personajes: ${personajes.map(p => p.nombre).join(', ')}`);
  console.log(`NPCs seleccionados: ${formData.npcs_seleccionados.map(n => n.nombre).join(', ') || 'ninguno'}`);
  console.log(`Lugares seleccionados: ${formData.lugares_seleccionados.map(l => l.nombre).join(', ') || 'ninguno'}`);
  console.log(`Monstruos: ${formData.monstruos_seleccionados.map(m => m.nombre).join(', ')}`);
  console.log(`Bloque objetivo: ${formData.bloque_objetivo || 'todos'}\n`);

  console.log(`Llamando a: ${ENDPOINT}`);
  console.log('Esperando respuesta (puede tardar 30-60s)...\n');

  const startTime = Date.now();

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'X-DM-Auth': 'halo-dm',
      },
      body: JSON.stringify({
        formData,
        campaignContext,
        fecha_sesion: '2026-03-22',
      }),
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Respuesta: ${res.status} ${res.statusText} (${elapsed}s)\n`);

    if (!res.ok) {
      const errBody = await res.text();
      console.error('ERROR:', errBody);
      process.exit(1);
    }

    const data = await res.json();

    // Validate structure
    const errors = validateResponse(data);

    // Print each block
    console.log('─'.repeat(60));

    // Strong Start
    console.log('\n## GANCHO FUERTE');
    console.log(data.bloque_strong_start || '(vacío)');

    // Scenes
    console.log('\n## ESCENAS POTENCIALES');
    if (Array.isArray(data.bloque_escenas)) {
      data.bloque_escenas.forEach((e, i) => {
        console.log(`  ${i + 1}. [${e.tipo}] ${e.titulo} (tensión: ${e.tension})`);
        console.log(`     ${e.descripcion}`);
      });
    }

    // Secrets
    console.log('\n## SECRETOS Y PISTAS');
    if (Array.isArray(data.bloque_secretos)) {
      data.bloque_secretos.forEach((s, i) => {
        console.log(`  ${i + 1}. ${s.secreto}`);
        console.log(`     Pista: ${s.pista}`);
        console.log(`     Quién sabe: ${s.quien_sabe || '?'}`);
      });
    }

    // NPCs
    console.log('\n## NPCs IMPORTANTES');
    if (Array.isArray(data.bloque_npcs)) {
      data.bloque_npcs.forEach(n => {
        console.log(`  - ${n.nombre} (${n.rol}) — "${n.frase}"`);
        console.log(`    Motivación: ${n.motivacion} | Tono: ${n.tono}`);
      });
    }

    // Locations
    console.log('\n## LOCACIONES FANTÁSTICAS');
    if (Array.isArray(data.bloque_locaciones)) {
      data.bloque_locaciones.forEach(l => {
        console.log(`  - ${l.nombre} [${l.tipo}] — ${l.region}`);
        console.log(`    ${l.descripcion}`);
      });
    }

    // Treasures
    console.log('\n## TESOROS RELEVANTES');
    if (Array.isArray(data.bloque_tesoros)) {
      data.bloque_tesoros.forEach(t => {
        console.log(`  - ${t.nombre} (${t.tipo}, ${t.rareza}) → ${t.portador_sugerido}`);
        console.log(`    ${t.descripcion}`);
      });
    }

    // Monsters
    console.log('\n## MONSTRUOS EN CONTEXTO');
    if (Array.isArray(data.bloque_monstruos)) {
      data.bloque_monstruos.forEach(m => {
        console.log(`  - ${m.nombre} x${m.cantidad}`);
        console.log(`    ${m.contexto_narrativo}`);
      });
    }

    // Validation results
    console.log('\n' + '─'.repeat(60));
    if (errors.length === 0) {
      console.log('\nVALIDACIÓN: PASÓ — Todos los bloques tienen la estructura correcta');
    } else {
      console.log(`\nVALIDACIÓN: ${errors.length} ERRORES:`);
      errors.forEach(e => console.log(`  - ${e}`));
    }

    console.log(`\nTiempo total: ${elapsed}s`);
  } catch (err) {
    console.error('ERROR de red:', err.message);
    process.exit(1);
  }
}

main();
