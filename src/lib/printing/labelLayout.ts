/**
 * Layout visual de la etiqueta — definido por el usuario en el diseñador.
 *
 * Coordenadas en MILÍMETROS sobre la página final (después de rotación).
 * El renderer (thermal.ts) recorta cada texto a wMm y dibuja a la fuente
 * indicada. El QR se dibuja como imagen cuadrada usando wMm como tamaño.
 */

export type LabelField =
  | 'qr'
  | 'numero'
  | 'paciente'
  | 'descripcion'
  | 'laboratorio'
  | 'numeroMontura'
  | 'fechaEntrega'
  | 'sede'
  | 'formula'
  | 'custom';

export interface LabelElement {
  id: string;
  field: LabelField;
  xMm: number;
  yMm: number;
  wMm: number;
  hMm: number;            // sólo informativo para texto; QR usa wMm como lado
  fontSize: number;       // pt
  bold?: boolean;
  align?: 'left' | 'center' | 'right';
  prefix?: string;        // se antepone al valor, ej "M: "
  text?: string;          // para campo 'custom'
}

export interface LabelLayout {
  version: 1;
  elements: LabelElement[];
}

export const FIELD_LABELS: Record<LabelField, string> = {
  qr: 'QR',
  numero: 'Nº orden',
  paciente: 'Paciente',
  descripcion: 'Descripción',
  laboratorio: 'Laboratorio',
  numeroMontura: 'Nº montura',
  fechaEntrega: 'Fecha entrega',
  sede: 'Sede',
  formula: 'Fórmula',
  custom: 'Texto fijo',
};

export const SAMPLE_VALUES: Record<LabelField, string> = {
  qr: '',
  numero: 'ORD-00001',
  paciente: 'Juan Pérez',
  descripcion: 'Lente progresivo AR',
  laboratorio: 'Lab Óptico',
  numeroMontura: 'M-123',
  fechaEntrega: '15/06/26',
  sede: 'Sede Centro',
  formula: 'OD -1.00 -0.50 x90 / OI -1.25 -0.75 x85',
  custom: 'Texto',
};

const uid = () => Math.random().toString(36).slice(2, 10);

/** Layout por defecto para etiqueta vertical de 30×40 mm (QR arriba, datos abajo). */
export const buildDefaultLayout = (widthMm: number, heightMm: number): LabelLayout => {
  const pad = Math.max(1, Math.min(widthMm, heightMm) * 0.05);
  const qrSize = Math.min(widthMm - pad * 2, heightMm * 0.55);
  const qrX = (widthMm - qrSize) / 2;
  const textX = pad;
  const textW = widthMm - pad * 2;
  let y = pad + qrSize + 1.5;

  const line = (field: LabelField, fontSize: number, bold?: boolean, prefix?: string): LabelElement => {
    const el: LabelElement = {
      id: uid(), field, xMm: textX, yMm: y,
      wMm: textW, hMm: fontSize * 0.4,
      fontSize, bold, align: 'center', prefix,
    };
    y += fontSize * 0.45;
    return el;
  };

  return {
    version: 1,
    elements: [
      { id: uid(), field: 'qr', xMm: qrX, yMm: pad, wMm: qrSize, hMm: qrSize, fontSize: 0 },
      line('numero',        9, true),
      line('paciente',      7, true),
      line('descripcion',   6),
      line('numeroMontura', 6, false, 'M: '),
      line('laboratorio',   5.5),
    ],
  };
};

export const LABEL_PX_PER_MM = 8;
