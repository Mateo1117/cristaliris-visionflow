-- =====================================================================
-- ELIMINAR SEDES, LABORATORIOS Y PRODUCTOS DEL CATÁLOGO
-- =====================================================================
-- Las llaves foráneas eran NO ACTION: una sede, laboratorio o producto ya
-- usado no se podía eliminar. Ahora se puede: los registros que lo usaban
-- (órdenes, garantías, citas, pacientes, caja, inventario) se conservan y
-- solo quedan sin ese dato (NULL).
--
-- Excepción: horarios_medicos.sede_id NULL significa "atiende en todas las
-- sedes"; si se pusiera NULL, el médico pasaría a atender en todas. Por eso
-- las franjas de una sede eliminada se borran (CASCADE).
-- =====================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('garantias',        'laboratorio_id',       'laboratorios',       'garantias_laboratorio_id_fkey',              'SET NULL'),
    ('orden_productos',  'laboratorio_id',       'laboratorios',       'orden_productos_laboratorio_id_fkey',        'SET NULL'),
    ('orden_productos',  'producto_catalogo_id', 'productos_catalogo', 'orden_productos_producto_catalogo_id_fkey',  'SET NULL'),
    ('caja_diaria',      'sede_id',              'sedes',              'caja_diaria_sede_id_fkey',                   'SET NULL'),
    ('citas',            'sede_id',              'sedes',              'citas_sede_id_fkey',                         'SET NULL'),
    ('inventario',       'sede_id',              'sedes',              'inventario_sede_id_fkey',                    'SET NULL'),
    ('ordenes',          'sede_id',              'sedes',              'ordenes_sede_id_fkey',                       'SET NULL'),
    ('pacientes',        'sede_registro',        'sedes',              'pacientes_sede_registro_fkey',               'SET NULL'),
    ('horarios_medicos', 'sede_id',              'sedes',              'horarios_medicos_sede_id_fkey',              'CASCADE')
  ) AS t(tabla, columna, referencia, nombre, accion)
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.tabla, r.nombre);
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(id) ON DELETE %s',
                   r.tabla, r.nombre, r.columna, r.referencia, r.accion);
  END LOOP;
END $$;
