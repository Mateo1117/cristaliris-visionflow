/**
 * Flujo de atención del paciente (migración 20261014000000):
 *
 *   cita agendada ─► llegó (en_espera) ─► en_consulta ─► atendida
 *                                                         │
 *                     historia clínica ─► "Por facturar" ─┤
 *                                   compró ─► orden       │
 *                               no compró ─► cotización / sin compra
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const ESTADOS_CITA = ['agendada', 'confirmada', 'en_espera', 'en_consulta', 'atendida', 'asistio', 'no_asistio', 'cancelada'] as const;
export type EstadoCita = (typeof ESTADOS_CITA)[number];

export const ESTADO_CITA_LABEL: Record<string, string> = {
  agendada: 'Agendada',
  confirmada: 'Confirmada',
  en_espera: 'En sala de espera',
  en_consulta: 'En consulta',
  atendida: 'Atendida',
  asistio: 'Asistió',
  no_asistio: 'No asistió',
  cancelada: 'Cancelada',
};

export const ESTADO_CITA_COLOR: Record<string, string> = {
  agendada: 'bg-info/20 text-info border-info/30',
  confirmada: 'bg-primary/20 text-primary border-primary/30',
  en_espera: 'bg-warning/20 text-warning border-warning/40',
  en_consulta: 'bg-primary/30 text-primary border-primary/50',
  atendida: 'bg-success/20 text-success border-success/30',
  asistio: 'bg-success/20 text-success border-success/30',
  no_asistio: 'bg-destructive/20 text-destructive border-destructive/30',
  cancelada: 'bg-muted text-muted-foreground border-muted line-through',
};

/** Estados que el menú de una cita permite elegir a mano. */
export const ESTADOS_CITA_MANUALES: EstadoCita[] = ['agendada', 'confirmada', 'en_espera', 'en_consulta', 'atendida', 'no_asistio', 'cancelada'];

export type ResultadoConsulta = 'orden' | 'cotizacion' | 'sin_compra';

export const RESULTADO_LABEL: Record<string, string> = {
  pendiente: 'Por facturar',
  orden: 'Compró',
  cotizacion: 'Cotización',
  sin_compra: 'Sin compra',
};

export interface Formula {
  od?: { esfera?: number | null; cilindro?: number | null; eje?: number | null; adicion?: number | null };
  oi?: { esfera?: number | null; cilindro?: number | null; eje?: number | null; adicion?: number | null };
  dp?: number | null;
  tipo_lente?: string | null;
  filtros?: string | null;
  forma_uso?: string | null;
  observaciones?: string | null;
}

export interface HistoriaPorFacturar {
  historia_id: string;
  fecha_consulta: string;
  estado_facturacion: 'pendiente' | ResultadoConsulta;
  orden_id: string | null;
  cotizacion_id: string | null;
  fecha_facturacion: string | null;
  paciente_id: string;
  paciente_nombre: string;
  paciente_documento: string;
  paciente_telefono: string | null;
  empresa: string | null;
  optometra_nombre: string | null;
  cita_id: string | null;
  formula: Formula;
}

/** ¿El error indica que la función/columna de la migración aún no existe? */
export const faltaMigracion = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === 'PGRST202' || e.code === '42883' || e.code === '42703' || e.code === 'PGRST204');

/** Cola "Por facturar": pendientes y resueltos de hoy. */
export function usePorFacturar(habilitado = true) {
  return useQuery({
    enabled: habilitado,
    queryKey: ['por-facturar'],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('historias_por_facturar');
      if (error) {
        if (faltaMigracion(error)) return { filas: [] as HistoriaPorFacturar[], sinMigracion: true };
        throw error;
      }
      return { filas: (data ?? []) as HistoriaPorFacturar[], sinMigracion: false };
    },
    refetchInterval: 60 * 1000,
  });
}

/** Registra si el paciente compró (orden), se llevó una cotización o no compró. */
export async function registrarResultadoConsulta(
  historiaId: string | null,
  resultado: ResultadoConsulta,
  ids: { ordenId?: string | null; cotizacionId?: string | null } = {},
) {
  const { error } = await (supabase.rpc as any)('registrar_resultado_consulta', {
    p_historia_id: historiaId,
    p_resultado: resultado,
    p_orden_id: ids.ordenId ?? null,
    p_cotizacion_id: ids.cotizacionId ?? null,
  });
  if (error) throw error;
}

const num = (v: number | null | undefined, decimales = 2) =>
  v === null || v === undefined ? '—' : `${v > 0 ? '+' : ''}${Number(v).toFixed(decimales)}`;

/** Fórmula en una línea por ojo, p. ej. "OD −1.25 −0.50 × 90 ADD +2.00". */
export function resumenOjo(o: Formula['od']): string {
  if (!o || (o.esfera == null && o.cilindro == null)) return '—';
  const partes = [num(o.esfera)];
  if (o.cilindro != null && Number(o.cilindro) !== 0) partes.push(`${num(o.cilindro)} × ${o.eje ?? '—'}°`);
  if (o.adicion != null && Number(o.adicion) !== 0) partes.push(`ADD ${num(o.adicion)}`);
  return partes.join(' ');
}

/** Texto de la fórmula para las observaciones de una orden o cotización. */
export function textoFormula(f: Formula | null | undefined, fecha?: string): string {
  if (!f) return '';
  const lineas = [
    `Fórmula${fecha ? ` (consulta ${new Date(fecha).toLocaleDateString('es-CO')})` : ''}:`,
    `OD ${resumenOjo(f.od)} · OI ${resumenOjo(f.oi)}${f.dp ? ` · DP ${f.dp}` : ''}`,
  ];
  if (f.tipo_lente) lineas.push(`Lente: ${f.tipo_lente}${f.filtros ? ` · Filtros: ${f.filtros}` : ''}`);
  return lineas.join('\n');
}
