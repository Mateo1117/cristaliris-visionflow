/**
 * Thermal printer integration — Jaltech POS JAL-838L (2-en-1)
 *
 * Genera PDFs con el tamaño EXACTO del medio (mm) usando jsPDF.
 * Así el driver de la impresora recibe la página en sus dimensiones
 * reales y no escala/recorta el contenido (problema típico con @page
 * + window.print, donde el navegador aplica márgenes y reescalado).
 *
 * Formatos soportados:
 *  - Ticket térmico 30 × 50 mm
 *  - Etiqueta 60 × 40 mm con QR
 */

import { jsPDF } from 'jspdf';

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

/** Abre el PDF en una ventana nueva e invoca el diálogo de impresión. */
const openPdfPrint = (doc: jsPDF, title: string) => {
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank', 'width=420,height=640');
  if (!w) {
    // Fallback: descarga
    const a = document.createElement('a');
    a.href = url; a.download = `${title}.pdf`; a.click();
    return;
  }
  w.addEventListener('load', () => {
    setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 250);
  });
};

// Helpers de texto con clip horizontal a un ancho máximo (mm)
const clipText = (doc: jsPDF, txt: string, maxW: number): string => {
  if (!txt) return '';
  if (doc.getTextWidth(txt) <= maxW) return txt;
  let t = txt;
  while (t.length > 1 && doc.getTextWidth(t + '…') > maxW) t = t.slice(0, -1);
  return t + '…';
};

// ───────────────────────────────────────────────────────────────────────────
// TICKET 30 × 50 mm
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
  const W = 30, H = 50;            // mm
  const PAD_X = 1.2, PAD_Y = 1.2;  // mm
  const innerW = W - PAD_X * 2;

  const doc = new jsPDF({ unit: 'mm', format: [W, H], orientation: 'portrait' });
  doc.setFont('helvetica', 'normal');

  let y = PAD_Y + 1.6;

  // Cabecera
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
  doc.text(COMPANY.nombre, W / 2, y, { align: 'center' }); y += 2.4;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5);
  doc.text(COMPANY.nit, W / 2, y, { align: 'center' }); y += 1.8;

  // Línea
  doc.setLineDashPattern([0.4, 0.4], 0);
  doc.line(PAD_X, y, W - PAD_X, y); y += 1.8;

  // Número y fecha
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
  doc.text(clipText(doc, data.numero, innerW), W / 2, y, { align: 'center' }); y += 2.2;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5);
  doc.text(fmtFecha(data.fecha), W / 2, y, { align: 'center' }); y += 1.8;

  // Paciente
  if (data.paciente) {
    doc.setFontSize(5.5);
    doc.text(clipText(doc, 'Pac: ' + data.paciente, innerW), PAD_X, y); y += 1.8;
  }

  doc.line(PAD_X, y, W - PAD_X, y); y += 1.6;

  // Ítems
  doc.setFontSize(5.5);
  const colQ = PAD_X, colD = PAD_X + 3, colV = W - PAD_X;
  const descMaxW = colV - colD - 4;
  for (const i of data.items) {
    if (y > H - 12) break; // protege el footer
    const cant = String(i.cantidad || 1);
    const desc = clipText(doc, i.descripcion, descMaxW);
    const val = fmtCOP(i.precio * (i.cantidad || 1));
    doc.text(cant, colQ, y);
    doc.text(desc, colD, y);
    doc.text(val, colV, y, { align: 'right' });
    y += 1.8;
  }

  doc.line(PAD_X, y, W - PAD_X, y); y += 1.8;

  // Totales
  const sub = data.subtotal ?? data.items.reduce((s, i) => s + i.precio * (i.cantidad || 1), 0);
  doc.setFontSize(5.5);
  doc.text('Subtotal', PAD_X, y);
  doc.text(fmtCOP(sub), W - PAD_X, y, { align: 'right' }); y += 1.8;
  if (data.descuento) {
    doc.text('Desc', PAD_X, y);
    doc.text('-' + fmtCOP(data.descuento), W - PAD_X, y, { align: 'right' }); y += 1.8;
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
  doc.text('TOTAL', PAD_X, y);
  doc.text(fmtCOP(data.total), W - PAD_X, y, { align: 'right' }); y += 2.2;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5);
  if (data.abonado != null) {
    doc.text('Abono', PAD_X, y);
    doc.text(fmtCOP(data.abonado), W - PAD_X, y, { align: 'right' }); y += 1.8;
  }
  if (data.saldo != null) {
    doc.setFont('helvetica', 'bold');
    doc.text('Saldo', PAD_X, y);
    doc.text(fmtCOP(data.saldo), W - PAD_X, y, { align: 'right' }); y += 1.8;
    doc.setFont('helvetica', 'normal');
  }

  // Footer
  doc.setFontSize(5);
  doc.text('¡Gracias!', W / 2, H - PAD_Y, { align: 'center' });

  openPdfPrint(doc, data.numero);
};

// ───────────────────────────────────────────────────────────────────────────
// ETIQUETA 60 × 40 mm con QR (modo etiqueta JAL-838L)
// ───────────────────────────────────────────────────────────────────────────

export interface LabelData {
  numero: string;
  qrSvg: string;          // outerHTML <svg> de qrcode.react
  paciente?: string;
  descripcion?: string;
  laboratorio?: string;
  numeroMontura?: string;
}

/** Convierte SVG string a PNG dataURL del tamaño en px solicitado. */
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
  const W = 60, H = 40;
  const PAD = 1.5;
  const doc = new jsPDF({ unit: 'mm', format: [W, H], orientation: 'landscape' });
  doc.setFont('helvetica', 'normal');

  // QR a la izquierda (cuadrado, 32 mm)
  const qrSize = 32;
  // 203 dpi → 8 px/mm → 256 px para 32 mm. Generamos 384 (~12 px/mm) para nitidez.
  try {
    const pngUrl = await svgToPngDataUrl(data.qrSvg, 384);
    doc.addImage(pngUrl, 'PNG', PAD, (H - qrSize) / 2, qrSize, qrSize, undefined, 'FAST');
  } catch {/* ignora QR si falla */}

  // Texto a la derecha
  const xT = PAD + qrSize + 2;
  const innerW = W - xT - PAD;
  let y = PAD + 3;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.text(clipText(doc, data.numero, innerW), xT, y); y += 4;

  if (data.paciente) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7);
    doc.text(clipText(doc, data.paciente, innerW), xT, y); y += 3;
  }
  if (data.descripcion) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
    doc.text(clipText(doc, data.descripcion, innerW), xT, y); y += 2.8;
  }
  if (data.numeroMontura) {
    doc.setFontSize(6.5);
    doc.text(clipText(doc, 'M: ' + data.numeroMontura, innerW), xT, y); y += 2.8;
  }
  if (data.laboratorio) {
    doc.setFontSize(6);
    doc.text(clipText(doc, data.laboratorio, innerW), xT, H - PAD);
  }

  openPdfPrint(doc, `Etiqueta ${data.numero}`);
};
