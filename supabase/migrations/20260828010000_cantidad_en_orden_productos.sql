-- ============================================================================
-- Cantidad por línea de producto
-- ============================================================================
-- Hasta ahora `orden_productos` no guardaba la cantidad: el número de unidades
-- se fundía dentro de `precio_venta`. Por eso los reportes contaban una unidad
-- por línea y la "utilidad unitaria" era en realidad utilidad por línea.
--
-- Se añade la columna con valor por defecto 1 para que las filas históricas
-- conserven exactamente el comportamiento actual (una línea = una unidad).
-- ============================================================================

ALTER TABLE public.orden_productos
  ADD COLUMN IF NOT EXISTS cantidad INTEGER NOT NULL DEFAULT 1;

-- Una línea siempre representa al menos una unidad.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orden_productos_cantidad_positiva'
  ) THEN
    ALTER TABLE public.orden_productos
      ADD CONSTRAINT orden_productos_cantidad_positiva CHECK (cantidad >= 1);
  END IF;
END $$;

COMMENT ON COLUMN public.orden_productos.cantidad IS
  'Unidades de esta línea. `precio_venta` es el valor TOTAL de la línea (cantidad x unitario, ya neto de descuento de convenio), no el precio unitario.';
