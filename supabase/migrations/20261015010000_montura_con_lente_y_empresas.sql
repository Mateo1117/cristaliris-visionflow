-- =====================================================================
-- 1. La montura viaja con el lente en el tablero
-- =====================================================================
-- Una orden de gafas tiene dos tarjetas (lente y montura) pero físicamente
-- van juntas al laboratorio. Al mover el lente (o cualquier producto que no
-- sea montura), las monturas de la misma orden lo acompañan:
--   · hacia adelante: las que estén en una etapa anterior a la de destino;
--   · hacia atrás (reproceso / retroceso): las que estaban en la misma etapa.
-- La montura se puede seguir moviendo sola (p. ej. montura sin lente).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.mover_etapa(
  p_orden_producto_id UUID,
  p_estado            TEXT,
  p_metodo            TEXT DEFAULT 'manual',
  p_justificacion     TEXT DEFAULT NULL,
  p_observaciones     TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actual      TEXT;
  v_tipo        TEXT;
  v_orden_id    UUID;
  v_orden_a     INTEGER;
  v_orden_b     INTEGER;
  v_es_admin    BOOLEAN := public.has_role(auth.uid(), 'admin'::app_role);
  v_retroceso   BOOLEAN;
  v_reproceso   BOOLEAN := FALSE;
  v_lab_destino BOOLEAN;
  v_metodo      TEXT;
  v_mover       RECORD;
  v_acompanan   INTEGER := 0;
BEGIN
  IF NOT (v_es_admin
       OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
       OR public.has_role(auth.uid(), 'auxiliar_optica'::app_role)
       OR public.has_role(auth.uid(), 'optometra'::app_role)
       OR public.has_role(auth.uid(), 'mensajero'::app_role)) THEN
    RAISE EXCEPTION 'No tiene permiso para mover órdenes en el tablero';
  END IF;

  SELECT estado_actual, tipo_producto, orden_id INTO v_actual, v_tipo, v_orden_id
    FROM public.orden_productos WHERE id = p_orden_producto_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El producto de la orden no existe'; END IF;
  IF v_actual = p_estado THEN RETURN jsonb_build_object('reproceso', FALSE, 'acompanan', 0); END IF;

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
  v_metodo := CASE WHEN v_retroceso THEN 'admin_retroceso' WHEN p_metodo = 'qr_scan' THEN 'qr_scan' ELSE 'manual' END;

  FOR v_mover IN
    SELECT op.id, op.estado_actual, (op.id = p_orden_producto_id) AS principal
      FROM public.orden_productos op
      LEFT JOIN public.kanban_etapas k ON k.clave = op.estado_actual
     WHERE op.id = p_orden_producto_id
        OR (v_tipo IS DISTINCT FROM 'montura'
            AND op.orden_id = v_orden_id
            AND op.tipo_producto = 'montura'
            AND op.estado_actual <> p_estado
            AND CASE WHEN v_retroceso THEN op.estado_actual = v_actual
                     ELSE coalesce(k.orden, 0) < v_orden_b END)
     FOR UPDATE OF op
  LOOP
    UPDATE public.orden_productos SET
      estado_actual        = p_estado,
      fecha_envio_lab      = CASE WHEN p_estado = 'enviado_laboratorio' OR v_reproceso THEN now() ELSE fecha_envio_lab END,
      fecha_recepcion_lab  = CASE WHEN p_estado = 'recibido_laboratorio' THEN now() ELSE fecha_recepcion_lab END,
      fecha_control_calidad= CASE WHEN p_estado = 'control_calidad' THEN now() ELSE fecha_control_calidad END,
      fecha_listo_entrega  = CASE WHEN p_estado = 'listo_entrega' THEN now() ELSE fecha_listo_entrega END,
      fecha_entrega_real   = CASE WHEN p_estado = 'entregado' THEN now() ELSE fecha_entrega_real END,
      es_reproceso         = es_reproceso OR v_reproceso,
      observaciones        = CASE WHEN v_mover.principal THEN COALESCE(NULLIF(p_observaciones, ''), observaciones) ELSE observaciones END
    WHERE id = v_mover.id;

    INSERT INTO public.estados_producto (orden_producto_id, estado_anterior, estado_nuevo, usuario_id, metodo, justificacion)
    VALUES (v_mover.id, v_mover.estado_actual, p_estado, auth.uid(), v_metodo,
            CASE WHEN v_mover.principal THEN COALESCE(NULLIF(p_justificacion, ''), NULLIF(p_observaciones, ''))
                 ELSE 'Acompaña al lente de la misma orden' END);

    IF NOT v_mover.principal THEN v_acompanan := v_acompanan + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('reproceso', v_reproceso, 'retroceso', v_retroceso, 'acompanan', v_acompanan);
END;
$$;
REVOKE ALL ON FUNCTION public.mover_etapa(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mover_etapa(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- =====================================================================
-- 2. Empresas (convenios) creadas desde el registro del paciente
-- =====================================================================
-- Solo el administrador podía crear empresas y no había pantalla para
-- hacerlo: el desplegable del paciente solo mostraba "Particular". Ahora
-- quien registra pacientes puede crear la empresa al vuelo; editarla,
-- desactivarla o borrarla sigue siendo del administrador (Configuración →
-- Empresas).
DROP POLICY IF EXISTS "Staff crea empresas" ON public.empresas;
CREATE POLICY "Staff crea empresas" ON public.empresas FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'asesor_comercial'::app_role)
           OR public.has_role(auth.uid(), 'auxiliar_optica'::app_role)
           OR public.has_role(auth.uid(), 'optometra'::app_role));
