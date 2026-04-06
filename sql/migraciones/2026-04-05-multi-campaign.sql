-- =============================================================
-- MIGRACIÓN: Multi-Campaña (QuestKeep)
-- Fecha: 2026-04-05
--
-- Agrega soporte multi-campaña: tabla campaigns, columna
-- campaign_slug en 14 tablas, función get_campaign_role(),
-- y reemplazo de TODAS las RLS policies.
--
-- Ejecutar DESPUÉS de 2026-04-04-campaign-members.sql
-- =============================================================

BEGIN;

-- =============================================================
-- 1. TABLA CAMPAIGNS
-- =============================================================

CREATE TABLE IF NOT EXISTS campaigns (
  slug        TEXT PRIMARY KEY,
  nombre      TEXT NOT NULL,
  descripcion TEXT,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

-- Cualquier autenticado puede ver las campañas (necesario para selector)
CREATE POLICY "campaigns_select" ON campaigns
  FOR SELECT USING (auth.role() = 'authenticated');

-- Solo service_role puede insertar (via Edge Function create-campaign)
-- No se crea policy de INSERT para anon/authenticated

-- Registrar campaña Halo
INSERT INTO campaigns (slug, nombre)
VALUES ('halo', 'Halo')
ON CONFLICT (slug) DO NOTHING;

-- Agregar FK de campaign_members.campaign → campaigns.slug
ALTER TABLE campaign_members
  ADD CONSTRAINT fk_campaign_members_campaign
  FOREIGN KEY (campaign) REFERENCES campaigns(slug)
  ON DELETE CASCADE;

-- =============================================================
-- 2. AGREGAR campaign_slug A 14 TABLAS
-- Todos los registros existentes reciben 'halo' via DEFAULT.
-- Después se quita el DEFAULT para forzar slug explícito.
-- =============================================================

-- Principales (10)
ALTER TABLE ciudades         ADD COLUMN IF NOT EXISTS campaign_slug TEXT NOT NULL DEFAULT 'halo' REFERENCES campaigns(slug);
ALTER TABLE npcs             ADD COLUMN IF NOT EXISTS campaign_slug TEXT NOT NULL DEFAULT 'halo' REFERENCES campaigns(slug);
ALTER TABLE establecimientos ADD COLUMN IF NOT EXISTS campaign_slug TEXT NOT NULL DEFAULT 'halo' REFERENCES campaigns(slug);
ALTER TABLE personajes       ADD COLUMN IF NOT EXISTS campaign_slug TEXT NOT NULL DEFAULT 'halo' REFERENCES campaigns(slug);
ALTER TABLE items            ADD COLUMN IF NOT EXISTS campaign_slug TEXT NOT NULL DEFAULT 'halo' REFERENCES campaigns(slug);
ALTER TABLE quests           ADD COLUMN IF NOT EXISTS campaign_slug TEXT NOT NULL DEFAULT 'halo' REFERENCES campaigns(slug);
ALTER TABLE notas_dm         ADD COLUMN IF NOT EXISTS campaign_slug TEXT NOT NULL DEFAULT 'halo' REFERENCES campaigns(slug);
ALTER TABLE notas_jugadores  ADD COLUMN IF NOT EXISTS campaign_slug TEXT NOT NULL DEFAULT 'halo' REFERENCES campaigns(slug);
ALTER TABLE lugares          ADD COLUMN IF NOT EXISTS campaign_slug TEXT NOT NULL DEFAULT 'halo' REFERENCES campaigns(slug);
ALTER TABLE marcadores       ADD COLUMN IF NOT EXISTS campaign_slug TEXT NOT NULL DEFAULT 'halo' REFERENCES campaigns(slug);

-- Recientes (3)
ALTER TABLE entity_notes     ADD COLUMN IF NOT EXISTS campaign_slug TEXT NOT NULL DEFAULT 'halo' REFERENCES campaigns(slug);
ALTER TABLE hex_fog          ADD COLUMN IF NOT EXISTS campaign_slug TEXT NOT NULL DEFAULT 'halo' REFERENCES campaigns(slug);
ALTER TABLE exploration_log  ADD COLUMN IF NOT EXISTS campaign_slug TEXT NOT NULL DEFAULT 'halo' REFERENCES campaigns(slug);

-- Session plans (1)
ALTER TABLE session_plans    ADD COLUMN IF NOT EXISTS campaign_slug TEXT NOT NULL DEFAULT 'halo' REFERENCES campaigns(slug);

-- Quitar defaults (forzar slug explícito en futuros inserts)
ALTER TABLE ciudades         ALTER COLUMN campaign_slug DROP DEFAULT;
ALTER TABLE npcs             ALTER COLUMN campaign_slug DROP DEFAULT;
ALTER TABLE establecimientos ALTER COLUMN campaign_slug DROP DEFAULT;
ALTER TABLE personajes       ALTER COLUMN campaign_slug DROP DEFAULT;
ALTER TABLE items            ALTER COLUMN campaign_slug DROP DEFAULT;
ALTER TABLE quests           ALTER COLUMN campaign_slug DROP DEFAULT;
ALTER TABLE notas_dm         ALTER COLUMN campaign_slug DROP DEFAULT;
ALTER TABLE notas_jugadores  ALTER COLUMN campaign_slug DROP DEFAULT;
ALTER TABLE lugares          ALTER COLUMN campaign_slug DROP DEFAULT;
ALTER TABLE marcadores       ALTER COLUMN campaign_slug DROP DEFAULT;
ALTER TABLE entity_notes     ALTER COLUMN campaign_slug DROP DEFAULT;
ALTER TABLE hex_fog          ALTER COLUMN campaign_slug DROP DEFAULT;
ALTER TABLE exploration_log  ALTER COLUMN campaign_slug DROP DEFAULT;
ALTER TABLE session_plans    ALTER COLUMN campaign_slug DROP DEFAULT;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_ciudades_campaign         ON ciudades(campaign_slug);
CREATE INDEX IF NOT EXISTS idx_npcs_campaign             ON npcs(campaign_slug);
CREATE INDEX IF NOT EXISTS idx_establecimientos_campaign ON establecimientos(campaign_slug);
CREATE INDEX IF NOT EXISTS idx_personajes_campaign       ON personajes(campaign_slug);
CREATE INDEX IF NOT EXISTS idx_items_campaign            ON items(campaign_slug);
CREATE INDEX IF NOT EXISTS idx_quests_campaign           ON quests(campaign_slug);
CREATE INDEX IF NOT EXISTS idx_notas_dm_campaign         ON notas_dm(campaign_slug);
CREATE INDEX IF NOT EXISTS idx_notas_jugadores_campaign  ON notas_jugadores(campaign_slug);
CREATE INDEX IF NOT EXISTS idx_lugares_campaign          ON lugares(campaign_slug);
CREATE INDEX IF NOT EXISTS idx_marcadores_campaign       ON marcadores(campaign_slug);
CREATE INDEX IF NOT EXISTS idx_entity_notes_campaign     ON entity_notes(campaign_slug);
CREATE INDEX IF NOT EXISTS idx_hex_fog_campaign          ON hex_fog(campaign_slug);
CREATE INDEX IF NOT EXISTS idx_exploration_log_campaign  ON exploration_log(campaign_slug);
CREATE INDEX IF NOT EXISTS idx_session_plans_campaign    ON session_plans(campaign_slug);

-- Índice crítico para campaign_members (lookup rápido en RLS)
CREATE INDEX IF NOT EXISTS idx_campaign_members_lookup
  ON campaign_members(user_id, campaign);

-- =============================================================
-- 3. FUNCIÓN get_campaign_role(slug)
-- Reemplaza get_user_role() para RLS parametrizado por campaña.
-- =============================================================

CREATE OR REPLACE FUNCTION get_campaign_role(slug TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT role FROM public.campaign_members
  WHERE user_id = auth.uid() AND campaign = slug
  LIMIT 1;
$$;

-- =============================================================
-- 4. REEMPLAZAR RLS POLICIES — TABLAS PRINCIPALES
-- DROP old → CREATE new con get_campaign_role(campaign_slug)
-- =============================================================

-- ----- CIUDADES -----
DROP POLICY IF EXISTS "ciudades_select" ON ciudades;
DROP POLICY IF EXISTS "ciudades_insert" ON ciudades;
DROP POLICY IF EXISTS "ciudades_update" ON ciudades;
DROP POLICY IF EXISTS "ciudades_delete" ON ciudades;

CREATE POLICY "ciudades_select" ON ciudades FOR SELECT USING (
  get_campaign_role(campaign_slug) = 'dm'
  OR (get_campaign_role(campaign_slug) = 'player' AND NOT archived AND conocida_jugadores = true)
);
CREATE POLICY "ciudades_insert" ON ciudades FOR INSERT WITH CHECK (
  get_campaign_role(campaign_slug) = 'dm'
);
CREATE POLICY "ciudades_update" ON ciudades FOR UPDATE USING (
  get_campaign_role(campaign_slug) = 'dm'
);
CREATE POLICY "ciudades_delete" ON ciudades FOR DELETE USING (
  get_campaign_role(campaign_slug) = 'dm'
);

-- ----- NPCS -----
DROP POLICY IF EXISTS "npcs_select" ON npcs;
DROP POLICY IF EXISTS "npcs_insert" ON npcs;
DROP POLICY IF EXISTS "npcs_update" ON npcs;
DROP POLICY IF EXISTS "npcs_delete" ON npcs;

CREATE POLICY "npcs_select" ON npcs FOR SELECT USING (
  get_campaign_role(campaign_slug) = 'dm'
  OR (get_campaign_role(campaign_slug) = 'player' AND NOT archived AND conocido_jugadores = true)
);
CREATE POLICY "npcs_insert" ON npcs FOR INSERT WITH CHECK (
  get_campaign_role(campaign_slug) = 'dm'
  OR (get_campaign_role(campaign_slug) = 'player' AND creado_por_jugador = true)
);
CREATE POLICY "npcs_update" ON npcs FOR UPDATE USING (
  get_campaign_role(campaign_slug) = 'dm'
  OR (get_campaign_role(campaign_slug) = 'player' AND creado_por_jugador = true)
);
CREATE POLICY "npcs_delete" ON npcs FOR DELETE USING (
  get_campaign_role(campaign_slug) = 'dm'
);

-- ----- ESTABLECIMIENTOS -----
DROP POLICY IF EXISTS "establecimientos_select" ON establecimientos;
DROP POLICY IF EXISTS "establecimientos_insert" ON establecimientos;
DROP POLICY IF EXISTS "establecimientos_update" ON establecimientos;
DROP POLICY IF EXISTS "establecimientos_delete" ON establecimientos;

CREATE POLICY "establecimientos_select" ON establecimientos FOR SELECT USING (
  get_campaign_role(campaign_slug) = 'dm'
  OR (get_campaign_role(campaign_slug) = 'player' AND NOT archived AND conocido_jugadores = true)
);
CREATE POLICY "establecimientos_insert" ON establecimientos FOR INSERT WITH CHECK (
  get_campaign_role(campaign_slug) = 'dm'
  OR (get_campaign_role(campaign_slug) = 'player' AND creado_por_jugador = true)
);
CREATE POLICY "establecimientos_update" ON establecimientos FOR UPDATE USING (
  get_campaign_role(campaign_slug) = 'dm'
  OR (get_campaign_role(campaign_slug) = 'player' AND creado_por_jugador = true)
);
CREATE POLICY "establecimientos_delete" ON establecimientos FOR DELETE USING (
  get_campaign_role(campaign_slug) = 'dm'
);

-- ----- PERSONAJES -----
DROP POLICY IF EXISTS "personajes_select" ON personajes;
DROP POLICY IF EXISTS "personajes_insert" ON personajes;
DROP POLICY IF EXISTS "personajes_update" ON personajes;
DROP POLICY IF EXISTS "personajes_delete" ON personajes;

CREATE POLICY "personajes_select" ON personajes FOR SELECT USING (
  get_campaign_role(campaign_slug) IS NOT NULL
  AND (NOT archived OR get_campaign_role(campaign_slug) = 'dm')
);
CREATE POLICY "personajes_insert" ON personajes FOR INSERT WITH CHECK (
  get_campaign_role(campaign_slug) = 'dm'
);
CREATE POLICY "personajes_update" ON personajes FOR UPDATE USING (
  get_campaign_role(campaign_slug) = 'dm'
);
CREATE POLICY "personajes_delete" ON personajes FOR DELETE USING (
  get_campaign_role(campaign_slug) = 'dm'
);

-- ----- ITEMS -----
DROP POLICY IF EXISTS "items_select" ON items;
DROP POLICY IF EXISTS "items_insert" ON items;
DROP POLICY IF EXISTS "items_update" ON items;
DROP POLICY IF EXISTS "items_delete" ON items;

CREATE POLICY "items_select" ON items FOR SELECT USING (
  get_campaign_role(campaign_slug) = 'dm'
  OR (get_campaign_role(campaign_slug) = 'player' AND NOT archived AND conocido_jugadores = true)
);
CREATE POLICY "items_insert" ON items FOR INSERT WITH CHECK (
  get_campaign_role(campaign_slug) = 'dm'
);
CREATE POLICY "items_update" ON items FOR UPDATE USING (
  get_campaign_role(campaign_slug) = 'dm'
);
CREATE POLICY "items_delete" ON items FOR DELETE USING (
  get_campaign_role(campaign_slug) = 'dm'
);

-- ----- QUESTS -----
DROP POLICY IF EXISTS "quests_select" ON quests;
DROP POLICY IF EXISTS "quests_insert" ON quests;
DROP POLICY IF EXISTS "quests_update" ON quests;
DROP POLICY IF EXISTS "quests_delete" ON quests;

CREATE POLICY "quests_select" ON quests FOR SELECT USING (
  get_campaign_role(campaign_slug) = 'dm'
  OR (get_campaign_role(campaign_slug) = 'player' AND NOT archived AND conocido_jugadores = true)
);
CREATE POLICY "quests_insert" ON quests FOR INSERT WITH CHECK (
  get_campaign_role(campaign_slug) = 'dm'
);
CREATE POLICY "quests_update" ON quests FOR UPDATE USING (
  get_campaign_role(campaign_slug) = 'dm'
);
CREATE POLICY "quests_delete" ON quests FOR DELETE USING (
  get_campaign_role(campaign_slug) = 'dm'
);

-- ----- NOTAS_DM (solo DM) -----
DROP POLICY IF EXISTS "notas_dm_select" ON notas_dm;
DROP POLICY IF EXISTS "notas_dm_insert" ON notas_dm;
DROP POLICY IF EXISTS "notas_dm_update" ON notas_dm;
DROP POLICY IF EXISTS "notas_dm_delete" ON notas_dm;

CREATE POLICY "notas_dm_select" ON notas_dm FOR SELECT USING (
  get_campaign_role(campaign_slug) = 'dm'
);
CREATE POLICY "notas_dm_insert" ON notas_dm FOR INSERT WITH CHECK (
  get_campaign_role(campaign_slug) = 'dm'
);
CREATE POLICY "notas_dm_update" ON notas_dm FOR UPDATE USING (
  get_campaign_role(campaign_slug) = 'dm'
);
CREATE POLICY "notas_dm_delete" ON notas_dm FOR DELETE USING (
  get_campaign_role(campaign_slug) = 'dm'
);

-- ----- NOTAS_JUGADORES (cualquier miembro de la campaña) -----
DROP POLICY IF EXISTS "notas_jugadores_select" ON notas_jugadores;
DROP POLICY IF EXISTS "notas_jugadores_insert" ON notas_jugadores;
DROP POLICY IF EXISTS "notas_jugadores_update" ON notas_jugadores;
DROP POLICY IF EXISTS "notas_jugadores_delete" ON notas_jugadores;

CREATE POLICY "notas_jugadores_select" ON notas_jugadores FOR SELECT USING (
  get_campaign_role(campaign_slug) IS NOT NULL AND NOT archived
);
CREATE POLICY "notas_jugadores_insert" ON notas_jugadores FOR INSERT WITH CHECK (
  get_campaign_role(campaign_slug) IS NOT NULL
);
CREATE POLICY "notas_jugadores_update" ON notas_jugadores FOR UPDATE USING (
  get_campaign_role(campaign_slug) IS NOT NULL
);
CREATE POLICY "notas_jugadores_delete" ON notas_jugadores FOR DELETE USING (
  get_campaign_role(campaign_slug) IS NOT NULL
);

-- ----- LUGARES -----
DROP POLICY IF EXISTS "lugares_select" ON lugares;
DROP POLICY IF EXISTS "lugares_insert" ON lugares;
DROP POLICY IF EXISTS "lugares_update" ON lugares;
DROP POLICY IF EXISTS "lugares_delete" ON lugares;

CREATE POLICY "lugares_select" ON lugares FOR SELECT USING (
  get_campaign_role(campaign_slug) = 'dm'
  OR (get_campaign_role(campaign_slug) = 'player' AND NOT archived AND conocido_jugadores = true)
);
CREATE POLICY "lugares_insert" ON lugares FOR INSERT WITH CHECK (
  get_campaign_role(campaign_slug) = 'dm'
  OR (get_campaign_role(campaign_slug) = 'player' AND creado_por_jugador = true)
);
CREATE POLICY "lugares_update" ON lugares FOR UPDATE USING (
  get_campaign_role(campaign_slug) = 'dm'
  OR (get_campaign_role(campaign_slug) = 'player' AND creado_por_jugador = true)
);
CREATE POLICY "lugares_delete" ON lugares FOR DELETE USING (
  get_campaign_role(campaign_slug) = 'dm'
);

-- ----- MARCADORES (cualquier miembro) -----
DROP POLICY IF EXISTS "marcadores_select" ON marcadores;
DROP POLICY IF EXISTS "marcadores_insert" ON marcadores;
DROP POLICY IF EXISTS "marcadores_update" ON marcadores;
DROP POLICY IF EXISTS "marcadores_delete" ON marcadores;

CREATE POLICY "marcadores_select" ON marcadores FOR SELECT USING (
  get_campaign_role(campaign_slug) IS NOT NULL
);
CREATE POLICY "marcadores_insert" ON marcadores FOR INSERT WITH CHECK (
  get_campaign_role(campaign_slug) IS NOT NULL
);
CREATE POLICY "marcadores_update" ON marcadores FOR UPDATE USING (
  get_campaign_role(campaign_slug) IS NOT NULL
);
CREATE POLICY "marcadores_delete" ON marcadores FOR DELETE USING (
  get_campaign_role(campaign_slug) IS NOT NULL
);

-- =============================================================
-- 5. REEMPLAZAR RLS — TABLAS DE MIGRACIONES RECIENTES
-- =============================================================

-- ----- ENTITY_NOTES -----
DROP POLICY IF EXISTS "entity_notes_select" ON entity_notes;
DROP POLICY IF EXISTS "entity_notes_insert" ON entity_notes;
DROP POLICY IF EXISTS "entity_notes_update" ON entity_notes;

CREATE POLICY "entity_notes_select" ON entity_notes FOR SELECT USING (
  get_campaign_role(campaign_slug) IS NOT NULL
);
CREATE POLICY "entity_notes_insert" ON entity_notes FOR INSERT WITH CHECK (
  get_campaign_role(campaign_slug) IS NOT NULL
);
CREATE POLICY "entity_notes_update" ON entity_notes FOR UPDATE USING (
  get_campaign_role(campaign_slug) IS NOT NULL
);

-- ----- HEX_FOG -----
DROP POLICY IF EXISTS "hex_fog_select" ON hex_fog;
DROP POLICY IF EXISTS "hex_fog_all" ON hex_fog;
DROP POLICY IF EXISTS "hex_fog_insert" ON hex_fog;
DROP POLICY IF EXISTS "hex_fog_update" ON hex_fog;

CREATE POLICY "hex_fog_select" ON hex_fog FOR SELECT USING (
  get_campaign_role(campaign_slug) IS NOT NULL
);
CREATE POLICY "hex_fog_insert" ON hex_fog FOR INSERT WITH CHECK (
  get_campaign_role(campaign_slug) IS NOT NULL
);
CREATE POLICY "hex_fog_update" ON hex_fog FOR UPDATE USING (
  get_campaign_role(campaign_slug) IS NOT NULL
);

-- ----- EXPLORATION_LOG -----
DROP POLICY IF EXISTS "exploration_log_select" ON exploration_log;
DROP POLICY IF EXISTS "exploration_log_all" ON exploration_log;
DROP POLICY IF EXISTS "exploration_log_insert" ON exploration_log;

CREATE POLICY "exploration_log_select" ON exploration_log FOR SELECT USING (
  get_campaign_role(campaign_slug) IS NOT NULL
);
CREATE POLICY "exploration_log_insert" ON exploration_log FOR INSERT WITH CHECK (
  get_campaign_role(campaign_slug) IS NOT NULL
);

-- =============================================================
-- 6. REEMPLAZAR RLS — SESSION PLANS (solo DM de la campaña)
-- =============================================================

DROP POLICY IF EXISTS "dm_only_session_plans" ON session_plans;
DROP POLICY IF EXISTS "dm_only_plan_npcs" ON plan_npcs;
DROP POLICY IF EXISTS "dm_only_plan_lugares" ON plan_lugares;
DROP POLICY IF EXISTS "dm_only_plan_items" ON plan_items;

CREATE POLICY "session_plans_dm" ON session_plans USING (
  get_campaign_role(campaign_slug) = 'dm'
);

-- Junction tables de plans: verificar via JOIN que el plan pertenece
-- a una campaña donde el usuario es DM
CREATE POLICY "plan_npcs_dm" ON plan_npcs USING (
  EXISTS (
    SELECT 1 FROM session_plans sp
    WHERE sp.id = plan_id AND get_campaign_role(sp.campaign_slug) = 'dm'
  )
);
CREATE POLICY "plan_lugares_dm" ON plan_lugares USING (
  EXISTS (
    SELECT 1 FROM session_plans sp
    WHERE sp.id = plan_id AND get_campaign_role(sp.campaign_slug) = 'dm'
  )
);
CREATE POLICY "plan_items_dm" ON plan_items USING (
  EXISTS (
    SELECT 1 FROM session_plans sp
    WHERE sp.id = plan_id AND get_campaign_role(sp.campaign_slug) = 'dm'
  )
);

-- =============================================================
-- 7. CATÁLOGOS COMPARTIDOS — Actualizar a campaign-aware
-- items_catalog y monstruos son globales, pero el acceso debe
-- validarse via membresía a CUALQUIER campaña.
-- =============================================================

DROP POLICY IF EXISTS "dm_full_items_catalog" ON items_catalog;
DROP POLICY IF EXISTS "players_read_items_catalog" ON items_catalog;
DROP POLICY IF EXISTS "dm_full_monstruos" ON monstruos;
DROP POLICY IF EXISTS "players_read_monstruos" ON monstruos;

-- Acceso si el usuario es miembro de CUALQUIER campaña
CREATE POLICY "items_catalog_select" ON items_catalog FOR SELECT USING (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);
CREATE POLICY "items_catalog_dm" ON items_catalog
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM campaign_members
      WHERE user_id = auth.uid() AND role = 'dm'
    )
  );

CREATE POLICY "monstruos_select" ON monstruos FOR SELECT USING (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);
CREATE POLICY "monstruos_dm" ON monstruos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM campaign_members
      WHERE user_id = auth.uid() AND role = 'dm'
    )
  );

-- =============================================================
-- 8. JUNCTION TABLES PRINCIPALES — Sin campaign_slug
-- El aislamiento viene de las tablas padre. Solo validar
-- que el usuario es miembro de alguna campaña.
-- =============================================================

-- Drop viejas
DROP POLICY IF EXISTS "npcs_items_select" ON npcs_items;
DROP POLICY IF EXISTS "npcs_items_insert" ON npcs_items;
DROP POLICY IF EXISTS "npcs_lugares_select" ON npcs_lugares;
DROP POLICY IF EXISTS "npcs_lugares_insert" ON npcs_lugares;
DROP POLICY IF EXISTS "npcs_quests_select" ON npcs_quests;
DROP POLICY IF EXISTS "npcs_quests_insert" ON npcs_quests;
DROP POLICY IF EXISTS "personajes_items_select" ON personajes_items;
DROP POLICY IF EXISTS "personajes_items_insert" ON personajes_items;
DROP POLICY IF EXISTS "quests_lugares_select" ON quests_lugares;
DROP POLICY IF EXISTS "quests_lugares_insert" ON quests_lugares;
DROP POLICY IF EXISTS "quests_ciudades_select" ON quests_ciudades;
DROP POLICY IF EXISTS "quests_ciudades_insert" ON quests_ciudades;
DROP POLICY IF EXISTS "quests_establecimientos_select" ON quests_establecimientos;
DROP POLICY IF EXISTS "quests_establecimientos_insert" ON quests_establecimientos;
DROP POLICY IF EXISTS "quests_notas_dm_select" ON quests_notas_dm;
DROP POLICY IF EXISTS "quests_notas_dm_insert" ON quests_notas_dm;
DROP POLICY IF EXISTS "lugares_items_select" ON lugares_items;
DROP POLICY IF EXISTS "lugares_items_insert" ON lugares_items;
DROP POLICY IF EXISTS "notas_jugadores_items_select" ON notas_jugadores_items;
DROP POLICY IF EXISTS "notas_jugadores_items_insert" ON notas_jugadores_items;

-- Nuevas: miembro de cualquier campaña puede leer/escribir
-- (el filtro real viene de las tablas padre via campaign_slug)
CREATE POLICY "junction_select" ON npcs_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);
CREATE POLICY "junction_insert" ON npcs_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);
CREATE POLICY "junction_delete" ON npcs_items FOR DELETE USING (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);

CREATE POLICY "junction_select" ON npcs_lugares FOR SELECT USING (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);
CREATE POLICY "junction_insert" ON npcs_lugares FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);
CREATE POLICY "junction_delete" ON npcs_lugares FOR DELETE USING (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);

CREATE POLICY "junction_select" ON npcs_quests FOR SELECT USING (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);
CREATE POLICY "junction_insert" ON npcs_quests FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);
CREATE POLICY "junction_delete" ON npcs_quests FOR DELETE USING (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);

CREATE POLICY "junction_select" ON personajes_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);
CREATE POLICY "junction_insert" ON personajes_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);
CREATE POLICY "junction_delete" ON personajes_items FOR DELETE USING (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);

CREATE POLICY "junction_select" ON quests_lugares FOR SELECT USING (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);
CREATE POLICY "junction_insert" ON quests_lugares FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);
CREATE POLICY "junction_delete" ON quests_lugares FOR DELETE USING (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);

CREATE POLICY "junction_select" ON quests_ciudades FOR SELECT USING (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);
CREATE POLICY "junction_insert" ON quests_ciudades FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);
CREATE POLICY "junction_delete" ON quests_ciudades FOR DELETE USING (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);

CREATE POLICY "junction_select" ON quests_establecimientos FOR SELECT USING (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);
CREATE POLICY "junction_insert" ON quests_establecimientos FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);
CREATE POLICY "junction_delete" ON quests_establecimientos FOR DELETE USING (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);

CREATE POLICY "junction_select" ON quests_notas_dm FOR SELECT USING (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);
CREATE POLICY "junction_insert" ON quests_notas_dm FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);
CREATE POLICY "junction_delete" ON quests_notas_dm FOR DELETE USING (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);

CREATE POLICY "junction_select" ON lugares_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);
CREATE POLICY "junction_insert" ON lugares_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);
CREATE POLICY "junction_delete" ON lugares_items FOR DELETE USING (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);

CREATE POLICY "junction_select" ON notas_jugadores_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);
CREATE POLICY "junction_insert" ON notas_jugadores_items FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);
CREATE POLICY "junction_delete" ON notas_jugadores_items FOR DELETE USING (
  EXISTS (SELECT 1 FROM campaign_members WHERE user_id = auth.uid())
);

COMMIT;
