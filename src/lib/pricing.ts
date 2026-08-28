/**
 * Lógica financiera central de Cristal Iris.
 *
 * Implementa el MÓDULO 6.1 del PROMPT MAESTRO (README):
 *
 *  1. Descuento automático por empresa: 45% o 50% según el convenio del paciente.
 *  2. Ajuste por medio de pago: "Si el medio de pago es tarjeta de crédito, Addi o
 *     link de pago → restar 5% al descuento de empresa".
 *     Ejemplo del README: empresa 50% + tarjeta = 45% de descuento efectivo.
 *  3. Recargo financiero: "Pagos con tarjeta / Addi → recargo del 9% sobre el valor
 *     después de descuento".
 *     NOTA: el README aplica el ajuste de -5 puntos a tarjeta, Addi Y link de pago,
 *     pero el recargo del 9% SOLO lo menciona para tarjeta y Addi. Se respeta esa
 *     asimetría de forma literal (link_pago ajusta descuento pero no recarga).
 *
 * Todo el dinero se maneja en pesos colombianos SIN decimales (se redondea a peso).
 */

// ---------------------------------------------------------------------------
// Constantes de negocio
// ---------------------------------------------------------------------------

/** Puntos porcentuales que se restan al descuento de empresa según el medio de pago. */
export const PUNTOS_AJUSTE_MEDIO_PAGO = 5;

/** Porcentaje de recargo financiero sobre el valor después de descuento. */
export const PORCENTAJE_RECARGO_FINANCIERO = 9;

/** Descuento fijo cuando el paciente trae su propia montura. */
export const DESCUENTO_MONTURA_PROPIA = 90000;

// ---------------------------------------------------------------------------
// Medios de pago
// ---------------------------------------------------------------------------

export type MedioPago =
  | 'efectivo'
  | 'contado'
  | 'transferencia'
  | 'llave'
  | 'nequi'
  | 'daviplata'
  | 'nomina'
  | 'datafono'
  | 'tarjeta'
  | 'addi'
  | 'sistecredito'
  | 'link_pago';

export interface ReglaMedioPago {
  /** Valor persistido en `ordenes.modalidad_pago` / `abonos.medio_pago`. */
  v: MedioPago;
  /** Etiqueta de UI (español). */
  l: string;
  /** Resta PUNTOS_AJUSTE_MEDIO_PAGO al descuento de empresa. */
  ajustaDescuento: boolean;
  /** Genera recargo financiero del PORCENTAJE_RECARGO_FINANCIERO. */
  generaRecargo: boolean;
  /** Justificación de la clasificación (para auditoría / mantenimiento). */
  nota: string;
}

/**
 * Mapa EXPLÍCITO medio de pago → reglas financieras.
 *
 * Los tres primeros bloques están textualmente en el README. Los medios que el
 * README no nombra se clasifican por analogía y quedan documentados aquí para que
 * el área financiera pueda confirmarlos o corregirlos en un solo lugar:
 *
 *  - `datafono`: en la UI convive con "Tarjeta Crédito" como opción aparte, por lo
 *    que se interpreta como pago débito en punto de venta (liquidación inmediata):
 *    NO ajusta descuento y NO recarga. Si el negocio pasa crédito por el datáfono
 *    debe registrarse como `tarjeta`.
 *  - `sistecredito`: financiación en punto de venta, funcionalmente idéntica a Addi
 *    → ajusta descuento y recarga, igual que Addi.
 *  - `llave` / `nequi` / `daviplata`: transferencias inmediatas (billeteras) → sin
 *    ajuste ni recargo, igual que `transferencia`.
 *  - `nomina`: descuento por nómina aprobado por la empresa → sin ajuste ni recargo.
 */
export const MEDIOS_PAGO: readonly ReglaMedioPago[] = [
  { v: 'efectivo', l: 'Efectivo', ajustaDescuento: false, generaRecargo: false, nota: 'Contado: sin costo financiero.' },
  { v: 'contado', l: 'Contado', ajustaDescuento: false, generaRecargo: false, nota: 'Contado: sin costo financiero.' },
  { v: 'transferencia', l: 'Transferencia', ajustaDescuento: false, generaRecargo: false, nota: 'Transferencia bancaria: sin costo financiero.' },
  { v: 'llave', l: 'Llave', ajustaDescuento: false, generaRecargo: false, nota: 'Transferencia inmediata (llave): equivale a transferencia.' },
  { v: 'nequi', l: 'Nequi', ajustaDescuento: false, generaRecargo: false, nota: 'Billetera digital: equivale a transferencia.' },
  { v: 'daviplata', l: 'Daviplata', ajustaDescuento: false, generaRecargo: false, nota: 'Billetera digital: equivale a transferencia.' },
  { v: 'nomina', l: 'Nómina', ajustaDescuento: false, generaRecargo: false, nota: 'Descuento por nómina aprobado por la empresa.' },
  { v: 'datafono', l: 'Datafono', ajustaDescuento: false, generaRecargo: false, nota: 'Débito en punto de venta. El crédito se registra como "tarjeta".' },
  { v: 'tarjeta', l: 'Tarjeta Crédito', ajustaDescuento: true, generaRecargo: true, nota: 'README: -5 puntos de descuento y recargo del 9%.' },
  { v: 'addi', l: 'Addi', ajustaDescuento: true, generaRecargo: true, nota: 'README: -5 puntos de descuento y recargo del 9%.' },
  { v: 'sistecredito', l: 'Sistecrédito', ajustaDescuento: true, generaRecargo: true, nota: 'Financiación en punto de venta: se trata igual que Addi.' },
  { v: 'link_pago', l: 'Link de Pago', ajustaDescuento: true, generaRecargo: false, nota: 'README: -5 puntos de descuento; el 9% solo se menciona para tarjeta/Addi.' },
] as const;

const REGLAS = new Map<string, ReglaMedioPago>(MEDIOS_PAGO.map((m) => [m.v, m]));

/**
 * Regla asociada a un medio de pago. Un medio desconocido se trata de forma
 * conservadora (sin ajuste ni recargo) para nunca cobrarle de más al paciente.
 */
export function reglaMedioPago(medioPago?: string | null): ReglaMedioPago {
  return (
    REGLAS.get((medioPago || '').trim().toLowerCase()) ?? {
      v: 'efectivo',
      l: 'Efectivo',
      ajustaDescuento: false,
      generaRecargo: false,
      nota: 'Medio de pago no reconocido: se asume contado (sin ajuste ni recargo).',
    }
  );
}

/** ¿El medio de pago resta puntos al descuento de empresa? */
export function ajustaDescuento(medioPago?: string | null): boolean {
  return reglaMedioPago(medioPago).ajustaDescuento;
}

/** ¿El medio de pago genera recargo financiero? */
export function generaRecargo(medioPago?: string | null): boolean {
  return reglaMedioPago(medioPago).generaRecargo;
}

// ---------------------------------------------------------------------------
// Utilidades numéricas
// ---------------------------------------------------------------------------

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Redondea a pesos colombianos (sin decimales). */
export function redondearPesos(valor: number): number {
  const n = num(valor);
  // Math.round(-0.5) === -0 en JS; se normaliza para evitar "-0" en la UI.
  const r = Math.round(n);
  return Object.is(r, -0) ? 0 : r;
}

// ---------------------------------------------------------------------------
// Descuento efectivo y recargo
// ---------------------------------------------------------------------------

/**
 * Descuento efectivo (en %) tras aplicar el ajuste por medio de pago.
 *
 *   descuentoEfectivo(50, 'tarjeta')  → 45   (ejemplo del README)
 *   descuentoEfectivo(45, 'addi')     → 40
 *   descuentoEfectivo(50, 'efectivo') → 50
 *   descuentoEfectivo(0,  'tarjeta')  → 0    (paciente particular: nunca negativo)
 */
export function descuentoEfectivo(pctEmpresa: number | null | undefined, medioPago?: string | null): number {
  const base = Math.min(100, Math.max(0, num(pctEmpresa)));
  if (base <= 0) return 0;
  const ajuste = ajustaDescuento(medioPago) ? PUNTOS_AJUSTE_MEDIO_PAGO : 0;
  return Math.max(0, base - ajuste);
}

/**
 * Recargo financiero (9%) calculado SOBRE EL VALOR DESPUÉS DE DESCUENTO.
 * Devuelve 0 para medios de pago que no generan recargo o bases no positivas.
 */
export function recargoFinanciero(valorConDescuento: number, medioPago?: string | null): number {
  if (!generaRecargo(medioPago)) return 0;
  const base = num(valorConDescuento);
  if (base <= 0) return 0;
  return redondearPesos((base * PORCENTAJE_RECARGO_FINANCIERO) / 100);
}

// ---------------------------------------------------------------------------
// Cálculo de totales
// ---------------------------------------------------------------------------

export interface ItemPrecio {
  cantidad: number;
  precioUnitario: number;
  /** Si es false la línea nunca recibe descuento de convenio (ej. lentes de contacto). */
  aplicaDescuento?: boolean;
  /** Override manual del % de la línea. Si es null/undefined se usa el descuento efectivo. */
  descuentoPorcentaje?: number | null;
}

export interface LineaCalculada {
  /** cantidad × precio unitario (precio de lista). */
  subtotal: number;
  /** % realmente aplicado a esta línea. */
  descuentoPorcentaje: number;
  /** Valor descontado en esta línea. */
  descuentoValor: number;
  /**
   * Precio NETO de la línea = subtotal - descuentoValor.
   * Este es el valor que debe persistirse en `orden_productos.precio_venta`,
   * porque los reportes de utilidad asumen que ese campo ya viene neto.
   */
  neto: number;
}

export interface TotalesCalculados {
  /** Suma de precios de lista (cantidad × precio unitario). */
  subtotal: number;
  /** % de descuento efectivo de convenio ya ajustado por medio de pago. */
  descuentoPct: number;
  /** Valor total del descuento de convenio. */
  descuentoValor: number;
  /** Descuentos que NO son de convenio (ej. montura propia). */
  descuentoAdicional: number;
  /** subtotal - descuentoValor - descuentoAdicional (nunca negativo). */
  baseConDescuento: number;
  /** 9% sobre baseConDescuento cuando el medio de pago lo exige. */
  recargoFinanciero: number;
  /** baseConDescuento + recargoFinanciero. */
  total: number;
  /** Detalle por línea; `neto` es lo que se persiste por producto. */
  lineas: LineaCalculada[];
}

export interface ParamsTotales {
  items: ItemPrecio[];
  /** Descuento del convenio del paciente (45 / 50 / 0 si es particular). */
  pctEmpresa: number | null | undefined;
  medioPago?: string | null;
  /** Descuentos de orden que no dependen del convenio (ej. montura propia). */
  descuentoAdicional?: number;
}

/**
 * Calcula todos los totales de una orden/cotización.
 *
 * DECISIÓN SOBRE EL DOBLE DESCUENTO
 * ---------------------------------
 * El descuento de convenio se aplica UNA sola vez, a nivel de línea:
 *
 *   - `orden_productos.precio_venta` = `linea.neto` (YA neto de convenio).
 *   - `ordenes.subtotal`             = `subtotal` (bruto, informativo).
 *   - `ordenes.descuento_empresa`    = `descuentoValor` (informativo, el desglose
 *                                       que se le muestra al paciente).
 *   - `ordenes.total_final`          = `total`.
 *
 * `total_final` NO se obtiene sumando `precio_venta` y volviendo a restar
 * `descuento_empresa`: se calcula a partir del subtotal bruto. Por eso guardar el
 * neto por línea no duplica el descuento — `Σ linea.neto === subtotal - descuentoValor`
 * por construcción (el neto se deriva restando, no re-aplicando el porcentaje).
 *
 * El descuento por montura propia y el recargo financiero se mantienen a nivel de
 * ORDEN (no se prorratean por línea) porque no son atribuibles a un producto
 * concreto; así los reportes de utilidad por producto siguen siendo comparables.
 */
export function calcularTotales({
  items,
  pctEmpresa,
  medioPago,
  descuentoAdicional = 0,
}: ParamsTotales): TotalesCalculados {
  const descuentoPct = descuentoEfectivo(pctEmpresa, medioPago);

  const lineas: LineaCalculada[] = (items || []).map((it) => {
    const cantidad = num(it.cantidad) || 0;
    const subtotal = redondearPesos(cantidad * num(it.precioUnitario));
    const aplica = it.aplicaDescuento !== false;
    const pctLinea = aplica
      ? Math.min(100, Math.max(0, it.descuentoPorcentaje == null ? descuentoPct : num(it.descuentoPorcentaje)))
      : 0;
    const descuentoValor = redondearPesos((subtotal * pctLinea) / 100);
    return {
      subtotal,
      descuentoPorcentaje: pctLinea,
      descuentoValor,
      // Restar (en vez de multiplicar por 1 - pct) garantiza Σ neto === subtotal - descuento.
      neto: subtotal - descuentoValor,
    };
  });

  const subtotal = lineas.reduce((s, l) => s + l.subtotal, 0);
  const descuentoValor = lineas.reduce((s, l) => s + l.descuentoValor, 0);
  const adicional = redondearPesos(Math.max(0, num(descuentoAdicional)));
  const baseConDescuento = Math.max(0, subtotal - descuentoValor - adicional);
  const recargo = recargoFinanciero(baseConDescuento, medioPago);

  return {
    subtotal,
    descuentoPct,
    descuentoValor,
    descuentoAdicional: adicional,
    baseConDescuento,
    recargoFinanciero: recargo,
    total: baseConDescuento + recargo,
    lineas,
  };
}

// ---------------------------------------------------------------------------
// Antigüedad de cartera (README 6.3)
// ---------------------------------------------------------------------------

export type RangoAntiguedad = '0-30' | '31-60' | '61-90' | '>90';

/** Orden canónico para mostrar los rangos en tablas y resúmenes. */
export const RANGOS_ANTIGUEDAD: readonly RangoAntiguedad[] = ['0-30', '31-60', '61-90', '>90'] as const;

const MS_DIA = 24 * 60 * 60 * 1000;

/** Días calendario transcurridos entre `fecha` y `referencia` (0 si la fecha es futura o inválida). */
export function diasAntiguedad(fecha: string | number | Date | null | undefined, referencia: Date = new Date()): number {
  if (fecha == null) return 0;
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  const t = d.getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((referencia.getTime() - t) / MS_DIA));
}

/**
 * Clasifica la antigüedad de una cuenta por cobrar en los rangos del README:
 * 0-30, 31-60, 61-90 y >90 días.
 */
export function clasificarAntiguedad(
  fecha: string | number | Date | null | undefined,
  referencia: Date = new Date(),
): RangoAntiguedad {
  const dias = diasAntiguedad(fecha, referencia);
  if (dias <= 30) return '0-30';
  if (dias <= 60) return '31-60';
  if (dias <= 90) return '61-90';
  return '>90';
}

/** Agrupa saldos por rango de antigüedad. Devuelve siempre los 4 rangos. */
export function resumenAntiguedad(
  cuentas: { fecha: string | number | Date | null | undefined; saldo: number }[],
  referencia: Date = new Date(),
): Record<RangoAntiguedad, number> {
  const acc: Record<RangoAntiguedad, number> = { '0-30': 0, '31-60': 0, '61-90': 0, '>90': 0 };
  for (const c of cuentas || []) {
    const saldo = num(c.saldo);
    if (saldo <= 0) continue;
    acc[clasificarAntiguedad(c.fecha, referencia)] += saldo;
  }
  return acc;
}
