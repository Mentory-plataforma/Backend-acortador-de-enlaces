-- Índices para el módulo de Estadísticas generales (rama Neon: "Gestión Clicks").
-- Son idempotentes y no modifican datos.
CREATE INDEX IF NOT EXISTS idx_visitas_link_id ON visitas(link_id);
CREATE INDEX IF NOT EXISTS idx_visitas_link_created_at ON visitas(link_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitas_created_at ON visitas(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_links_user_activo ON links(user_id, activo);
