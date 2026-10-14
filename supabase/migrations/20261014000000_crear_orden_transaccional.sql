-- =====================================================================
-- CREAR ORDEN EN UNA SOLA TRANSACCIÓN
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

CREATE OR REPLACE FUNCTION public.crear_orden(
  p_orden          JSONB,
  p_productos      JSONB,
  p_abono          JSONB DEFAULT NULL,
  p_cotizacion_id  UUID  DEFAULT NULL
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

  RETURN jsonb_build_object('id', v_orden_id, 'numero_orden', v_numero, 'abono_id', v_abono_id);
END;
$$;

REVOKE ALL ON FUNCTION public.crear_orden(JSONB, JSONB, JSONB, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_orden(JSONB, JSONB, JSONB, UUID) TO authenticated;

COMMENT ON FUNCTION public.crear_orden(JSONB, JSONB, JSONB, UUID) IS
  'Crea orden + productos + salidas de inventario (con kardex) + abono inicial (con su aplicación) y, si se indica, convierte la cotización; todo en una sola transacción. Respeta la RLS del usuario.';
