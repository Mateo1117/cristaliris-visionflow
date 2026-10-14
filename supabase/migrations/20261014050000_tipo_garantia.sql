-- Tipo de garantía: el periodo de adaptación de 7 días solo aplica a las
-- quejas de adaptación (el paciente no se acostumbra a la fórmula o al lente).
-- Los defectos físicos (lente rayado, montura torcida, error de fabricación)
-- se pueden reportar de inmediato.
ALTER TABLE public.garantias ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'defecto';
ALTER TABLE public.garantias DROP CONSTRAINT IF EXISTS garantias_tipo_check;
ALTER TABLE public.garantias ADD CONSTRAINT garantias_tipo_check CHECK (tipo IN ('defecto', 'adaptacion'));
COMMENT ON COLUMN public.garantias.tipo IS 'defecto = daño físico o de fabricación (sin espera); adaptacion = requiere 7 días desde la entrega.';
