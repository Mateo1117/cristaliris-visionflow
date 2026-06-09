/**
 * Thermal printer integration — Jaltech POS JAL-838L (2-en-1)
 *
 * Genera PDFs con el tamaño EXACTO del medio (mm) usando jsPDF.
 * Los tamaños se leen desde printSettings (localStorage) y el layout
 * se auto-ajusta a cualquier ancho/alto configurado por el usuario.
 */

import { jsPDF } from 'jspdf';
import {
  loadPrintSettings,
  type PrintSize,
  type Orientation,
} from './printSettings';

const COMPANY = {
  nombre: 'Cristal Iris',
  nit: 'NIT 900.123.456-7',
};

const fmtCOP = (n: number) =>
  '$' + Math.round(n || 0).toLocaleString('es-CO');

const fmtFecha = (d?: string | Date) => {
  const date = d ? new Date(d) : new Date();
  return date.toLocaleString('es-CO', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
};

const openPdfPrint = (doc: jsPDF, title: string) => {
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank', 'width=420,height=640');
  if (!w) {
    const a = document.createElement('a');
    a.href = url; a.download = `${title}.pdf`; a.click();
    return;
  }
  w.addEventListener('load', () => {
    setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 250);
  });
};

const clipText = (doc: jsPDF, txt: string, maxW: number): string => {
  if (!txt) return '';
  if (doc.getTextWidth(txt) <= maxW) return txt;
  let t = txt;
  while (t.length > 1 && doc.getTextWidth(t + '…') > maxW) t = t.slice(0, -1);
  return t + '…';
};

/** Resuelve el tamaño efectivo del PDF según la orientación elegida.
 *  Si `rotateContent` está activo, intercambia W↔H y flipa la orientación,
 *  para compensar drivers de impresoras térmicas que rotan automáticamente. */
const resolveFormat = (size: PrintSize): { W: number; H: number; orientation: 'portrait' | 'landscape' } => {
  let w = Math.max(20, size.widthMm);
  let h = Math.max(20, size.heightMm);
  let orientation: Orientation = size.orientation;
  if (size.rotateContent) {
    [w, h] = [h, w];
    orientation = orientation === 'portrait' ? 'landscape' : 'portrait';
  }
  return { W: w, H: h, orientation };
};

// ───────────────────────────────────────────────────────────────────────────
// TICKET (configurable, default 30 × 50 mm)
// ───────────────────────────────────────────────────────────────────────────

export interface ReceiptItem {
  descripcion: string;
  cantidad?: number;
  precio: number;
}

export interface ReceiptData {
  numero: string;
  fecha?: string | Date;
  paciente?: string;
  documento?: string;
  vendedor?: string;
  items: ReceiptItem[];
  subtotal?: number;
  descuento?: number;
  total: number;
  abonado?: number;
  saldo?: number;
  notas?: string;
}

export const printThermalReceipt = (data: ReceiptData) => {
  const cfg = loadPrintSettings().receipt;
  const { W, H, orientation } = resolveFormat(cfg);

  // Escala basada en el ancho (referencia 30 mm)
  const scale = Math.max(0.6, Math.min(2.2, W / 30));
  const PAD_X = 1.2 * scale;
  const PAD_Y = 1.2 * scale;
  const innerW = W - PAD_X * 2;

  // Fuentes derivadas
  const F_TITLE = 7 * scale;
  const F_SUB   = 5 * scale;
  const F_BODY  = 5.5 * scale;
  const F_TOTAL = 7 * scale;
  const LH      = 1.8 * scale;

  const doc = new jsPDF({ unit: 'mm', format: [W, H], orientation });
  doc.setFont('helvetica', 'normal');

  let y = PAD_Y + 1.6 * scale;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(F_TITLE);
  doc.text(COMPANY.nombre, W / 2, y, { align: 'center' }); y += LH + 0.6 * scale;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(F_SUB);
  doc.text(COMPANY.nit, W / 2, y, { align: 'center' }); y += LH;

  doc.setLineDashPattern([0.4, 0.4], 0);
  doc.line(PAD_X, y, W - PAD_X, y); y += LH;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(F_TITLE);
  doc.text(clipText(doc, data.numero, innerW), W / 2, y, { align: 'center' }); y += LH + 0.4 * scale;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(F_SUB);
  doc.text(fmtFecha(data.fecha), W / 2, y, { align: 'center' }); y += LH;

  if (data.paciente) {
    doc.setFontSize(F_BODY);
    doc.text(clipText(doc, 'Pac: ' + data.paciente, innerW), PAD_X, y); y += LH;
  }

  doc.line(PAD_X, y, W - PAD_X, y); y += LH;

  doc.setFontSize(F_BODY);
  const colQ = PAD_X, colD = PAD_X + 3 * scale, colV = W - PAD_X;
  const descMaxW = colV - colD - 4 * scale;
  const footerReserve = 12 * scale;
  for (const i of data.items) {
    if (y > H - footerReserve) break;
    const cant = String(i.cantidad || 1);
    const desc = clipText(doc, i.descripcion, descMaxW);
    const val = fmtCOP(i.precio * (i.cantidad || 1));
    doc.text(cant, colQ, y);
    doc.text(desc, colD, y);
    doc.text(val, colV, y, { align: 'right' });
    y += LH;
  }

  doc.line(PAD_X, y, W - PAD_X, y); y += LH;

  const sub = data.subtotal ?? data.items.reduce((s, i) => s + i.precio * (i.cantidad || 1), 0);
  doc.setFontSize(F_BODY);
  doc.text('Subtotal', PAD_X, y);
  doc.text(fmtCOP(sub), W - PAD_X, y, { align: 'right' }); y += LH;
  if (data.descuento) {
    doc.text('Desc', PAD_X, y);
    doc.text('-' + fmtCOP(data.descuento), W - PAD_X, y, { align: 'right' }); y += LH;
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(F_TOTAL);
  doc.text('TOTAL', PAD_X, y);
  doc.text(fmtCOP(data.total), W - PAD_X, y, { align: 'right' }); y += LH + 0.4 * scale;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(F_BODY);
  if (data.abonado != null) {
    doc.text('Abono', PAD_X, y);
    doc.text(fmtCOP(data.abonado), W - PAD_X, y, { align: 'right' }); y += LH;
  }
  if (data.saldo != null) {
    doc.setFont('helvetica', 'bold');
    doc.text('Saldo', PAD_X, y);
    doc.text(fmtCOP(data.saldo), W - PAD_X, y, { align: 'right' }); y += LH;
    doc.setFont('helvetica', 'normal');
  }

  doc.setFontSize(F_SUB);
  doc.text('¡Gracias!', W / 2, H - PAD_Y, { align: 'center' });

  openPdfPrint(doc, data.numero);
};

// ───────────────────────────────────────────────────────────────────────────
// ETIQUETA con QR (configurable, default 60 × 40 mm)
// ───────────────────────────────────────────────────────────────────────────

export interface LabelData {
  numero: string;
  qrSvg: string;
  paciente?: string;
  descripcion?: string;
  laboratorio?: string;
  numeroMontura?: string;
}

const svgToPngDataUrl = (svg: string, sizePx: number): Promise<string> =>
  new Promise((resolve, reject) => {
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = sizePx; c.height = sizePx;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, sizePx, sizePx);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, sizePx, sizePx);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });

export const printThermalLabel = async (data: LabelData) => {
  const cfg = loadPrintSettings().label;
  const { W, H, orientation } = resolveFormat(cfg);

  // En jsPDF con orientation 'landscape', el page width efectivo es H y el height es W.
  // Para simplificar, reasignamos a variables "página":
  const pageW = orientation === 'landscape' ? Math.max(W, H) : Math.min(W, H);
  const pageH = orientation === 'landscape' ? Math.min(W, H) : Math.max(W, H);

  const PAD = Math.max(1, Math.min(pageW, pageH) * 0.04);

  // QR ocupa hasta el alto disponible (cuadrado), con tope en 60% del ancho
  const qrSize = Math.min(pageH - PAD * 2, pageW * 0.55);

  const doc = new jsPDF({ unit: 'mm', format: [W, H], orientation });
  doc.setFont('helvetica', 'normal');

  // Decide layout: si pageW >= pageH * 1.3 → QR a la izquierda y texto a la derecha.
  // En caso contrario (cuadrado / vertical) → QR arriba y texto debajo.
  const horizontal = pageW >= pageH * 1.2;

  if (horizontal) {
    try {
      const pngUrl = await svgToPngDataUrl(data.qrSvg, Math.round(qrSize * 12));
      doc.addImage(pngUrl, 'PNG', PAD, (pageH - qrSize) / 2, qrSize, qrSize, undefined, 'FAST');
    } catch {/* ignora QR si falla */}

    const xT = PAD + qrSize + PAD;
    const innerW = pageW - xT - PAD;
    const fScale = Math.max(0.6, Math.min(1.8, innerW / 22));
    let y = PAD + 2.4 * fScale;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(10 * fScale);
    doc.text(clipText(doc, data.numero, innerW), xT, y); y += 4 * fScale;

    if (data.paciente) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7 * fScale);
      doc.text(clipText(doc, data.paciente, innerW), xT, y); y += 3 * fScale;
    }
    if (data.descripcion) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5 * fScale);
      doc.text(clipText(doc, data.descripcion, innerW), xT, y); y += 2.8 * fScale;
    }
    if (data.numeroMontura) {
      doc.setFontSize(6.5 * fScale);
      doc.text(clipText(doc, 'M: ' + data.numeroMontura, innerW), xT, y); y += 2.8 * fScale;
    }
    if (data.laboratorio) {
      doc.setFontSize(6 * fScale);
      doc.text(clipText(doc, data.laboratorio, innerW), xT, pageH - PAD);
    }
  } else {
    // Layout vertical: QR arriba, texto debajo
    const qr = Math.min(pageW - PAD * 2, pageH * 0.55);
    try {
      const pngUrl = await svgToPngDataUrl(data.qrSvg, Math.round(qr * 12));
      doc.addImage(pngUrl, 'PNG', (pageW - qr) / 2, PAD, qr, qr, undefined, 'FAST');
    } catch {/* ignora QR si falla */}

    const fScale = Math.max(0.6, Math.min(1.8, pageW / 30));
    let y = PAD + qr + 3 * fScale;
    const innerW = pageW - PAD * 2;

    doc.setFont('helvetica', 'bold'); doc.setFontSize(9 * fScale);
    doc.text(clipText(doc, data.numero, innerW), pageW / 2, y, { align: 'center' }); y += 3.4 * fScale;

    if (data.paciente) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5 * fScale);
      doc.text(clipText(doc, data.paciente, innerW), pageW / 2, y, { align: 'center' }); y += 2.8 * fScale;
    }
    if (data.descripcion) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6 * fScale);
      doc.text(clipText(doc, data.descripcion, innerW), pageW / 2, y, { align: 'center' }); y += 2.6 * fScale;
    }
    if (data.numeroMontura) {
      doc.setFontSize(6 * fScale);
      doc.text(clipText(doc, 'M: ' + data.numeroMontura, innerW), pageW / 2, y, { align: 'center' }); y += 2.6 * fScale;
    }
    if (data.laboratorio) {
      doc.setFontSize(5.5 * fScale);
      doc.text(clipText(doc, data.laboratorio, innerW), pageW / 2, pageH - PAD, { align: 'center' });
    }
  }

  openPdfPrint(doc, `Etiqueta ${data.numero}`);
};
