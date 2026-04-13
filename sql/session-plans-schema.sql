-- =============================================================
-- DND-HALO — Session Plans (planes de sesión del DM)
-- =============================================================

CREATE TABLE IF NOT EXISTS session_plans (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre              TEXT NOT NULL,
  fecha_sesion        DATE,
  estado              TEXT DEFAULT 'borrador' CHECK (estado IN ('borrador', 'finalizado')),
  -- Inputs del DM
  input_personajes    JSONB DEFAULT '[]',
  input_strong_start  TEXT DEFAULT '',
  input_escenas       TEXT DEFAULT '',
  input_secretos      TEXT DEFAULT '',
  input_npcs_ids      UUID[] DEFAULT '{}',
  input_lugares_ids   UUID[] DEFAULT '{}',
  input_items_ids     UUID[] DEFAULT '{}',
  input_monstruos_ids UUID[] DEFAULT '{}',
  -- Bloques generados por IA
  bloque_strong_start TEXT,
  bloque_escenas      JSONB DEFAULT '[]',
  bloque_secretos     JSONB DEFAULT '[]',
  bloque_npcs         JSONB DEFAULT '[]',
  bloque_locaciones   JSONB DEFAULT '[]',
  bloque_tesoros      JSONB DEFAULT '[]',
  bloque_monstruos    JSONB DEFAULT '[]',
  -- Tracking de commits
  bloques_committed   JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Junction tables para vincular planes con entidades de la campaña
CREATE TABLE IF NOT EXISTS plan_npcs (
  plan_id      UUID REFERENCES session_plans(id) ON DELETE CASCADE,
  npc_id       UUID REFERENCES npcs(id) ON DELETE CASCADE,
  committed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (plan_id, npc_id)
);

CREATE TABLE IF NOT EXISTS plan_lugares (
  plan_id      UUID REFERENCES session_plans(id) ON DELETE CASCADE,
  lugar_id     UUID REFERENCES lugares(id) ON DELETE CASCADE,
  committed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (plan_id, lugar_id)
);

CREATE TABLE IF NOT EXISTS plan_items (
  plan_id      UUID REFERENCES session_plans(id) ON DELETE CASCADE,
  item_id      UUID REFERENCES items(id) ON DELETE CASCADE,
  committed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (plan_id, item_id)
);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_session_plans_updated_at
  BEFORE UPDATE ON session_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================================
-- RLS
-- =============================================================

ALTER TABLE session_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_npcs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_lugares  ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE items_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE monstruos     ENABLE ROW LEVEL SECURITY;

-- Solo DM puede leer/escribir session_plans y tablas de vínculo
CREATE POLICY "dm_only_session_plans" ON session_plans
  USING (get_user_role() = 'dm');
CREATE POLICY "dm_only_plan_npcs" ON plan_npcs
  USING (get_user_role() = 'dm');
CREATE POLICY "dm_only_plan_lugares" ON plan_lugares
  USING (get_user_role() = 'dm');
CREATE POLICY "dm_only_plan_items" ON plan_items
  USING (get_user_role() = 'dm');

-- items_catalog: DM full, players lectura (no archivados)
CREATE POLICY "dm_full_items_catalog" ON items_catalog
  USING (get_user_role() = 'dm');
CREATE POLICY "players_read_items_catalog" ON items_catalog
  FOR SELECT USING (get_user_role() = 'player' AND NOT archived);

-- monstruos: DM full, players lectura (no archivados)
CREATE POLICY "dm_full_monstruos" ON monstruos
  USING (get_user_role() = 'dm');
CREATE POLICY "players_read_monstruos" ON monstruos
  FOR SELECT USING (get_user_role() = 'player' AND NOT archived);
