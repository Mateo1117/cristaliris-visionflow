-- Garantía para rehacer el trabajo: la nueva fórmula (si cambia) y el tipo
-- de lente quedan guardados en la garantía, y el detalle de la orden y la
-- etiqueta muestran esa fórmula en lugar de la de la consulta original.
ALTER TABLE public.garantias ADD COLUMN IF NOT EXISTS formula_nueva JSONB;
ALTER TABLE public.garantias ADD COLUMN IF NOT EXISTS tipo_lente_tiempo TEXT;
COMMENT ON COLUMN public.garantias.formula_nueva IS 'Fórmula para rehacer el trabajo: {od:{esfera,cilindro,eje,adicion,altura}, oi:{…}, dp, tipo_lente, notas}. NULL = misma fórmula.';
