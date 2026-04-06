# Plan QuestKeep: Multi-Campaña

## Contexto

Actualmente existen dos repos separados (`dnd-halo` y `dnd-tierras-perdidas`) que son copias del mismo código. Cada bug fix o feature hay que duplicarla. El objetivo es consolidar en **un solo deployment** que soporte múltiples campañas, donde un DM nuevo pueda registrarse y tener su campaña vacía.

**Ya implementado:** tabla `campaign_members`, auth individual por username, Edge Function `manage-users` (campaign-aware), `CONFIG.SLUG` (hardcodeado 'halo').

**Decisiones de diseño acordadas:**
- Mapa hexagonal (hex grid, fog of war) → **Solo Halo**
- IA (chat + planificador) → **Solo Halo**
- Catálogos (monstruos/items) → **Compartidos** (referencia D&D 5e)

---

## Fase 1: Base de datos

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
**Principales (10):** ciudades, npcs, establecimientos, personajes, items, quests, notas_dm, notas_jugadores, lugares, marcadores

**Recientes (3):** entity_notes, hex_fog, exploration_log

**Session plans (1):** session_plans

```sql
ALTER TABLE <tabla> ADD COLUMN campaign_slug TEXT NOT NULL DEFAULT 'halo' REFERENCES campaigns(slug);
-- Después:
ALTER COLUMN campaign_slug DROP DEFAULT;
CREATE INDEX idx_<tabla>_campaign ON <tabla>(campaign_slug);
```

### 1.3 Junction tables: SIN cambios
No necesitan `campaign_slug` — referencian entidades que ya lo tienen.

### 1.4 Catálogos compartidos: SIN cambios
`items_catalog` y `monstruos` son referencia global.

### 1.5 RLS policies campaign-aware

```sql
CREATE OR REPLACE FUNCTION get_campaign_role(slug TEXT)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM public.campaign_members
  WHERE user_id = auth.uid() AND campaign = slug LIMIT 1;
$$;
```

Patrón por tabla:
- **SELECT:** `get_campaign_role(campaign_slug) IN ('dm','player')` (+ filtros de visibilidad para players)
- **INSERT/UPDATE/DELETE:** `get_campaign_role(campaign_slug) = 'dm'`

---

## Fase 2: Edge Functions

### 2.1 `chat/index.ts`
- Reemplazar `X-DM-Auth: 'halo-dm'` → validación JWT + campaign_members
- Verificar que el usuario sea miembro de campaña 'halo' (IA solo disponible para Halo)
- System prompt se mantiene hardcodeado para Halo

### 2.2 `generate-session-plan/index.ts`
- Mismo cambio de auth (JWT + verificar membresía Halo)
- System prompt se mantiene hardcodeado para Halo

### 2.3 `manage-users/index.ts`
- Ya es campaign-aware. Sin cambios.

### 2.4 Nueva: `create-campaign/index.ts`
- Inputs: username, password, campaign name
- Crea usuario auth + genera slug + inserta en `campaigns` + `campaign_members` (role=dm)

---

## Fase 3: Frontend

### 3.1 `config.js`
- `CONFIG.SLUG` inicia como `null`, se setea después de login/selección

### 3.2 `auth.js`
- Nueva `fetchAllMemberships(userId, accessToken)` → trae TODAS las campañas del usuario
- Si tiene 1 → auto-selecciona (flujo idéntico al actual)
- Si tiene 2+ → retorna lista para selector
- Nueva `selectCampaign(membership)` → setea `CONFIG.SLUG` + sessionStorage
- `initAuth()` restaura CONFIG.SLUG desde sessionStorage

### 3.3 `supabase-client.js`
- Agregar `.eq('campaign_slug', CONFIG.SLUG)` a todos los queries en `loadAllData()`
- En `sbSave()`: agregar `campaign_slug: CONFIG.SLUG` al payload
- En entity notes y marcadores: mismo filtro

### 3.4 `app.js`
- **Storage keys dinámicos:**
  - `FOG_STORAGE_KEY` → `() => \`${CONFIG.SLUG}_fog_data\``
  - `PARTY_STORAGE_KEY` → `() => \`${CONFIG.SLUG}_party\``
  - Igual para col_order, visible_cols, map_markers, etc.
- **Tabs condicionales (solo Halo):** si `CONFIG.SLUG !== 'halo'`, ocultar tabs de Mapa, Planear (IA) y Chat (IA)
- **Branding dinámico:** "HALO" → nombre de campaña en login-logo y sidebar

### 3.5 `planear.js`
- Reemplazar `X-DM-Auth: 'halo-dm'` → JWT auth + `x-campaign-slug: 'halo'`
- Solo accesible cuando `CONFIG.SLUG === 'halo'`

### 3.6 `preparador.js`
- Mismos cambios que planear.js
- Solo accesible cuando `CONFIG.SLUG === 'halo'`

### 3.7 Archivos menores
- `sw.js`: cache name genérico
- `index.html`: título genérico
- `manifest.json`: nombre genérico

---

## Fase 4: UI nuevos

### 4.1 Pantalla "Crear campaña" (en login)
- Botón "Crear nueva campaña"
- Formulario: nombre campaña, username DM, contraseña
- Llama a Edge Function `create-campaign`

### 4.2 Selector de campaña (post-login)
- Solo aparece si 2+ membresías
- Cards con: nombre campaña, rol (DM/Jugador)
- Botón en sidebar para volver al selector

---

## Fase 5: Migración Tierras Perdidas

1. Crear registro en `campaigns`
2. Migrar datos existentes con `campaign_slug = 'tierras-perdidas'`
3. Crear `campaign_members` para usuarios de esa campaña

---

## Verificación

1. Tests Playwright existentes siguen pasando con datos 'halo'
2. Login single-campaign → entra directo sin selector
3. Login multi-campaign → ve selector → datos correctos
4. Aislamiento: DM de campaña A no ve datos de campaña B
5. Crear campaña nueva → dashboard vacío funcional
6. IA (chat + planificador) solo visible y funcional en campaña 'halo'
7. Mapa solo visible en campaña 'halo'
8. Storage aislado por campaña

---

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `sql/migraciones/2026-04-05-multi-campaign.sql` | **Nuevo** — schema + RLS |
| `supabase/functions/create-campaign/index.ts` | **Nuevo** — registro DM |
| `config.js` | SLUG dinámico |
| `auth.js` | Multi-membership flow |
| `supabase-client.js` | Filtros campaign_slug |
| `app.js` | Storage keys, selector, condicional mapa |
| `planear.js` | Storage dinámico, JWT auth |
| `preparador.js` | campaign_slug en queries |
| `supabase/functions/chat/index.ts` | JWT auth, prompt dinámico |
| `supabase/functions/generate-session-plan/index.ts` | JWT auth, prompt dinámico |
| `sw.js`, `index.html`, `manifest.json` | Branding genérico |
