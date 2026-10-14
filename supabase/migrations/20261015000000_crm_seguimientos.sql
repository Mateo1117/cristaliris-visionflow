-- =====================================================================
-- CRM: seguimiento de pacientes que compraron y recibieron sus gafas
-- =====================================================================
-- La lista de clientes sale de órdenes con productos en etapa 'entregado'.
-- Aquí se guarda cada contacto posterior a la entrega: llamada de
-- satisfacción, WhatsApp, recordatorio de control anual, notas, y la fecha
-- del próximo contacto.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.crm_seguimientos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id     UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  orden_id        UUID REFERENCES public.ordenes(id) ON DELETE SET NULL,
  tipo            TEXT NOT NULL DEFAULT 'nota'
                  CHECK (tipo IN ('llamada', 'whatsapp', 'visita', 'nota')),
  motivo          TEXT NOT NULL DEFAULT 'satisfaccion'
                  CHECK (motivo IN ('satisfaccion', 'control_anual', 'cobro', 'promocion', 'garantia', 'otro')),
  resultado       TEXT NOT NULL DEFAULT 'contactado'
                  CHECK (resultado IN ('contactado', 'no_contesta', 'satisfecho', 'insatisfecho', 'agendo_cita', 'no_interesado')),
  nota            TEXT,
  proximo_contacto DATE,
  usuario_id      UUID DEFAULT auth.uid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_seguimientos_paciente_idx ON public.crm_seguimientos (paciente_id, created_at DESC);
COMMENT ON TABLE public.crm_seguimientos IS 'Contactos de seguimiento (CRM) con pacientes después de la entrega.';

ALTER TABLE public.crm_seguimientos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CRM viewable" ON public.crm_seguimientos;
CREATE POLICY "CRM viewable" ON public.crm_seguimientos FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
      OR public.has_role(auth.uid(), 'auxiliar_optica'::app_role)
      OR public.has_role(auth.uid(), 'optometra'::app_role)
      OR public.has_role(auth.uid(), 'contador'::app_role));

DROP POLICY IF EXISTS "CRM insert" ON public.crm_seguimientos;
CREATE POLICY "CRM insert" ON public.crm_seguimientos FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
      OR public.has_role(auth.uid(), 'auxiliar_optica'::app_role)
      OR public.has_role(auth.uid(), 'optometra'::app_role));

-- Corregir o borrar: quien lo registró o un administrador.
DROP POLICY IF EXISTS "CRM update" ON public.crm_seguimientos;
CREATE POLICY "CRM update" ON public.crm_seguimientos FOR UPDATE TO authenticated
  USING (usuario_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (usuario_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
DROP POLICY IF EXISTS "CRM delete" ON public.crm_seguimientos;
CREATE POLICY "CRM delete" ON public.crm_seguimientos FOR DELETE TO authenticated
  USING (usuario_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
