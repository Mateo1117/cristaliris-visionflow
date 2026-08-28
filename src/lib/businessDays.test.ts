import { describe, it, expect } from 'vitest';
import {
  CAMPO_FECHA_CICLO,
  DIAS_ADAPTACION,
  ESTADOS_LABORATORIO,
  ORDEN_FLUJO_ESTADOS,
  adaptacionCumplida,
  diasCalendarioEntre,
  diasHabilesEntre,
  diasRestantesAdaptacion,
  esDiaHabil,
  esEstadoLaboratorio,
  esFinDeSemana,
  esRetroceso,
  hoyColombia,
  indiceEstado,
  normalizarFestivos,
  sellosDeFecha,
  siguienteEstado,
  sumarDiasHabiles,
  toFechaColombia,
} from '@/lib/businessDays';

/**
 * Calendario de referencia (enero 2026):
 *   J 1  V 2  S 3  D 4  L 5  M 6  X 7  J 8  V 9
 *   S 10 D 11 L 12 M 13 X 14 J 15 V 16 S 17 D 18
 * Festivos usados: 2026-01-01 (Año Nuevo) y 2026-01-12 (Reyes, Ley Emiliani).
 */
const FESTIVOS = ['2026-01-01', '2026-01-12'];

/** Helper: fecha civil colombiana del `Date` devuelto por sumarDiasHabiles. */
const clave = (d: Date) => toFechaColombia(d);

describe('toFechaColombia', () => {
  it('conserva un string "YYYY-MM-DD" tal cual (columnas date de Postgres)', () => {
    expect(toFechaColombia('2026-01-05')).toBe('2026-01-05');
  });

  it('no resta un día por interpretar "YYYY-MM-DD" como medianoche UTC', () => {
    // new Date('2026-01-05') es 2026-01-05T00:00Z = 2026-01-04 19:00 en Bogotá.
    expect(toFechaColombia('2026-01-05')).not.toBe('2026-01-04');
  });

  it('convierte un instante nocturno a la fecha local correcta (bug de toISOString)', () => {
    // 2026-01-05 23:30 en Bogotá = 2026-01-06T04:30Z. toISOString() diría "06".
    const instante = new Date('2026-01-06T04:30:00.000Z');
    expect(instante.toISOString().slice(0, 10)).toBe('2026-01-06');
    expect(toFechaColombia(instante)).toBe('2026-01-05');
  });

  it('convierte un instante de madrugada UTC al día anterior en Colombia', () => {
    expect(toFechaColombia('2026-01-06T02:00:00.000Z')).toBe('2026-01-05');
  });

  it('mantiene el mismo día para instantes diurnos', () => {
    expect(toFechaColombia('2026-01-06T15:00:00.000Z')).toBe('2026-01-06');
  });

  it('acepta Date, timestamp numérico y string ISO', () => {
    const instante = new Date('2026-01-06T15:00:00.000Z');
    expect(toFechaColombia(instante)).toBe('2026-01-06');
    expect(toFechaColombia(instante.getTime())).toBe('2026-01-06');
    expect(toFechaColombia(instante.toISOString())).toBe('2026-01-06');
  });

  it('lanza error con fechas inválidas', () => {
    expect(() => toFechaColombia('no-es-una-fecha')).toThrow();
  });
});

describe('hoyColombia', () => {
  it('devuelve la fecha civil colombiana del instante dado', () => {
    expect(hoyColombia('2026-01-06T03:00:00.000Z')).toBe('2026-01-05');
  });
});

describe('esFinDeSemana / esDiaHabil', () => {
  it('marca sábado y domingo como fin de semana', () => {
    expect(esFinDeSemana('2026-01-10')).toBe(true); // sábado
    expect(esFinDeSemana('2026-01-11')).toBe(true); // domingo
    expect(esFinDeSemana('2026-01-09')).toBe(false); // viernes
  });

  it('el sábado NO es hábil', () => {
    expect(esDiaHabil('2026-01-10')).toBe(false);
  });

  it('el domingo NO es hábil', () => {
    expect(esDiaHabil('2026-01-11')).toBe(false);
  });

  it('un lunes normal sí es hábil', () => {
    expect(esDiaHabil('2026-01-05')).toBe(true);
  });

  it('un festivo entre semana NO es hábil', () => {
    expect(esDiaHabil('2026-01-12', FESTIVOS)).toBe(false);
    expect(esDiaHabil('2026-01-12')).toBe(true); // sin festivos cargados sí lo sería
  });

  it('usa la fecha local para instantes nocturnos', () => {
    // 2026-01-09 23:00 Bogotá (viernes) = 2026-01-10T04:00Z (sábado en UTC).
    expect(esDiaHabil('2026-01-10T04:00:00.000Z')).toBe(true);
  });
});

describe('normalizarFestivos', () => {
  it('normaliza distintos formatos y descarta valores inválidos', () => {
    const set = normalizarFestivos([
      '2026-01-01',
      '2026-01-12T05:00:00.000Z', // = 2026-01-12 00:00 en Bogotá
      '',
      'basura',
    ]);
    expect([...set].sort()).toEqual(['2026-01-01', '2026-01-12']);
  });
});

describe('diasHabilesEntre', () => {
  it('mismo día ⇒ 0', () => {
    expect(diasHabilesEntre('2026-01-05', '2026-01-05')).toBe(0);
  });

  it('viernes → lunes ⇒ 1 (no cuenta el fin de semana)', () => {
    expect(diasHabilesEntre('2026-01-02', '2026-01-05')).toBe(1);
  });

  it('viernes → sábado ⇒ 0', () => {
    expect(diasHabilesEntre('2026-01-09', '2026-01-10')).toBe(0);
  });

  it('viernes → domingo ⇒ 0', () => {
    expect(diasHabilesEntre('2026-01-09', '2026-01-11')).toBe(0);
  });

  it('lunes → viernes ⇒ 4', () => {
    expect(diasHabilesEntre('2026-01-05', '2026-01-09')).toBe(4);
  });

  it('semana completa lunes → lunes ⇒ 5', () => {
    expect(diasHabilesEntre('2026-01-05', '2026-01-12')).toBe(5);
  });

  it('descuenta el festivo del rango', () => {
    expect(diasHabilesEntre('2026-01-09', '2026-01-12', FESTIVOS)).toBe(0);
    expect(diasHabilesEntre('2026-01-09', '2026-01-12')).toBe(1);
    expect(diasHabilesEntre('2026-01-05', '2026-01-12', FESTIVOS)).toBe(4);
  });

  it('un festivo en fin de semana no se descuenta dos veces', () => {
    expect(diasHabilesEntre('2026-01-09', '2026-01-13', ['2026-01-10'])).toBe(2);
  });

  it('es negativo y simétrico si el rango va hacia atrás', () => {
    expect(diasHabilesEntre('2026-01-09', '2026-01-05')).toBe(-4);
    expect(diasHabilesEntre('2026-01-12', '2026-01-09', FESTIVOS)).toBe(0);
  });

  it('rango largo: 52 semanas exactas ⇒ 260 días hábiles', () => {
    // 2026-01-05 (lunes) + 364 días = 2027-01-04 (lunes).
    expect(diasHabilesEntre('2026-01-05', '2027-01-04')).toBe(260);
  });

  it('rango largo con festivos: descuenta solo los que caen entre semana', () => {
    const festivos = ['2026-01-12', '2026-03-23', '2026-05-01', '2026-05-02']; // 05-02 es sábado
    expect(diasHabilesEntre('2026-01-05', '2027-01-04', festivos)).toBe(257);
  });

  it('funciona cruzando fin de año y años bisiestos', () => {
    expect(diasHabilesEntre('2023-12-29', '2024-01-01')).toBe(1); // vie → lun
    expect(diasHabilesEntre('2024-02-28', '2024-03-01')).toBe(2); // 2024 bisiesto
  });

  it('acepta instantes y usa la fecha colombiana', () => {
    // Ambos instantes son el viernes 2026-01-09 por la noche en Bogotá.
    expect(diasHabilesEntre('2026-01-10T03:00:00.000Z', '2026-01-10T04:00:00.000Z')).toBe(0);
  });
});

describe('sumarDiasHabiles', () => {
  it('n = 0 devuelve el mismo día aunque no sea hábil', () => {
    expect(clave(sumarDiasHabiles('2026-01-10', 0))).toBe('2026-01-10');
  });

  it('viernes + 1 ⇒ lunes', () => {
    expect(clave(sumarDiasHabiles('2026-01-02', 1))).toBe('2026-01-05');
  });

  it('viernes + 1 saltando el festivo del lunes ⇒ martes', () => {
    expect(clave(sumarDiasHabiles('2026-01-09', 1, FESTIVOS))).toBe('2026-01-13');
    expect(clave(sumarDiasHabiles('2026-01-09', 1))).toBe('2026-01-12');
  });

  it('lunes + 5 ⇒ lunes siguiente', () => {
    expect(clave(sumarDiasHabiles('2026-01-05', 5))).toBe('2026-01-12');
  });

  it('lunes + 5 con festivo ⇒ martes siguiente', () => {
    expect(clave(sumarDiasHabiles('2026-01-05', 5, FESTIVOS))).toBe('2026-01-13');
  });

  it('desde sábado + 1 ⇒ lunes', () => {
    expect(clave(sumarDiasHabiles('2026-01-10', 1))).toBe('2026-01-12');
  });

  it('n negativo retrocede días hábiles', () => {
    expect(clave(sumarDiasHabiles('2026-01-12', -1))).toBe('2026-01-09');
    expect(clave(sumarDiasHabiles('2026-01-12', -1, FESTIVOS))).toBe('2026-01-09');
    expect(clave(sumarDiasHabiles('2026-01-05', -1))).toBe('2026-01-02');
  });

  it('20 días hábiles = 4 semanas naturales', () => {
    expect(clave(sumarDiasHabiles('2026-01-05', 20))).toBe('2026-02-02');
  });

  it('el resultado siempre cae en día hábil cuando n ≠ 0', () => {
    for (let n = 1; n <= 15; n++) {
      expect(esDiaHabil(sumarDiasHabiles('2026-01-01', n, FESTIVOS), FESTIVOS)).toBe(true);
    }
  });

  it('es coherente con diasHabilesEntre (ida y vuelta)', () => {
    const destino = sumarDiasHabiles('2026-01-05', 3, FESTIVOS);
    expect(diasHabilesEntre('2026-01-05', destino, FESTIVOS)).toBe(3);
  });
});

describe('diasCalendarioEntre', () => {
  it('cuenta días calendario, incluidos fines de semana', () => {
    expect(diasCalendarioEntre('2026-01-02', '2026-01-09')).toBe(7);
    expect(diasCalendarioEntre('2026-01-05', '2026-01-05')).toBe(0);
    expect(diasCalendarioEntre('2026-01-09', '2026-01-02')).toBe(-7);
  });
});

describe('protocolo de adaptación (7 días calendario)', () => {
  it('el periodo es de 7 días', () => {
    expect(DIAS_ADAPTACION).toBe(7);
  });

  it('cuenta los días que faltan desde la entrega', () => {
    expect(diasRestantesAdaptacion('2026-01-05', '2026-01-05')).toBe(7);
    expect(diasRestantesAdaptacion('2026-01-05', '2026-01-08')).toBe(4);
    expect(diasRestantesAdaptacion('2026-01-05', '2026-01-11')).toBe(1);
  });

  it('llega a 0 al cumplirse el día 7 y no baja de 0', () => {
    expect(diasRestantesAdaptacion('2026-01-05', '2026-01-12')).toBe(0);
    expect(diasRestantesAdaptacion('2026-01-05', '2026-02-01')).toBe(0);
  });

  it('sin fecha de entrega el periodo no ha empezado', () => {
    expect(diasRestantesAdaptacion(null)).toBe(7);
    expect(adaptacionCumplida(null)).toBe(false);
    expect(adaptacionCumplida(undefined)).toBe(false);
  });

  it('adaptacionCumplida solo es true al día 7', () => {
    expect(adaptacionCumplida('2026-01-05', '2026-01-11')).toBe(false);
    expect(adaptacionCumplida('2026-01-05', '2026-01-12')).toBe(true);
  });

  it('usa la fecha colombiana de la entrega, no la UTC', () => {
    // Entrega el 2026-01-05 a las 20:00 Bogotá = 2026-01-06T01:00Z.
    expect(diasRestantesAdaptacion('2026-01-06T01:00:00.000Z', '2026-01-12')).toBe(0);
  });
});

describe('flujo de estados', () => {
  it('el orden del flujo cubre los 11 estados del enum', () => {
    expect(ORDEN_FLUJO_ESTADOS).toHaveLength(11);
    expect(ORDEN_FLUJO_ESTADOS[0]).toBe('pedido_creado');
    expect(ORDEN_FLUJO_ESTADOS[ORDEN_FLUJO_ESTADOS.length - 1]).toBe('entregado');
  });

  it('indiceEstado devuelve -1 para estados desconocidos', () => {
    expect(indiceEstado('control_calidad')).toBeGreaterThan(indiceEstado('en_produccion'));
    expect(indiceEstado('inexistente')).toBe(-1);
  });

  it('detecta retrocesos', () => {
    expect(esRetroceso('control_calidad', 'en_produccion')).toBe(true);
    expect(esRetroceso('control_calidad', 'listo_entrega')).toBe(false);
    expect(esRetroceso('entregado', 'pedido_creado')).toBe(true);
    expect(esRetroceso('control_calidad', 'control_calidad')).toBe(false);
    expect(esRetroceso('control_calidad', 'inexistente')).toBe(false);
  });

  it('siguienteEstado avanza por el flujo visible', () => {
    expect(siguienteEstado('control_calidad')?.key).toBe('listo_entrega');
    expect(siguienteEstado('listo_entrega')?.key).toBe('entregado');
    expect(siguienteEstado('entregado')).toBeNull();
    // Estados sin columna Kanban saltan al siguiente visible.
    expect(siguienteEstado('recibido_laboratorio')?.key).toBe('en_produccion');
    expect(siguienteEstado('en_transito')?.key).toBe('recibido_optica');
  });

  it('reconoce los estados de laboratorio', () => {
    expect(ESTADOS_LABORATORIO).toContain('en_produccion');
    expect(esEstadoLaboratorio('enviado_laboratorio')).toBe(true);
    expect(esEstadoLaboratorio('control_calidad')).toBe(false);
    expect(esEstadoLaboratorio('listo_entrega')).toBe(false);
  });
});

describe('fechas del ciclo', () => {
  it('mapea cada estado con su columna de fecha', () => {
    expect(CAMPO_FECHA_CICLO.enviado_laboratorio).toBe('fecha_envio_lab');
    expect(CAMPO_FECHA_CICLO.recibido_laboratorio).toBe('fecha_recepcion_lab');
    expect(CAMPO_FECHA_CICLO.control_calidad).toBe('fecha_control_calidad');
    expect(CAMPO_FECHA_CICLO.listo_entrega).toBe('fecha_listo_entrega');
    expect(CAMPO_FECHA_CICLO.entregado).toBe('fecha_entrega_real');
  });

  it('sellosDeFecha devuelve el parche del estado alcanzado', () => {
    const ahora = new Date('2026-01-05T15:00:00.000Z');
    expect(sellosDeFecha('entregado', ahora)).toEqual({
      fecha_entrega_real: '2026-01-05T15:00:00.000Z',
    });
  });

  it('sellosDeFecha devuelve {} para estados sin fecha asociada', () => {
    expect(sellosDeFecha('pedido_creado')).toEqual({});
    expect(sellosDeFecha('en_produccion')).toEqual({});
    expect(sellosDeFecha('estado_raro')).toEqual({});
  });
});
