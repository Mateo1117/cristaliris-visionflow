-- =====================================================================
-- Historial de fórmulas de un trabajo
-- =====================================================================
-- Cuando un lente se rehace (garantía después de la entrega, o reproceso
-- desde control de calidad) con una fórmula distinta, la nueva fórmula se
-- agrega aquí. La original (historia clínica o venta directa) no se toca:
-- el detalle de la orden muestra la vigente arriba y las anteriores debajo.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.formulas_ajuste (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_producto_id UUID NOT NULL REFERENCES public.orden_productos(id) ON DELETE CASCADE,
  origen            TEXT NOT NULL CHECK (origen IN ('garantia', 'reproceso')),
  referencia        TEXT,           -- subcódigo de la garantía, p. ej. G1-3F9A1C0B
  formula           JSONB NOT NULL, -- {od:{esfera,cilindro,eje,adicion,altura}, oi:{…}, dp, tipo_lente}
  motivo            TEXT,
  usuario_id        UUID DEFAULT auth.uid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS formulas_ajuste_producto_idx ON public.formulas_ajuste (orden_producto_id, created_at DESC);
COMMENT ON TABLE public.formulas_ajuste IS 'Fórmulas nuevas con las que se rehizo un trabajo (garantía o reproceso). La original queda en la historia clínica.';

ALTER TABLE public.formulas_ajuste ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Formulas ajuste viewable" ON public.formulas_ajuste;
CREATE POLICY "Formulas ajuste viewable" ON public.formulas_ajuste FOR SELECT TO authenticated
  USING (public.tiene_rol_asignado(auth.uid()));
DROP POLICY IF EXISTS "Formulas ajuste insert" ON public.formulas_ajuste;
CREATE POLICY "Formulas ajuste insert" ON public.formulas_ajuste FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role)
           OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
           OR public.has_role(auth.uid(), 'auxiliar_optica'::app_role)
           OR public.has_role(auth.uid(), 'optometra'::app_role));
DROP POLICY IF EXISTS "Formulas ajuste admin" ON public.formulas_ajuste;
CREATE POLICY "Formulas ajuste admin" ON public.formulas_ajuste FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Garantías que ya traían fórmula nueva pasan al historial.
INSERT INTO public.formulas_ajuste (orden_producto_id, origen, referencia, formula, motivo, created_at)
SELECT g.orden_producto_id, 'garantia', g.subcodigo, g.formula_nueva, g.motivo, g.fecha_solicitud
  FROM public.garantias g
 WHERE g.formula_nueva IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.formulas_ajuste f WHERE f.orden_producto_id = g.orden_producto_id AND f.referencia = g.subcodigo);
