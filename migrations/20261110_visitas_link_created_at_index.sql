-- Ayuda a resolver los filtros de fechas y el orden cronológico por enlace.
CREATE INDEX IF NOT EXISTS idx_visitas_link_created_at
  ON visitas (link_id, created_at DESC);
