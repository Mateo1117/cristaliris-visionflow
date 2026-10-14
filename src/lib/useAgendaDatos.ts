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
