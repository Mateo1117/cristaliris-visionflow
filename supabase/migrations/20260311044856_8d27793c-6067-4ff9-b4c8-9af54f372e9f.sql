
-- Utility: update_updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ROLES
CREATE TYPE public.app_role AS ENUM ('admin', 'optometra', 'asesor_comercial', 'auxiliar_optica', 'mensajero', 'contador', 'visualizador');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- SEDES
CREATE TABLE public.sedes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  direccion TEXT,
  telefono TEXT,
  estado_activa BOOLEAN NOT NULL DEFAULT true,
  configuracion JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sedes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Sedes viewable by authenticated" ON public.sedes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage sedes" ON public.sedes FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_sedes_updated_at BEFORE UPDATE ON public.sedes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  email TEXT,
  telefono TEXT,
  sedes_asignadas UUID[] DEFAULT '{}',
  estado_activo BOOLEAN NOT NULL DEFAULT true,
  ultimo_acceso TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins manage profiles" ON public.profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nombre, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nombre', NEW.email), NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- EMPRESAS
CREATE TABLE public.empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nit TEXT NOT NULL UNIQUE,
  razon_social TEXT NOT NULL,
  porcentaje_descuento INTEGER NOT NULL DEFAULT 45 CHECK (porcentaje_descuento IN (45, 50)),
  contacto_rrhh TEXT,
  email TEXT,
  telefono TEXT,
  estado_activa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.empresas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Empresas viewable" ON public.empresas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage empresas" ON public.empresas FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_empresas_updated_at BEFORE UPDATE ON public.empresas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- PACIENTES
CREATE TABLE public.pacientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_documento TEXT NOT NULL CHECK (tipo_documento IN ('CC', 'CE', 'TI', 'PA', 'NIT')),
  numero_documento TEXT NOT NULL,
  nombres TEXT NOT NULL,
  apellidos TEXT NOT NULL,
  fecha_nacimiento DATE,
  genero TEXT CHECK (genero IN ('M', 'F', 'O')),
  telefono TEXT,
  email TEXT,
  direccion TEXT,
  ciudad TEXT DEFAULT 'Bogotá',
  departamento TEXT DEFAULT 'Cundinamarca',
  empresa_id UUID REFERENCES public.empresas(id),
  modalidad_pago TEXT NOT NULL DEFAULT 'contado' CHECK (modalidad_pago IN ('contado', 'nomina')),
  sede_registro UUID REFERENCES public.sedes(id),
  es_fuera_bogota BOOLEAN NOT NULL DEFAULT false,
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tipo_documento, numero_documento)
);
ALTER TABLE public.pacientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Pacientes viewable" ON public.pacientes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert pacientes" ON public.pacientes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Update pacientes" ON public.pacientes FOR UPDATE TO authenticated USING (true);
CREATE INDEX idx_pacientes_documento ON public.pacientes (tipo_documento, numero_documento);
CREATE TRIGGER update_pacientes_updated_at BEFORE UPDATE ON public.pacientes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- CITAS
CREATE TABLE public.citas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES public.pacientes(id),
  optometra_id UUID REFERENCES auth.users(id),
  sede_id UUID REFERENCES public.sedes(id),
  fecha DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  estado TEXT NOT NULL DEFAULT 'agendada' CHECK (estado IN ('agendada', 'confirmada', 'asistio', 'no_asistio', 'cancelada')),
  origen TEXT DEFAULT 'manual' CHECK (origen IN ('bot', 'manual', 'crm')),
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.citas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Citas viewable" ON public.citas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert citas" ON public.citas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Update citas" ON public.citas FOR UPDATE TO authenticated USING (true);
CREATE INDEX idx_citas_fecha ON public.citas (fecha, hora_inicio);
CREATE TRIGGER update_citas_updated_at BEFORE UPDATE ON public.citas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- HISTORIAS CLÍNICAS
CREATE TABLE public.historias_clinicas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES public.pacientes(id),
  optometra_id UUID REFERENCES auth.users(id),
  fecha_consulta TIMESTAMPTZ NOT NULL DEFAULT now(),
  anamnesis TEXT,
  antecedentes TEXT,
  agudeza_visual_od TEXT,
  agudeza_visual_oi TEXT,
  refraccion_od TEXT,
  refraccion_oi TEXT,
  formula_od_esfera NUMERIC(6,2),
  formula_od_cilindro NUMERIC(6,2),
  formula_od_eje INTEGER,
  formula_od_adicion NUMERIC(6,2),
  formula_oi_esfera NUMERIC(6,2),
  formula_oi_cilindro NUMERIC(6,2),
  formula_oi_eje INTEGER,
  formula_oi_adicion NUMERIC(6,2),
  distancia_pupilar NUMERIC(4,1),
  altura_pupilar_od NUMERIC(4,1),
  altura_pupilar_oi NUMERIC(4,1),
  diagnostico TEXT,
  codigo_cie10 TEXT,
  plan_manejo TEXT,
  observaciones TEXT,
  firma_optometra TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.historias_clinicas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Historias viewable" ON public.historias_clinicas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert historias" ON public.historias_clinicas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Update historias" ON public.historias_clinicas FOR UPDATE TO authenticated USING (true);
CREATE INDEX idx_historias_paciente ON public.historias_clinicas (paciente_id);
CREATE TRIGGER update_historias_updated_at BEFORE UPDATE ON public.historias_clinicas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- LABORATORIOS
CREATE TABLE public.laboratorios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  contacto TEXT,
  telefono TEXT,
  email TEXT,
  tiempo_promedio_entrega INTEGER DEFAULT 3,
  estado_activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.laboratorios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Labs viewable" ON public.laboratorios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage labs" ON public.laboratorios FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER update_laboratorios_updated_at BEFORE UPDATE ON public.laboratorios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ORDENES
CREATE TABLE public.ordenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES public.pacientes(id),
  cotizacion_id UUID,
  asesor_id UUID REFERENCES auth.users(id),
  optometra_id UUID REFERENCES auth.users(id),
  sede_id UUID REFERENCES public.sedes(id),
  empresa_id UUID REFERENCES public.empresas(id),
  modalidad_pago TEXT NOT NULL DEFAULT 'contado' CHECK (modalidad_pago IN ('contado', 'tarjeta', 'nomina', 'addi', 'link_pago')),
  subtotal NUMERIC(12,2) DEFAULT 0,
  descuento_porcentaje NUMERIC(5,2) DEFAULT 0,
  descuento_empresa NUMERIC(12,2) DEFAULT 0,
  recargo_financiero NUMERIC(12,2) DEFAULT 0,
  total_final NUMERIC(12,2) DEFAULT 0,
  saldo_pendiente NUMERIC(12,2) DEFAULT 0,
  estado_pago TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado_pago IN ('pendiente', 'parcial', 'pagado')),
  soporte_pago_url TEXT,
  aprobacion_nomina_estado TEXT CHECK (aprobacion_nomina_estado IN ('pendiente', 'aprobada', 'rechazada')),
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ordenes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ordenes viewable" ON public.ordenes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert ordenes" ON public.ordenes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Update ordenes" ON public.ordenes FOR UPDATE TO authenticated USING (true);
CREATE INDEX idx_ordenes_paciente ON public.ordenes (paciente_id);
CREATE TRIGGER update_ordenes_updated_at BEFORE UPDATE ON public.ordenes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ESTADO PRODUCTO ENUM
CREATE TYPE public.estado_producto AS ENUM (
  'pedido_creado', 'enviado_laboratorio', 'recibido_laboratorio',
  'en_produccion', 'producido', 'en_transito', 'recibido_optica',
  'control_calidad', 'listo_entrega', 'entregado'
);

-- ORDEN PRODUCTOS
CREATE TABLE public.orden_productos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id UUID NOT NULL REFERENCES public.ordenes(id) ON DELETE CASCADE,
  tipo_producto TEXT NOT NULL CHECK (tipo_producto IN ('lente', 'montura', 'insumo')),
  descripcion TEXT NOT NULL,
  montura_id UUID,
  lente_tipo TEXT,
  laboratorio_id UUID REFERENCES public.laboratorios(id),
  codigo_qr TEXT UNIQUE,
  estado_actual public.estado_producto NOT NULL DEFAULT 'pedido_creado',
  costo_laboratorio NUMERIC(12,2) DEFAULT 0,
  costo_montura NUMERIC(12,2) DEFAULT 0,
  costo_lente NUMERIC(12,2) DEFAULT 0,
  costo_insumos NUMERIC(12,2) DEFAULT 0,
  precio_venta NUMERIC(12,2) DEFAULT 0,
  comision_financiera NUMERIC(12,2) DEFAULT 0,
  utilidad_calculada NUMERIC(12,2) DEFAULT 0,
  numero_orden_laboratorio TEXT,
  fecha_envio_lab TIMESTAMPTZ,
  fecha_recepcion_lab TIMESTAMPTZ,
  fecha_control_calidad TIMESTAMPTZ,
  fecha_listo_entrega TIMESTAMPTZ,
  fecha_entrega_real TIMESTAMPTZ,
  tipo_lente_tiempo TEXT CHECK (tipo_lente_tiempo IN ('1_dia', '3_dias')),
  es_reproceso BOOLEAN DEFAULT false,
  es_garantia BOOLEAN DEFAULT false,
  garantia_codigo TEXT,
  ciclo_garantia INTEGER DEFAULT 0,
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orden_productos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Productos viewable" ON public.orden_productos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert productos" ON public.orden_productos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Update productos" ON public.orden_productos FOR UPDATE TO authenticated USING (true);
CREATE INDEX idx_productos_orden ON public.orden_productos (orden_id);
CREATE INDEX idx_productos_estado ON public.orden_productos (estado_actual);
CREATE INDEX idx_productos_qr ON public.orden_productos (codigo_qr);
CREATE TRIGGER update_orden_productos_updated_at BEFORE UPDATE ON public.orden_productos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ESTADOS PRODUCTO (audit trail)
CREATE TABLE public.estados_producto (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_producto_id UUID NOT NULL REFERENCES public.orden_productos(id) ON DELETE CASCADE,
  estado_anterior public.estado_producto,
  estado_nuevo public.estado_producto NOT NULL,
  fecha_cambio TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario_id UUID REFERENCES auth.users(id),
  metodo TEXT DEFAULT 'manual' CHECK (metodo IN ('qr_scan', 'manual', 'admin_retroceso')),
  justificacion TEXT,
  ip_registro TEXT
);
ALTER TABLE public.estados_producto ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Estados viewable" ON public.estados_producto FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert estados" ON public.estados_producto FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX idx_estados_producto ON public.estados_producto (orden_producto_id);

-- ABONOS
CREATE TABLE public.abonos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id UUID NOT NULL REFERENCES public.ordenes(id),
  paciente_id UUID NOT NULL REFERENCES public.pacientes(id),
  monto NUMERIC(12,2) NOT NULL,
  fecha_abono TIMESTAMPTZ NOT NULL DEFAULT now(),
  medio_pago TEXT NOT NULL,
  referencia_pago TEXT,
  soporte_url TEXT,
  registrado_por UUID REFERENCES auth.users(id),
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.abonos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Abonos viewable" ON public.abonos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert abonos" ON public.abonos FOR INSERT TO authenticated WITH CHECK (true);

-- INVENTARIO
CREATE TABLE public.inventario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sede_id UUID REFERENCES public.sedes(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('montura', 'lente', 'insumo')),
  codigo_referencia TEXT,
  marca TEXT,
  modelo TEXT,
  descripcion TEXT,
  cantidad_disponible INTEGER NOT NULL DEFAULT 0,
  stock_minimo INTEGER NOT NULL DEFAULT 5,
  costo_unitario NUMERIC(12,2) DEFAULT 0,
  precio_venta NUMERIC(12,2) DEFAULT 0,
  ubicacion_estante TEXT,
  estado TEXT DEFAULT 'activo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.inventario ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Inventario viewable" ON public.inventario FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert inventario" ON public.inventario FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Update inventario" ON public.inventario FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_inventario_updated_at BEFORE UPDATE ON public.inventario FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- GARANTIAS
CREATE TABLE public.garantias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_producto_id UUID NOT NULL REFERENCES public.orden_productos(id),
  subcodigo TEXT NOT NULL,
  ciclo INTEGER NOT NULL DEFAULT 1,
  motivo TEXT NOT NULL,
  fecha_solicitud TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_resolucion TIMESTAMPTZ,
  laboratorio_id UUID REFERENCES public.laboratorios(id),
  estado TEXT DEFAULT 'solicitada',
  guia_envio TEXT,
  envio_asumido_por TEXT CHECK (envio_asumido_por IN ('optica', 'paciente', 'laboratorio')),
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.garantias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Garantias viewable" ON public.garantias FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert garantias" ON public.garantias FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Update garantias" ON public.garantias FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_garantias_updated_at BEFORE UPDATE ON public.garantias FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- CAJA DIARIA
CREATE TABLE public.caja_diaria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sede_id UUID REFERENCES public.sedes(id),
  usuario_id UUID REFERENCES auth.users(id),
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  hora_apertura TIMESTAMPTZ NOT NULL DEFAULT now(),
  hora_cierre TIMESTAMPTZ,
  monto_apertura NUMERIC(12,2) NOT NULL DEFAULT 0,
  ingresos_efectivo NUMERIC(12,2) DEFAULT 0,
  ingresos_tarjeta NUMERIC(12,2) DEFAULT 0,
  ingresos_transferencia NUMERIC(12,2) DEFAULT 0,
  egresos NUMERIC(12,2) DEFAULT 0,
  monto_cierre NUMERIC(12,2),
  diferencia NUMERIC(12,2),
  estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'cerrada')),
  observaciones TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.caja_diaria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Caja viewable" ON public.caja_diaria FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert caja" ON public.caja_diaria FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Update caja" ON public.caja_diaria FOR UPDATE TO authenticated USING (true);

-- FESTIVOS
CREATE TABLE public.festivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL UNIQUE,
  descripcion TEXT,
  anio INTEGER
);
ALTER TABLE public.festivos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Festivos viewable" ON public.festivos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage festivos" ON public.festivos FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- LOG AUDITORIA
CREATE TABLE public.log_auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES auth.users(id),
  entidad TEXT NOT NULL,
  entidad_id UUID,
  accion TEXT NOT NULL,
  datos_anteriores JSONB,
  datos_nuevos JSONB,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.log_auditoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Audit viewable by admins" ON public.log_auditoria FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Insert audit" ON public.log_auditoria FOR INSERT TO authenticated WITH CHECK (true);
CREATE INDEX idx_audit_entidad ON public.log_auditoria (entidad, entidad_id);

-- COTIZACIONES
CREATE TABLE public.cotizaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paciente_id UUID NOT NULL REFERENCES public.pacientes(id),
  asesor_id UUID REFERENCES auth.users(id),
  items JSONB NOT NULL DEFAULT '[]',
  total_estimado NUMERIC(12,2) DEFAULT 0,
  estado TEXT NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente', 'convertida', 'vencida')),
  fecha_vencimiento DATE,
  orden_id_convertida UUID REFERENCES public.ordenes(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.cotizaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cotizaciones viewable" ON public.cotizaciones FOR SELECT TO authenticated USING (true);
CREATE POLICY "Insert cotizaciones" ON public.cotizaciones FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Update cotizaciones" ON public.cotizaciones FOR UPDATE TO authenticated USING (true);
CREATE TRIGGER update_cotizaciones_updated_at BEFORE UPDATE ON public.cotizaciones FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- SEED SEDES
INSERT INTO public.sedes (nombre, direccion, telefono) VALUES
  ('Sede Norte', 'Cra 15 #120-45, Bogotá', '601-555-0001'),
  ('Sede Sur', 'Calle 40 Sur #68-12, Bogotá', '601-555-0002');

-- SEED LABORATORIOS
INSERT INTO public.laboratorios (nombre, contacto, telefono, tiempo_promedio_entrega) VALUES
  ('Servioptica', 'Juan Pérez', '601-555-1001', 3),
  ('Industrias Ópticas', 'María López', '601-555-1002', 3),
  ('Hoya', 'Carlos Ruiz', '601-555-1003', 3),
  ('Essilor', 'Ana García', '601-555-1004', 3),
  ('Zeiss', 'Pedro Martínez', '601-555-1005', 3);
