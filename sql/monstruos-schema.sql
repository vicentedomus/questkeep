-- =============================================================
-- DND-HALO — Monstruos (catálogo general de monstruos D&D)
-- Tabla independiente de la campaña, solo referencia
-- =============================================================

CREATE TABLE IF NOT EXISTS monstruos (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre                TEXT NOT NULL,
  fuente                TEXT,
  tamano                TEXT,
  tipo                  TEXT,
  alineamiento          TEXT,
  ac                    TEXT,
  hp                    TEXT,
  velocidad             TEXT,
  fuerza                INT,
  destreza              INT,
  constitucion          INT,
  inteligencia          INT,
  sabiduria             INT,
  carisma               INT,
  tiradas_salvacion     TEXT,
  habilidades           TEXT,
  vulnerabilidades      TEXT,
  resistencias          TEXT,
  inmunidades_dano      TEXT,
  inmunidades_condicion TEXT,
  sentidos              TEXT,
  idiomas               TEXT,
  cr                    TEXT,
  rasgos                TEXT,
  acciones              TEXT,
  acciones_bonus        TEXT,
  reacciones            TEXT,
  acciones_legendarias  TEXT,
  entorno               TEXT,
  archived              BOOLEAN DEFAULT false,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monstruos_tipo ON monstruos(tipo);
CREATE INDEX IF NOT EXISTS idx_monstruos_cr ON monstruos(cr);
CREATE INDEX IF NOT EXISTS idx_monstruos_archived ON monstruos(archived) WHERE NOT archived;
