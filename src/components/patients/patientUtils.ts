/**
 * Utilidades puras del módulo de Pacientes.
 *
 * Viven aquí (y no dentro de un componente) para que la página, la tabla y los
 * diálogos compartan UNA sola fuente de verdad: la edad se calculaba de tres
 * formas distintas y la ciudad se normalizaba de una manera pero el indicador
 * `es_fuera_bogota` se derivaba de otra.
 *
 * Zona horaria: igual que `@/lib/businessDays`, todo se resuelve sobre la fecha
 * civil colombiana (UTC-5), nunca sobre `toISOString()` del instante: a las
 * 8 p.m. de Bogotá el UTC ya está en el día siguiente y la edad se adelantaba
 * un día en los cumpleaños.
 */

import { toFechaColombia, type FechaEntrada } from '@/lib/businessDays';

export const CIUDAD_POR_DEFECTO = 'Bogotá';

/** Columnas por las que busca el listado de pacientes (búsqueda en servidor). */
const COLUMNAS_BUSQUEDA = ['numero_documento', 'nombres', 'apellidos', 'telefono', 'referido_por'] as const;

/** Minúsculas y sin tildes, para comparar textos escritos por el usuario. */
function sinTildes(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Edad en años cumplidos sobre la fecha civil colombiana.
 * Devuelve `null` si no hay fecha, si es inválida o si está en el futuro.
 */
export function calcularEdad(
  fechaNacimiento: FechaEntrada | null | undefined,
  ahora: FechaEntrada = new Date(),
): number | null {
  if (!fechaNacimiento) return null;

  let nacimiento: string;
  let hoy: string;
  try {
    nacimiento = toFechaColombia(fechaNacimiento);
    hoy = toFechaColombia(ahora);
  } catch {
    return null;
  }

  const [anioNac, mesNac, diaNac] = nacimiento.split('-').map(Number);
  const [anioHoy, mesHoy, diaHoy] = hoy.split('-').map(Number);

  let edad = anioHoy - anioNac;
  if (mesHoy < mesNac || (mesHoy === mesNac && diaHoy < diaNac)) edad--;

  return edad < 0 ? null : edad;
}

/** Fecha civil colombiana formateada como en el resto de la UI ("27/8/2026"). */
export function formatearFechaColombia(fecha: FechaEntrada | null | undefined): string {
  if (!fecha) return '—';
  try {
    const [anio, mes, dia] = toFechaColombia(fecha).split('-').map(Number);
    return `${dia}/${mes}/${anio}`;
  } catch {
    return '—';
  }
}

/**
 * Ciudad lista para guardar: sin espacios sobrantes y con Bogotá por defecto
 * cuando el campo viene vacío.
 */
export function normalizarCiudad(ciudad: string | null | undefined): string {
  const limpia = (ciudad ?? '').replace(/\s+/g, ' ').trim();
  return limpia || CIUDAD_POR_DEFECTO;
}

/** ¿La ciudad es Bogotá? Ignora mayúsculas, tildes y variantes "D.C."/"DC". */
export function esBogota(ciudad: string | null | undefined): boolean {
  const base = sinTildes(normalizarCiudad(ciudad)).replace(/[^a-z0-9]+/g, ' ').trim();
  return base === 'bogota' || base.startsWith('bogota d');
}

/**
 * Indicador `es_fuera_bogota`. Se deriva SIEMPRE de la ciudad ya normalizada
 * para que no pueda guardarse "Bogotá" marcada como fuera de Bogotá.
 */
export function esFueraDeBogota(ciudad: string | null | undefined): boolean {
  return !esBogota(ciudad);
}

/**
 * Filtro `.or()` de PostgREST para la búsqueda de pacientes en el servidor.
 * Devuelve `null` cuando no hay término útil (entonces no se filtra).
 *
 * Los caracteres con significado en la sintaxis de `or` (comas, paréntesis,
 * comillas) y los comodines de `ilike` se eliminan para no romper la consulta.
 */
export function filtroBusquedaPacientes(termino: string): string | null {
  const limpio = (termino ?? '')
    .replace(/[,()"'%\\*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!limpio) return null;
  return COLUMNAS_BUSQUEDA.map((columna) => `${columna}.ilike.%${limpio}%`).join(',');
}
