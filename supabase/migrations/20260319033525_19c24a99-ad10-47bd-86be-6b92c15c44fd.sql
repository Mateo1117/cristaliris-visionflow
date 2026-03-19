-- Add DP per eye and vertex distance to historias_clinicas
ALTER TABLE public.historias_clinicas
  ADD COLUMN IF NOT EXISTS distancia_pupilar_od numeric,
  ADD COLUMN IF NOT EXISTS distancia_pupilar_oi numeric,
  ADD COLUMN IF NOT EXISTS distancia_vertice numeric;

-- Add tipo_lente_tiempo for production alerts (progresivo, terminado, montura_3piezas)
-- This column already exists, so we skip it
