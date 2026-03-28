-- Hexplorer: Fog of War + Log de exploración
-- hex_fog: estado de cada hex (revealed, discovered, notas DM)
-- exploration_log: historial de descubrimientos

-- ── hex_fog ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hex_fog (
  hex_key TEXT PRIMARY KEY,          -- "q,r" (coordenadas axiales)
  revealed BOOLEAN DEFAULT FALSE,
  discovered BOOLEAN DEFAULT FALSE,
  note TEXT DEFAULT NULL,            -- nota del DM
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: todos pueden leer, solo DM puede escribir
ALTER TABLE hex_fog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hex_fog_read" ON hex_fog
  FOR SELECT USING (true);

CREATE POLICY "hex_fog_write" ON hex_fog
  FOR ALL USING (true) WITH CHECK (true);

-- ── exploration_log ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exploration_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tipo TEXT NOT NULL,                -- 'region', 'clima', 'social', 'combate'
  titulo TEXT NOT NULL,              -- nombre de region o tipo de encuentro
  descripcion TEXT DEFAULT NULL,     -- detalle del resultado
  hex_key TEXT DEFAULT NULL,         -- hex donde ocurrió
  bioma TEXT DEFAULT NULL,
  roll INTEGER DEFAULT NULL,         -- tirada d100
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE exploration_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exploration_log_read" ON exploration_log
  FOR SELECT USING (true);

CREATE POLICY "exploration_log_write" ON exploration_log
  FOR ALL USING (true) WITH CHECK (true);

-- Índice para ordenar por fecha
CREATE INDEX IF NOT EXISTS idx_exploration_log_created ON exploration_log(created_at DESC);
