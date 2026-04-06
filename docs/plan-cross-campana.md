# Plan Cross Campaña

## Context

Actualmente existen **dos repos separados** (`dnd-halo` y `dnd-tierras-perdidas`) que son copias del mismo código para campañas distintas. Cada bug fix o feature nueva hay que duplicarla. El objetivo es consolidar en **un solo deployment** que soporte múltiples campañas, donde un DM nuevo pueda registrarse y tener su campaña vacía.

La rama actual (`claude/multi-campaign-analysis-jrSK4`) ya tiene implementado: `campaign_members` table, auth individual por username, Edge Function `manage-users`, y UI de administración de jugadores.

**Decisiones de diseño acordadas:**
- Mapa hexagonal (hex grid, fog of war, exploración) → **Solo Halo** (requeriría editor de mapas para ser genérico)
- IA (chat + planificador de sesión) → **Disponible para todos** (parametrizar es trivial)
- Catálogos (monstruos/items) → **Compartidos** (son referencia D&D 5e)

---

## Fase 1: Base de datos (migration SQL)

**Archivo nuevo:** `sql/migraciones/2026-04-05-multi-campaign.sql`

### 1.1 Crear tabla `campaigns`
```sql
CREATE TABLE campaigns (
  slug TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO campaigns (slug, nombre) VALUES ('halo', 'Halo');
```

### 1.2 Agregar `campaign_slug` a 14 tablas
Tablas principales (10): `ciudades`, `npcs`, `establecimientos`, `personajes`, `items`, `quests`, `notas_dm`, `notas_jugadores`, `lugares`, `marcadores`

Tablas de migraciones recientes (3): `entity_notes`, `hex_fog`, `exploration_log`

Session plans (1): `session_plans`

```sql
ALTER TABLE <tabla> ADD COLUMN campaign_slug TEXT NOT NULL DEFAULT 'halo' REFERENCES campaigns(slug);
```
- Todos los registros existentes reciben `'halo'` automáticamente por el DEFAULT
- Después: `ALTER COLUMN campaign_slug DROP DEFAULT` para forzar slug explícito en inserts futuros
- Agregar índices: `CREATE INDEX idx_<tabla>_campaign ON <tabla>(campaign_slug);`

### 1.3 Junction tables: SIN cambios
No necesitan `campaign_slug` — referencian entidades que ya lo tienen. RLS en las tablas padre provee el aislamiento.

### 1.4 Catálogos compartidos: SIN cambios
`items_catalog` y `monstruos` son referencia global.

### 1.5 Nuevas RLS policies

Reemplazar `get_user_role()` con función campaign-aware:
```sql
CREATE OR REPLACE FUNCTION get_campaign_role(slug TEXT)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM public.campaign_members
  WHERE user_id = auth.uid() AND campaign = slug LIMIT 1;
$$;
```

Patrón de policy (ejemplo ciudades):
- SELECT: `get_campaign_role(campaign_slug) = 'dm' OR (get_campaign_role(campaign_slug) = 'player' AND NOT archived AND conocida_jugadores)`
- INSERT/UPDATE/DELETE: `get_campaign_role(campaign_slug) = 'dm'`

Índice crítico para performance:
```sql
CREATE INDEX idx_campaign_members_lookup ON campaign_members(user_id, campaign);
```

---

## Fase 2: Edge Functions

### 2.1 `supabase/functions/chat/index.ts`
- Reemplazar auth por `DM_PASSWORD` → validación JWT + campaign_members
- Hacer system prompt dinámico: "Halo" → nombre de campaña desde header `x-campaign-slug`
- Renombrar `halo-changes` → `campaign-changes`

### 2.2 `supabase/functions/generate-session-plan/index.ts`
- Mismo cambio de auth y prompt dinámico

### 2.3 `supabase/functions/manage-users/index.ts`
- Ya es campaign-aware. Sin cambios estructurales.

### 2.4 Nueva: `supabase/functions/create-campaign/index.ts`
- Inputs: username, password, campaign name
- Crea usuario auth (o usa existente)
- Genera slug automático del nombre
- Inserta en `campaigns` + `campaign_members` (role=dm)
- Usa service_role key

---

## Fase 3: Frontend

### 3.1 `config.js`
- `CONFIG.SLUG` inicia como `null`, se setea después de login/selección de campaña

### 3.2 `auth.js`
- Nueva función `fetchAllMemberships(userId, accessToken)` — trae TODAS las membresías del usuario
- Si tiene 1 membresía → auto-selecciona, flujo idéntico al actual
- Si tiene 2+ → retorna lista para mostrar selector
- Nueva función `selectCampaign(membership)` → setea `CONFIG.SLUG` + sessionStorage
- `initAuth()` restaura `CONFIG.SLUG` desde sessionStorage

### 3.3 `supabase-client.js`
- Agregar `.eq('campaign_slug', CONFIG.SLUG)` a TODOS los queries en `loadAllData()`
- En `sbSave()`: agregar `campaign_slug: CONFIG.SLUG` al payload en inserts
- En `sbLoadEntityNote()` / `sbSaveEntityNote()`: agregar filtro por campaign_slug
- En `sbUpsertMarker()`: incluir campaign_slug

### 3.4 `app.js`
- **Storage keys dinámicos** — convertir constantes a funciones:
  - `FOG_STORAGE_KEY` → `() => ${CONFIG.SLUG}_fog_data`
  - `DISCOVERED_REGIONS_KEY` → `() => ${CONFIG.SLUG}_discovered_regions`
  - `PARTY_STORAGE_KEY` → `() => ${CONFIG.SLUG}_party`
  - Igual para `col_order`, `visible_cols`, `map_markers`
- **Mapa: condicionar a Halo** — si `CONFIG.SLUG !== 'halo'`, ocultar tab/sección del mapa hexagonal, fog of war, y exploración hex
- **Branding dinámico** — "HALO" en login-logo y sidebar-logo → nombre de campaña
- **Queries hex_fog/exploration_log**: agregar `.eq('campaign_slug', CONFIG.SLUG)`
- **Campaign selector UI**: nueva pantalla entre login y dashboard (solo si 2+ campañas)

### 3.5 `planear.js`
- `CHAT_STORAGE_KEY` → función dinámica con slug
- Reemplazar `X-DM-Auth: 'halo-dm'` → auth por JWT

### 3.6 `preparador.js`
- Mismos cambios que planear.js
- Queries de `session_plans` → agregar `.eq('campaign_slug', CONFIG.SLUG)`

### 3.7 Archivos menores
- `sw.js`: `CACHE_NAME = 'dnd-campaign-v1'` (genérico, no depende de slug)
- `index.html`: título genérico "Campaña D&D" o dinámico post-selección
- `manifest.json`: nombre genérico "D&D Campaign Manager"

---

## Fase 4: UI nuevos

### 4.1 Pantalla "Crear campaña" (en login)
- Botón "Crear nueva campaña" en pantalla de login
- Formulario: nombre campaña, username DM, contraseña
- Llama a Edge Function `create-campaign`
- Al completar → login automático + dashboard vacío

### 4.2 Selector de campaña (post-login)
- Solo aparece si el usuario tiene 2+ membresías
- Cards con: nombre campaña, rol del usuario (DM/Jugador)
- Click → setea CONFIG.SLUG → carga app normal
- Botón en sidebar header para volver al selector

---

## Fase 5: Migración de Tierras Perdidas

1. Crear registro: `INSERT INTO campaigns VALUES ('tierras-perdidas', 'Las Tierras Perdidas')`
2. Si comparten Supabase project: `UPDATE` rows existentes con `campaign_slug = 'tierras-perdidas'`
3. Si son Supabase projects distintos: script de exportación/importación con mapeo de UUIDs
4. Crear `campaign_members` entries para los usuarios de tierras-perdidas

---

## Verificación

1. **Tests existentes**: Ejecutar `npx playwright test` — deben seguir pasando con datos de campaña 'halo'
2. **Login single-campaign**: Usuario con 1 membresía → entra directo sin selector
3. **Login multi-campaign**: Usuario con 2+ membresías → ve selector → elige → datos correctos
4. **Aislamiento**: DM de campaña A no ve datos de campaña B (verificar via Supabase dashboard)
5. **Crear campaña**: Nuevo DM se registra → dashboard vacío → puede crear ciudades/NPCs
6. **IA funciona**: Chat y planificador responden con contexto de la campaña seleccionada
7. **Mapa solo Halo**: En campaña distinta a 'halo', tab de mapa no aparece
8. **Storage aislado**: Fog/party/chat-history usan keys con prefijo de campaña

---

## Archivos críticos a modificar

| Archivo | Tipo de cambio |
|---------|---------------|
| `sql/migraciones/2026-04-05-multi-campaign.sql` | **Nuevo** — schema + RLS |
| `supabase/functions/create-campaign/index.ts` | **Nuevo** — registro DM |
| `config.js` | SLUG dinámico |
| `auth.js` | Multi-membership flow |
| `supabase-client.js` | Filtros campaign_slug en queries |
| `app.js` | Storage keys, selector UI, condicional mapa |
| `planear.js` | Storage key dinámico, JWT auth |
| `preparador.js` | campaign_slug en session_plans |
| `supabase/functions/chat/index.ts` | JWT auth, prompt dinámico |
| `supabase/functions/generate-session-plan/index.ts` | JWT auth, prompt dinámico |
| `sw.js` | Cache name genérico |
| `index.html` | Título/branding genérico |
| `manifest.json` | Nombre genérico |
