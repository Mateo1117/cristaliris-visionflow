/**
 * Pruebas de la grilla de la agenda.
 *
 * Regresión que cubren: la grilla sólo dibujaba los minutos :00 y :20 y cruzaba
 * las citas por igualdad exacta de texto, así que una cita a las 8:30 no salía
 * en ninguna parte — la agenda se veía libre y se podía agendar doble.
 */
import { describe, it, expect } from 'vitest';
import { HORAS_BASE, aHoraCorta, construirHoras, sumarDias, hoyEnColombia } from './agendaGrid';

describe('aHoraCorta', () => {
  it('recorta los segundos que devuelve la base de datos', () => {
    expect(aHoraCorta('08:30:00')).toBe('08:30');
  });
  it('deja intacta una hora sin segundos', () => {
    expect(aHoraCorta('14:45')).toBe('14:45');
  });
  it('tolera nulos', () => {
    expect(aHoraCorta(null)).toBe('');
    expect(aHoraCorta(undefined)).toBe('');
  });
});

describe('HORAS_BASE', () => {
  it('cubre la jornada de 8:00 a 18:00 cada 20 minutos', () => {
    expect(HORAS_BASE[0]).toBe('08:00');
    expect(HORAS_BASE[1]).toBe('08:20');
    expect(HORAS_BASE[2]).toBe('08:40'); // antes este slot no existía
    expect(HORAS_BASE[HORAS_BASE.length - 1]).toBe('17:40');
    expect(HORAS_BASE).toHaveLength(30);
  });
});

describe('construirHoras', () => {
  it('añade la hora de una cita que no cae en una franja fija', () => {
    const horas = construirHoras([{ hora_inicio: '08:30:00' }]);
    expect(horas).toContain('08:30');
  });

  it('mantiene el orden cronológico', () => {
    const horas = construirHoras([{ hora_inicio: '14:45:00' }, { hora_inicio: '08:30:00' }]);
    expect(horas).toEqual([...horas].sort());
    expect(horas.indexOf('08:30')).toBeLessThan(horas.indexOf('14:45'));
  });

  it('no duplica una hora que ya es franja fija', () => {
    const horas = construirHoras([{ hora_inicio: '09:00:00' }]);
    expect(horas.filter(h => h === '09:00')).toHaveLength(1);
  });

  it('ignora citas sin hora', () => {
    expect(construirHoras([{ hora_inicio: null }])).toEqual(HORAS_BASE);
  });

  it('sin citas devuelve solo las franjas fijas', () => {
    expect(construirHoras([])).toEqual(HORAS_BASE);
  });

  it('incluye una cita fuera del horario de jornada', () => {
    expect(construirHoras([{ hora_inicio: '19:15:00' }])).toContain('19:15');
  });
});

describe('sumarDias', () => {
  it('avanza un día', () => {
    expect(sumarDias('2026-08-27', 1)).toBe('2026-08-28');
  });
  it('retrocede un día', () => {
    expect(sumarDias('2026-08-27', -1)).toBe('2026-08-26');
  });
  it('cruza el cambio de mes', () => {
    expect(sumarDias('2026-08-31', 1)).toBe('2026-09-01');
  });
  it('cruza el cambio de año', () => {
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('respeta el año bisiesto', () => {
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29');
  });
});

describe('hoyEnColombia', () => {
  it('devuelve una fecha con formato yyyy-MM-dd', () => {
    expect(hoyEnColombia()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
