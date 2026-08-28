/**
 * Cálculos puros de la caja diaria (README 6.4).
 *
 * Se mantienen fuera del componente para poder probarlos sin montar React ni
 * Supabase: son la parte del módulo donde un error cuesta dinero real.
 */

/**
 * Columnas de ingreso que existen REALMENTE en `caja_diaria`
 * (`ingresos_efectivo`, `ingresos_tarjeta`, `ingresos_transferencia`).
 * No hay una cuarta columna, así que todo lo que no encaje en las tres se
 * agrupa en `otro` y NO se guarda: ver `LIMITACIONES_CAJA`.
 */
export type CategoriaCaja = 'efectivo' | 'tarjeta' | 'transferencia' | 'otro';

/**
 * Medio de pago (`abonos.medio_pago`, valores de `MEDIOS_PAGO` en
 * src/lib/pricing.ts) → columna de la caja.
 *
 *  - efectivo / contado            → efectivo (entra plata al cajón)
 *  - transferencia / llave / nequi
 *    / daviplata                   → transferencia (banco/billetera)
 *  - tarjeta / addi / sistecredito
 *    / datafono / link_pago        → tarjeta (liquidación por el adquirente)
 *  - nomina                        → `otro`: no es un movimiento de caja, la
 *                                    empresa lo descuenta después por nómina.
 */
const MAPA_CATEGORIA: Record<string, CategoriaCaja> = {
  efectivo: 'efectivo',
  contado: 'efectivo',
  transferencia: 'transferencia',
  llave: 'transferencia',
  nequi: 'transferencia',
  daviplata: 'transferencia',
  tarjeta: 'tarjeta',
  datafono: 'tarjeta',
  addi: 'tarjeta',
  sistecredito: 'tarjeta',
  link_pago: 'tarjeta',
  nomina: 'otro',
};

/** Categoría de caja de un medio de pago. Lo desconocido cae en `otro`. */
export function categoriaCaja(medioPago?: string | null): CategoriaCaja {
  return MAPA_CATEGORIA[(medioPago || '').trim().toLowerCase()] ?? 'otro';
}

export interface IngresosCaja {
  efectivo: number;
  tarjeta: number;
  transferencia: number;
  /** Medios que no caben en ninguna columna de `caja_diaria` (p. ej. nómina). */
  otro: number;
  /** efectivo + tarjeta + transferencia (NO incluye `otro`). */
  total: number;
}

export const INGRESOS_VACIOS: IngresosCaja = {
  efectivo: 0,
  tarjeta: 0,
  transferencia: 0,
  otro: 0,
  total: 0,
};

/** Agrupa los abonos del día por categoría de caja. */
export function agruparIngresos(
  abonos: ReadonlyArray<{ monto: number | null; medio_pago: string | null }>,
): IngresosCaja {
  const r: IngresosCaja = { ...INGRESOS_VACIOS };
  for (const a of abonos) {
    const monto = Number(a.monto) || 0;
    if (monto <= 0) continue;
    r[categoriaCaja(a.medio_pago)] += monto;
  }
  r.total = r.efectivo + r.tarjeta + r.transferencia;
  return r;
}

export interface BaseCierre {
  monto_apertura: number | null;
  ingresos_efectivo: number | null;
  ingresos_tarjeta: number | null;
  ingresos_transferencia: number | null;
  egresos: number | null;
}

/**
 * Monto esperado al cierre = apertura + ingresos - egresos (README 6.4).
 *
 * "Ingresos" incluye los tres medios porque así lo define el README; el
 * efectivo que debería estar físicamente en el cajón se calcula aparte con
 * `esperadoEfectivo` y se muestra como referencia en el arqueo.
 */
export function montoEsperado(c: BaseCierre): number {
  return (
    (Number(c.monto_apertura) || 0) +
    (Number(c.ingresos_efectivo) || 0) +
    (Number(c.ingresos_tarjeta) || 0) +
    (Number(c.ingresos_transferencia) || 0) -
    (Number(c.egresos) || 0)
  );
}

/** Efectivo que debería haber físicamente en el cajón: apertura + efectivo - egresos. */
export function esperadoEfectivo(c: BaseCierre): number {
  return (
    (Number(c.monto_apertura) || 0) +
    (Number(c.ingresos_efectivo) || 0) -
    (Number(c.egresos) || 0)
  );
}

/**
 * Redondeo a 2 decimales: las columnas de dinero son NUMERIC(12,2).
 * Normaliza `-0` a `0` para que un faltante de cero no se muestre como "-$0".
 */
export function redondear2(n: number): number {
  const r = Math.round((Number(n) || 0) * 100) / 100;
  return r === 0 ? 0 : r;
}

/**
 * Diferencia del arqueo: real - esperado.
 * Positiva = sobrante, negativa = faltante, cero = cuadra.
 * Se redondea para que un error de coma flotante no dispare por sí solo el
 * "requiere observaciones".
 */
export function calcularDiferencia(esperado: number, real: number): number {
  return redondear2((Number(real) || 0) - (Number(esperado) || 0));
}

/** README 6.4: las observaciones son obligatorias si hay diferencia. */
export function requiereObservaciones(diferencia: number): boolean {
  return redondear2(diferencia) !== 0;
}

/** Etiqueta en español de la diferencia, para la UI. */
export function etiquetaDiferencia(diferencia: number): 'Cuadra' | 'Sobrante' | 'Faltante' {
  const d = redondear2(diferencia);
  if (d === 0) return 'Cuadra';
  return d > 0 ? 'Sobrante' : 'Faltante';
}

/**
 * LIMITACIONES conocidas del esquema actual de `caja_diaria`
 * (columnas exactas en src/integrations/supabase/types.ts, que es de solo
 * lectura). No se inventa ninguna columna; se documentan aquí y se muestran
 * en la UI para que quien administre la base decida si amplía el esquema.
 */
export const LIMITACIONES_CAJA = [
  '`egresos` es un único total NUMERIC, no existe una tabla de detalle: cada egreso registrado suma al acumulado y su concepto se anexa a `observaciones` con fecha, hora y monto.',
  'No hay columnas para el medio de pago "nómina" ni para otros medios: esos abonos se muestran aparte como "no aplica a caja" y no entran en el monto esperado.',
  '`caja_diaria` no guarda quién cerró la caja (solo `usuario_id`, el de la apertura) ni el detalle del arqueo por denominación.',
  '`usuario_id` referencia a `auth.users`, no a `profiles`: la aplicación no puede mostrar el nombre del cajero, solo identificar si la caja es del usuario actual.',
] as const;
