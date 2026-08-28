/**
 * Pruebas del calendario de festivos colombianos.
 *
 * De estas fechas depende el conteo de días hábiles de todo el flujo de
 * laboratorio: si un festivo falta o sobra, las alertas de atraso del tablero
 * y los tiempos de entrega prometidos salen mal.
 */
import { describe, it, expect } from 'vitest';
import { domingoDePascua, festivosColombia } from './FestivosManager';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const fechas = (anio: number) => festivosColombia(anio).map(f => f.fecha);

describe('domingoDePascua', () => {
  // Fechas oficiales del Domingo de Resurrección.
  it.each([
    [2024, '2024-03-31'],
    [2025, '2025-04-20'],
    [2026, '2026-04-05'],
    [2027, '2027-03-28'],
    [2028, '2028-04-16'],
  ])('en %i cae el %s', (anio, esperado) => {
    expect(iso(domingoDePascua(anio))).toBe(esperado);
  });

  it('siempre cae en domingo', () => {
    for (let anio = 2020; anio <= 2040; anio++) {
      expect(domingoDePascua(anio).getUTCDay()).toBe(0);
    }
  });
});

describe('festivosColombia', () => {
  it('incluye los festivos de fecha fija', () => {
    const f = fechas(2026);
    for (const fijo of ['2026-01-01', '2026-05-01', '2026-07-20', '2026-08-07', '2026-12-08', '2026-12-25']) {
      expect(f).toContain(fijo);
    }
  });

  it('traslada al lunes los festivos de la Ley Emiliani', () => {
    // Reyes 2026 cae martes 6 de enero → se traslada al lunes 12.
    expect(fechas(2026)).toContain('2026-01-12');
    expect(fechas(2026)).not.toContain('2026-01-06');
  });

  it('no mueve un festivo trasladable que ya cae en lunes', () => {
    // 6 de enero de 2025 es lunes: se queda donde está.
    expect(fechas(2025)).toContain('2025-01-06');
  });

  it('no traslada Jueves ni Viernes Santo', () => {
    // Pascua 2026: domingo 5 de abril → jueves 2 y viernes 3.
    const f = fechas(2026);
    expect(f).toContain('2026-04-02');
    expect(f).toContain('2026-04-03');
  });

  it('todos los festivos trasladables caen en lunes', () => {
    // Los que NO se trasladan: los de fecha fija y los dos de Semana Santa.
    const NO_TRASLADABLES = new Set([
      'Año Nuevo', 'Día del Trabajo', 'Día de la Independencia',
      'Batalla de Boyacá', 'Inmaculada Concepción', 'Navidad',
      'Jueves Santo', 'Viernes Santo',
    ]);

    for (const anio of [2024, 2025, 2026, 2027, 2028]) {
      for (const festivo of festivosColombia(anio)) {
        // Una descripción fusionada corresponde a dos festivos que cayeron el
        // mismo lunes, así que se evalúa como trasladable.
        const partes = festivo.descripcion.split(/\s*\/\s*/);
        if (partes.every(p => NO_TRASLADABLES.has(p.trim()))) continue;
        const [a, m, d] = festivo.fecha.split('-').map(Number);
        expect(new Date(Date.UTC(a, m - 1, d)).getUTCDay()).toBe(1);
      }
    }
  });

  it('no devuelve fechas repetidas (la columna fecha es única)', () => {
    for (const anio of [2024, 2025, 2026, 2027, 2028]) {
      const f = fechas(anio);
      expect(new Set(f).size).toBe(f.length);
    }
  });

  it('fusiona los dos festivos que coinciden el 30 de junio de 2025', () => {
    // San Pedro y San Pablo trasladado cae el mismo lunes que el Sagrado Corazón.
    const f = festivosColombia(2025).filter(x => x.fecha === '2025-06-30');
    expect(f).toHaveLength(1);
    expect(f[0].descripcion).toMatch(/\/|y /);
  });

  it('devuelve entre 17 y 18 festivos por año', () => {
    for (let anio = 2024; anio <= 2030; anio++) {
      const total = festivosColombia(anio).length;
      expect(total).toBeGreaterThanOrEqual(17);
      expect(total).toBeLessThanOrEqual(18);
    }
  });

  it('todas las fechas pertenecen al año pedido', () => {
    for (const fecha of fechas(2026)) expect(fecha.startsWith('2026-')).toBe(true);
  });

  it('devuelve las fechas en formato yyyy-MM-dd', () => {
    for (const fecha of fechas(2026)) expect(fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
