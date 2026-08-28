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
