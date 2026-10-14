/**
 * Filtros y resumen por laboratorio del tablero de órdenes. Con muchas
 * tarjetas no se veía qué tiene cada laboratorio ni qué montura acompaña a
 * cada lente (son líneas distintas de la misma orden).
 */
import { esEstadoLaboratorio } from './businessDays';

export const SIN_LABORATORIO = 'sin-lab';
export type TipoFiltro = 'todos' | 'lente' | 'montura';

export interface ItemKanban {
  id: string;
  orden_id: string;
  numero_orden?: number | null;
  paciente_nombre: string;
  tipo_producto: string;
  descripcion: string;
  numero_montura?: string | null;
  laboratorio_id?: string | null;
  laboratorio_nombre: string;
  estado_actual: string;
  dias_en_estado: number;
  tiempo_esperado_dias: number;
}

export interface FiltrosKanban { laboratorioId: string | null; tipo: TipoFiltro; texto: string }

const normalizar = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export const etiquetaOrden = (n?: number | null) => (n ? `ORD-${String(n).padStart(5, '0')}` : '');

/** Quita el prefijo "Montura ·" para mostrar solo marca y referencia. */
export const textoMontura = (descripcion: string) => descripcion.replace(/^montura\s*·\s*/i, '');

/** Monturas de cada orden, para mostrarlas en la tarjeta del lente. */
export function monturasPorOrden(items: ItemKanban[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const it of items) {
    if (it.tipo_producto !== 'montura') continue;
    m.set(it.orden_id, [...(m.get(it.orden_id) ?? []), textoMontura(it.descripcion)]);
  }
  return m;
}

export function filtrarKanban<T extends ItemKanban>(items: T[], f: FiltrosKanban): T[] {
  const q = normalizar(f.texto.trim());
  return items.filter((it) => {
    if (f.laboratorioId) {
      const lab = it.laboratorio_id ?? SIN_LABORATORIO;
      if (lab !== f.laboratorioId) return false;
    }
    if (f.tipo !== 'todos' && it.tipo_producto !== f.tipo) return false;
    if (q) {
      const texto = normalizar([it.paciente_nombre, it.descripcion, it.numero_montura ?? '', etiquetaOrden(it.numero_orden), String(it.numero_orden ?? ''), it.laboratorio_nombre].join(' '));
      if (!texto.includes(q)) return false;
    }
    return true;
  });
}

export interface ResumenLaboratorio {
  id: string;
  nombre: string;
  /** Trabajos sin entregar asignados a ese laboratorio. */
  activos: number;
  /** De esos, cuántos están físicamente en el laboratorio (enviado, recibido, producción…). */
  enLaboratorio: number;
  /** Cuántos superan el tiempo esperado en su estado actual. */
  atrasados: number;
}

/** Resumen por laboratorio de los trabajos sin entregar, del más cargado al menos. */
export function resumenLaboratorios(items: ItemKanban[]): ResumenLaboratorio[] {
  const m = new Map<string, ResumenLaboratorio>();
  for (const it of items) {
    if (it.estado_actual === 'entregado') continue;
    const id = it.laboratorio_id ?? SIN_LABORATORIO;
    const r = m.get(id) ?? { id, nombre: it.laboratorio_id ? it.laboratorio_nombre : 'Sin laboratorio', activos: 0, enLaboratorio: 0, atrasados: 0 };
    r.activos++;
    if (esEstadoLaboratorio(it.estado_actual)) r.enLaboratorio++;
    if (it.tiempo_esperado_dias > 0 && it.dias_en_estado >= it.tiempo_esperado_dias) r.atrasados++;
    m.set(id, r);
  }
  return [...m.values()].sort((a, b) =>
    (a.id === SIN_LABORATORIO ? 1 : 0) - (b.id === SIN_LABORATORIO ? 1 : 0) || b.activos - a.activos || a.nombre.localeCompare(b.nombre));
}
