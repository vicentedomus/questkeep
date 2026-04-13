-- =============================================================
-- DND-HALO — Items Catalog (catálogo general de items D&D)
-- Tabla independiente de la campaña, solo referencia
-- =============================================================

CREATE TABLE IF NOT EXISTS items_catalog (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre                TEXT NOT NULL,
  fuente                TEXT,
  rareza                TEXT,
  tipo                  TEXT,
  requiere_sintonizacion BOOLEAN DEFAULT false,
  dano                  TEXT,
  propiedades           TEXT,
  peso                  TEXT,
  valor                 TEXT,
  descripcion           TEXT,
  archived              BOOLEAN DEFAULT false,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_items_catalog_rareza ON items_catalog(rareza);
CREATE INDEX IF NOT EXISTS idx_items_catalog_tipo ON items_catalog(tipo);
CREATE INDEX IF NOT EXISTS idx_items_catalog_archived ON items_catalog(archived) WHERE NOT archived;
