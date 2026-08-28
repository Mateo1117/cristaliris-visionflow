-- =====================================================================
-- APLICACIÓN DE ABONOS A ÓRDENES  (README 6.3)
-- =====================================================================
--
-- «Tabla de aplicación de abonos por orden (un abono puede aplicarse a
--  una o varias órdenes). Permitir aplicación parcial de abonos.»
--
-- Hasta ahora `abonos` tenía `orden_id NOT NULL`: cada pago quedaba
-- atado a UNA sola orden y su monto se restaba íntegro del saldo de esa
-- orden. Eso impide el caso real de la óptica: el paciente (o la empresa)
-- paga una suma y esa suma cubre parcialmente varias órdenes.
--
-- Modelo que introduce esta migración:
--
--   abonos              -> el DINERO que entró (un recibo de caja)
--   aplicacion_abonos   -> CÓMO se repartió ese dinero entre órdenes
--
-- Invariante que la aplicación debe respetar (y que aquí se refuerza con
-- constraints + un trigger):
--
--   SUM(aplicacion_abonos.monto_aplicado WHERE abono_id = X) <= abonos.monto
--
-- `abonos.orden_id` se conserva intacto (sigue siendo NOT NULL y sigue
-- apuntando a la orden "principal" del recibo) para no romper el código ni
-- los reportes existentes. NO se toca esa columna en esta migración.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabla
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.aplicacion_abonos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  abono_id         UUID NOT NULL REFERENCES public.abonos(id) ON DELETE CASCADE,
  orden_id         UUID NOT NULL REFERENCES public.ordenes(id) ON DELETE RESTRICT,
  monto_aplicado   NUMERIC(12,2) NOT NULL,
  fecha_aplicacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario_id       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT aplicacion_abonos_monto_positivo CHECK (monto_aplicado > 0)
);

COMMENT ON TABLE public.aplicacion_abonos IS
  'Distribución de un abono entre una o varias órdenes (README 6.3). La suma de monto_aplicado por abono nunca puede superar abonos.monto.';
COMMENT ON COLUMN public.aplicacion_abonos.monto_aplicado IS
  'Porción del abono imputada a esta orden. Siempre > 0; la suma por abono se valida con el trigger trg_aplicacion_abonos_no_excede.';
COMMENT ON COLUMN public.aplicacion_abonos.usuario_id IS
  'Usuario que hizo la imputación (auth.users). Puede ser NULL en las filas de backfill de abonos históricos sin registrado_por.';

-- Un mismo abono no debe imputarse dos veces a la misma orden: si hay que
-- corregir el monto se actualiza la fila existente, no se agrega otra.
CREATE UNIQUE INDEX IF NOT EXISTS aplicacion_abonos_abono_orden_uk
  ON public.aplicacion_abonos (abono_id, orden_id);

-- ---------------------------------------------------------------------
-- 2. Índices de consulta
--    - por abono: "¿cuánto de este abono ya está aplicado?" (saldo por aplicar)
--    - por orden: "¿qué pagos componen el saldo de esta orden?"
--    - por fecha: reportes de recaudo por rango de fechas
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_aplicacion_abonos_abono_id  ON public.aplicacion_abonos (abono_id);
CREATE INDEX IF NOT EXISTS idx_aplicacion_abonos_orden_id  ON public.aplicacion_abonos (orden_id);
CREATE INDEX IF NOT EXISTS idx_aplicacion_abonos_fecha     ON public.aplicacion_abonos (fecha_aplicacion DESC);
CREATE INDEX IF NOT EXISTS idx_aplicacion_abonos_usuario   ON public.aplicacion_abonos (usuario_id);

-- ---------------------------------------------------------------------
-- 3. Refuerzo del invariante en la base de datos
--    La UI ya valida, pero la validación de cliente es una cortesía: dos
--    usuarios aplicando el mismo abono a la vez podrían pasarse del monto.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_aplicacion_abonos_no_excede()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_monto_abono   NUMERIC(12,2);
  v_total_aplicado NUMERIC(12,2);
BEGIN
  SELECT monto INTO v_monto_abono FROM public.abonos WHERE id = NEW.abono_id;
  IF v_monto_abono IS NULL THEN
    RAISE EXCEPTION 'El abono % no existe', NEW.abono_id;
  END IF;

  SELECT COALESCE(SUM(monto_aplicado), 0) INTO v_total_aplicado
  FROM public.aplicacion_abonos
  WHERE abono_id = NEW.abono_id
    AND id IS DISTINCT FROM NEW.id;

  IF v_total_aplicado + NEW.monto_aplicado > v_monto_abono THEN
    RAISE EXCEPTION
      'La aplicación excede el abono: ya aplicado %, se intenta aplicar % y el abono es de %',
      v_total_aplicado, NEW.monto_aplicado, v_monto_abono;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aplicacion_abonos_no_excede ON public.aplicacion_abonos;
CREATE CONSTRAINT TRIGGER trg_aplicacion_abonos_no_excede
  AFTER INSERT OR UPDATE ON public.aplicacion_abonos
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION public.fn_aplicacion_abonos_no_excede();

-- ---------------------------------------------------------------------
-- 4. RLS
--    Mismo criterio que `abonos` / `caja_diaria` en
--    20260828000000_seguridad_roles_y_rls.sql:
--      * Lectura : cualquier usuario con rol operativo asignado.
--      * Escritura: admin, asesor_comercial y contador (financiero).
--      * Borrado : solo admin (la imputación es un movimiento contable).
--    Se usa el helper `public.tiene_rol_asignado` creado en esa migración.
-- ---------------------------------------------------------------------
ALTER TABLE public.aplicacion_abonos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Aplicacion abonos viewable" ON public.aplicacion_abonos;
CREATE POLICY "Aplicacion abonos viewable"
  ON public.aplicacion_abonos FOR SELECT TO authenticated
  USING (public.tiene_rol_asignado(auth.uid()));

DROP POLICY IF EXISTS "Insert aplicacion abonos" ON public.aplicacion_abonos;
CREATE POLICY "Insert aplicacion abonos"
  ON public.aplicacion_abonos FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
    OR public.has_role(auth.uid(), 'contador'::app_role)
  );

DROP POLICY IF EXISTS "Update aplicacion abonos" ON public.aplicacion_abonos;
CREATE POLICY "Update aplicacion abonos"
  ON public.aplicacion_abonos FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
    OR public.has_role(auth.uid(), 'contador'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
    OR public.has_role(auth.uid(), 'contador'::app_role)
  );

DROP POLICY IF EXISTS "Delete aplicacion abonos" ON public.aplicacion_abonos;
CREATE POLICY "Delete aplicacion abonos"
  ON public.aplicacion_abonos FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ---------------------------------------------------------------------
-- 5. Auditoría (mismo trigger genérico que usa `abonos`)
--    Se crea solo si la función de auditoría existe, para que esta
--    migración siga siendo aplicable sobre bases que aún no corrieron
--    20260828000000_seguridad_roles_y_rls.sql.
-- ---------------------------------------------------------------------
--    El trigger se crea DESPUÉS del backfill (paso 6) para no llenar
--    `log_auditoria` con una fila por cada abono histórico migrado.

-- ---------------------------------------------------------------------
-- 6. BACKFILL — imprescindible para no descuadrar la cartera
--
--    Todo abono anterior a esta migración YA descontó su monto completo
--    del saldo de su orden (así lo hace src/pages/Billing.tsx). Si no se
--    registraran esas imputaciones, la aplicación calcularía
--    "disponible = monto - 0 = monto" y permitiría volver a repartir un
--    dinero que ya fue imputado, descontando el saldo dos veces.
--
--    Se crea entonces una fila de aplicación por cada abono existente,
--    por su monto total, contra su propia orden.
-- ---------------------------------------------------------------------
INSERT INTO public.aplicacion_abonos (abono_id, orden_id, monto_aplicado, fecha_aplicacion, usuario_id)
SELECT a.id, a.orden_id, a.monto, a.fecha_abono, a.registrado_por
FROM public.abonos a
WHERE a.monto > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.aplicacion_abonos ap WHERE ap.abono_id = a.id
  );

-- ---------------------------------------------------------------------
-- 7. Trigger de auditoría (ya con los datos históricos cargados)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_log_auditoria'
  ) THEN
    DROP TRIGGER IF EXISTS trg_audit_aplicacion_abonos ON public.aplicacion_abonos;
    CREATE TRIGGER trg_audit_aplicacion_abonos
      AFTER INSERT OR UPDATE OR DELETE ON public.aplicacion_abonos
      FOR EACH ROW EXECUTE FUNCTION public.fn_log_auditoria();
  ELSE
    RAISE NOTICE 'public.fn_log_auditoria no existe: aplicacion_abonos queda sin trigger de auditoría.';
  END IF;
END $$;
