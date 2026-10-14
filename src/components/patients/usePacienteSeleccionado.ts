import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Columnas básicas para mostrar un paciente en el selector. */
export const COLUMNAS_LISTA = 'id, tipo_documento, numero_documento, nombres, apellidos, telefono, empresas(razon_social, porcentaje_descuento)';

/** Datos del paciente elegido, con las columnas que pida cada pantalla. */
export function usePacienteSeleccionado(id: string | null | undefined, columnas = COLUMNAS_LISTA) {
  return useQuery({
    queryKey: ['paciente-seleccionado', id, columnas],
    queryFn: async () => {
      const { data, error } = await supabase.from('pacientes').select(columnas).eq('id', id as string).maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}
