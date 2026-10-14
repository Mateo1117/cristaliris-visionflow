-- =====================================================================
-- ALINEAR LOS VALORES PERMITIDOS CON LOS QUE ENVÍA LA APLICACIÓN
-- =====================================================================
-- Las restricciones CHECK de la primera versión no se actualizaron cuando la
-- app agregó medios de pago y tipos de lente, así que crear una orden con
-- "Efectivo" o un lente "Terminado (1d)" fallaba:
--   new row for relation "ordenes" violates check constraint "ordenes_modalidad_pago_check"
--
-- Las listas incluyen los valores antiguos para no invalidar filas
-- existentes. Si se agrega un medio de pago en src/lib/pricing.ts
-- (MEDIOS_PAGO) hay que agregarlo aquí: lo verifica
-- src/lib/valoresPermitidos.test.ts.
-- =====================================================================

-- Medios de pago (src/lib/pricing.ts → MEDIOS_PAGO) + 'cuotas'
ALTER TABLE public.ordenes DROP CONSTRAINT IF EXISTS ordenes_modalidad_pago_check;
ALTER TABLE public.ordenes ADD CONSTRAINT ordenes_modalidad_pago_check CHECK (modalidad_pago IN (
  'efectivo', 'contado', 'transferencia', 'llave', 'nequi', 'daviplata', 'nomina', 'datafono',
  'tarjeta', 'addi', 'sistecredito', 'link_pago', 'cuotas'
));

ALTER TABLE public.pacientes DROP CONSTRAINT IF EXISTS pacientes_modalidad_pago_check;
ALTER TABLE public.pacientes ADD CONSTRAINT pacientes_modalidad_pago_check CHECK (modalidad_pago IN (
  'efectivo', 'contado', 'transferencia', 'llave', 'nequi', 'daviplata', 'nomina', 'datafono',
  'tarjeta', 'addi', 'sistecredito', 'link_pago', 'cuotas'
));

-- Tipo / tiempo del lente (formulario de órdenes y tablero Kanban)
ALTER TABLE public.orden_productos DROP CONSTRAINT IF EXISTS orden_productos_tipo_lente_tiempo_check;
ALTER TABLE public.orden_productos ADD CONSTRAINT orden_productos_tipo_lente_tiempo_check CHECK (tipo_lente_tiempo IN (
  'terminado', 'talla', 'progresivo', 'sol_formula', 'montura_3piezas', '1_dia', '3_dias'
));

-- Tipos de producto e inventario: se agrega 'accesorio'
ALTER TABLE public.orden_productos DROP CONSTRAINT IF EXISTS orden_productos_tipo_producto_check;
ALTER TABLE public.orden_productos ADD CONSTRAINT orden_productos_tipo_producto_check CHECK (tipo_producto IN (
  'lente', 'montura', 'insumo', 'accesorio'
));

ALTER TABLE public.inventario DROP CONSTRAINT IF EXISTS inventario_tipo_check;
ALTER TABLE public.inventario ADD CONSTRAINT inventario_tipo_check CHECK (tipo IN (
  'montura', 'lente', 'insumo', 'accesorio'
));
