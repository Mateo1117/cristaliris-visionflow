import { describe, it, expect } from 'vitest';
import {
  MEDIOS_PAGO,
  PORCENTAJE_RECARGO_FINANCIERO,
  PUNTOS_AJUSTE_MEDIO_PAGO,
  DESCUENTO_MONTURA_PROPIA,
  RANGOS_ANTIGUEDAD,
  ajustaDescuento,
  calcularTotales,
  clasificarAntiguedad,
  descuentoEfectivo,
  diasAntiguedad,
  generaRecargo,
  recargoFinanciero,
  redondearPesos,
  reglaMedioPago,
  resumenAntiguedad,
  type MedioPago,
} from './pricing';

// Clasificación esperada de CADA medio de pago soportado.
const ESPERADO: Record<MedioPago, { ajusta: boolean; recarga: boolean }> = {
  efectivo: { ajusta: false, recarga: false },
  contado: { ajusta: false, recarga: false },
  transferencia: { ajusta: false, recarga: false },
  llave: { ajusta: false, recarga: false },
  nequi: { ajusta: false, recarga: false },
  daviplata: { ajusta: false, recarga: false },
  nomina: { ajusta: false, recarga: false },
  datafono: { ajusta: false, recarga: false },
  tarjeta: { ajusta: true, recarga: true },
  addi: { ajusta: true, recarga: true },
  sistecredito: { ajusta: true, recarga: true },
  link_pago: { ajusta: true, recarga: false },
};

describe('catálogo de medios de pago', () => {
  it('cubre exactamente los medios documentados, sin duplicados', () => {
    const valores = MEDIOS_PAGO.map((m) => m.v);
    expect(new Set(valores).size).toBe(valores.length);
    expect(valores.sort()).toEqual(Object.keys(ESPERADO).sort());
  });

  it('cada medio tiene etiqueta y nota de negocio', () => {
    for (const m of MEDIOS_PAGO) {
      expect(m.l.length).toBeGreaterThan(0);
      expect(m.nota.length).toBeGreaterThan(0);
    }
  });

  it.each(Object.entries(ESPERADO))('%s tiene la clasificación documentada', (medio, esperado) => {
    expect(ajustaDescuento(medio)).toBe(esperado.ajusta);
    expect(generaRecargo(medio)).toBe(esperado.recarga);
  });

  it('un medio desconocido se trata como contado (conservador)', () => {
    expect(ajustaDescuento('bitcoin')).toBe(false);
    expect(generaRecargo('bitcoin')).toBe(false);
    expect(reglaMedioPago(null).generaRecargo).toBe(false);
    expect(reglaMedioPago(undefined).ajustaDescuento).toBe(false);
  });

  it('normaliza mayúsculas y espacios', () => {
    expect(generaRecargo('  Tarjeta ')).toBe(true);
    expect(ajustaDescuento('ADDI')).toBe(true);
  });
});

describe('descuentoEfectivo', () => {
  it('ejemplo del README: empresa 50% + tarjeta = 45% efectivo', () => {
    expect(descuentoEfectivo(50, 'tarjeta')).toBe(45);
  });

  it('convenio 45% + tarjeta = 40%', () => {
    expect(descuentoEfectivo(45, 'tarjeta')).toBe(40);
  });

  it('mantiene 45% y 50% con medios de contado', () => {
    for (const medio of ['efectivo', 'contado', 'transferencia', 'llave', 'nomina', 'datafono', 'nequi', 'daviplata']) {
      expect(descuentoEfectivo(45, medio)).toBe(45);
      expect(descuentoEfectivo(50, medio)).toBe(50);
    }
  });

  it('resta 5 puntos con tarjeta, Addi, Sistecrédito y link de pago', () => {
    for (const medio of ['tarjeta', 'addi', 'sistecredito', 'link_pago']) {
      expect(descuentoEfectivo(50, medio)).toBe(50 - PUNTOS_AJUSTE_MEDIO_PAGO);
      expect(descuentoEfectivo(45, medio)).toBe(45 - PUNTOS_AJUSTE_MEDIO_PAGO);
    }
  });

  it('paciente particular (0%) nunca queda con descuento negativo', () => {
    expect(descuentoEfectivo(0, 'tarjeta')).toBe(0);
    expect(descuentoEfectivo(null, 'addi')).toBe(0);
    expect(descuentoEfectivo(undefined, 'efectivo')).toBe(0);
  });

  it('acota valores fuera de rango', () => {
    expect(descuentoEfectivo(200, 'efectivo')).toBe(100);
    expect(descuentoEfectivo(-30, 'efectivo')).toBe(0);
    expect(descuentoEfectivo(3, 'tarjeta')).toBe(0);
  });
});

describe('recargoFinanciero', () => {
  it('cobra 9% sobre el valor DESPUÉS de descuento con tarjeta y Addi', () => {
    expect(recargoFinanciero(200000, 'tarjeta')).toBe(18000);
    expect(recargoFinanciero(200000, 'addi')).toBe(18000);
    expect(recargoFinanciero(200000, 'sistecredito')).toBe(18000);
  });

  it('no cobra recargo en medios de contado ni en link de pago', () => {
    for (const medio of ['efectivo', 'contado', 'transferencia', 'llave', 'nequi', 'daviplata', 'nomina', 'datafono', 'link_pago']) {
      expect(recargoFinanciero(200000, medio)).toBe(0);
    }
  });

  it('redondea a pesos', () => {
    // 111.111 × 9% = 9.999,99 → 10.000
    expect(recargoFinanciero(111111, 'tarjeta')).toBe(10000);
    expect(Number.isInteger(recargoFinanciero(123457, 'addi'))).toBe(true);
  });

  it('usa el porcentaje declarado como constante', () => {
    expect(recargoFinanciero(1000000, 'tarjeta')).toBe((1000000 * PORCENTAJE_RECARGO_FINANCIERO) / 100);
  });

  it('bases nulas o negativas no generan recargo', () => {
    expect(recargoFinanciero(0, 'tarjeta')).toBe(0);
    expect(recargoFinanciero(-5000, 'tarjeta')).toBe(0);
  });
});

describe('redondearPesos', () => {
  it('redondea al peso más cercano', () => {
    expect(redondearPesos(1000.4)).toBe(1000);
    expect(redondearPesos(1000.5)).toBe(1001);
    expect(redondearPesos(-0.2)).toBe(0);
  });

  it('valores no numéricos cuentan como 0', () => {
    expect(redondearPesos(NaN)).toBe(0);
    expect(redondearPesos(Number('x' as unknown as number))).toBe(0);
  });
});

describe('calcularTotales', () => {
  const items = [{ cantidad: 2, precioUnitario: 200000 }];

  it('ejemplo README: convenio 50% + tarjeta → 45% efectivo y recargo 9%', () => {
    const t = calcularTotales({ items, pctEmpresa: 50, medioPago: 'tarjeta' });
    expect(t.subtotal).toBe(400000);
    expect(t.descuentoPct).toBe(45);
    expect(t.descuentoValor).toBe(180000);
    expect(t.baseConDescuento).toBe(220000);
    expect(t.recargoFinanciero).toBe(19800);
    expect(t.total).toBe(239800);
  });

  it('mismo convenio pagando en efectivo: 50% y sin recargo', () => {
    const t = calcularTotales({ items, pctEmpresa: 50, medioPago: 'efectivo' });
    expect(t.descuentoPct).toBe(50);
    expect(t.descuentoValor).toBe(200000);
    expect(t.baseConDescuento).toBe(200000);
    expect(t.recargoFinanciero).toBe(0);
    expect(t.total).toBe(200000);
  });

  it('convenio 45% con Addi → 40% y recargo 9%', () => {
    const t = calcularTotales({ items, pctEmpresa: 45, medioPago: 'addi' });
    expect(t.descuentoPct).toBe(40);
    expect(t.baseConDescuento).toBe(240000);
    expect(t.recargoFinanciero).toBe(21600);
    expect(t.total).toBe(261600);
  });

  it('link de pago ajusta el descuento pero no recarga', () => {
    const t = calcularTotales({ items, pctEmpresa: 50, medioPago: 'link_pago' });
    expect(t.descuentoPct).toBe(45);
    expect(t.baseConDescuento).toBe(220000);
    expect(t.recargoFinanciero).toBe(0);
    expect(t.total).toBe(220000);
  });

  it('paciente particular: sin descuento, con recargo si paga con tarjeta', () => {
    const t = calcularTotales({ items, pctEmpresa: 0, medioPago: 'tarjeta' });
    expect(t.descuentoPct).toBe(0);
    expect(t.descuentoValor).toBe(0);
    expect(t.baseConDescuento).toBe(400000);
    expect(t.recargoFinanciero).toBe(36000);
  });

  it('la cantidad multiplica el precio de la línea', () => {
    const t = calcularTotales({ items: [{ cantidad: 3, precioUnitario: 100000 }], pctEmpresa: 0, medioPago: 'efectivo' });
    expect(t.subtotal).toBe(300000);
    expect(t.lineas[0].subtotal).toBe(300000);
    expect(t.lineas[0].neto).toBe(300000);
  });

  it('el neto por línea es el valor a persistir en orden_productos.precio_venta', () => {
    const t = calcularTotales({
      items: [
        { cantidad: 2, precioUnitario: 200000 },
        { cantidad: 1, precioUnitario: 150000, aplicaDescuento: false },
      ],
      pctEmpresa: 50,
      medioPago: 'efectivo',
    });
    expect(t.lineas[0].neto).toBe(200000); // 400.000 - 50%
    expect(t.lineas[1].neto).toBe(150000); // línea sin descuento (ej. lente de contacto)
    expect(t.lineas[1].descuentoPorcentaje).toBe(0);
  });

  it('Σ neto de las líneas === subtotal - descuentoValor (no hay doble descuento)', () => {
    const t = calcularTotales({
      items: [
        { cantidad: 1, precioUnitario: 333333 },
        { cantidad: 3, precioUnitario: 111111 },
        { cantidad: 2, precioUnitario: 77777, aplicaDescuento: false },
      ],
      pctEmpresa: 45,
      medioPago: 'tarjeta',
    });
    const sumaNetos = t.lineas.reduce((s, l) => s + l.neto, 0);
    expect(sumaNetos).toBe(t.subtotal - t.descuentoValor);
    expect(t.lineas.every((l) => Number.isInteger(l.neto))).toBe(true);
  });

  it('respeta el override manual del % por línea', () => {
    const t = calcularTotales({
      items: [{ cantidad: 1, precioUnitario: 100000, descuentoPorcentaje: 10 }],
      pctEmpresa: 50,
      medioPago: 'efectivo',
    });
    expect(t.descuentoPct).toBe(50); // el efectivo de convenio no cambia
    expect(t.lineas[0].descuentoPorcentaje).toBe(10);
    expect(t.lineas[0].neto).toBe(90000);
  });

  it('descuento adicional (montura propia) se resta antes del recargo', () => {
    const t = calcularTotales({
      items,
      pctEmpresa: 50,
      medioPago: 'tarjeta',
      descuentoAdicional: DESCUENTO_MONTURA_PROPIA,
    });
    expect(t.descuentoAdicional).toBe(90000);
    expect(t.baseConDescuento).toBe(130000); // 400.000 - 180.000 - 90.000
    expect(t.recargoFinanciero).toBe(11700); // 9% sobre 130.000
    expect(t.total).toBe(141700);
  });

  it('el total nunca es negativo si el descuento adicional supera la base', () => {
    const t = calcularTotales({
      items: [{ cantidad: 1, precioUnitario: 50000 }],
      pctEmpresa: 50,
      medioPago: 'tarjeta',
      descuentoAdicional: DESCUENTO_MONTURA_PROPIA,
    });
    expect(t.baseConDescuento).toBe(0);
    expect(t.recargoFinanciero).toBe(0);
    expect(t.total).toBe(0);
  });

  it('sin ítems devuelve todo en cero', () => {
    const t = calcularTotales({ items: [], pctEmpresa: 50, medioPago: 'tarjeta' });
    expect(t).toMatchObject({ subtotal: 0, descuentoValor: 0, baseConDescuento: 0, recargoFinanciero: 0, total: 0 });
    expect(t.lineas).toEqual([]);
  });

  it('todos los montos quedan redondeados a pesos', () => {
    const t = calcularTotales({
      items: [{ cantidad: 3, precioUnitario: 33333.33 }],
      pctEmpresa: 45,
      medioPago: 'addi',
    });
    for (const v of [t.subtotal, t.descuentoValor, t.baseConDescuento, t.recargoFinanciero, t.total]) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});

describe('clasificarAntiguedad', () => {
  const hoy = new Date('2026-08-27T12:00:00Z');
  const hace = (dias: number) => new Date(hoy.getTime() - dias * 24 * 60 * 60 * 1000);

  it('clasifica los bordes exactos de cada rango', () => {
    expect(clasificarAntiguedad(hace(0), hoy)).toBe('0-30');
    expect(clasificarAntiguedad(hace(30), hoy)).toBe('0-30');
    expect(clasificarAntiguedad(hace(31), hoy)).toBe('31-60');
    expect(clasificarAntiguedad(hace(60), hoy)).toBe('31-60');
    expect(clasificarAntiguedad(hace(61), hoy)).toBe('61-90');
    expect(clasificarAntiguedad(hace(90), hoy)).toBe('61-90');
    expect(clasificarAntiguedad(hace(91), hoy)).toBe('>90');
    expect(clasificarAntiguedad(hace(365), hoy)).toBe('>90');
  });

  it('acepta strings ISO (como vienen de Supabase)', () => {
    expect(clasificarAntiguedad('2026-06-01T00:00:00Z', hoy)).toBe('61-90');
    expect(clasificarAntiguedad('2026-08-20', hoy)).toBe('0-30');
  });

  it('fechas futuras o inválidas caen en 0-30', () => {
    expect(clasificarAntiguedad(hace(-10), hoy)).toBe('0-30');
    expect(clasificarAntiguedad('no-es-fecha', hoy)).toBe('0-30');
    expect(clasificarAntiguedad(null, hoy)).toBe('0-30');
    expect(diasAntiguedad(undefined, hoy)).toBe(0);
  });

  it('RANGOS_ANTIGUEDAD expone los 4 rangos en orden', () => {
    expect(RANGOS_ANTIGUEDAD).toEqual(['0-30', '31-60', '61-90', '>90']);
  });
});

describe('resumenAntiguedad', () => {
  const hoy = new Date('2026-08-27T12:00:00Z');
  const hace = (dias: number) => new Date(hoy.getTime() - dias * 24 * 60 * 60 * 1000);

  it('suma los saldos por rango e ignora saldos en cero o negativos', () => {
    const resumen = resumenAntiguedad(
      [
        { fecha: hace(5), saldo: 100000 },
        { fecha: hace(20), saldo: 50000 },
        { fecha: hace(45), saldo: 70000 },
        { fecha: hace(75), saldo: 30000 },
        { fecha: hace(200), saldo: 10000 },
        { fecha: hace(10), saldo: 0 },
        { fecha: hace(10), saldo: -5000 },
      ],
      hoy,
    );
    expect(resumen).toEqual({ '0-30': 150000, '31-60': 70000, '61-90': 30000, '>90': 10000 });
  });

  it('devuelve los 4 rangos en cero cuando no hay cartera', () => {
    expect(resumenAntiguedad([], hoy)).toEqual({ '0-30': 0, '31-60': 0, '61-90': 0, '>90': 0 });
  });
});
