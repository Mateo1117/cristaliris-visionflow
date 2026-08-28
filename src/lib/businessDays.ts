/**
 * Utilidades de fechas del flujo operativo (Módulo 3 y Módulo 5).
 *
 * ── Días hábiles ────────────────────────────────────────────────────────────
 * Regla de negocio (README, 3.4): los tiempos de laboratorio se miden en días
 * HÁBILES = lunes a viernes, excluyendo sábados, domingos y los festivos
 * configurados en la tabla `festivos`. Los sábados NO son hábiles.
 *
 * ── Zona horaria ────────────────────────────────────────────────────────────
 * Colombia es UTC-5 fijo (no tiene horario de verano). Todas las funciones
 * trabajan sobre la *fecha civil colombiana* ("YYYY-MM-DD"), nunca sobre
 * `toISOString()` del instante: a las 8 p.m. de Bogotá `toISOString()` ya
 * devuelve el día siguiente en UTC y el conteo saldría corrido un día.
 *
 * Las funciones que devuelven `Date` la anclan a las 12:00 UTC (07:00 en
 * Bogotá), de modo que su fecha civil colombiana siempre es la esperada.
 *
 * ── Nota de ubicación ───────────────────────────────────────────────────────
 * Además del cálculo de días hábiles, este módulo concentra el ORDEN del flujo
 * de estados y el mapa de fechas del ciclo. Viven aquí para que Kanban, ScanQR
 * y el diálogo de detalle compartan UNA sola fuente de verdad (son datos puros
 * y testeables, sin dependencias de React).
 */

import { useQuery } from '@tanstack/react-query';
import { ESTADOS_PRODUCTO, type EstadoProducto } from '@/types';

export type FechaEntrada = string | number | Date;

/** Colombia: UTC-5 permanente (sin DST). */
const OFFSET_COLOMBIA_MS = 5 * 60 * 60 * 1000;
const MS_DIA = 86_400_000;
const RE_FECHA_SIMPLE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Tope de seguridad para los bucles día a día (~547 años). */
const MAX_ITERACIONES = 200_000;

const pad = (n: number) => String(n).padStart(2, '0');

/** Formatea las partes UTC de una fecha anclada a mediodía como "YYYY-MM-DD". */
function claveUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * Fecha civil colombiana ("YYYY-MM-DD") de cualquier entrada.
 *
 * - Un string "YYYY-MM-DD" (columnas `date` de Postgres) se toma tal cual:
 *   NO se reinterpreta como medianoche UTC, que restaría un día en Bogotá.
 * - Cualquier otro valor se trata como instante y se convierte a UTC-5.
 */
export function toFechaColombia(fecha: FechaEntrada): string {
  if (typeof fecha === 'string') {
    const texto = fecha.trim();
    if (RE_FECHA_SIMPLE.test(texto)) return texto;
    const instante = new Date(texto);
    if (Number.isNaN(instante.getTime())) throw new RangeError(`Fecha inválida: ${fecha}`);
    return claveUtc(new Date(instante.getTime() - OFFSET_COLOMBIA_MS));
  }
  const instante = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(instante.getTime())) throw new RangeError(`Fecha inválida: ${String(fecha)}`);
  return claveUtc(new Date(instante.getTime() - OFFSET_COLOMBIA_MS));
}

/** `Date` anclada a las 12:00 UTC del día civil indicado ("YYYY-MM-DD"). */
function claveADate(clave: string): Date {
  const [anio, mes, dia] = clave.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia, 12, 0, 0, 0));
}

/** Fecha civil colombiana de hoy ("YYYY-MM-DD"). */
export function hoyColombia(ahora: FechaEntrada = new Date()): string {
  return toFechaColombia(ahora);
}

/** Normaliza la lista de festivos a un `Set` de claves "YYYY-MM-DD". */
export function normalizarFestivos(festivos: Iterable<FechaEntrada> = []): Set<string> {
  const set = new Set<string>();
  for (const f of festivos) {
    if (f === null || f === undefined || f === '') continue;
    try {
      set.add(toFechaColombia(f));
    } catch {
      // Un festivo mal formado no debe tumbar el cálculo del tablero.
    }
  }
  return set;
}

function esFinDeSemanaClave(clave: string): boolean {
  const dow = claveADate(clave).getUTCDay();
  return dow === 0 || dow === 6;
}

function esDiaHabilClave(clave: string, festivos: Set<string>): boolean {
  return !esFinDeSemanaClave(clave) && !festivos.has(clave);
}

/** ¿La fecha cae en sábado o domingo (hora colombiana)? */
export function esFinDeSemana(fecha: FechaEntrada): boolean {
  return esFinDeSemanaClave(toFechaColombia(fecha));
}

/** ¿La fecha es día hábil? (lunes-viernes y no festivo). */
export function esDiaHabil(fecha: FechaEntrada, festivos: Iterable<FechaEntrada> = []): boolean {
  return esDiaHabilClave(toFechaColombia(fecha), normalizarFestivos(festivos));
}

/**
 * Días hábiles transcurridos entre dos fechas: cuenta los días hábiles del
 * intervalo (desde, hasta] — es decir, excluye el día inicial e incluye el
 * final. Mismo día ⇒ 0. Si `hasta` es anterior a `desde` el resultado es
 * negativo (simétrico).
 *
 * Ejemplos: viernes → lunes = 1 · viernes → sábado = 0 · lunes → viernes = 4.
 */
export function diasHabilesEntre(
  desde: FechaEntrada,
  hasta: FechaEntrada,
  festivos: Iterable<FechaEntrada> = [],
): number {
  const claveDesde = toFechaColombia(desde);
  const claveHasta = toFechaColombia(hasta);
  if (claveDesde === claveHasta) return 0;

  const invertido = claveHasta < claveDesde; // las claves ISO ordenan lexicográficamente
  const inicio = invertido ? claveHasta : claveDesde;
  const fin = invertido ? claveDesde : claveHasta;

  const set = normalizarFestivos(festivos);
  const finMs = claveADate(fin).getTime();
  let ms = claveADate(inicio).getTime();
  let habiles = 0;
  let iteraciones = 0;

  while (ms < finMs && iteraciones++ < MAX_ITERACIONES) {
    ms += MS_DIA;
    if (esDiaHabilClave(claveUtc(new Date(ms)), set)) habiles++;
  }

  if (!habiles) return 0; // evita devolver -0
  return invertido ? -habiles : habiles;
}

/**
 * Suma `n` días hábiles a una fecha (n negativo resta). `n = 0` devuelve el
 * mismo día aunque no sea hábil. El resultado siempre cae en día hábil cuando
 * `n !== 0`.
 *
 * Devuelve un `Date` anclado a las 12:00 UTC del día resultante.
 */
export function sumarDiasHabiles(
  fecha: FechaEntrada,
  n: number,
  festivos: Iterable<FechaEntrada> = [],
): Date {
  const inicio = claveADate(toFechaColombia(fecha));
  const pasos = Math.trunc(n);
  if (!pasos) return inicio;

  const set = normalizarFestivos(festivos);
  const delta = pasos > 0 ? MS_DIA : -MS_DIA;
  let restantes = Math.abs(pasos);
  let ms = inicio.getTime();
  let iteraciones = 0;

  while (restantes > 0 && iteraciones++ < MAX_ITERACIONES) {
    ms += delta;
    if (esDiaHabilClave(claveUtc(new Date(ms)), set)) restantes--;
  }

  return new Date(ms);
}

/** Días CALENDARIO entre dos fechas (negativo si `hasta` < `desde`). */
export function diasCalendarioEntre(desde: FechaEntrada, hasta: FechaEntrada): number {
  const a = claveADate(toFechaColombia(desde)).getTime();
  const b = claveADate(toFechaColombia(hasta)).getTime();
  return Math.round((b - a) / MS_DIA);
}

// ────────────────────────────────────────────────────────────────────────────
// Protocolo de adaptación (Módulo 5.1)
// ────────────────────────────────────────────────────────────────────────────

/** Periodo obligatorio de adaptación: 7 días CALENDARIO desde la entrega. */
export const DIAS_ADAPTACION = 7;

/**
 * Días que faltan para terminar el periodo de adaptación.
 * 0 ⇒ el periodo ya se cumplió y se puede solicitar garantía.
 */
export function diasRestantesAdaptacion(
  fechaEntrega: FechaEntrada | null | undefined,
  ahora: FechaEntrada = new Date(),
): number {
  if (!fechaEntrega) return DIAS_ADAPTACION;
  const transcurridos = diasCalendarioEntre(fechaEntrega, ahora);
  return Math.max(0, DIAS_ADAPTACION - transcurridos);
}

/** ¿Ya se cumplió el periodo de adaptación de 7 días? */
export function adaptacionCumplida(
  fechaEntrega: FechaEntrada | null | undefined,
  ahora: FechaEntrada = new Date(),
): boolean {
  return !!fechaEntrega && diasRestantesAdaptacion(fechaEntrega, ahora) === 0;
}

// ────────────────────────────────────────────────────────────────────────────
// Flujo de estados y fechas del ciclo (Módulo 3.2)
// ────────────────────────────────────────────────────────────────────────────

/** Orden canónico del flujo, incluidos los estados que no tienen columna Kanban. */
export const ORDEN_FLUJO_ESTADOS: EstadoProducto[] = [
  'pedido_creado',
  'alistamiento',
  'enviado_laboratorio',
  'recibido_laboratorio',
  'en_produccion',
  'producido',
  'en_transito',
  'recibido_optica',
  'control_calidad',
  'listo_entrega',
  'entregado',
];

/** Posición del estado en el flujo (-1 si es desconocido). */
export function indiceEstado(estado: string): number {
  return ORDEN_FLUJO_ESTADOS.indexOf(estado as EstadoProducto);
}

/** ¿Pasar de `desde` a `hasta` es un retroceso en el flujo? */
export function esRetroceso(desde: string, hasta: string): boolean {
  const a = indiceEstado(desde);
  const b = indiceEstado(hasta);
  if (a < 0 || b < 0) return false;
  return b < a;
}

/** Siguiente paso lógico dentro del flujo visible (columnas del Kanban). */
export function siguienteEstado(actual: string): { key: EstadoProducto; label: string } | null {
  const idx = indiceEstado(actual);
  if (idx < 0) return null;
  return ESTADOS_PRODUCTO.find((e) => indiceEstado(e.key) > idx) ?? null;
}

/** Estados en los que el producto está en manos del laboratorio. */
export const ESTADOS_LABORATORIO: EstadoProducto[] = [
  'enviado_laboratorio',
  'recibido_laboratorio',
  'en_produccion',
  'producido',
];

export function esEstadoLaboratorio(estado: string): boolean {
  return ESTADOS_LABORATORIO.includes(estado as EstadoProducto);
}

/**
 * Fecha de `orden_productos` que se sella al ALCANZAR cada estado.
 * Habilita los KPIs de tiempos y la regla de los 7 días de adaptación.
 */
export const CAMPO_FECHA_CICLO: Partial<Record<EstadoProducto, string>> = {
  enviado_laboratorio: 'fecha_envio_lab',
  recibido_laboratorio: 'fecha_recepcion_lab',
  control_calidad: 'fecha_control_calidad',
  listo_entrega: 'fecha_listo_entrega',
  entregado: 'fecha_entrega_real',
};

/**
 * Parche `{ campo: timestamp }` que debe acompañar al cambio de estado.
 * Devuelve `{}` para los estados que no tienen fecha asociada.
 */
export function sellosDeFecha(estado: string, ahora: Date = new Date()): Record<string, string> {
  const campo = CAMPO_FECHA_CICLO[estado as EstadoProducto];
  return campo ? { [campo]: ahora.toISOString() } : {};
}

// ────────────────────────────────────────────────────────────────────────────
// Festivos desde Supabase
// ────────────────────────────────────────────────────────────────────────────

/**
 * Festivos configurados en la BD, como claves "YYYY-MM-DD".
 *
 * Cambian muy poco (una vez al año), así que se cachean de forma agresiva.
 * El cliente de Supabase se importa de forma diferida para que este módulo
 * siga siendo puro e importable desde los tests sin variables de entorno.
 */
export function useFestivos() {
  const { data = [], isLoading } = useQuery({
    queryKey: ['festivos'],
    queryFn: async (): Promise<string[]> => {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data, error } = await supabase.from('festivos').select('fecha');
      if (error) throw error;
      return [...normalizarFestivos((data ?? []).map((f) => f.fecha))];
    },
    staleTime: 24 * 60 * 60 * 1000, // 24 h
    gcTime: 48 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  return { festivos: data, isLoading };
}
