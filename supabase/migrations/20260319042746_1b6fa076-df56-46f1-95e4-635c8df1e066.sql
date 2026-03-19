
-- Table for persistent notifications
CREATE TABLE public.notificaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL DEFAULT 'alerta_produccion',
  titulo text NOT NULL,
  detalle text,
  orden_producto_id uuid REFERENCES public.orden_productos(id) ON DELETE CASCADE,
  leida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Notificaciones viewable" ON public.notificaciones
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Insert notificaciones" ON public.notificaciones
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Update notificaciones" ON public.notificaciones
  FOR UPDATE TO authenticated USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notificaciones;
