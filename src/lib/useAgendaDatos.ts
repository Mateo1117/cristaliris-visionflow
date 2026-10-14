/** Datos de agenda compartidos por la Agenda, Nueva cita y Horarios médicos. */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { sumarDias, hoyEnColombia } from './agendaGrid';
import type { BloqueHorario, Excepcion } from './disponibilidad';

export interface Medico { user_id: string; nombre: string; email?: string | null }

/** Optómetras activos (rol optometra). */
export function useOptometras() {
  return useQuery({
    queryKey: ['optometras'],
    queryFn: async () => {
      const { data: roles } = await supabase.from('user_roles').select('user_id').eq('role', 'optometra');
      if (!roles?.length) return [] as Medico[];
      const { data, error } = await supabase.from('profiles')
        .select('user_id, nombre, email').in('user_id', roles.map((r) => r.user_id)).eq('estado_activo', true).order('nombre');
      if (error) throw error;
      return (data ?? []) as Medico[];
    },
  });
}

export function useHorariosMedicos() {
  return useQuery({
    queryKey: ['horarios-medicos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('horarios_medicos').select('*').order('hora_inicio');
      if (error) throw error;
      return data as BloqueHorario[];
    },
  });
}

/** Ausencias de los últimos 60 días en adelante (las anteriores ya no afectan turnos). */
export function useExcepciones() {
  return useQuery({
    queryKey: ['horarios-excepciones'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('horarios_excepciones')
        .select('*').gte('fecha_fin', sumarDias(hoyEnColombia(), -60)).order('fecha_inicio');
      // Si la tabla aún no existe (migración pendiente) la agenda sigue funcionando sin bloqueos.
      if (error) return [] as Excepcion[];
      return (data ?? []) as Excepcion[];
    },
  });
}

export function useSedesActivas() {
  return useQuery({
    queryKey: ['sedes-activas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sedes').select('id, nombre').eq('estado_activa', true).order('nombre');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Citas entre dos fechas (vistas de semana, mes y lista). */
export function useCitasRango(desde: string, hasta: string, habilitado = true) {
  return useQuery({
    queryKey: ['citas', 'rango', desde, hasta],
    queryFn: async () => {
      const { data, error } = await supabase.from('citas')
        .select('*, pacientes(nombres, apellidos, telefono, numero_documento)')
        .gte('fecha', desde).lte('fecha', hasta)
        .order('fecha').order('hora_inicio');
      if (error) throw error;
      return data as any[];
    },
    enabled: habilitado,
  });
}

/**
 * Color por médico para distinguirlos en semana y mes. Clases literales para
 * que Tailwind las incluya en el build.
 */
const PALETA = [
  { bloque: 'bg-sky-500/15 border-sky-500/50 text-sky-900 dark:text-sky-100', punto: 'bg-sky-500' },
  { bloque: 'bg-violet-500/15 border-violet-500/50 text-violet-900 dark:text-violet-100', punto: 'bg-violet-500' },
  { bloque: 'bg-emerald-500/15 border-emerald-500/50 text-emerald-900 dark:text-emerald-100', punto: 'bg-emerald-500' },
  { bloque: 'bg-amber-500/15 border-amber-500/60 text-amber-900 dark:text-amber-100', punto: 'bg-amber-500' },
  { bloque: 'bg-rose-500/15 border-rose-500/50 text-rose-900 dark:text-rose-100', punto: 'bg-rose-500' },
  { bloque: 'bg-teal-500/15 border-teal-500/50 text-teal-900 dark:text-teal-100', punto: 'bg-teal-500' },
];
const SIN_MEDICO = { bloque: 'bg-muted border-border text-foreground', punto: 'bg-muted-foreground' };

export function colorMedico(medicos: Medico[], id: string | null | undefined) {
  const i = medicos.findIndex((m) => m.user_id === id);
  return i < 0 ? SIN_MEDICO : PALETA[i % PALETA.length];
}
