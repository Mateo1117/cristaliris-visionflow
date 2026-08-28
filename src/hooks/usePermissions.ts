import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { AppRole } from '@/types';

/** Etiquetas en español para mostrar el rol en la UI. */
export const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Administrador',
  optometra: 'Optómetra',
  asesor_comercial: 'Asesor Comercial',
  auxiliar_optica: 'Auxiliar Óptica',
  mensajero: 'Mensajero',
  contador: 'Contador',
  visualizador: 'Visualizador',
};

/** Módulos de la aplicación (coinciden con las rutas). */
export type Modulo =
  | 'dashboard'
  | 'pacientes'
  | 'agenda'
  | 'cotizaciones'
  | 'ordenes'
  | 'control-calidad'
  | 'historias'
  | 'inventario'
  | 'cartera'
  | 'garantias'
  | 'reportes'
  | 'scan'
  | 'usuarios'
  | 'configuracion'
  | 'api-docs';

/**
 * Roles con acceso de LECTURA a cada módulo.
 * Si un módulo no aparece aquí, cualquier usuario autenticado puede verlo.
 */
export const ACCESO_MODULO: Partial<Record<Modulo, AppRole[]>> = {
  historias: ['admin', 'optometra', 'asesor_comercial'],
  cartera: ['admin', 'contador', 'asesor_comercial'],
  reportes: ['admin', 'contador'],
  usuarios: ['admin'],
  configuracion: ['admin'],
  'api-docs': ['admin'],
};

/**
 * Roles con permiso de ESCRITURA (crear / editar / eliminar) en cada módulo.
 * `admin` siempre puede escribir. `visualizador` nunca.
 */
export const ESCRITURA_MODULO: Record<Modulo, AppRole[]> = {
  dashboard: [],
  pacientes: ['admin', 'optometra', 'asesor_comercial', 'auxiliar_optica'],
  agenda: ['admin', 'optometra', 'asesor_comercial', 'auxiliar_optica'],
  cotizaciones: ['admin', 'asesor_comercial', 'auxiliar_optica'],
  ordenes: ['admin', 'asesor_comercial', 'auxiliar_optica', 'mensajero'],
  'control-calidad': ['admin', 'optometra', 'auxiliar_optica'],
  historias: ['admin', 'optometra'],
  inventario: ['admin', 'auxiliar_optica'],
  cartera: ['admin', 'contador', 'asesor_comercial'],
  garantias: ['admin', 'optometra', 'asesor_comercial', 'auxiliar_optica'],
  reportes: [],
  scan: ['admin', 'mensajero', 'auxiliar_optica', 'asesor_comercial'],
  usuarios: ['admin'],
  configuracion: ['admin'],
  'api-docs': ['admin'],
};

/** ¿El rol dado puede ver el módulo? (usado por rutas y menú lateral) */
export function puedeVerModulo(role: AppRole | null | undefined, modulo: Modulo): boolean {
  const permitidos = ACCESO_MODULO[modulo];
  if (!permitidos) return !!role;
  return !!role && permitidos.includes(role);
}

/**
 * Rol del usuario autenticado y helpers de permisos.
 *
 * El rol se lee de la tabla `user_roles` (RLS: cada usuario ve su propio rol).
 * Se cachea con react-query por usuario para no reconsultar en cada render/ruta.
 */
export function usePermissions() {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id;

  const { data: role = null, isLoading: roleLoading } = useQuery({
    queryKey: ['user-role', userId],
    queryFn: async (): Promise<AppRole | null> => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId as string)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data?.role as AppRole | undefined) ?? null;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const isLoading = authLoading || (!!userId && roleLoading);

  /** ¿El usuario tiene alguno de los roles indicados? */
  const has = (...roles: AppRole[]) => !!role && roles.includes(role);

  /** ¿El usuario puede escribir en el módulo indicado? */
  const canWrite = (modulo: Modulo) => {
    if (!role) return false;
    if (role === 'admin') return true;
    return ESCRITURA_MODULO[modulo].includes(role);
  };

  /** ¿El usuario puede ver el módulo indicado? */
  const canView = (modulo: Modulo) => puedeVerModulo(role, modulo);

  return {
    role,
    roleLabel: role ? ROLE_LABELS[role] : null,
    isAdmin: role === 'admin',
    isLoading,
    has,
    canWrite,
    canView,
  };
}

/** Perfil (nombre, email, teléfono...) del usuario autenticado. */
export function useCurrentProfile() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ['current-profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, nombre, email, telefono, estado_activo')
        .eq('user_id', userId as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
