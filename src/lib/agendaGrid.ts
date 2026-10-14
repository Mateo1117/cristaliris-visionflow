/**
 * Grilla de la agenda del día.
 *
 * La grilla dibujaba únicamente los minutos :00 y :20 y cruzaba las citas por
 * igualdad exacta de texto, de modo que una cita a las 8:30 o 14:45 no aparecía
 * en ninguna franja: la agenda se veía libre y era posible agendar doble. Aquí
 * la grilla se arma con las franjas fijas MÁS las horas reales de las citas.
 */

/** Franjas base de la jornada: 8:00 a 18:00 cada 20 minutos. */
export const HORAS_BASE: string[] = (() => {
  const salida: string[] = [];
  for (let minutos = 8 * 60; minutos < 18 * 60; minutos += 20) {
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    salida.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }
  return salida;
})();

/** 'HH:MM[:SS]' → 'HH:MM' (Postgres devuelve las horas con segundos). */
export const aHoraCorta = (hora?: string | null): string => (hora || '').slice(0, 5);

/** Franjas fijas + la hora exacta de cada cita, en orden cronológico. */
export const construirHoras = (citas: Array<{ hora_inicio?: string | null }>): string[] => {
  const horas = new Set(HORAS_BASE);
  for (const c of citas) {
    const h = aHoraCorta(c.hora_inicio);
    if (h) horas.add(h);
  }
  return [...horas].sort();
};

/**
 * Fecha de hoy en Colombia (UTC−5).
 * `new Date().toISOString()` da el día siguiente entre las 7 p. m. y medianoche.
 */
export const hoyEnColombia = (): string => {
  const ahora = new Date();
  const co = new Date(ahora.getTime() - 5 * 60 * 60 * 1000);
  return co.toISOString().split('T')[0];
};

/** Suma (o resta) días a una fecha 'yyyy-MM-dd' sin pasar por zonas horarias. */
export const sumarDias = (fecha: string, dias: number): string => {
  const [a, m, d] = fecha.split('-').map(Number);
  const base = new Date(Date.UTC(a, m - 1, d));
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().split('T')[0];
};

/** Día de la semana de 'yyyy-MM-dd' (0 = domingo), sin zonas horarias. */
const diaSemanaUTC = (fecha: string): number => {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
};

/** Lunes de la semana de la fecha. */
export const inicioSemana = (fecha: string): string => sumarDias(fecha, -((diaSemanaUTC(fecha) + 6) % 7));

/** Los 7 días (lunes a domingo) de la semana de la fecha. */
export const diasDeSemana = (fecha: string): string[] => {
  const lunes = inicioSemana(fecha);
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
};

/** Primer día del mes de la fecha. */
export const inicioMes = (fecha: string): string => `${fecha.slice(0, 7)}-01`;

/** Suma meses conservando el día 1 (para navegar entre meses). */
export const sumarMeses = (fecha: string, meses: number): string => {
  const [a, m] = fecha.split('-').map(Number);
  const base = new Date(Date.UTC(a, m - 1 + meses, 1));
  return base.toISOString().slice(0, 10);
};

/** Cuadrícula del mes: semanas completas de lunes a domingo que lo cubren. */
export const cuadriculaMes = (fecha: string): string[][] => {
  const primero = inicioMes(fecha);
  const ultimo = sumarDias(sumarMeses(primero, 1), -1);
  const semanas: string[][] = [];
  for (let lunes = inicioSemana(primero); lunes <= ultimo; lunes = sumarDias(lunes, 7)) {
    semanas.push(Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i)));
  }
  return semanas;
};
