-- Agregar columna dndbeyond_url a la tabla personajes
ALTER TABLE personajes ADD COLUMN IF NOT EXISTS dndbeyond_url TEXT;
