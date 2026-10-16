/**
 * Tiempo de entrega de un trabajo en el laboratorio, en días HÁBILES.
 *
 * Manda el tiempo configurado en Configuración → Laboratorios
 * (`tiempo_promedio_entrega`). Si el trabajo no tiene laboratorio o el
 * laboratorio no tiene tiempo, se usa el tiempo por tipo de lente.
 * Esta regla la usan la orden nueva, el tablero y las alertas de producción.
 */
import { sumarDiasHabiles, toFechaColombia, type FechaEntrada } from './businessDays';

/** Tiempo por tipo de lente, cuando no hay tiempo del laboratorio. */
export const DIAS_POR_TIPO: Record<string, number> = {
  progresivo: 3,
  talla: 3,
  sol_formula: 3,
  terminado: 1,
  montura_3piezas: 2,
};
export const DIAS_POR_DEFECTO = 3;

export interface TiempoEntrega {
  dias: number;
  origen: 'laboratorio' | 'tipo' | 'defecto';
}

export function tiempoEntrega(diasLaboratorio: number | null | undefined, tipoLenteTiempo?: string | null): TiempoEntrega {
  const lab = Number(diasLaboratorio);
  if (Number.isFinite(lab) && lab > 0) return { dias: Math.round(lab), origen: 'laboratorio' };
  const tipo = tipoLenteTiempo ? DIAS_POR_TIPO[tipoLenteTiempo] : undefined;
  if (tipo) return { dias: tipo, origen: 'tipo' };
  return { dias: DIAS_POR_DEFECTO, origen: 'defecto' };
}

/** Fecha estimada (YYYY-MM-DD) sumando días hábiles desde `desde`. */
export function fechaEntregaEstimada(desde: FechaEntrada, dias: number, festivos: Iterable<FechaEntrada> = []): string {
  return toFechaColombia(sumarDiasHabiles(desde, dias, festivos));
}

/** "jue 22 oct" */
export function fechaCorta(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export const textoDias = (n: number) => `${n} ${n === 1 ? 'día hábil' : 'días hábiles'}`;
