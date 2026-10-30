-- =====================================================================
-- Numeración de órdenes ajustable
-- =====================================================================
-- El número de orden lo da la secuencia ordenes_numero_orden_seq. La óptica
-- viene de otro sistema y necesita que la numeración siga desde el número
-- en el que va hoy. Solo el administrador puede:
--   · fijar el siguiente número de orden (no menor al mayor existente + 1);
--   · corregir el número de una orden (sin repetir otro).
-- =====================================================================

ALTER TABLE public.ordenes DROP CONSTRAINT IF EXISTS ordenes_numero_orden_key;
ALTER TABLE public.ordenes ADD CONSTRAINT ordenes_numero_orden_key UNIQUE (numero_orden);

-- Estado actual: último número usado y el que saldrá en la próxima orden.
CREATE OR REPLACE FUNCTION public.numeracion_ordenes()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_last BIGINT; v_called BOOLEAN; v_max INTEGER;
BEGIN
  IF NOT public.tiene_rol_asignado(auth.uid()) THEN RAISE EXCEPTION 'Sin permiso'; END IF;
  SELECT last_value, is_called INTO v_last, v_called FROM public.ordenes_numero_orden_seq;
  SELECT max(numero_orden) INTO v_max FROM public.ordenes;
  RETURN jsonb_build_object(
    'siguiente', CASE WHEN v_called THEN v_last + 1 ELSE v_last END,
    'mayor', coalesce(v_max, 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.fijar_siguiente_numero_orden(p_siguiente INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_max INTEGER;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar la numeración de órdenes';
  END IF;
  SELECT coalesce(max(numero_orden), 0) INTO v_max FROM public.ordenes;
  IF p_siguiente IS NULL OR p_siguiente <= v_max THEN
    RAISE EXCEPTION 'El siguiente número debe ser mayor que %, el número más alto que ya existe', v_max;
  END IF;
  PERFORM setval('public.ordenes_numero_orden_seq', p_siguiente, false);
  RETURN public.numeracion_ordenes();
END;
$$;

CREATE OR REPLACE FUNCTION public.cambiar_numero_orden(p_orden_id UUID, p_numero INTEGER)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_siguiente BIGINT; v_called BOOLEAN;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar el número de una orden';
  END IF;
  IF p_numero IS NULL OR p_numero < 1 THEN RAISE EXCEPTION 'Número de orden inválido'; END IF;
  IF EXISTS (SELECT 1 FROM public.ordenes WHERE numero_orden = p_numero AND id <> p_orden_id) THEN
    RAISE EXCEPTION 'Ya existe otra orden con el número %', p_numero;
  END IF;
  UPDATE public.ordenes SET numero_orden = p_numero WHERE id = p_orden_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'La orden no existe'; END IF;
  -- Que la siguiente orden nueva no choque con el número asignado a mano.
  SELECT last_value, is_called INTO v_siguiente, v_called FROM public.ordenes_numero_orden_seq;
  IF (CASE WHEN v_called THEN v_siguiente + 1 ELSE v_siguiente END) <= p_numero THEN
    PERFORM setval('public.ordenes_numero_orden_seq', p_numero + 1, false);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.numeracion_ordenes() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fijar_siguiente_numero_orden(INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cambiar_numero_orden(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.numeracion_ordenes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fijar_siguiente_numero_orden(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cambiar_numero_orden(UUID, INTEGER) TO authenticated;
