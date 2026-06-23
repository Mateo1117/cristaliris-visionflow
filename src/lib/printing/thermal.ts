/**
 * Thermal printer integration — Jaltech POS JAL-838L (2-en-1)
 *
 * Genera PDFs con el tamaño EXACTO del medio (mm) usando jsPDF.
 * Los tamaños se leen desde printSettings (localStorage) y el layout
 * se auto-ajusta a cualquier ancho/alto configurado por el usuario.
 */

import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import {
  loadPrintSettings,
  type PrintSize,
  type Orientation,
} from './printSettings';
import { buildDefaultLayout, type LabelElement, type LabelField, type LabelLayout } from './labelLayout';

const COMPANY = {
  nombre: 'Cristal Iris',
  nit: 'NIT 900.123.456-7',
};

/** Padding interno fijo de la etiqueta (en mm), aplicado en los 4 bordes. */
export const LABEL_PADDING_MM = 1;

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
  qrSvg?: string;
  /** Contenido a codificar en el QR. Si no se envía, se usa `numero`. */
  qrPayload?: string;
  paciente?: string;
  descripcion?: string;
  laboratorio?: string;
  numeroMontura?: string;
  fechaEntrega?: string | Date;
  sede?: string;
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

/** Resuelve el texto a imprimir para un campo del layout. */
const fieldValue = (field: LabelField, data: LabelData, customText?: string): string => {
  switch (field) {
    case 'numero':        return data.numero || '';
    case 'paciente':      return data.paciente || '';
    case 'descripcion':   return data.descripcion || '';
    case 'laboratorio':   return data.laboratorio || '';
    case 'numeroMontura': return data.numeroMontura || '';
    case 'fechaEntrega':
      if (!data.fechaEntrega) return '';
      try {
        const d = data.fechaEntrega instanceof Date ? data.fechaEntrega : new Date(data.fechaEntrega);
        return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' });
      } catch { return ''; }
    case 'sede':          return data.sede || '';
    case 'custom':        return customText || '';
    default:              return '';
  }
};

/** Carga una imagen y resuelve cuando esté lista. */
const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

/** Renderiza el layout completo a un canvas (en pixeles) con el tamaño de diseño. */
const renderLayoutToCanvas = async (
  layout: LabelLayout,
  data: LabelData,
  designWmm: number,
  designHmm: number,
  pxPerMm: number,
): Promise<HTMLCanvasElement> => {
  const W = Math.max(1, Math.round(designWmm * pxPerMm));
  const H = Math.max(1, Math.round(designHmm * pxPerMm));
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000000';

  // 1 pt = 1/72 inch ; 1 inch = 25.4 mm  →  1 pt = (pxPerMm * 25.4 / 72) px
  const ptToPx = (pt: number) => pt * pxPerMm * 25.4 / 72;

  for (const el of layout.elements) {
    if (el.field === 'qr') {
      try {
        const sidePx = Math.max(64, Math.round(el.wMm * pxPerMm));
        const pngUrl = await QRCode.toDataURL(data.qrPayload || data.numero || ' ', {
          errorCorrectionLevel: 'M',
          margin: 0,
          width: sidePx,
          color: { dark: '#000000', light: '#FFFFFF' },
        });
        const img = await loadImage(pngUrl);
        ctx.drawImage(img, el.xMm * pxPerMm, el.yMm * pxPerMm, el.wMm * pxPerMm, el.wMm * pxPerMm);
      } catch (e) {
        console.error('QR render failed', e);
      }
      continue;
    }

    const raw = fieldValue(el.field, data, el.text);
    if (!raw) continue;
    const txt = (el.prefix || '') + raw;

    const fontPx = ptToPx(Math.max(4, el.fontSize));
    ctx.font = `${el.bold ? 'bold ' : ''}${fontPx}px Helvetica, Arial, sans-serif`;
    ctx.textBaseline = 'top';
    const align = el.align || 'left';
    ctx.textAlign = align as CanvasTextAlign;
    const maxWpx = Math.max(4, el.wMm * pxPerMm);

    // Clip con elipsis
    let display = txt;
    if (ctx.measureText(display).width > maxWpx) {
      while (display.length > 1 && ctx.measureText(display + '…').width > maxWpx) {
        display = display.slice(0, -1);
      }
      display = display + '…';
    }

    let x = el.xMm * pxPerMm;
    if (align === 'center') x += maxWpx / 2;
    else if (align === 'right') x += maxWpx;
    ctx.fillText(display, x, el.yMm * pxPerMm);
  }

  return canvas;
};

/** Rota un canvas 90/180/270 grados y devuelve uno nuevo. */
const rotateCanvas = (src: HTMLCanvasElement, deg: 0 | 90 | 180 | 270): HTMLCanvasElement => {
  if (deg === 0) return src;
  const out = document.createElement('canvas');
  if (deg === 180) { out.width = src.width; out.height = src.height; }
  else { out.width = src.height; out.height = src.width; }
  const c = out.getContext('2d')!;
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, out.width, out.height);
  c.save();
  if (deg === 90)  { c.translate(out.width, 0); c.rotate(Math.PI / 2); }
  if (deg === 180) { c.translate(out.width, out.height); c.rotate(Math.PI); }
  if (deg === 270) { c.translate(0, out.height); c.rotate(-Math.PI / 2); }
  c.drawImage(src, 0, 0);
  c.restore();
  return out;
};

/**
 * Compone la imagen final dentro del papel FÍSICO configurado.
 * Importante: no cambiamos el tamaño @page al rotar, porque muchos drivers
 * térmicos vuelven a rotar/escalar cuando reciben 50×30 en vez de 30×50.
 */
const composeFixedPaperCanvas = (
  content: HTMLCanvasElement,
  paperWmm: number,
  paperHmm: number,
  padMm: number,
  pxPerMm: number,
): HTMLCanvasElement => {
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(paperWmm * pxPerMm));
  out.height = Math.max(1, Math.round(paperHmm * pxPerMm));

  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.imageSmoothingEnabled = false;

  const padPx = Math.max(0, Math.round(padMm * pxPerMm));
  const innerW = Math.max(1, out.width - padPx * 2);
  const innerH = Math.max(1, out.height - padPx * 2);
  const fit = Math.min(innerW / content.width, innerH / content.height);
  const drawW = Math.max(1, Math.round(content.width * fit));
  const drawH = Math.max(1, Math.round(content.height * fit));
  const x = padPx + Math.round((innerW - drawW) / 2);
  const y = padPx + Math.round((innerH - drawH) / 2);

  ctx.drawImage(content, x, y, drawW, drawH);
  return out;
};

export const printThermalLabel = async (data: LabelData) => {
  const settings = loadPrintSettings();
  const cfg = settings.label;

  // Dimensiones de DISEÑO (las que el usuario configuró en el diseñador).
  const dW = Math.max(10, cfg.widthMm);
  const dH = Math.max(10, cfg.heightMm);

  const layout: LabelLayout = settings.labelLayout && settings.labelLayout.elements?.length
    ? settings.labelLayout
    : buildDefaultLayout(dW, dH);

  // Lógica de rotación:
  //  - `orientation` indica la orientación FINAL del papel impreso. Si el
  //     aspecto del diseño no coincide, se rota 90°.
  //  - `rotateContent` suma otros 90° (compensación driver térmico).
  const designIsPortrait = dH >= dW;
  const wantPortrait = cfg.orientation !== 'landscape';
  let rot: 0 | 90 | 180 | 270 = (designIsPortrait === wantPortrait) ? 0 : 90;
  if (cfg.rotateContent) rot = ((rot + 90) % 360) as 0 | 90 | 180 | 270;

  const pad = LABEL_PADDING_MM;

  // Render del layout a raster, rotación y envío al print HTML.
  // El @page conserva SIEMPRE el tamaño físico configurado (ej. 30×50).
  const PX_PER_MM = 12;
  const designCanvas = await renderLayoutToCanvas(layout, data, dW, dH, PX_PER_MM);
  const rotatedContent = rotateCanvas(designCanvas, rot);
  const finalCanvas = composeFixedPaperCanvas(rotatedContent, dW, dH, pad, PX_PER_MM);
  const imgDataUrl = finalCanvas.toDataURL('image/png');
  openHtmlPrint(imgDataUrl, dW, dH, `Etiqueta ${data.numero}`);
};

/**
 * Abre una ventana HTML con `@page` configurado al tamaño EXACTO de la etiqueta
 * y dispara `window.print()`. Esto evita que el driver escale a Letter/A4.
 */
const openHtmlPrint = (
  imgDataUrl: string,
  pageW: number,
  pageH: number,
  title: string,
) => {
  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) return;
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  @page { size: ${pageW}mm ${pageH}mm; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { width: ${pageW}mm; height: ${pageH}mm; }
  .label {
    position: relative;
    width: ${pageW}mm;
    height: ${pageH}mm;
    overflow: hidden;
    page-break-after: avoid;
  }
  .label img {
    display: block;
    width: ${pageW}mm;
    height: ${pageH}mm;
    image-rendering: pixelated;
  }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
  <div class="label"><img src="${imgDataUrl}" alt="" /></div>
  <script>
    window.addEventListener('load', function () {
      var img = document.querySelector('img');
      var go = function () { try { window.focus(); window.print(); } catch(e){} };
      if (img && !img.complete) { img.addEventListener('load', function(){ setTimeout(go, 80); }); }
      else { setTimeout(go, 80); }
    });
  </script>
</body>
</html>`;
  w.document.open();
  w.document.write(html);
  w.document.close();
};

