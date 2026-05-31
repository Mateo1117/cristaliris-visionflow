
-- Fase 1: Catálogo de productos
CREATE TABLE public.productos_catalogo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  categoria TEXT NOT NULL, -- monofocal, bifocal, progresivo, lente_contacto, sol
  precio_full NUMERIC NOT NULL DEFAULT 0,
  aplica_descuento BOOLEAN NOT NULL DEFAULT true,
  activo BOOLEAN NOT NULL DEFAULT true,
  orden_display INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.productos_catalogo TO authenticated;
GRANT ALL ON public.productos_catalogo TO service_role;

ALTER TABLE public.productos_catalogo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Productos viewable" ON public.productos_catalogo FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage productos" ON public.productos_catalogo FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_productos_catalogo_updated_at BEFORE UPDATE ON public.productos_catalogo FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Empleados de nómina (referido por)
CREATE TABLE public.empleados_nomina (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  cedula TEXT NOT NULL,
  celular TEXT,
  email TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, cedula)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.empleados_nomina TO authenticated;
GRANT ALL ON public.empleados_nomina TO service_role;

ALTER TABLE public.empleados_nomina ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Empleados viewable" ON public.empleados_nomina FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert empleados" ON public.empleados_nomina FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Update empleados" ON public.empleados_nomina FOR UPDATE TO authenticated USING (true);

CREATE TRIGGER update_empleados_nomina_updated_at BEFORE UPDATE ON public.empleados_nomina FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Pacientes: anclar empleado titular + ocupación
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS ocupacion TEXT,
  ADD COLUMN IF NOT EXISTS empleado_titular_id UUID REFERENCES public.empleados_nomina(id),
  ADD COLUMN IF NOT EXISTS empleado_titular_nombre TEXT,
  ADD COLUMN IF NOT EXISTS empleado_titular_cedula TEXT,
  ADD COLUMN IF NOT EXISTS empleado_titular_celular TEXT;

-- Empresas: permitir 40 además de 45/50 (cambiar a integer libre, agregar check)
ALTER TABLE public.empresas
  DROP CONSTRAINT IF EXISTS empresas_porcentaje_descuento_check;
ALTER TABLE public.empresas
  ADD CONSTRAINT empresas_porcentaje_descuento_check CHECK (porcentaje_descuento IN (40, 45, 50));

-- Órdenes: número legible + montura propia + observaciones (ya existe) + medidas progresivo
ALTER TABLE public.ordenes
  ADD COLUMN IF NOT EXISTS numero_orden SERIAL,
  ADD COLUMN IF NOT EXISTS montura_propia BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS descuento_montura_propia NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.orden_productos
  ADD COLUMN IF NOT EXISTS producto_catalogo_id UUID REFERENCES public.productos_catalogo(id),
  ADD COLUMN IF NOT EXISTS numero_montura TEXT,
  ADD COLUMN IF NOT EXISTS medidas_progresivo JSONB;

-- Historia clínica: nuevos campos
ALTER TABLE public.historias_clinicas
  ADD COLUMN IF NOT EXISTS ocupacion TEXT,
  ADD COLUMN IF NOT EXISTS av_sin_correccion_od TEXT,
  ADD COLUMN IF NOT EXISTS av_sin_correccion_oi TEXT,
  ADD COLUMN IF NOT EXISTS lensometria_od_esfera NUMERIC,
  ADD COLUMN IF NOT EXISTS lensometria_od_cilindro NUMERIC,
  ADD COLUMN IF NOT EXISTS lensometria_od_eje INTEGER,
  ADD COLUMN IF NOT EXISTS lensometria_od_adicion NUMERIC,
  ADD COLUMN IF NOT EXISTS lensometria_oi_esfera NUMERIC,
  ADD COLUMN IF NOT EXISTS lensometria_oi_cilindro NUMERIC,
  ADD COLUMN IF NOT EXISTS lensometria_oi_eje INTEGER,
  ADD COLUMN IF NOT EXISTS lensometria_oi_adicion NUMERIC,
  ADD COLUMN IF NOT EXISTS keratometria_od TEXT,
  ADD COLUMN IF NOT EXISTS keratometria_oi TEXT,
  ADD COLUMN IF NOT EXISTS formula_tipo_lente TEXT,
  ADD COLUMN IF NOT EXISTS formula_filtros TEXT,
  ADD COLUMN IF NOT EXISTS formula_forma_uso TEXT,
  ADD COLUMN IF NOT EXISTS formula_observaciones TEXT,
  ADD COLUMN IF NOT EXISTS formula_control TEXT;

-- Cotizaciones: ya tiene items jsonb, no necesita schema change (validación en frontend)

-- Storage buckets para aprobaciones y comprobantes
INSERT INTO storage.buckets (id, name, public) VALUES 
  ('aprobaciones-nomina', 'aprobaciones-nomina', false),
  ('comprobantes-pago', 'comprobantes-pago', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Aprobaciones nomina read auth" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'aprobaciones-nomina');
CREATE POLICY "Aprobaciones nomina insert auth" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'aprobaciones-nomina');
CREATE POLICY "Aprobaciones nomina update auth" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'aprobaciones-nomina');

CREATE POLICY "Comprobantes pago read auth" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'comprobantes-pago');
CREATE POLICY "Comprobantes pago insert auth" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'comprobantes-pago');
CREATE POLICY "Comprobantes pago update auth" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'comprobantes-pago');
