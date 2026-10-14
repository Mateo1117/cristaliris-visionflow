/**
 * Pruebas de la disponibilidad de la agenda.
 *
 * Regresión que cubren: la cita se agendaba escribiendo la hora a mano, sin
 * mirar el horario del médico ni las citas ya tomadas.
 */
import { describe, it, expect } from 'vitest';
import {
  aHora, aMinutos, buscarCruce, calcularTurnos, dentroDeHorario, diaCompletoBloqueado, diaDeSemana, estaBloqueado,
  haySolape, resumenSemanal, validarBloque, type BloqueHorario, type Excepcion,
} from './disponibilidad';

const LUNES = '2026-10-12';
const bloque = (b: Partial<BloqueHorario> = {}): BloqueHorario => ({
  medico_id: 'ana', dia_semana: 1, hora_inicio: '08:00:00', hora_fin: '10:00:00',
  duracion_cita: 30, sede_id: null, activo: true, ...b,
});

describe('utilidades de hora', () => {
  it('convierte entre texto y minutos', () => {
    expect(aMinutos('08:30:00')).toBe(510);
    expect(aHora(510)).toBe('08:30');
  });
  it('calcula el día de la semana sin depender de la zona horaria', () => {
    expect(diaDeSemana(LUNES)).toBe(1);
    expect(diaDeSemana('2026-10-18')).toBe(0);
  });
  it('detecta solapes y permite rangos contiguos', () => {
    expect(haySolape('08:00', '09:00', '08:30', '09:30')).toBe(true);
    expect(haySolape('08:00', '09:00', '09:00', '10:00')).toBe(false);
  });
});

describe('calcularTurnos', () => {
  it('parte el bloque en turnos de la duración configurada', () => {
    const turnos = calcularTurnos({ fecha: LUNES, horarios: [bloque()], citas: [] });
    expect(turnos.map((t) => t.hora_inicio)).toEqual(['08:00', '08:30', '09:00', '09:30']);
    expect(turnos[3].hora_fin).toBe('10:00');
  });

  it('no ofrece turnos otro día de la semana ni de bloques inactivos', () => {
    expect(calcularTurnos({ fecha: '2026-10-13', horarios: [bloque()], citas: [] })).toEqual([]);
    expect(calcularTurnos({ fecha: LUNES, horarios: [bloque({ activo: false })], citas: [] })).toEqual([]);
  });

  it('quita los turnos ocupados, también si la cita no empieza en punto', () => {
    const turnos = calcularTurnos({
      fecha: LUNES, horarios: [bloque()],
      citas: [{ optometra_id: 'ana', hora_inicio: '08:45:00', hora_fin: '09:15:00', estado: 'agendada' }],
    });
    expect(turnos.map((t) => t.hora_inicio)).toEqual(['08:00', '09:30']);
  });

  it('una cita cancelada libera el turno', () => {
    const turnos = calcularTurnos({
      fecha: LUNES, horarios: [bloque()],
      citas: [{ optometra_id: 'ana', hora_inicio: '08:00', hora_fin: '08:30', estado: 'cancelada' }],
    });
    expect(turnos[0].hora_inicio).toBe('08:00');
  });

  it('la cita de otro médico no ocupa el turno', () => {
    const turnos = calcularTurnos({
      fecha: LUNES, horarios: [bloque()],
      citas: [{ optometra_id: 'luis', hora_inicio: '08:00', hora_fin: '08:30', estado: 'agendada' }],
    });
    expect(turnos).toHaveLength(4);
  });

  it('filtra por sede; un bloque sin sede atiende en todas', () => {
    const horarios = [bloque({ sede_id: 'norte' }), bloque({ medico_id: 'luis', sede_id: null }), bloque({ medico_id: 'eva', sede_id: 'sur' })];
    const medicos = new Set(calcularTurnos({ fecha: LUNES, horarios, citas: [], sedeId: 'norte' }).map((t) => t.medico_id));
    expect([...medicos].sort()).toEqual(['ana', 'luis']);
  });

  it('filtra por médico y descarta los turnos ya pasados', () => {
    const horarios = [bloque(), bloque({ medico_id: 'luis' })];
    const turnos = calcularTurnos({ fecha: LUNES, horarios, citas: [], medicoId: 'ana', desdeMinutos: aMinutos('09:00') });
    expect(turnos.map((t) => `${t.medico_id} ${t.hora_inicio}`)).toEqual(['ana 09:00', 'ana 09:30']);
  });

  it('ordena por hora y no deja un turno que no cabe completo', () => {
    const horarios = [bloque({ hora_fin: '09:10:00', duracion_cita: 40 }), bloque({ medico_id: 'aaa', hora_inicio: '08:20' })];
    const turnos = calcularTurnos({ fecha: LUNES, horarios, citas: [] });
    expect(turnos[0].hora_inicio).toBe('08:00');
    expect(turnos.filter((t) => t.medico_id === 'ana').map((t) => t.hora_inicio)).toEqual(['08:00']); // 08:40 + 40 min = 09:20 se pasa del fin (09:10)
  });
});

describe('validarBloque', () => {
  const nuevo = { dia_semana: 1, hora_inicio: '09:00', hora_fin: '12:00', duracion_cita: 30 };
  it('rechaza horas invertidas y duraciones que no caben', () => {
    expect(validarBloque({ ...nuevo, hora_fin: '08:00' }, [])).toMatch(/hora de fin/);
    expect(validarBloque({ ...nuevo, duracion_cita: 240 }, [])).toMatch(/no cabe/);
  });
  it('rechaza un bloque que se cruza con otro del mismo día', () => {
    expect(validarBloque(nuevo, [bloque()])).toMatch(/Lunes: se cruza con el bloque 08:00–10:00/);
  });
  it('acepta bloques contiguos, de otro día, o el mismo bloque al editarlo', () => {
    expect(validarBloque({ ...nuevo, hora_inicio: '10:00' }, [bloque()])).toBeNull();
    expect(validarBloque({ ...nuevo, dia_semana: 2 }, [bloque()])).toBeNull();
    expect(validarBloque({ ...nuevo, id: 'b1' }, [bloque({ id: 'b1' })])).toBeNull();
  });
});

describe('buscarCruce y dentroDeHorario', () => {
  const citas = [{ id: 'c1', optometra_id: 'ana', hora_inicio: '08:00', hora_fin: '08:30', estado: 'confirmada' }];
  it('encuentra la cita que se cruza, salvo la que se está editando', () => {
    expect(buscarCruce('ana', '08:15', '08:45', citas)?.id).toBe('c1');
    expect(buscarCruce('ana', '08:15', '08:45', citas, 'c1')).toBeUndefined();
    expect(buscarCruce('ana', '08:30', '09:00', citas)).toBeUndefined();
  });
  it('verifica que la cita quede dentro de un bloque del médico', () => {
    expect(dentroDeHorario('ana', LUNES, '09:30', '10:00', [bloque()])).toBe(true);
    expect(dentroDeHorario('ana', LUNES, '09:45', '10:15', [bloque()])).toBe(false);
  });
});

describe('ausencias y bloqueos', () => {
  const vacaciones: Excepcion = { medico_id: 'ana', fecha_inicio: '2026-10-10', fecha_fin: '2026-10-14', motivo: 'Vacaciones' };
  const salidaTemprano: Excepcion = { medico_id: 'ana', fecha_inicio: LUNES, fecha_fin: LUNES, hora_inicio: '09:00', hora_fin: '10:00' };

  it('un día completo bloqueado no ofrece turnos', () => {
    expect(calcularTurnos({ fecha: LUNES, horarios: [bloque()], citas: [], excepciones: [vacaciones] })).toEqual([]);
    expect(diaCompletoBloqueado('ana', LUNES, [vacaciones])?.motivo).toBe('Vacaciones');
  });
  it('fuera del rango de fechas no aplica', () => {
    expect(calcularTurnos({ fecha: '2026-10-19', horarios: [bloque()], citas: [], excepciones: [vacaciones] })).toHaveLength(4);
  });
  it('un bloqueo de horas quita solo esos turnos', () => {
    const turnos = calcularTurnos({ fecha: LUNES, horarios: [bloque()], citas: [], excepciones: [salidaTemprano] });
    expect(turnos.map((t) => t.hora_inicio)).toEqual(['08:00', '08:30']);
    expect(estaBloqueado('ana', LUNES, '08:30', '09:00', [salidaTemprano])).toBeUndefined();
  });
  it('no afecta a otro médico', () => {
    expect(calcularTurnos({ fecha: LUNES, horarios: [bloque({ medico_id: 'luis' })], citas: [], excepciones: [vacaciones] })).toHaveLength(4);
  });
});

describe('resumenSemanal', () => {
  it('suma horas, turnos y días de los bloques activos', () => {
    const r = resumenSemanal([
      bloque(), // lunes 8-10, 30 min: 2 h, 4 turnos
      bloque({ hora_inicio: '14:00', hora_fin: '17:00', duracion_cita: 20 }), // lunes 3 h, 9 turnos
      bloque({ dia_semana: 2, hora_inicio: '08:00', hora_fin: '12:00' }), // martes 4 h, 8 turnos
      bloque({ dia_semana: 3, activo: false }),
    ]);
    expect(r).toEqual({ horas: 9, turnos: 21, dias: 2 });
  });
});
