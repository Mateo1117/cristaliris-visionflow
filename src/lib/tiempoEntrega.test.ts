import { describe, it, expect } from 'vitest';
import { fechaEntregaEstimada, tiempoEntrega, textoDias } from './tiempoEntrega';

describe('tiempoEntrega', () => {
  it('manda el tiempo configurado del laboratorio sobre el tipo de lente', () => {
    expect(tiempoEntrega(4, 'terminado')).toEqual({ dias: 4, origen: 'laboratorio' });
    expect(tiempoEntrega(1, 'progresivo')).toEqual({ dias: 1, origen: 'laboratorio' });
  });

  it('sin tiempo de laboratorio usa el tipo de lente, y si no, 3 días', () => {
    expect(tiempoEntrega(null, 'terminado')).toEqual({ dias: 1, origen: 'tipo' });
    expect(tiempoEntrega(0, 'montura_3piezas')).toEqual({ dias: 2, origen: 'tipo' });
    expect(tiempoEntrega(undefined, null)).toEqual({ dias: 3, origen: 'defecto' });
  });

  it('calcula la fecha en días hábiles, saltando fin de semana y festivos', () => {
    // Viernes 16 oct 2026 + 4 hábiles = jueves 22 oct (sin festivos).
    expect(fechaEntregaEstimada('2026-10-16T15:00:00Z', 4)).toBe('2026-10-22');
    // Con el lunes 19 festivo, se corre al viernes 23.
    expect(fechaEntregaEstimada('2026-10-16T15:00:00Z', 4, ['2026-10-19'])).toBe('2026-10-23');
  });

  it('texto en singular y plural', () => {
    expect(textoDias(1)).toBe('1 día hábil');
    expect(textoDias(4)).toBe('4 días hábiles');
  });
});
