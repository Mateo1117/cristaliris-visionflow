/**
 * Calibración de etiqueta — POR DISPOSITIVO (no se sincroniza a la BD).
 *
 * Cada sede/impresora tiene tolerancias mecánicas distintas; estos valores
 * permiten ajustar el margen interior y desplazamiento X/Y hasta que la
 * etiqueta salga centrada perfectamente, sin tocar el diseño global.
 */

export interface LabelCalibration {
  /** Padding interior aplicado a los 4 bordes del papel físico (mm). */
  marginMm: number;
  /** Desplazamiento horizontal del contenido (mm). Positivo = derecha. */
  offsetXMm: number;
  /** Desplazamiento vertical del contenido (mm). Positivo = abajo. */
  offsetYMm: number;
}

export const DEFAULT_LABEL_CALIBRATION: LabelCalibration = {
  // Sin margen: el diseño ocupa la etiqueta completa. Cualquier margen aquí
  // encoge TODO el contenido (se reescala para caber en el área interior), y
  // el espacio en blanco ya se decide colocando los elementos en el diseñador.
  marginMm: 0,
  offsetXMm: 0,
  offsetYMm: 0,
};

const KEY = 'cristaliris.labelCalibration.v1';

export const loadLabelCalibration = (): LabelCalibration => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_LABEL_CALIBRATION;
    const p = JSON.parse(raw);
    return {
      marginMm: clamp(Number(p.marginMm), 0, 10, DEFAULT_LABEL_CALIBRATION.marginMm),
      offsetXMm: clamp(Number(p.offsetXMm), -40, 40, 0),
      offsetYMm: clamp(Number(p.offsetYMm), -20, 20, 0),
    };
  } catch {
    return DEFAULT_LABEL_CALIBRATION;
  }
};

export const saveLabelCalibration = (c: LabelCalibration): void => {
  localStorage.setItem(KEY, JSON.stringify(c));
};

export const resetLabelCalibration = (): void => {
  localStorage.removeItem(KEY);
};

const clamp = (n: number, min: number, max: number, fallback: number) => {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};
