import { supabase } from '@/integrations/supabase/client';
import {
  disponibleAbono,
  redondear2,
  sumaReparto,
  totalesAplicados,
  validarReparto,
  type AplicacionAbono,
} from './repartoAbonos';

/**
 * Acceso a `aplicacion_abonos` (README 6.3).
 *
 * La tabla la crea supabase/migrations/20260828020000_aplicacion_abonos.sql.
 * `src/integrations/supabase/types.ts` es un archivo GENERADO (para nosotros,
 * de solo lectura) y todavía no la incluye, así que el cliente tipado no la
 * conoce. En vez de tocar el archivo generado se aísla aquí un accesor sin
 * tipar: el `any` queda encerrado en este módulo y el resto del código trabaja
 * contra los tipos de `./repartoAbonos`.
 *
 * Cuando se regeneren los tipos de Supabase, `tablaAplicacionAbonos()` puede
 * reemplazarse por `supabase.from('aplicacion_abonos')`.
 */

export type { AplicacionAbono } from './repartoAbonos';

/** Tabla `aplicacion_abonos` sin tipar (ver nota del encabezado). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const tablaAplicacionAbonos = () => (supabase as any).from('aplicacion_abonos');

/** Aplicaciones ya registradas para un conjunto de abonos. */
export async function listarAplicaciones(abonoIds: string[]): Promise<AplicacionAbono[]> {
  if (abonoIds.length === 0) return [];
  const { data, error } = await tablaAplicacionAbonos()
    .select('id, abono_id, orden_id, monto_aplicado, fecha_aplicacion, usuario_id, created_at')
    .in('abono_id', abonoIds);
  if (error) throw error;
  return (data || []) as AplicacionAbono[];
}

/**
 * Registra la imputación implícita de un abono aplicado a UNA sola orden.
 *
 * El flujo clásico de Billing.tsx (abonar sobre una orden) ya descuenta el
 * saldo directamente; esta fila deja constancia en el libro de imputaciones
 * para que el "disponible" de ese abono quede en cero y nadie vuelva a
 * repartir un dinero que ya se imputó.
 */
export async function registrarAplicacionDirecta(a: {
  abono_id: string;
  orden_id: string;
  monto_aplicado: number;
  usuario_id?: string | null;
}): Promise<void> {
  const { error } = await tablaAplicacionAbonos().insert({
    abono_id: a.abono_id,
    orden_id: a.orden_id,
    monto_aplicado: redondear2(a.monto_aplicado),
    usuario_id: a.usuario_id ?? null,
  });
  if (error) throw error;
}

/**
 * Inserta las imputaciones de un abono y descuenta el saldo de cada orden.
 *
 * Igual que el abono de una sola orden en Billing.tsx, los saldos se RELEEN de
 * la base justo antes de calcular: entre que se abrió el diálogo y se envió el
 * formulario otro usuario pudo haber abonado sobre alguna de estas órdenes.
 *
 * El cliente de Supabase no permite una transacción de varias sentencias, así
 * que el trigger `trg_aplicacion_abonos_no_excede` es la última barrera para
 * que dos usuarios simultáneos no repartan más dinero del que entró.
 */
export async function aplicarAbono(params: {
  abonoId: string;
  montoAbono: number;
  usuarioId?: string | null;
  lineas: ReadonlyArray<{ orden_id: string; monto: number; etiqueta?: string }>;
}): Promise<{ aplicado: number; ordenes: number }> {
  const activas = params.lineas.filter((l) => (Number(l.monto) || 0) > 0);
  if (activas.length === 0) throw new Error('Indique al menos una orden con un monto mayor a cero');

  // 1. Disponible real del abono (relectura).
  const aplicacionesPrevias = await listarAplicaciones([params.abonoId]);
  const disponible = disponibleAbono(
    params.montoAbono,
    totalesAplicados(aplicacionesPrevias)[params.abonoId] || 0,
  );

  // 2. Saldos reales de las órdenes (relectura).
  const { data: ordenes, error: oe } = await supabase
    .from('ordenes')
    .select('id, saldo_pendiente')
    .in('id', activas.map((l) => l.orden_id));
  if (oe) throw oe;

  const saldos = new Map<string, number>(
    (ordenes || []).map((o) => [o.id, Number(o.saldo_pendiente) || 0]),
  );

  const error = validarReparto(
    disponible,
    activas.map((l) => ({
      orden_id: l.orden_id,
      etiqueta: l.etiqueta,
      monto: Number(l.monto),
      saldo_pendiente: saldos.get(l.orden_id) ?? 0,
    })),
  );
  if (error) throw new Error(error);

  // 3. Imputaciones. Si una orden ya tenía imputación de este abono se suma
  //    sobre ella: el índice único (abono_id, orden_id) impide duplicarla.
  const previasPorOrden = new Map(aplicacionesPrevias.map((a) => [a.orden_id, a]));
  for (const l of activas) {
    const monto = redondear2(Number(l.monto));
    const previa = previasPorOrden.get(l.orden_id);
    if (previa) {
      const { error: ue } = await tablaAplicacionAbonos()
        .update({ monto_aplicado: redondear2((Number(previa.monto_aplicado) || 0) + monto) })
        .eq('id', previa.id);
      if (ue) throw ue;
    } else {
      const { error: ie } = await tablaAplicacionAbonos().insert({
        abono_id: params.abonoId,
        orden_id: l.orden_id,
        monto_aplicado: monto,
        usuario_id: params.usuarioId ?? null,
      });
      if (ie) throw ie;
    }

    // 4. Saldo de la orden.
    const saldo = saldos.get(l.orden_id) ?? 0;
    const nuevoSaldo = Math.max(0, redondear2(saldo - monto));
    const { error: se } = await supabase
      .from('ordenes')
      .update({ saldo_pendiente: nuevoSaldo, estado_pago: nuevoSaldo === 0 ? 'pagado' : 'parcial' })
      .eq('id', l.orden_id);
    if (se) {
      throw new Error(
        `Se registró la aplicación pero no se pudo actualizar el saldo de la orden ${l.etiqueta || l.orden_id}: ${se.message}`,
      );
    }
  }

  return { aplicado: sumaReparto(activas), ordenes: activas.length };
}
