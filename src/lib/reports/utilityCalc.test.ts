import { describe, it, expect } from 'vitest';
import {
  calcularCostoTotal,
  calcularUtilidadFila,
  agregarProductos,
  calcularUtilidadPorLente,
  type OrdenProductoRow,
} from './utilityCalc';

const row = (over: Partial<OrdenProductoRow> = {}): OrdenProductoRow => ({
  tipo_producto: 'lente',
  precio_venta: 0,
  costo_laboratorio: 0,
  costo_montura: 0,
  costo_lente: 0,
  costo_insumos: 0,
  comision_financiera: 0,
  utilidad_calculada: 0,
  descripcion: null,
  productos_catalogo: null,
  ...over,
});

describe('calcularCostoTotal', () => {
  it('suma todos los costos', () => {
    expect(
      calcularCostoTotal(
        row({ costo_laboratorio: 1000, costo_montura: 2000, costo_lente: 3000, costo_insumos: 500, comision_financiera: 250 }),
      ),
    ).toBe(6750);
  });

  it('trata null/undefined/strings como 0', () => {
    expect(calcularCostoTotal({ costo_laboratorio: null, costo_montura: undefined, costo_lente: 'x' as any, costo_insumos: '100', comision_financiera: 0 })).toBe(100);
  });
});

describe('calcularUtilidadFila', () => {
  it('cuando utilidad_calculada está en 0 calcula precio - costos', () => {
    const r = row({ precio_venta: 100000, costo_laboratorio: 20000, costo_montura: 10000, costo_lente: 40000, comision_financiera: 5000 });
    expect(calcularUtilidadFila(r)).toBe(25000);
  });

  it('respeta utilidad_calculada cuando viene poblada', () => {
    const r = row({ precio_venta: 100000, costo_laboratorio: 20000, utilidad_calculada: 35000 });
    expect(calcularUtilidadFila(r)).toBe(35000);
  });

  it('puede devolver utilidad negativa cuando costos > precio', () => {
    const r = row({ precio_venta: 50000, costo_laboratorio: 80000 });
    expect(calcularUtilidadFila(r)).toBe(-30000);
  });

  it('descuentos quedan reflejados en precio_venta (ya viene neto)', () => {
    // Convenio 45% sobre 200.000 → precio_venta persistido = 110.000
    const r = row({ precio_venta: 110000, costo_laboratorio: 40000 });
    expect(calcularUtilidadFila(r)).toBe(70000);
  });
});

describe('agregarProductos', () => {
  it('agrupa por nombre del catálogo', () => {
    const rows = [
      row({ precio_venta: 100000, costo_laboratorio: 30000, productos_catalogo: { nombre: 'Progresivo Premium', categoria: 'progresivo' } }),
      row({ precio_venta: 120000, costo_laboratorio: 40000, productos_catalogo: { nombre: 'Progresivo Premium', categoria: 'progresivo' } }),
      row({ precio_venta: 80000, costo_laboratorio: 20000, productos_catalogo: { nombre: 'Monofocal Básico', categoria: 'monofocal' } }),
    ];
    const agg = agregarProductos(rows);
    const prog = agg.find(p => p.nombre === 'Progresivo Premium')!;
    expect(prog.cantidad).toBe(2);
    expect(prog.ingreso).toBe(220000);
    expect(prog.costo).toBe(70000);
    expect(prog.utilidad).toBe(150000);
    expect(agg.find(p => p.nombre === 'Monofocal Básico')!.utilidad).toBe(60000);
  });

  it('usa descripción y tipo_producto cuando no hay catálogo', () => {
    const agg = agregarProductos([row({ descripcion: 'Lente custom', tipo_producto: 'lente', precio_venta: 90000, costo_laboratorio: 30000 })]);
    expect(agg[0].nombre).toBe('Lente custom');
    expect(agg[0].categoria).toBe('lente');
  });
});

describe('calcularUtilidadPorLente', () => {
  it('total, unitario y margen % con costos mixtos y descuento por convenio', () => {
    // 3 progresivos vendidos: dos a precio convenio (descuento ya en precio_venta) y uno full
    const rows = [
      row({
        precio_venta: 220000, // descuento 45% sobre 400.000
        costo_laboratorio: 60000, costo_lente: 20000, comision_financiera: 5000,
        productos_catalogo: { nombre: 'Progresivo X', categoria: 'progresivo' },
      }),
      row({
        precio_venta: 220000,
        costo_laboratorio: 60000, costo_lente: 20000, comision_financiera: 5000,
        productos_catalogo: { nombre: 'Progresivo X', categoria: 'progresivo' },
      }),
      row({
        precio_venta: 400000, // full
        costo_laboratorio: 60000, costo_lente: 20000,
        productos_catalogo: { nombre: 'Progresivo X', categoria: 'progresivo' },
      }),
    ];
    const [lente] = calcularUtilidadPorLente(rows);
    expect(lente.cantidad).toBe(3);
    expect(lente.ingreso).toBe(840000);
    expect(lente.costo).toBe(250000);
    expect(lente.utilidad).toBe(590000);
    expect(lente.utilidad_unitaria).toBeCloseTo(590000 / 3, 2);
    expect(lente.margen).toBeCloseTo((590000 / 840000) * 100, 4);
  });

  it('filtra solo categorías de lente (excluye monturas)', () => {
    const rows = [
      row({ precio_venta: 120000, costo_montura: 80000, productos_catalogo: { nombre: 'Montura A', categoria: 'montura' } }),
      row({ precio_venta: 200000, costo_laboratorio: 50000, productos_catalogo: { nombre: 'Bifocal B', categoria: 'bifocal' } }),
      row({ precio_venta: 150000, costo_lente: 40000, productos_catalogo: { nombre: 'Lentes de Contacto', categoria: 'lente_contacto' } }),
    ];
    const lentes = calcularUtilidadPorLente(rows);
    expect(lentes.map(l => l.nombre).sort()).toEqual(['Bifocal B', 'Lentes de Contacto']);
  });

  it('ordena por utilidad total descendente', () => {
    const rows = [
      row({ precio_venta: 100000, costo_laboratorio: 80000, productos_catalogo: { nombre: 'Bajo', categoria: 'monofocal' } }),
      row({ precio_venta: 500000, costo_laboratorio: 100000, productos_catalogo: { nombre: 'Alto', categoria: 'progresivo' } }),
      row({ precio_venta: 300000, costo_laboratorio: 100000, productos_catalogo: { nombre: 'Medio', categoria: 'bifocal' } }),
    ];
    expect(calcularUtilidadPorLente(rows).map(l => l.nombre)).toEqual(['Alto', 'Medio', 'Bajo']);
  });

  it('margen y unitario son 0 cuando no hay ingresos / cantidad', () => {
    expect(calcularUtilidadPorLente([])).toEqual([]);
    const [lente] = calcularUtilidadPorLente([
      row({ precio_venta: 0, costo_laboratorio: 0, productos_catalogo: { nombre: 'Cortesía', categoria: 'monofocal' } }),
    ]);
    expect(lente.margen).toBe(0);
    expect(lente.utilidad_unitaria).toBe(0);
  });

  it('margen negativo cuando costos superan ingresos (ej. garantía cubierta)', () => {
    const [lente] = calcularUtilidadPorLente([
      row({ precio_venta: 100000, costo_laboratorio: 150000, productos_catalogo: { nombre: 'Garantía', categoria: 'lente' } }),
    ]);
    expect(lente.utilidad).toBe(-50000);
    expect(lente.margen).toBe(-50);
  });

  it('montura propia: el descuento ya viene aplicado a nivel de orden, los lentes mantienen su precio', () => {
    // Cliente trae su montura: -$90.000 se aplica a la orden, no a los lentes individuales.
    // El lente conserva precio_venta y costos normales.
    const [lente] = calcularUtilidadPorLente([
      row({ precio_venta: 280000, costo_laboratorio: 70000, costo_lente: 30000, productos_catalogo: { nombre: 'Progresivo Y', categoria: 'progresivo' } }),
    ]);
    expect(lente.utilidad).toBe(180000);
    expect(lente.margen).toBeCloseTo((180000 / 280000) * 100, 4);
  });
});
