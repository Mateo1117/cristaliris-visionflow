
CREATE TABLE public.horarios_medicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id uuid NOT NULL,
  dia_semana integer NOT NULL,
  hora_inicio time NOT NULL,
  hora_fin time NOT NULL,
  duracion_cita integer NOT NULL DEFAULT 30,
  sede_id uuid REFERENCES public.sedes(id),
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.horarios_medicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Horarios viewable" ON public.horarios_medicos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage horarios" ON public.horarios_medicos FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Horarios public read" ON public.horarios_medicos FOR SELECT TO anon USING (activo = true);
CREATE POLICY "Citas public insert" ON public.citas FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Citas public read" ON public.citas FOR SELECT TO anon USING (true);
