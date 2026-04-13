-- =============================================================
-- Agregar contenido_html a tablas que tienen cuerpo de página
-- Fecha: 2026-03-20
-- Afecta: quests, items, notas_jugadores
-- =============================================================

ALTER TABLE quests
  ADD COLUMN IF NOT EXISTS contenido_html text;

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS contenido_html text;

ALTER TABLE notas_jugadores
  ADD COLUMN IF NOT EXISTS contenido_html text;
