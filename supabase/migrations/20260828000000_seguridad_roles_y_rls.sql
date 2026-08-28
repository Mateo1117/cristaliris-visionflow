-- =====================================================================
-- MIGRACIÓN DE SEGURIDAD: cierre de brechas de RLS, roles y storage
-- =====================================================================
--
-- ¡¡ADVERTENCIA IMPORTANTE ANTES DE APLICAR!!
--
-- A partir de esta migración TODA la escritura (y buena parte de la
-- lectura) depende de que el usuario tenga una fila en public.user_roles.
-- Hasta ahora casi todas las políticas eran `USING (true)`, es decir,
-- cualquier usuario autenticado podía leer y escribir todo.
--
-- SI NINGÚN USUARIO TIENE EL ROL 'admin' EN public.user_roles, NADIE
-- PODRÁ ADMINISTRAR EL SISTEMA DESPUÉS DE ESTA MIGRACIÓN: no se podrán
-- asignar roles desde la aplicación (la política "Admins can manage all
-- roles" exige ser admin), no se podrá escribir en historias clínicas,
-- órdenes, caja, inventario, etc. La única salida sería insertar el rol
-- manualmente con la service_role key / SQL editor de Supabase:
--
--   INSERT INTO public.user_roles (user_id, role)
--   VALUES ('<uuid-del-usuario>', 'admin')
--   ON CONFLICT (user_id, role) DO NOTHING;
--
-- Igualmente, los usuarios autenticados SIN NINGÚN ROL asignado quedan
-- prácticamente sin acceso a datos operativos (comportamiento deseado:
-- una cuenta recién creada ya no puede leer pacientes ni historias).
--
-- Enum public.app_role (valores exactos existentes):
--   'admin', 'optometra', 'asesor_comercial', 'auxiliar_optica',
--   'mensajero', 'contador', 'visualizador'
--
-- Grupos de permiso usados en esta migración:
--   * Lectura operativa  -> cualquier usuario con algún rol asignado
--   * Clínico            -> admin, optometra
--   * Ventas             -> admin, asesor_comercial, auxiliar_optica
--   * Financiero (caja)  -> admin, asesor_comercial, contador
--   * Nómina             -> admin
--   * Inventario         -> admin, auxiliar_optica, asesor_comercial
-- 'visualizador' NUNCA escribe. 'contador' solo escribe en caja_diaria.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Aviso (no bloqueante) si no existe ningún administrador
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role = 'admin'::app_role
  ) THEN
    RAISE NOTICE '*** ATENCIÓN: no existe ningún usuario con rol admin en public.user_roles. Tras esta migración nadie tendrá acceso administrativo. Asigne un admin manualmente con la service_role key. ***';
  ELSE
    RAISE NOTICE 'Verificación OK: existen % usuario(s) con rol admin.',
      (SELECT count(*) FROM public.user_roles WHERE role = 'admin'::app_role);
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 0.b Helper: ¿el usuario tiene algún rol operativo asignado?
--     Evita repetir 7 llamadas a has_role() en cada política de lectura.
--     SECURITY DEFINER para no chocar con la RLS de user_roles.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tiene_rol_asignado(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

-- =====================================================================
-- 1. ELIMINAR ACCESO ANÓNIMO (rol `anon`) EN citas Y horarios_medicos
--    El bot / agenda pública usa la edge function `api-agenda`, que se
--    conecta con SERVICE_ROLE_KEY y por tanto ignora la RLS: quitar el
--    acceso anon no rompe el agendamiento público.
-- =====================================================================
DROP POLICY IF EXISTS "Citas public insert"    ON public.citas;
DROP POLICY IF EXISTS "Citas public read"      ON public.citas;
DROP POLICY IF EXISTS "Horarios public read"   ON public.horarios_medicos;

-- Equivalentes solo para `authenticated`
DROP POLICY IF EXISTS "Citas viewable" ON public.citas;
CREATE POLICY "Citas viewable"
  ON public.citas FOR SELECT TO authenticated
  USING (public.tiene_rol_asignado(auth.uid()));

-- Escritura de agenda: admin, optometra, asesor_comercial, auxiliar_optica
DROP POLICY IF EXISTS "Insert citas" ON public.citas;
CREATE POLICY "Insert citas"
  ON public.citas FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'optometra'::app_role)
    OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
    OR public.has_role(auth.uid(), 'auxiliar_optica'::app_role)
  );

DROP POLICY IF EXISTS "Update citas" ON public.citas;
CREATE POLICY "Update citas"
  ON public.citas FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'optometra'::app_role)
    OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
    OR public.has_role(auth.uid(), 'auxiliar_optica'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'optometra'::app_role)
    OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
    OR public.has_role(auth.uid(), 'auxiliar_optica'::app_role)
  );

-- Horarios: lectura para usuarios con rol; la gestión sigue siendo admin
-- (política existente "Admins manage horarios" FOR ALL).
DROP POLICY IF EXISTS "Horarios viewable" ON public.horarios_medicos;
CREATE POLICY "Horarios viewable"
  ON public.horarios_medicos FOR SELECT TO authenticated
  USING (public.tiene_rol_asignado(auth.uid()));

-- =====================================================================
-- 2. HISTORIAS CLÍNICAS (dato sensible de salud)
--    SELECT: admin, optometra, asesor_comercial (necesita la fórmula)
--    INSERT/UPDATE: solo admin y optometra
--    DELETE: sin política => denegado por defecto
-- =====================================================================
DROP POLICY IF EXISTS "Historias viewable" ON public.historias_clinicas;
CREATE POLICY "Historias viewable"
  ON public.historias_clinicas FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'optometra'::app_role)
    OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
  );

DROP POLICY IF EXISTS "Insert historias" ON public.historias_clinicas;
CREATE POLICY "Insert historias"
  ON public.historias_clinicas FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'optometra'::app_role)
  );

DROP POLICY IF EXISTS "Update historias" ON public.historias_clinicas;
CREATE POLICY "Update historias"
  ON public.historias_clinicas FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'optometra'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'optometra'::app_role)
  );

-- =====================================================================
-- 3. PACIENTES
--    SELECT: cualquier rol operativo. INSERT/UPDATE: admin, optometra,
--    asesor_comercial. Sin DELETE.
-- =====================================================================
DROP POLICY IF EXISTS "Pacientes viewable" ON public.pacientes;
CREATE POLICY "Pacientes viewable"
  ON public.pacientes FOR SELECT TO authenticated
  USING (public.tiene_rol_asignado(auth.uid()));

DROP POLICY IF EXISTS "Insert pacientes" ON public.pacientes;
CREATE POLICY "Insert pacientes"
  ON public.pacientes FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'optometra'::app_role)
    OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
  );

DROP POLICY IF EXISTS "Update pacientes" ON public.pacientes;
CREATE POLICY "Update pacientes"
  ON public.pacientes FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'optometra'::app_role)
    OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'optometra'::app_role)
    OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
  );

-- =====================================================================
-- 4. ÓRDENES, ORDEN_PRODUCTOS, ABONOS, COTIZACIONES
--    SELECT: cualquier rol operativo.
--    Escritura: admin, asesor_comercial, auxiliar_optica (+ optometra en
--    órdenes y productos, donde interviene la fórmula/control calidad).
--    'visualizador' y 'contador' NO escriben.
--    NOTA sobre 'mensajero': solo debería poder mover el estado de
--    entrega, pero la RLS de PostgreSQL no permite restringir por columna
--    dentro de una política (haría falta column-level GRANT + política con
--    WITH CHECK sobre estado_actual, o una función RPC dedicada). Por ser
--    complejo y arriesgado se deja SIN permiso de escritura; se recomienda
--    exponerle una función SECURITY DEFINER `marcar_entregado(...)`.
-- =====================================================================

-- ORDENES ------------------------------------------------------------
DROP POLICY IF EXISTS "Ordenes viewable" ON public.ordenes;
CREATE POLICY "Ordenes viewable"
  ON public.ordenes FOR SELECT TO authenticated
  USING (public.tiene_rol_asignado(auth.uid()));

DROP POLICY IF EXISTS "Insert ordenes" ON public.ordenes;
CREATE POLICY "Insert ordenes"
  ON public.ordenes FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
    OR public.has_role(auth.uid(), 'auxiliar_optica'::app_role)
    OR public.has_role(auth.uid(), 'optometra'::app_role)
  );

DROP POLICY IF EXISTS "Update ordenes" ON public.ordenes;
CREATE POLICY "Update ordenes"
  ON public.ordenes FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
    OR public.has_role(auth.uid(), 'auxiliar_optica'::app_role)
    OR public.has_role(auth.uid(), 'optometra'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
    OR public.has_role(auth.uid(), 'auxiliar_optica'::app_role)
    OR public.has_role(auth.uid(), 'optometra'::app_role)
  );

-- ORDEN_PRODUCTOS -----------------------------------------------------
DROP POLICY IF EXISTS "Productos viewable" ON public.orden_productos;
CREATE POLICY "Productos viewable"
  ON public.orden_productos FOR SELECT TO authenticated
  USING (public.tiene_rol_asignado(auth.uid()));

DROP POLICY IF EXISTS "Insert productos" ON public.orden_productos;
CREATE POLICY "Insert productos"
  ON public.orden_productos FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
    OR public.has_role(auth.uid(), 'auxiliar_optica'::app_role)
    OR public.has_role(auth.uid(), 'optometra'::app_role)
  );

DROP POLICY IF EXISTS "Update productos" ON public.orden_productos;
CREATE POLICY "Update productos"
  ON public.orden_productos FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
    OR public.has_role(auth.uid(), 'auxiliar_optica'::app_role)
    OR public.has_role(auth.uid(), 'optometra'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
    OR public.has_role(auth.uid(), 'auxiliar_optica'::app_role)
    OR public.has_role(auth.uid(), 'optometra'::app_role)
  );

-- ABONOS (dinero) -----------------------------------------------------
-- Nota: la tabla nunca tuvo política de UPDATE (los abonos eran
-- inmutables). Se conserva esa inmutabilidad salvo para admin, que puede
-- corregir errores de digitación (queda auditado por trigger).
DROP POLICY IF EXISTS "Abonos viewable" ON public.abonos;
CREATE POLICY "Abonos viewable"
  ON public.abonos FOR SELECT TO authenticated
  USING (public.tiene_rol_asignado(auth.uid()));

DROP POLICY IF EXISTS "Insert abonos" ON public.abonos;
CREATE POLICY "Insert abonos"
  ON public.abonos FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
    OR public.has_role(auth.uid(), 'auxiliar_optica'::app_role)
  );

DROP POLICY IF EXISTS "Update abonos" ON public.abonos;
CREATE POLICY "Update abonos"
  ON public.abonos FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- COTIZACIONES --------------------------------------------------------
DROP POLICY IF EXISTS "Cotizaciones viewable" ON public.cotizaciones;
CREATE POLICY "Cotizaciones viewable"
  ON public.cotizaciones FOR SELECT TO authenticated
  USING (public.tiene_rol_asignado(auth.uid()));

DROP POLICY IF EXISTS "Insert cotizaciones" ON public.cotizaciones;
CREATE POLICY "Insert cotizaciones"
  ON public.cotizaciones FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
    OR public.has_role(auth.uid(), 'auxiliar_optica'::app_role)
  );

DROP POLICY IF EXISTS "Update cotizaciones" ON public.cotizaciones;
CREATE POLICY "Update cotizaciones"
  ON public.cotizaciones FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
    OR public.has_role(auth.uid(), 'auxiliar_optica'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
    OR public.has_role(auth.uid(), 'auxiliar_optica'::app_role)
  );

-- =====================================================================
-- 5. CAJA DIARIA y EMPLEADOS DE NÓMINA
-- =====================================================================

-- CAJA: escritura admin, asesor_comercial, contador
DROP POLICY IF EXISTS "Caja viewable" ON public.caja_diaria;
CREATE POLICY "Caja viewable"
  ON public.caja_diaria FOR SELECT TO authenticated
  USING (public.tiene_rol_asignado(auth.uid()));

DROP POLICY IF EXISTS "Insert caja" ON public.caja_diaria;
CREATE POLICY "Insert caja"
  ON public.caja_diaria FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
    OR public.has_role(auth.uid(), 'contador'::app_role)
  );

DROP POLICY IF EXISTS "Update caja" ON public.caja_diaria;
CREATE POLICY "Update caja"
  ON public.caja_diaria FOR UPDATE TO authenticated
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

-- EMPLEADOS DE NÓMINA: datos personales de terceros.
-- Lectura para todos los roles operativos MENOS 'visualizador'.
-- Escritura solo admin.
DROP POLICY IF EXISTS "Empleados viewable" ON public.empleados_nomina;
CREATE POLICY "Empleados viewable"
  ON public.empleados_nomina FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'optometra'::app_role)
    OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
    OR public.has_role(auth.uid(), 'auxiliar_optica'::app_role)
    OR public.has_role(auth.uid(), 'contador'::app_role)
    OR public.has_role(auth.uid(), 'mensajero'::app_role)
  );

DROP POLICY IF EXISTS "Insert empleados" ON public.empleados_nomina;
CREATE POLICY "Insert empleados"
  ON public.empleados_nomina FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Update empleados" ON public.empleados_nomina;
CREATE POLICY "Update empleados"
  ON public.empleados_nomina FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- =====================================================================
-- 6. INVENTARIO y MOVIMIENTOS DE INVENTARIO
--    Escritura: admin, auxiliar_optica, asesor_comercial
-- =====================================================================
DROP POLICY IF EXISTS "Inventario viewable" ON public.inventario;
CREATE POLICY "Inventario viewable"
  ON public.inventario FOR SELECT TO authenticated
  USING (public.tiene_rol_asignado(auth.uid()));

DROP POLICY IF EXISTS "Insert inventario" ON public.inventario;
CREATE POLICY "Insert inventario"
  ON public.inventario FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'auxiliar_optica'::app_role)
    OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
  );

DROP POLICY IF EXISTS "Update inventario" ON public.inventario;
CREATE POLICY "Update inventario"
  ON public.inventario FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'auxiliar_optica'::app_role)
    OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'auxiliar_optica'::app_role)
    OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
  );

DROP POLICY IF EXISTS "Movimientos viewable" ON public.movimientos_inventario;
CREATE POLICY "Movimientos viewable"
  ON public.movimientos_inventario FOR SELECT TO authenticated
  USING (public.tiene_rol_asignado(auth.uid()));

-- El histórico de movimientos es inmutable: solo INSERT.
DROP POLICY IF EXISTS "Insert movimientos" ON public.movimientos_inventario;
CREATE POLICY "Insert movimientos"
  ON public.movimientos_inventario FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'auxiliar_optica'::app_role)
    OR public.has_role(auth.uid(), 'asesor_comercial'::app_role)
  );

-- =====================================================================
-- 7. LOG DE AUDITORÍA
--    a) El cliente ya no puede falsificar el usuario del registro.
--    b) Trigger SECURITY DEFINER que audita automáticamente.
--    NOTA: las columnas reales de la tabla son `datos_anteriores` y
--    `datos_nuevos` (JSONB); no existen columnas con sufijo `_json`.
-- =====================================================================
DROP POLICY IF EXISTS "Insert audit" ON public.log_auditoria;
CREATE POLICY "Insert audit"
  ON public.log_auditoria FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = usuario_id);

-- Sin políticas de UPDATE/DELETE => el log es inmutable para clientes.

CREATE OR REPLACE FUNCTION public.fn_log_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anteriores JSONB := NULL;
  v_nuevos     JSONB := NULL;
  v_entidad_id UUID   := NULL;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    v_nuevos := to_jsonb(NEW);
  ELSIF (TG_OP = 'UPDATE') THEN
    v_anteriores := to_jsonb(OLD);
    v_nuevos     := to_jsonb(NEW);
  ELSIF (TG_OP = 'DELETE') THEN
    v_anteriores := to_jsonb(OLD);
  END IF;

  -- Todas las tablas auditadas tienen PK uuid llamada `id`.
  v_entidad_id := NULLIF(COALESCE(v_nuevos, v_anteriores) ->> 'id', '')::uuid;

  INSERT INTO public.log_auditoria (
    usuario_id, entidad, entidad_id, accion, datos_anteriores, datos_nuevos
  ) VALUES (
    auth.uid(), TG_TABLE_NAME, v_entidad_id, TG_OP, v_anteriores, v_nuevos
  );

  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Triggers de auditoría (idempotentes)
DROP TRIGGER IF EXISTS trg_audit_historias_clinicas ON public.historias_clinicas;
CREATE TRIGGER trg_audit_historias_clinicas
  AFTER INSERT OR UPDATE OR DELETE ON public.historias_clinicas
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_auditoria();

DROP TRIGGER IF EXISTS trg_audit_ordenes ON public.ordenes;
CREATE TRIGGER trg_audit_ordenes
  AFTER INSERT OR UPDATE OR DELETE ON public.ordenes
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_auditoria();

DROP TRIGGER IF EXISTS trg_audit_orden_productos ON public.orden_productos;
CREATE TRIGGER trg_audit_orden_productos
  AFTER INSERT OR UPDATE OR DELETE ON public.orden_productos
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_auditoria();

DROP TRIGGER IF EXISTS trg_audit_abonos ON public.abonos;
CREATE TRIGGER trg_audit_abonos
  AFTER INSERT OR UPDATE OR DELETE ON public.abonos
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_auditoria();

DROP TRIGGER IF EXISTS trg_audit_garantias ON public.garantias;
CREATE TRIGGER trg_audit_garantias
  AFTER INSERT OR UPDATE OR DELETE ON public.garantias
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_auditoria();

-- =====================================================================
-- 8. STORAGE: bucket `orden-fotos` deja de ser público
--    ATENCIÓN FRONTEND: al volverse privado, `getPublicUrl()` deja de
--    servir las imágenes. El código de src/ debe migrar a
--    `createSignedUrl()`. Ese cambio NO forma parte de esta migración.
-- =====================================================================
UPDATE storage.buckets SET public = false WHERE id = 'orden-fotos';

-- Lectura: solo usuarios autenticados (antes era pública/anónima)
DROP POLICY IF EXISTS "Public can view order photos" ON storage.objects;
DROP POLICY IF EXISTS "Orden fotos read authenticated" ON storage.objects;
CREATE POLICY "Orden fotos read authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'orden-fotos' AND public.tiene_rol_asignado(auth.uid()));

-- Subida: se mantiene para autenticados con rol operativo
DROP POLICY IF EXISTS "Authenticated can upload order photos" ON storage.objects;
CREATE POLICY "Authenticated can upload order photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'orden-fotos' AND public.tiene_rol_asignado(auth.uid()));

-- Borrado: solo admin
DROP POLICY IF EXISTS "Authenticated can delete order photos" ON storage.objects;
DROP POLICY IF EXISTS "Orden fotos delete admin" ON storage.objects;
CREATE POLICY "Orden fotos delete admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'orden-fotos' AND public.has_role(auth.uid(), 'admin'::app_role));
