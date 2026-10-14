/**
 * Etapas del tablero de órdenes (tabla kanban_etapas, migración
 * 20261014040000): nombre, orden, color, responsable y visibilidad los
 * define la óptica. Las 11 claves originales conservan su comportamiento
 * (control de calidad, aviso de entrega, fechas del ciclo, laboratorio).
 *
 * Las funciones de `@/types` y `businessDays` (etiqueta, color, orden,
 * siguiente etapa, ¿es laboratorio?) leen el registro que llena
 * `useEtapasKanban`, así todas las pantallas usan la misma configuración.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ETAPAS_POR_DEFECTO, registrarEtapas, type EtapaKanban } from './etapasRegistro';

export * from './etapasRegistro';

/** Etapas configuradas (y registradas para el resto de la app). */
export function useEtapasKanban() {
  return useQuery({
    queryKey: ['kanban-etapas'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('kanban_etapas').select('*').order('orden');
      const etapas = (!error && data?.length ? data : ETAPAS_POR_DEFECTO) as EtapaKanban[];
      registrarEtapas(etapas);
      return etapas;
    },
    staleTime: 60 * 1000,
  });
}

/** "Cesar Muete " → "Cesar Muete". */
export const nombreCorto = (n?: string | null) => (n ?? '').trim();

/**
 * Cambia la etapa de un producto con la función mover_etapa (valida
 * permisos y retrocesos, sella fechas y deja el historial). Permite al
 * mensajero mover tarjetas sin poder editar la orden.
 */
export async function moverEtapa(p: {
  id: string;
  estado: string;
  metodo?: 'manual' | 'qr_scan';
  justificacion?: string | null;
  observaciones?: string | null;
}): Promise<{ reproceso: boolean; retroceso: boolean }> {
  const { data, error } = await (supabase.rpc as any)('mover_etapa', {
    p_orden_producto_id: p.id,
    p_estado: p.estado,
    p_metodo: p.metodo ?? 'manual',
    p_justificacion: p.justificacion ?? null,
    p_observaciones: p.observaciones ?? null,
  });
  if (error) throw error;
  return { reproceso: !!data?.reproceso, retroceso: !!data?.retroceso };
}
