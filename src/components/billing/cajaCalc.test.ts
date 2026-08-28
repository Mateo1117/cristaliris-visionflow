import { describe, expect, it } from 'vitest';
import {
  agruparIngresos,
  calcularDiferencia,
  categoriaCaja,
  esperadoEfectivo,
  etiquetaDiferencia,
  montoEsperado,
  requiereObservaciones,
} from './cajaCalc';
import {
  disponibleAbono,
  distribuirPorAntiguedad,
  sumaReparto,
  totalesAplicados,
  validarReparto,
} from './repartoAbonos';

describe('categoriaCaja', () => {
  it('mapea los medios de pago a las tres columnas de caja_diaria', () => {
    expect(categoriaCaja('efectivo')).toBe('efectivo');
    expect(categoriaCaja('contado')).toBe('efectivo');
    expect(categoriaCaja('transferencia')).toBe('transferencia');
    expect(categoriaCaja('nequi')).toBe('transferencia');
    expect(categoriaCaja('tarjeta')).toBe('tarjeta');
    expect(categoriaCaja('addi')).toBe('tarjeta');
    expect(categoriaCaja('link_pago')).toBe('tarjeta');
  });

  it('deja fuera de la caja la nómina y los medios desconocidos', () => {
    expect(categoriaCaja('nomina')).toBe('otro');
    expect(categoriaCaja('cheque_de_viajero')).toBe('otro');
    expect(categoriaCaja(null)).toBe('otro');
  });

  it('normaliza mayúsculas y espacios', () => {
    expect(categoriaCaja('  Efectivo ')).toBe('efectivo');
  });
});

describe('agruparIngresos', () => {
  it('suma por categoría e ignora montos no positivos', () => {
    const r = agruparIngresos([
      { monto: 10000, medio_pago: 'efectivo' },
      { monto: 5000, medio_pago: 'contado' },
      { monto: 20000, medio_pago: 'tarjeta' },
      { monto: 7000, medio_pago: 'nequi' },
      { monto: 90000, medio_pago: 'nomina' },
      { monto: 0, medio_pago: 'efectivo' },
      { monto: null, medio_pago: 'efectivo' },
    ]);
    expect(r.efectivo).toBe(15000);
    expect(r.tarjeta).toBe(20000);
    expect(r.transferencia).toBe(7000);
    expect(r.otro).toBe(90000);
    // el total NO incluye la nómina: no mueve caja
    expect(r.total).toBe(42000);
  });

  it('devuelve ceros sin abonos', () => {
    expect(agruparIngresos([]).total).toBe(0);
  });
});

describe('arqueo de caja (README 6.4)', () => {
  const base = {
    monto_apertura: 100000,
    ingresos_efectivo: 50000,
    ingresos_tarjeta: 30000,
    ingresos_transferencia: 20000,
    egresos: 15000,
  };

  it('monto esperado = apertura + ingresos - egresos', () => {
    expect(montoEsperado(base)).toBe(185000);
  });

  it('el esperado en efectivo excluye tarjeta y transferencia', () => {
    expect(esperadoEfectivo(base)).toBe(135000);
  });

  it('trata los nulos como cero', () => {
    expect(montoEsperado({
      monto_apertura: null,
      ingresos_efectivo: null,
      ingresos_tarjeta: null,
      ingresos_transferencia: null,
      egresos: null,
    })).toBe(0);
  });

  it('la diferencia es real - esperado (positiva = sobrante)', () => {
    expect(calcularDiferencia(185000, 190000)).toBe(5000);
    expect(calcularDiferencia(185000, 180000)).toBe(-5000);
    expect(calcularDiferencia(185000, 185000)).toBe(0);
  });

  it('etiqueta el sobrante, el faltante y el cuadre', () => {
    expect(etiquetaDiferencia(5000)).toBe('Sobrante');
    expect(etiquetaDiferencia(-5000)).toBe('Faltante');
    expect(etiquetaDiferencia(0)).toBe('Cuadra');
  });

  it('exige observaciones solo cuando la diferencia no es cero', () => {
    expect(requiereObservaciones(0)).toBe(false);
    expect(requiereObservaciones(1)).toBe(true);
    expect(requiereObservaciones(-1)).toBe(true);
  });

  it('no exige observaciones por ruido de coma flotante', () => {
    const dif = calcularDiferencia(0.1 + 0.2, 0.3);
    expect(dif).toBe(0);
    expect(requiereObservaciones(dif)).toBe(false);
  });
});

describe('aplicación de abonos (README 6.3)', () => {
  it('acumula lo ya aplicado por abono', () => {
    const totales = totalesAplicados([
      { abono_id: 'A', monto_aplicado: 30000 },
      { abono_id: 'A', monto_aplicado: 20000 },
      { abono_id: 'B', monto_aplicado: 10000 },
    ]);
    expect(totales.A).toBe(50000);
    expect(totales.B).toBe(10000);
  });

  it('el disponible nunca es negativo', () => {
    expect(disponibleAbono(100000, 40000)).toBe(60000);
    expect(disponibleAbono(100000, 100000)).toBe(0);
    expect(disponibleAbono(100000, 150000)).toBe(0);
  });

  it('suma solo las líneas con monto positivo', () => {
    expect(sumaReparto([{ monto: 1000 }, { monto: 0 }, { monto: -500 }])).toBe(1000);
  });

  it('acepta un reparto válido entre varias órdenes', () => {
    expect(validarReparto(100000, [
      { orden_id: 'o1', saldo_pendiente: 60000, monto: 60000 },
      { orden_id: 'o2', saldo_pendiente: 80000, monto: 40000 },
    ])).toBeNull();
  });

  it('permite aplicar parcialmente (deja saldo del abono sin aplicar)', () => {
    expect(validarReparto(100000, [
      { orden_id: 'o1', saldo_pendiente: 60000, monto: 25000 },
    ])).toBeNull();
  });

  it('rechaza que la suma supere el monto disponible del abono', () => {
    expect(validarReparto(50000, [
      { orden_id: 'o1', saldo_pendiente: 60000, monto: 30000 },
      { orden_id: 'o2', saldo_pendiente: 60000, monto: 30000 },
    ])).toMatch(/supera el monto disponible/);
  });

  it('rechaza aplicar más que el saldo de una orden', () => {
    expect(validarReparto(100000, [
      { orden_id: 'o1', saldo_pendiente: 10000, monto: 20000, etiqueta: '#7' },
    ])).toMatch(/#7/);
  });

  it('rechaza órdenes ya pagadas', () => {
    expect(validarReparto(100000, [
      { orden_id: 'o1', saldo_pendiente: 0, monto: 1000 },
    ])).toMatch(/ya no tiene saldo pendiente/);
  });

  it('exige al menos una línea con monto', () => {
    expect(validarReparto(100000, [
      { orden_id: 'o1', saldo_pendiente: 10000, monto: 0 },
    ])).toMatch(/al menos una orden/);
    expect(validarReparto(100000, [])).toMatch(/al menos una orden/);
  });

  it('distribuye por antigüedad sin pasarse del saldo de cada orden', () => {
    const reparto = distribuirPorAntiguedad(70000, [
      { id: 'vieja', saldo_pendiente: 50000 },
      { id: 'media', saldo_pendiente: 40000 },
      { id: 'nueva', saldo_pendiente: 30000 },
    ]);
    expect(reparto).toEqual({ vieja: 50000, media: 20000 });
    expect(sumaReparto(Object.values(reparto).map((monto) => ({ monto })))).toBe(70000);
  });

  it('el reparto automático es siempre válido', () => {
    const ordenes = [
      { id: 'o1', saldo_pendiente: 15000 },
      { id: 'o2', saldo_pendiente: 25000 },
    ];
    const reparto = distribuirPorAntiguedad(1000000, ordenes);
    expect(validarReparto(1000000, ordenes.map((o) => ({
      orden_id: o.id,
      saldo_pendiente: o.saldo_pendiente,
      monto: reparto[o.id] ?? 0,
    })))).toBeNull();
  });
});
