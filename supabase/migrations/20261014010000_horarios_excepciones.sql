-- =====================================================================
-- AUSENCIAS Y BLOQUEOS DE LA AGENDA DE CADA MÉDICO
-- =====================================================================
-- El horario semanal (horarios_medicos) no tenía cómo decir "Claudia está
-- de vacaciones del 20 al 27" o "el jueves sale a las 3 p. m.": la agenda
-- seguía ofreciendo esos turnos. Cada fila bloquea un rango de fechas,
-- el día completo o solo unas horas (hora_inicio / hora_fin).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.horarios_excepciones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id     UUID NOT NULL,
  fecha_inicio  DATE NOT NULL,
  fecha_fin     DATE NOT NULL,
  hora_inicio   TIME,
  hora_fin      TIME,
  motivo        TEXT NOT NULL DEFAULT 'Ausencia',
  creado_por    UUID DEFAULT auth.uid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT horarios_excepciones_rango_fechas CHECK (fecha_fin >= fecha_inicio),
  CONSTRAINT horarios_excepciones_horas CHECK (
    (hora_inicio IS NULL AND hora_fin IS NULL)
    OR (hora_inicio IS NOT NULL AND hora_fin IS NOT NULL AND hora_fin > hora_inicio)
  )
);

COMMENT ON TABLE public.horarios_excepciones IS
  'Ausencias o bloqueos de la agenda de un médico. Sin horas = día completo; con horas = solo ese rango cada día del período.';

CREATE INDEX IF NOT EXISTS idx_horarios_excepciones_medico_fechas
  ON public.horarios_excepciones (medico_id, fecha_inicio, fecha_fin);

ALTER TABLE public.horarios_excepciones ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario con rol (la agenda la necesita para calcular turnos).
DROP POLICY IF EXISTS "Excepciones viewable" ON public.horarios_excepciones;
CREATE POLICY "Excepciones viewable" ON public.horarios_excepciones
  FOR SELECT TO authenticated USING (public.tiene_rol_asignado(auth.uid()));

-- Gestión: admin, igual que horarios_medicos.
DROP POLICY IF EXISTS "Admins manage excepciones" ON public.horarios_excepciones;
CREATE POLICY "Admins manage excepciones" ON public.horarios_excepciones
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
