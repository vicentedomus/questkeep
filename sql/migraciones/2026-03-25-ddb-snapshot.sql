-- Snapshot de datos de D&D Beyond en personajes
-- ddb_data: JSON completo parseado (abilities, spells, equipment, HP, etc.)
-- ddb_synced_at: última vez que se sincronizó desde D&D Beyond

ALTER TABLE personajes
  ADD COLUMN IF NOT EXISTS ddb_data JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ddb_synced_at TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN personajes.ddb_data IS 'Snapshot completo de D&D Beyond (abilities, spells, equipment, HP, etc.)';
COMMENT ON COLUMN personajes.ddb_synced_at IS 'Última sincronización desde D&D Beyond';
