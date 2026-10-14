-- =====================================================================
-- FLUJO DE ATENCIÓN DEL PACIENTE  +  CREAR ORDEN EN UNA TRANSACCIÓN
-- =====================================================================
--
-- Flujo que soporta esta migración:
--
--   cita agendada ─► llegó (en_espera) ─► en_consulta ─► atendida
--                                                          │
--                       historia clínica (cita_id, optometra_id)
--                                                          │
--                         estado_facturacion = 'pendiente' (cola "Por facturar")
--                                 ├─► 'orden'       (compró: orden_id)
--                                 ├─► 'cotizacion'  (no compró: cotizacion_id)
--                                 └─► 'sin_compra'  (no compró ni quiso cotización)
--
-- Antes la historia no guardaba la cita ni la optómetra, y nada indicaba
-- qué pacientes salieron de consulta sin pasar por caja.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Estados de la cita
--    'asistio' se conserva por compatibilidad con citas anteriores.
-- ---------------------------------------------------------------------
ALTER TABLE public.citas DROP CONSTRAINT IF EXISTS citas_estado_check;
ALTER TABLE public.citas ADD CONSTRAINT citas_estado_check CHECK (estado IN (
  'agendada', 'confirmada', 'en_espera', 'en_consulta', 'atendida', 'asistio', 'no_asistio', 'cancelada'
));
ALTER TABLE public.citas ADD COLUMN IF NOT EXISTS hora_llegada TIMESTAMPTZ;
COMMENT ON COLUMN public.citas.hora_llegada IS 'Momento en que recepción marcó que el paciente llegó (estado en_espera).';

-- ---------------------------------------------------------------------
-- 2. Historia clínica: cita, optómetra y resultado comercial
-- ---------------------------------------------------------------------
ALTER TABLE public.historias_clinicas
  ADD COLUMN IF NOT EXISTS cita_id            UUID REFERENCES public.citas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS estado_facturacion TEXT,
  ADD COLUMN IF NOT EXISTS orden_id           UUID REFERENCES public.ordenes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cotizacion_id      UUID REFERENCES public.cotizaciones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fecha_facturacion  TIMESTAMPTZ;

-- Las historias anteriores quedan en NULL (fuera de la cola); las nuevas
-- entran como 'pendiente'. El DEFAULT se pone DESPUÉS de crear la columna
-- para que no se aplique a las filas existentes.
ALTER TABLE public.historias_clinicas ALTER COLUMN estado_facturacion SET DEFAULT 'pendiente';
ALTER TABLE public.historias_clinicas ALTER COLUMN optometra_id SET DEFAULT auth.uid();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'historias_estado_facturacion_check') THEN
    ALTER TABLE public.historias_clinicas ADD CONSTRAINT historias_estado_facturacion_check
      CHECK (estado_facturacion IN ('pendiente', 'orden', 'cotizacion', 'sin_compra'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_historias_por_facturar
  ON public.historias_clinicas (fecha_consulta) WHERE estado_facturacion = 'pendiente';
CREATE INDEX IF NOT EXISTS idx_historias_cita ON public.historias_clinicas (cita_id);
CREATE INDEX IF NOT EXISTS idx_historias_cotizacion ON public.historias_clinicas (cotizacion_id);

-- ---------------------------------------------------------------------
-- 3. Al guardar la historia de una cita, la cita queda 'atendida'.
--    SECURITY DEFINER: la optómetra no necesita permisos extra sobre citas.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_historia_marca_cita_atendida()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.cita_id IS NOT NULL THEN
    UPDATE public.citas SET estado = 'atendida'
     WHERE id = NEW.cita_id AND estado NOT IN ('cancelada', 'no_asistio');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_historia_marca_cita_atendida ON public.historias_clinicas;
CREATE TRIGGER trg_historia_marca_cita_atendida
  AFTER INSERT ON public.historias_clinicas
  FOR EACH ROW EXECUTE FUNCTION public.fn_historia_marca_cita_atendida();

-- ---------------------------------------------------------------------
-- 4. Registrar el resultado comercial de la consulta.
--    Facturación (asesor / auxiliar) no puede editar historias por RLS
--    (dato clínico): esta función solo toca las columnas de facturación.
--    Con p_historia_id NULL y p_cotizacion_id dado, actualiza la historia
--    ligada a esa cotización (el paciente volvió y la convirtió en orden).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_resultado_consulta(
  p_historia_id   UUID,
  p_resultado     TEXT,
  p_orden_id      UUID DEFAULT NULL,
  p_cotizacion_id UUID DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
       OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
       OR public.has_role(auth.uid(), 'auxiliar_optica'::app_role)
       OR public.has_role(auth.uid(), 'optometra'::app_role)) THEN
    RAISE EXCEPTION 'No tiene permiso para registrar el resultado de la consulta';
  END IF;
  IF p_resultado NOT IN ('orden', 'cotizacion', 'sin_compra') THEN
    RAISE EXCEPTION 'Resultado inválido: %', p_resultado;
  END IF;

  IF p_historia_id IS NOT NULL THEN
    UPDATE public.historias_clinicas
       SET estado_facturacion = p_resultado,
           orden_id           = COALESCE(p_orden_id, orden_id),
           cotizacion_id      = COALESCE(p_cotizacion_id, cotizacion_id),
           fecha_facturacion  = now()
     WHERE id = p_historia_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La historia clínica no existe';
    END IF;
  ELSIF p_cotizacion_id IS NOT NULL THEN
    UPDATE public.historias_clinicas
       SET estado_facturacion = p_resultado,
           orden_id           = COALESCE(p_orden_id, orden_id),
           fecha_facturacion  = now()
     WHERE cotizacion_id = p_cotizacion_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_resultado_consulta(UUID, TEXT, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_resultado_consulta(UUID, TEXT, UUID, UUID) TO authenticated;

-- ---------------------------------------------------------------------
-- 5. Cola "Por facturar".
--    Devuelve solo lo que facturación necesita para vender: datos del
--    paciente, optómetra y fórmula final (sin anamnesis ni diagnóstico).
--    SECURITY DEFINER porque auxiliar_optica no lee historias por RLS.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.historias_por_facturar(p_desde DATE DEFAULT NULL)
RETURNS TABLE (
  historia_id UUID, fecha_consulta TIMESTAMPTZ, estado_facturacion TEXT,
  orden_id UUID, cotizacion_id UUID, fecha_facturacion TIMESTAMPTZ,
  paciente_id UUID, paciente_nombre TEXT, paciente_documento TEXT, paciente_telefono TEXT,
  empresa TEXT, optometra_nombre TEXT, cita_id UUID,
  formula JSONB
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
       OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
       OR public.has_role(auth.uid(), 'auxiliar_optica'::app_role)
       OR public.has_role(auth.uid(), 'optometra'::app_role)) THEN
    RAISE EXCEPTION 'No tiene permiso para ver la cola de facturación';
  END IF;

  RETURN QUERY
  SELECT h.id, h.fecha_consulta, h.estado_facturacion, h.orden_id, h.cotizacion_id, h.fecha_facturacion,
         p.id, trim(p.nombres || ' ' || p.apellidos), p.tipo_documento || ' ' || p.numero_documento, p.telefono,
         e.razon_social, pr.nombre, h.cita_id,
         jsonb_build_object(
           'od', jsonb_build_object('esfera', h.formula_od_esfera, 'cilindro', h.formula_od_cilindro, 'eje', h.formula_od_eje, 'adicion', h.formula_od_adicion),
           'oi', jsonb_build_object('esfera', h.formula_oi_esfera, 'cilindro', h.formula_oi_cilindro, 'eje', h.formula_oi_eje, 'adicion', h.formula_oi_adicion),
           'dp', h.distancia_pupilar, 'tipo_lente', h.formula_tipo_lente, 'filtros', h.formula_filtros,
           'forma_uso', h.formula_forma_uso, 'observaciones', h.formula_observaciones
         )
    FROM public.historias_clinicas h
    JOIN public.pacientes p ON p.id = h.paciente_id
    LEFT JOIN public.empresas e ON e.id = p.empresa_id
    LEFT JOIN public.profiles pr ON pr.user_id = h.optometra_id
   WHERE h.estado_facturacion = 'pendiente'
      OR (h.estado_facturacion IS NOT NULL
          AND h.fecha_facturacion >= COALESCE(p_desde, (now() AT TIME ZONE 'America/Bogota')::date) AT TIME ZONE 'America/Bogota')
   ORDER BY (h.estado_facturacion = 'pendiente') DESC, h.fecha_consulta;
END;
$$;

REVOKE ALL ON FUNCTION public.historias_por_facturar(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.historias_por_facturar(DATE) TO authenticated;

-- =====================================================================
-- 6. CREAR ORDEN EN UNA SOLA TRANSACCIÓN
-- =====================================================================
--
-- La orden se creaba desde el navegador en pasos sueltos: orden, luego
-- productos, luego abono, luego inventario. Si un paso fallaba quedaban
-- datos a medias:
--
--   * Orden sin productos (y ya con total y saldo pendiente): infla la
--     cartera, y desde 20260828000000 nadie puede borrarla desde la app.
--   * Orden guardada con el saldo YA descontado del abono inicial, pero
--     sin el abono: falta dinero en caja y la cartera no cuadra.
--   * Abono inicial sin fila en aplicacion_abonos: figura como "por
--     aplicar" y se podría repartir otra vez (saldo descontado dos veces).
--   * Al convertir una cotización el stock se descontaba con la cantidad
--     que el navegador tenía en pantalla (dos ventas a la vez se pisaban),
--     sin movimiento en el kardex, y se podían convertir cotizaciones
--     vencidas o ya convertidas.
--
-- `crear_orden` hace todo dentro de la transacción de la llamada: o se
-- guarda completo o no se guarda nada.
--
-- SECURITY INVOKER: corre con los permisos del usuario, así que la RLS de
-- ordenes / orden_productos / abonos / aplicacion_abonos / inventario /
-- movimientos_inventario / cotizaciones sigue aplicando.
--
-- Las columnas de la orden y de cada producto se toman de las claves del
-- JSON (quote_ident evita inyección; una clave que no sea columna da error)
-- para no repetir aquí la lista de columnas y que las omitidas tomen su
-- DEFAULT. En cada producto, las claves especiales:
--   _inventario_id        artículo de inventario a descontar
--   _inventario_cantidad  unidades a descontar (por defecto `cantidad` o 1)
-- =====================================================================

DROP FUNCTION IF EXISTS public.crear_orden(JSONB, JSONB, JSONB);
DROP FUNCTION IF EXISTS public.crear_orden(JSONB, JSONB, JSONB, UUID);

CREATE OR REPLACE FUNCTION public.crear_orden(
  p_orden          JSONB,
  p_productos      JSONB,
  p_abono          JSONB DEFAULT NULL,
  p_cotizacion_id  UUID  DEFAULT NULL,
  p_historia_id    UUID  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_cols       TEXT;
  v_orden_id   UUID;
  v_numero     INTEGER;
  v_item       JSONB;
  v_fila       JSONB;
  v_op_id      UUID;
  v_inv_id     UUID;
  v_cant       INTEGER;
  v_ant        INTEGER;
  v_desc_inv   TEXT;
  v_cot        RECORD;
  v_monto      NUMERIC(12,2);
  v_abono_id   UUID;
BEGIN
  IF p_orden IS NULL OR jsonb_typeof(p_orden) <> 'object' THEN
    RAISE EXCEPTION 'Datos de la orden inválidos';
  END IF;
  IF p_productos IS NULL OR jsonb_typeof(p_productos) <> 'array' OR jsonb_array_length(p_productos) = 0 THEN
    RAISE EXCEPTION 'La orden debe tener al menos un producto';
  END IF;

  -- 0. Cotización: se bloquea la fila para que dos personas no la conviertan a la vez.
  IF p_cotizacion_id IS NOT NULL THEN
    SELECT estado, fecha_vencimiento INTO v_cot
      FROM public.cotizaciones WHERE id = p_cotizacion_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La cotización no existe';
    END IF;
    IF v_cot.estado <> 'vigente' THEN
      RAISE EXCEPTION 'La cotización ya está %', v_cot.estado;
    END IF;
    IF v_cot.fecha_vencimiento IS NOT NULL
       AND v_cot.fecha_vencimiento < (now() AT TIME ZONE 'America/Bogota')::date THEN
      RAISE EXCEPTION 'La cotización venció el %; duplíquela para cotizar con precios actuales',
        to_char(v_cot.fecha_vencimiento, 'DD/MM/YYYY');
    END IF;
    p_orden := p_orden || jsonb_build_object('cotizacion_id', p_cotizacion_id);
  END IF;

  -- 1. Orden
  SELECT string_agg(quote_ident(k), ', ') INTO v_cols FROM jsonb_object_keys(p_orden) AS k;
  EXECUTE format(
    'INSERT INTO public.ordenes (%1$s) SELECT %1$s FROM jsonb_populate_record(NULL::public.ordenes, $1) RETURNING id, numero_orden',
    v_cols
  ) INTO v_orden_id, v_numero USING p_orden;

  -- 2. Productos y, si corresponde, salida de inventario con su movimiento
  FOR v_item IN SELECT e FROM jsonb_array_elements(p_productos) AS e LOOP
    v_inv_id := NULLIF(v_item ->> '_inventario_id', '')::UUID;
    v_cant   := GREATEST(1, COALESCE((v_item ->> '_inventario_cantidad')::INTEGER, (v_item ->> 'cantidad')::INTEGER, 1));
    v_fila   := (v_item - '_inventario_id' - '_inventario_cantidad') || jsonb_build_object('orden_id', v_orden_id);

    SELECT string_agg(quote_ident(k), ', ') INTO v_cols FROM jsonb_object_keys(v_fila) AS k;
    EXECUTE format(
      'INSERT INTO public.orden_productos (%1$s) SELECT %1$s FROM jsonb_populate_record(NULL::public.orden_productos, $1) RETURNING id',
      v_cols
    ) INTO v_op_id USING v_fila;

    IF v_inv_id IS NOT NULL THEN
      -- Stock real, bloqueado hasta el final de la transacción.
      SELECT cantidad_disponible, concat_ws(' ', marca, modelo, codigo_referencia)
        INTO v_ant, v_desc_inv
        FROM public.inventario WHERE id = v_inv_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'El artículo de inventario de "%" ya no existe', v_item ->> 'descripcion';
      END IF;
      IF COALESCE(v_ant, 0) < v_cant THEN
        RAISE EXCEPTION 'Stock insuficiente de % (disponible: %, requerido: %)',
          COALESCE(NULLIF(v_desc_inv, ''), v_item ->> 'descripcion'), COALESCE(v_ant, 0), v_cant;
      END IF;

      UPDATE public.inventario SET cantidad_disponible = v_ant - v_cant WHERE id = v_inv_id;
      INSERT INTO public.movimientos_inventario
        (inventario_id, tipo_movimiento, cantidad, cantidad_anterior, cantidad_nueva, motivo, orden_producto_id, usuario_id)
      VALUES
        (v_inv_id, 'salida', v_cant, v_ant, v_ant - v_cant,
         CASE WHEN p_cotizacion_id IS NULL THEN 'Venta en orden ' ELSE 'Cotización convertida a orden ' END
           || 'ORD-' || lpad(v_numero::TEXT, 5, '0'),
         v_op_id, auth.uid());
    END IF;
  END LOOP;

  -- 3. Abono inicial + su imputación a esta orden
  v_monto := COALESCE((p_abono ->> 'monto')::NUMERIC, 0);
  IF v_monto > 0 THEN
    INSERT INTO public.abonos (paciente_id, orden_id, monto, medio_pago, referencia_pago, observaciones, registrado_por)
    VALUES (
      (p_orden ->> 'paciente_id')::UUID,
      v_orden_id,
      v_monto,
      p_abono ->> 'medio_pago',
      NULLIF(p_abono ->> 'referencia_pago', ''),
      COALESCE(NULLIF(p_abono ->> 'observaciones', ''), 'Abono inicial al crear orden'),
      auth.uid()
    )
    RETURNING id INTO v_abono_id;

    INSERT INTO public.aplicacion_abonos (abono_id, orden_id, monto_aplicado, usuario_id)
    VALUES (v_abono_id, v_orden_id, v_monto, auth.uid());
  END IF;

  -- 4. Cotización convertida
  IF p_cotizacion_id IS NOT NULL THEN
    UPDATE public.cotizaciones
       SET estado = 'convertida', orden_id_convertida = v_orden_id
     WHERE id = p_cotizacion_id;
  END IF;

  -- 5. Resultado de la consulta: la historia queda ligada a la orden. Si la
  --    orden viene de una cotización, también se actualiza la historia que
  --    había terminado en esa cotización.
  IF p_historia_id IS NOT NULL OR p_cotizacion_id IS NOT NULL THEN
    PERFORM public.registrar_resultado_consulta(p_historia_id, 'orden', v_orden_id, p_cotizacion_id);
  END IF;

  RETURN jsonb_build_object('id', v_orden_id, 'numero_orden', v_numero, 'abono_id', v_abono_id);
END;
$$;

REVOKE ALL ON FUNCTION public.crear_orden(JSONB, JSONB, JSONB, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_orden(JSONB, JSONB, JSONB, UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.crear_orden(JSONB, JSONB, JSONB, UUID, UUID) IS
  'Crea orden + productos + salidas de inventario (con kardex) + abono inicial (con su aplicación) y, si se indica, convierte la cotización y liga la historia clínica; todo en una sola transacción. Respeta la RLS del usuario.';
