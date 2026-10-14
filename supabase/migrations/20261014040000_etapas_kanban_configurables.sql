-- =====================================================================
-- ETAPAS DEL TABLERO (KANBAN) CONFIGURABLES
-- =====================================================================
-- Las etapas eran un tipo cerrado (estado_producto) con 11 valores fijos.
-- Ahora viven en la tabla kanban_etapas: se pueden renombrar, reordenar,
-- ocultar, colorear, asignar responsable y crear etapas nuevas.
--
-- Las 11 claves originales se conservan (sistema = true) porque tienen
-- comportamiento propio: control de calidad, aviso de "listo para entrega",
-- fechas del ciclo y alertas de laboratorio. Las etapas nuevas no lo tienen.
--
-- mover_etapa(): única vía para cambiar la etapa de un producto. Permite que
-- el mensajero mueva tarjetas sin darle permiso de editar la orden (la RLS
-- de orden_productos solo deja escribir a admin/asesor/auxiliar/optómetra).
-- =====================================================================

-- 1. estado_actual y el historial pasan de enum a texto ----------------
ALTER TABLE public.orden_productos ALTER COLUMN estado_actual DROP DEFAULT;
ALTER TABLE public.orden_productos ALTER COLUMN estado_actual TYPE TEXT USING estado_actual::TEXT;
ALTER TABLE public.orden_productos ALTER COLUMN estado_actual SET DEFAULT 'pedido_creado';
ALTER TABLE public.estados_producto ALTER COLUMN estado_anterior TYPE TEXT USING estado_anterior::TEXT;
ALTER TABLE public.estados_producto ALTER COLUMN estado_nuevo TYPE TEXT USING estado_nuevo::TEXT;

-- 2. Etapas -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kanban_etapas (
  clave          TEXT PRIMARY KEY,
  nombre         TEXT NOT NULL,
  orden          INTEGER NOT NULL,
  color          TEXT NOT NULL DEFAULT 'gris',
  visible        BOOLEAN NOT NULL DEFAULT TRUE,
  responsable_id UUID,
  es_laboratorio BOOLEAN NOT NULL DEFAULT FALSE,
  sistema        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT kanban_etapas_clave_formato CHECK (clave ~ '^[a-z0-9_]+$')
);
COMMENT ON TABLE public.kanban_etapas IS 'Etapas (columnas) del tablero de órdenes, en el orden y con los nombres que define la óptica.';

-- Flujo inicial pedido por la óptica.
INSERT INTO public.kanban_etapas (clave, nombre, orden, color, visible, es_laboratorio, sistema, responsable_id) VALUES
  ('pedido_creado',        'Pedido creado',           1,  'gris',     TRUE,  FALSE, TRUE, (SELECT user_id FROM public.profiles WHERE nombre ILIKE 'claudia chav%' LIMIT 1)),
  ('alistamiento',         'Recoge mensajero',        2,  'morado',   TRUE,  FALSE, TRUE, (SELECT user_id FROM public.profiles WHERE nombre ILIKE 'cesar%' LIMIT 1)),
  ('enviado_laboratorio',  'Entregado a laboratorio', 3,  'azul',     TRUE,  TRUE,  TRUE, (SELECT user_id FROM public.profiles WHERE nombre ILIKE 'cesar%' LIMIT 1)),
  ('recibido_laboratorio', 'Recibido en laboratorio', 4,  'azul',     FALSE, TRUE,  TRUE, NULL),
  ('en_produccion',        'Producción',              5,  'amarillo', FALSE, TRUE,  TRUE, NULL),
  ('producido',            'Producido',               6,  'amarillo', TRUE,  TRUE,  TRUE, (SELECT user_id FROM public.profiles WHERE nombre ILIKE 'cesar%' LIMIT 1)),
  ('en_transito',          'En tránsito',             7,  'cian',     FALSE, FALSE, TRUE, NULL),
  ('recibido_optica',      'Entregado en óptica',     8,  'cian',     TRUE,  FALSE, TRUE, NULL),
  ('control_calidad',      'Control de calidad',      9,  'naranja',  TRUE,  FALSE, TRUE, NULL),
  ('listo_entrega',        'Listo para entrega',      10, 'verde',    TRUE,  FALSE, TRUE, NULL),
  ('entregado',            'Entregado',               11, 'verde',    TRUE,  FALSE, TRUE, NULL)
ON CONFLICT (clave) DO NOTHING;

ALTER TABLE public.orden_productos DROP CONSTRAINT IF EXISTS orden_productos_estado_actual_fkey;
ALTER TABLE public.orden_productos ADD CONSTRAINT orden_productos_estado_actual_fkey
  FOREIGN KEY (estado_actual) REFERENCES public.kanban_etapas(clave) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.kanban_etapas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Etapas viewable" ON public.kanban_etapas;
CREATE POLICY "Etapas viewable" ON public.kanban_etapas FOR SELECT TO authenticated USING (public.tiene_rol_asignado(auth.uid()));
DROP POLICY IF EXISTS "Admins manage etapas" ON public.kanban_etapas;
CREATE POLICY "Admins manage etapas" ON public.kanban_etapas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Las etapas del sistema no se borran (tienen comportamiento propio).
CREATE OR REPLACE FUNCTION public.fn_kanban_etapas_protege_sistema()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.sistema THEN
    RAISE EXCEPTION 'La etapa "%" es del sistema: se puede renombrar u ocultar, pero no eliminar', OLD.nombre;
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_kanban_etapas_protege_sistema ON public.kanban_etapas;
CREATE TRIGGER trg_kanban_etapas_protege_sistema BEFORE DELETE ON public.kanban_etapas
  FOR EACH ROW EXECUTE FUNCTION public.fn_kanban_etapas_protege_sistema();

-- 3. Mover un producto de etapa -----------------------------------------
CREATE OR REPLACE FUNCTION public.mover_etapa(
  p_orden_producto_id UUID,
  p_estado            TEXT,
  p_metodo            TEXT DEFAULT 'manual',
  p_justificacion     TEXT DEFAULT NULL,
  p_observaciones     TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actual     TEXT;
  v_orden_a    INTEGER;
  v_orden_b    INTEGER;
  v_es_admin   BOOLEAN := public.has_role(auth.uid(), 'admin'::app_role);
  v_retroceso  BOOLEAN;
  v_reproceso  BOOLEAN := FALSE;
  v_lab_destino BOOLEAN;
BEGIN
  IF NOT (v_es_admin
       OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
       OR public.has_role(auth.uid(), 'auxiliar_optica'::app_role)
       OR public.has_role(auth.uid(), 'optometra'::app_role)
       OR public.has_role(auth.uid(), 'mensajero'::app_role)) THEN
    RAISE EXCEPTION 'No tiene permiso para mover órdenes en el tablero';
  END IF;

  SELECT estado_actual INTO v_actual FROM public.orden_productos WHERE id = p_orden_producto_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El producto de la orden no existe'; END IF;
  IF v_actual = p_estado THEN RETURN jsonb_build_object('reproceso', FALSE); END IF;

  SELECT orden INTO v_orden_a FROM public.kanban_etapas WHERE clave = v_actual;
  SELECT orden, es_laboratorio INTO v_orden_b, v_lab_destino FROM public.kanban_etapas WHERE clave = p_estado;
  IF v_orden_b IS NULL THEN RAISE EXCEPTION 'La etapa "%" no existe', p_estado; END IF;

  v_retroceso := v_orden_a IS NOT NULL AND v_orden_b < v_orden_a;
  IF v_retroceso THEN
    -- Devolver desde control de calidad al laboratorio = reproceso interno:
    -- lo hace quien revisa la calidad. Cualquier otro retroceso, solo admin.
    v_reproceso := v_actual = 'control_calidad' AND coalesce(v_lab_destino, FALSE);
    IF NOT v_es_admin AND NOT v_reproceso THEN RAISE EXCEPTION 'Solo un administrador puede devolver una orden a una etapa anterior'; END IF;
    IF coalesce(length(trim(p_justificacion)), 0) < 5 THEN RAISE EXCEPTION 'Para devolver la orden escriba la justificación'; END IF;
  END IF;

  UPDATE public.orden_productos SET
    estado_actual        = p_estado,
    fecha_envio_lab      = CASE WHEN p_estado = 'enviado_laboratorio' OR v_reproceso THEN now() ELSE fecha_envio_lab END,
    fecha_recepcion_lab  = CASE WHEN p_estado = 'recibido_laboratorio' THEN now() ELSE fecha_recepcion_lab END,
    fecha_control_calidad= CASE WHEN p_estado = 'control_calidad' THEN now() ELSE fecha_control_calidad END,
    fecha_listo_entrega  = CASE WHEN p_estado = 'listo_entrega' THEN now() ELSE fecha_listo_entrega END,
    fecha_entrega_real   = CASE WHEN p_estado = 'entregado' THEN now() ELSE fecha_entrega_real END,
    es_reproceso         = es_reproceso OR v_reproceso,
    observaciones        = COALESCE(NULLIF(p_observaciones, ''), observaciones)
  WHERE id = p_orden_producto_id;

  INSERT INTO public.estados_producto (orden_producto_id, estado_anterior, estado_nuevo, usuario_id, metodo, justificacion)
  VALUES (p_orden_producto_id, v_actual, p_estado, auth.uid(),
          CASE WHEN v_retroceso THEN 'admin_retroceso' WHEN p_metodo = 'qr_scan' THEN 'qr_scan' ELSE 'manual' END,
          COALESCE(NULLIF(p_justificacion, ''), NULLIF(p_observaciones, '')));

  RETURN jsonb_build_object('reproceso', v_reproceso, 'retroceso', v_retroceso);
END;
$$;
REVOKE ALL ON FUNCTION public.mover_etapa(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mover_etapa(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
