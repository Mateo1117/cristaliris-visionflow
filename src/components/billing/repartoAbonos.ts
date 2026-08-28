/**
 * Reglas puras del reparto de un abono entre varias órdenes (README 6.3).
 *
 * Sin dependencias de React ni de Supabase para poder probarlas aisladas: es
 * la parte donde un error descuadra la cartera. El acceso a la tabla
 * `aplicacion_abonos` vive en `./abonosDb`.
 */

import { redondear2 } from './cajaCalc';

/** Redondeo a 2 decimales (`aplicacion_abonos.monto_aplicado` es NUMERIC(12,2)). */
export { redondear2 };

export interface AplicacionAbono {
  id: string;
  abono_id: string;
  orden_id: string;
  monto_aplicado: number;
  fecha_aplicacion: string;
  usuario_id: string | null;
  created_at: string;
}

/** Total ya aplicado por abono: `{ [abono_id]: monto }`. */
export function totalesAplicados(
  aplicaciones: ReadonlyArray<Pick<AplicacionAbono, 'abono_id' | 'monto_aplicado'>>,
): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const a of aplicaciones) {
    acc[a.abono_id] = redondear2((acc[a.abono_id] || 0) + (Number(a.monto_aplicado) || 0));
  }
  return acc;
}

/** Saldo del abono que aún no se ha imputado a ninguna orden (nunca negativo). */
export function disponibleAbono(montoAbono: number, yaAplicado: number): number {
  return Math.max(0, redondear2((Number(montoAbono) || 0) - (Number(yaAplicado) || 0)));
}

export interface RepartoOrden {
  orden_id: string;
  /** Saldo pendiente de la orden en el momento de validar. */
  saldo_pendiente: number;
  /** Monto que el usuario quiere imputar a esta orden. */
  monto: number;
  /** Etiqueta para el mensaje de error (nº de orden). */
  etiqueta?: string;
}

/** Suma de las líneas con monto > 0. */
export function sumaReparto(lineas: ReadonlyArray<{ monto: number }>): number {
  return redondear2(lineas.reduce((s, l) => s + Math.max(0, Number(l.monto) || 0), 0));
}

/**
 * Valida un reparto antes de escribir nada.
 *
 * Reglas (README 6.3, y las mismas que ya aplicaba Billing.tsx para el abono
 * de una sola orden):
 *  - hay al menos una línea con monto mayor a cero,
 *  - ningún monto supera el saldo pendiente de su orden,
 *  - la suma imputada no supera el monto disponible del abono.
 *
 * Devuelve el mensaje de error en español, o `null` si el reparto es válido.
 */
export function validarReparto(disponible: number, lineas: ReadonlyArray<RepartoOrden>): string | null {
  const activas = lineas.filter((l) => (Number(l.monto) || 0) > 0);

  if (activas.length === 0) {
    return 'Indique al menos una orden con un monto mayor a cero';
  }

  for (const l of activas) {
    const monto = Number(l.monto);
    const ref = l.etiqueta || l.orden_id;
    if (!Number.isFinite(monto)) {
      return `Monto inválido en la orden ${ref}`;
    }
    const saldo = Number(l.saldo_pendiente) || 0;
    if (saldo <= 0) {
      return `La orden ${ref} ya no tiene saldo pendiente`;
    }
    if (monto > saldo) {
      return `El monto aplicado a la orden ${ref} ($${monto.toLocaleString('es-CO')}) supera su saldo pendiente ($${saldo.toLocaleString('es-CO')})`;
    }
  }

  const suma = sumaReparto(activas);
  const tope = redondear2(disponible);
  if (suma > tope) {
    return `La suma aplicada ($${suma.toLocaleString('es-CO')}) supera el monto disponible del abono ($${tope.toLocaleString('es-CO')})`;
  }

  return null;
}

/**
 * Reparte un monto entre las órdenes dadas, de la más antigua a la más
 * reciente, sin pasarse del saldo de cada una. Devuelve `{ [orden_id]: monto }`.
 */
export function distribuirPorAntiguedad(
  disponible: number,
  ordenes: ReadonlyArray<{ id: string; saldo_pendiente: number }>,
): Record<string, number> {
  let resto = redondear2(disponible);
  const reparto: Record<string, number> = {};
  for (const o of ordenes) {
    if (resto <= 0) break;
    const asignar = Math.min(resto, Number(o.saldo_pendiente) || 0);
    if (asignar > 0) {
      reparto[o.id] = redondear2(asignar);
      resto = redondear2(resto - asignar);
    }
  }
  return reparto;
}
