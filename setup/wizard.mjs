#!/usr/bin/env node
/**
 * wizard.mjs — Setup interactivo para configurar una nueva campaña.
 *
 * Uso:  node setup/wizard.mjs
 *
 * Genera campaign.js, crea schema en Supabase, inicializa tablas y crea usuarios.
 */

import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Helpers ─────────────────────────────────────────────────

function readSQL(relativePath) {
  return readFileSync(join(ROOT, relativePath), 'utf-8');
}

function log(msg) { console.log(`  ${msg}`); }
function ok(msg)  { console.log(`  ✓ ${msg}`); }
function fail(msg){ console.log(`  ✗ ${msg}`); }

// ── Main ────────────────────────────────────────────────────

const rl = readline.createInterface({ input, output });

async function ask(question, defaultVal) {
  const suffix = defaultVal != null ? ` (${defaultVal})` : '';
  const answer = await rl.question(`  ${question}${suffix}: `);
  return answer.trim() || (defaultVal ?? '');
}

async function askYN(question, defaultNo = true) {
  const hint = defaultNo ? 's/N' : 'S/n';
  const answer = await rl.question(`  ${question} (${hint}): `);
  const a = answer.trim().toLowerCase();
  return defaultNo ? a === 's' || a === 'si' || a === 'y' || a === 'yes'
                   : a !== 'n' && a !== 'no';
}

console.log('\n  ⚔  D&D Campaign Setup  ⚔\n');

// Check if campaign.js already exists
const campaignPath = join(ROOT, 'campaign.js');
if (existsSync(campaignPath)) {
  const overwrite = await askYN('campaign.js ya existe. ¿Sobrescribir?');
  if (!overwrite) {
    log('Setup cancelado.');
    rl.close();
    process.exit(0);
  }
  console.log();
}

// ── Collect campaign info ───────────────────────────────────

log('── Datos de la campaña ──\n');

const slug = await ask('Slug (sin espacios, ej: mi-campana)');
const schema = slug.replace(/-/g, '_');
const name = await ask('Nombre de la campaña');
const subtitle = await ask('Subtítulo (opcional, Enter para saltar)', '');

console.log();
log('── Supabase ──\n');

const supabaseUrl = await ask('Project URL (https://XXXXX.supabase.co)');
const supabaseKey = await ask('Anon (public) key');
const serviceRoleKey = await ask('Service role key (solo para setup, no se guarda)');
const dbPassword = await ask('Database password');

console.log();
log('── Opcionales ──\n');

const githubOwner = await ask('GitHub owner (Enter para saltar)', '');
const githubRepo = await ask('GitHub repo (Enter para saltar)', '');
const hasMap = await askYN('¿Tiene mapa SVG?');
const hasAI = await askYN('¿Tiene IA (Edge Functions + API key Anthropic)?');

// ── Collect users ───────────────────────────────────────────

console.log();
log('── Usuarios ──\n');
log('Primero el DM, luego los jugadores.\n');

const dmUsername = await ask('Username del DM');
const tempPassword = await ask('Contraseña temporal (todos la usan para el primer login)', 'halo2026');

const players = [];
log('\nJugadores (escribe un username por línea, Enter vacío para terminar):\n');
while (true) {
  const p = await ask(`  Jugador ${players.length + 1}`);
  if (!p) break;
  players.push(p.toLowerCase());
}

rl.close();

// ── Extract Supabase ref ────────────────────────────────────

const refMatch = supabaseUrl.match(/https:\/\/(\w+)\.supabase\.co/);
if (!refMatch) {
  fail('URL de Supabase inválida. Debe ser https://XXXXX.supabase.co');
  process.exit(1);
}
const ref = refMatch[1];

// ── Step 1/4: Generate campaign.js ──────────────────────────

console.log('\n  ── Paso 1/4: Generando campaign.js...');

const campaignJS = `/**
 * campaign.js — Configuración de la campaña ${name}.
 * Este archivo NO se sube al repo (está en .gitignore).
 * Generado por setup/wizard.mjs
 */
const CAMPAIGN = {
  slug:           '${slug}',
  schema:         '${schema}',
  name:           '${name.replace(/'/g, "\\'")}',
  subtitle:       '${(subtitle || '').replace(/'/g, "\\'")}',
  supabaseUrl:    '${supabaseUrl}',
  supabaseKey:    '${supabaseKey}',
  githubOwner:    '${githubOwner}',
  githubRepo:     '${githubRepo}',
  hasMap:         ${hasMap},
  hasAI:          ${hasAI},
};
`;

writeFileSync(campaignPath, campaignJS, 'utf-8');
ok('campaign.js generado');

// ── Step 2/4: Create schema & initialize database ───────────

console.log('\n  ── Paso 2/4: Inicializando base de datos...');

const client = new pg.Client({
  host: `db.${ref}.supabase.co`,
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: dbPassword,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  ok('Conexión a Postgres establecida');
} catch (err) {
  fail(`No se pudo conectar a Postgres: ${err.message}`);
  log('Verifica el password de la BD y que el proyecto Supabase esté activo.');
  log('campaign.js ya se generó — puedes reintentar el wizard.');
  process.exit(1);
}

/**
 * Ejecuta SQL dentro del schema de la campaña.
 * Reemplaza 'public.' por '{schema}.' y ajusta search_path.
 */
async function runInSchema(sql) {
  await client.query(`SET search_path TO "${schema}", public;`);
  await client.query(sql);
}

try {
  // Crear schema
  log(`  → Creando schema "${schema}"...`);
  await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}";`);
  ok(`schema "${schema}"`);

  // Schema principal
  log('  → schema.sql...');
  await runInSchema(readSQL('sql/schema.sql'));
  ok('schema.sql');

  // Migraciones
  const migrationsDir = join(ROOT, 'sql/migraciones');
  const migrations = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  for (const m of migrations) {
    log(`  → ${m}...`);
    await runInSchema(readFileSync(join(migrationsDir, m), 'utf-8'));
    ok(m);
  }

  // Catálogos
  log('  → items-catalog-schema.sql...');
  await runInSchema(readSQL('sql/items-catalog-schema.sql'));
  ok('items-catalog-schema.sql');

  log('  → monstruos-schema.sql...');
  await runInSchema(readSQL('sql/monstruos-schema.sql'));
  ok('monstruos-schema.sql');

  log('  → session-plans-schema.sql...');
  await runInSchema(readSQL('sql/session-plans-schema.sql'));
  ok('session-plans-schema.sql');

  // RLS
  log('  → rls.sql...');
  await runInSchema(readSQL('sql/rls.sql'));
  ok('rls.sql');

  // Migration tracking
  log('  → tabla _migrations...');
  await runInSchema(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name text PRIMARY KEY,
      applied_at timestamptz DEFAULT now()
    );
  `);
  for (const m of migrations) {
    await client.query(`INSERT INTO "${schema}"._migrations (name) VALUES ($1) ON CONFLICT DO NOTHING`, [m]);
  }
  ok('_migrations registradas');

  // Exponer schema al API de Supabase (PostgREST)
  log('  → Exponiendo schema a la API...');
  await client.query(`
    GRANT USAGE ON SCHEMA "${schema}" TO anon, authenticated, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA "${schema}" TO anon, authenticated, service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA "${schema}" TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema}" GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema}" GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  `);
  ok('permisos de schema');

} catch (err) {
  fail(`Error ejecutando SQL: ${err.message}`);
  log('La BD puede haber quedado parcialmente inicializada.');
  log('Revisa el error y vuelve a ejecutar el wizard (los CREATE IF NOT EXISTS son seguros).');
  await client.end();
  process.exit(1);
}

await client.end();
ok('Base de datos inicializada');

// ── Step 3/4: Create auth users ─────────────────────────────

console.log('\n  ── Paso 3/4: Creando usuarios...');

async function createUser(username, role) {
  const res = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'apikey':        serviceRoleKey,
      'Authorization': `Bearer ${serviceRoleKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      email:         `${username}@dnd.local`,
      password:      tempPassword,
      email_confirm: true,
      user_metadata: {
        role,
        campaign: slug,
        username,
        mustChangePassword: true,
      },
    }),
  });

  const data = await res.json();
  if (data.id) {
    ok(`${username} (${role})`);
  } else {
    fail(`${username}: ${data.msg || data.message || JSON.stringify(data)}`);
  }
}

await createUser(dmUsername.toLowerCase(), 'dm');
for (const p of players) {
  await createUser(p, 'player');
}

// ── Step 4/4: Summary ───────────────────────────────────────

const allUsers = [dmUsername.toLowerCase(), ...players];

console.log(`
  ────────────────────────────────
  ✓ Setup completo!

  Campaña:         ${name}
  Schema:          ${schema}
  Usuarios:        ${allUsers.join(', ')}
  Contraseña temp: ${tempPassword}

  Cada usuario cambiará su contraseña
  en el primer login.

  Abre index.html con Live Server
  o despliega a GitHub Pages.
  ────────────────────────────────
`);
