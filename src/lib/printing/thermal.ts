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
import {
  buildDefaultLayout,
  clampLayout,
  elementHeightMm,
  scaleLayout,
  type LabelElement,
  type LabelField,
  type LabelLayout,
} from './labelLayout';
import { loadLabelCalibration } from './calibration';

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

  // Igual que las etiquetas: se imprime desde un iframe oculto para que el
  // bloqueador de ventanas emergentes no impida la impresión.
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  iframe.src = url;
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      // Si el visor PDF embebido no deja imprimir, se descarga el archivo.
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title}.pdf`;
      a.click();
    } finally {
      window.setTimeout(() => {
        iframe.remove();
        URL.revokeObjectURL(url);
      }, 60000);
    }
  };
  document.body.appendChild(iframe);
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
  /** Tipo de lente / descripción del producto. */
  descripcion?: string;
  laboratorio?: string;
  /** Número con el que el laboratorio identifica la orden. */
  numeroOrdenLab?: string;
  numeroMontura?: string;
  fechaEntrega?: string | Date;
  sede?: string;
  formula?: string;
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
    case 'optica':          return COMPANY.nombre;
    case 'numero':          return data.numero || '';
    case 'paciente':        return data.paciente || '';
    case 'descripcion':     return data.descripcion || '';
    case 'laboratorio':     return data.laboratorio || '';
    case 'numeroOrdenLab':  return data.numeroOrdenLab || '';
    case 'numeroMontura':   return data.numeroMontura || '';
    case 'fechaEntrega':
      if (!data.fechaEntrega) return '';
      try {
        const d = data.fechaEntrega instanceof Date ? data.fechaEntrega : new Date(data.fechaEntrega);
        return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' });
      } catch { return ''; }
    case 'sede':          return data.sede || '';
    case 'formula':       return data.formula || '';
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

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Genera el QR como SVG de rectángulos SÓLIDOS con coordenadas enteras.
 *
 * El SVG que produce la librería dibuja el código con trazos (`stroke`)
 * centrados en medio píxel; al rasterizarlo una impresora térmica de 203 ppp
 * cada módulo cae a caballo entre dos puntos y se difumina en gris. Con
 * rectángulos rellenos alineados a la rejilla, y `shape-rendering="crispEdges"`,
 * cada módulo queda negro pleno.
 */
const qrToSvg = (texto: string): string => {
  const qr = QRCode.create(texto, { errorCorrectionLevel: 'M' });
  const size: number = (qr.modules as any).size;
  const data: Uint8Array = (qr.modules as any).data;

  const rects: string[] = [];
  for (let fila = 0; fila < size; fila++) {
    // Se agrupan los módulos contiguos de cada fila en un solo rectángulo:
    // menos nodos y sin junturas visibles entre celdas.
    let inicio = -1;
    for (let col = 0; col <= size; col++) {
      const activo = col < size && !!data[fila * size + col];
      if (activo && inicio === -1) inicio = col;
      if (!activo && inicio !== -1) {
        rects.push(`<rect x="${inicio}" y="${fila}" width="${col - inicio}" height="1"/>`);
        inicio = -1;
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
    `preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges" width="100%" height="100%">` +
    `<rect width="${size}" height="${size}" fill="#fff"/>` +
    `<g fill="#000">${rects.join('')}</g></svg>`
  );
};

/**
 * Renderiza el diseño como HTML VECTORIAL (texto real + QR en SVG).
 *
 * Antes la etiqueta se generaba como una imagen de mapa de bits y el
 * controlador la reescalaba a los 203 ppp de la impresora, lo que la dejaba
 * borrosa. Con texto y SVG, el controlador rasteriza a la resolución nativa y
 * los trazos salen nítidos.
 */
const renderLayoutToHtml = async (
  layout: LabelLayout,
  data: LabelData,
  designWmm: number,
  designHmm: number,
): Promise<string> => {
  const partes: string[] = [];

  for (const el of layout.elements) {
    if (el.field === 'qr') {
      let qrSvg = '';
      try {
        qrSvg = qrToSvg(data.qrPayload || data.numero || ' ');
      } catch (e) {
        console.error('QR render failed', e);
        continue;
      }
      partes.push(
        `<div class="el qr" style="left:${el.xMm}mm;top:${el.yMm}mm;width:${el.wMm}mm;height:${el.wMm}mm;">${qrSvg}</div>`,
      );
      continue;
    }

    const raw = fieldValue(el.field, data, el.text);
    if (!raw) continue;
    const txt = escapeHtml((el.prefix || '') + raw);
    const align = el.align || 'left';
    const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
    const alto = Math.max(2, el.fontSize * 0.5);

    partes.push(
      `<div class="el txt" style="left:${el.xMm}mm;top:${el.yMm}mm;width:${el.wMm}mm;height:${alto}mm;` +
      `font-size:${el.fontSize}pt;font-weight:${el.bold ? 700 : 400};justify-content:${justify};">` +
      `<span>${txt}</span></div>`,
    );
  }

  return `<div class="design" style="width:${designWmm}mm;height:${designHmm}mm;">${partes.join('')}</div>`;
};

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

const layoutFits = (layout: LabelLayout, widthMm: number, heightMm: number): boolean => {
  return layout.elements.every((el) => {
    const h = el.field === 'qr' ? el.wMm : Math.max(2, el.fontSize * 0.5);
    return el.xMm >= 0 && el.yMm >= 0 && el.xMm + el.wMm <= widthMm + 0.5 && el.yMm + h <= heightMm + 0.5;
  });
};

const resolveLabelPrint = (
  cfg: PrintSize,
  savedLayout?: LabelLayout,
): { pageW: number; pageH: number; contentW: number; contentH: number; rot: 0 | 90 | 180 | 270; layout: LabelLayout } => {
  // Ancho/alto configurados = medida física del papel tal como se carga en la
  // impresora. La ORIENTACIÓN decide cómo se coloca la página:
  //   vertical   → el lado mayor queda a lo alto
  //   horizontal → el lado mayor queda a lo ancho
  // Así el selector deja de ser decorativo: cambia de verdad la página enviada.
  const w = Math.max(10, cfg.widthMm);
  const h = Math.max(10, cfg.heightMm);
  const long = Math.max(w, h);
  const short = Math.min(w, h);
  const pageW = cfg.orientation === 'landscape' ? long : short;
  const pageH = cfg.orientation === 'landscape' ? short : long;

  const contentW = pageW;
  const contentH = pageH;
  const rot: 0 | 90 | 180 | 270 = cfg.rotateContent ? 90 : 0;

  // El diseño se conserva siempre: si no cabe tras un cambio de tamaño se
  // reescala y se encaja, en vez de descartarlo y volver al layout por defecto.
  const candidate = savedLayout?.elements?.length ? savedLayout : undefined;
  let layout: LabelLayout;
  if (!candidate) {
    layout = buildDefaultLayout(contentW, contentH);
  } else if (layoutFits(candidate, contentW, contentH)) {
    layout = candidate;
  } else {
    const bounds = layoutBounds(candidate);
    const scaled = bounds.w > 0 && bounds.h > 0
      ? scaleLayout(candidate, Math.max(bounds.w, contentW), Math.max(bounds.h, contentH), contentW, contentH)
      : candidate;
    layout = clampLayout(scaled, contentW, contentH);
  }

  return { pageW, pageH, contentW, contentH, rot, layout };
};

/** Caja envolvente del diseño (mm), para reescalar sin perder proporciones. */
const layoutBounds = (layout: LabelLayout): { w: number; h: number } => {
  let w = 0;
  let h = 0;
  for (const el of layout.elements) {
    w = Math.max(w, el.xMm + el.wMm);
    h = Math.max(h, el.yMm + elementHeightMm(el));
  }
  return { w, h };
};

export const printThermalLabel = async (data: LabelData) => {
  const settings = loadPrintSettings();
  const cfg = settings.label;
  const calib = loadLabelCalibration();

  const pad = calib.marginMm;
  const { pageW, pageH, contentW, contentH, rot, layout } = resolveLabelPrint(cfg, settings.labelLayout);

  // La página enviada mide siempre lo que mide la etiqueta: agrandarla haría
  // que el controlador encogiera todo para encajarla. El diseño se dibuja a
  // tamaño completo y la calibración sólo lo desplaza dentro de la página.
  const contenido = await renderLayoutToHtml(layout, data, contentW, contentH);
  openHtmlPrint(
    contenido, pageW, pageH, contentW, contentH, rot, pad,
    calib.offsetXMm, calib.offsetYMm, `Etiqueta ${data.numero}`,
  );
};

/**
 * Abre una ventana HTML con `@page` al tamaño físico de la etiqueta y rota
 * el contenido por CSS (transform + transform-origin) sin tocar el papel.
 *
 * La página enviada mide SIEMPRE exactamente lo que mide la etiqueta. No debe
 * agrandarse para compensar desfases mecánicos: el controlador de Windows
 * tiene fijado el tamaño del medio y encogería toda la página para encajarla,
 * con lo que el diseño saldría diminuto. El desfase se corrige moviendo el
 * contenido dentro de la propia página (calibración X/Y).
 */
const openHtmlPrint = (
  contenidoHtml: string,
  pageW: number,
  pageH: number,
  contentW: number,
  contentH: number,
  rot: 0 | 90 | 180 | 270,
  padMm: number,
  offsetXMm: number,
  offsetYMm: number,
  title: string,
) => {
  // Bounding box después de rotar el contenido.
  const bboxW = (rot === 90 || rot === 270) ? contentH : contentW;
  const bboxH = (rot === 90 || rot === 270) ? contentW : contentH;
  const innerW = Math.max(1, pageW - padMm * 2);
  const innerH = Math.max(1, pageH - padMm * 2);
  // Nunca se agranda: el diseño ya viene al tamaño de la etiqueta.
  const scale = Math.min(1, innerW / bboxW, innerH / bboxH);

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  @page { size: ${pageW}mm ${pageH}mm; margin: 0; }
  html, body {
    width: ${pageW}mm;
    height: ${pageH}mm;
    margin: 0;
    padding: 0;
    background: #fff;
    overflow: hidden;
  }
  .sheet {
    position: relative;
    width: ${pageW}mm;
    height: ${pageH}mm;
    overflow: hidden;
  }
  .label {
    box-sizing: border-box;
    position: absolute;
    left: 0;
    top: 0;
    display: block;
    width: ${pageW}mm;
    height: ${pageH}mm;
    padding: ${padMm}mm;
    overflow: hidden;
    page-break-after: avoid;
  }
  .label .content {
    position: absolute;
    left: calc(50% - ${contentW / 2}mm + ${offsetXMm}mm);
    top: calc(50% - ${contentH / 2}mm + ${offsetYMm}mm);
    width: ${contentW}mm;
    height: ${contentH}mm;
    transform-origin: center center;
    transform: rotate(${rot}deg) scale(${scale});
  }
  /* Contenido vectorial: texto real y QR en SVG (nada de mapas de bits). */
  .design { position: relative; }
  .el { position: absolute; overflow: hidden; }
  .el.qr { line-height: 0; }
  .el.qr svg { display: block; width: 100%; height: 100%; }
  .el.txt {
    display: flex;
    align-items: center;
    color: #000;
    font-family: Helvetica, Arial, sans-serif;
    line-height: 1;
    white-space: nowrap;
  }
  .el.txt span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
  <div class="sheet">
    <div class="label"><div class="content">${contenidoHtml}</div></div>
  </div>
</body>
</html>`;

  printHtmlDocument(html, title);
};

/**
 * Imprime un documento HTML sin depender de ventanas emergentes.
 *
 * Los navegadores bloquean `window.open` por defecto y antes eso hacía que la
 * impresión fallara en silencio. Ahora se imprime desde un iframe oculto (que
 * ningún bloqueador intercepta) y sólo si eso no fuera posible se recurre a una
 * ventana nueva, avisando al usuario cuando también está bloqueada.
 */
export const printHtmlDocument = (html: string, title: string): void => {
  try {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);

    const cleanup = () => {
      window.setTimeout(() => iframe.remove(), 1000);
    };

    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) { cleanup(); return; }
      const go = () => {
        try {
          win.focus();
          win.print();
        } catch {
          /* el usuario cancela o el navegador rechaza: no hay nada que reintentar */
        } finally {
          cleanup();
        }
      };
      const img = win.document.querySelector('img');
      if (img && !img.complete) {
        img.addEventListener('load', () => window.setTimeout(go, 80));
        img.addEventListener('error', () => window.setTimeout(go, 80));
      } else {
        window.setTimeout(go, 80);
      }
    };

    const doc = iframe.contentWindow?.document;
    if (!doc) throw new Error('iframe sin documento');
    doc.open();
    doc.write(html);
    doc.close();
  } catch {
    // Último recurso: ventana nueva (puede estar bloqueada por el navegador).
    const w = window.open('', '_blank', 'width=420,height=640');
    if (!w) {
      notifyPrintBlocked();
      return;
    }
    w.document.open();
    w.document.write(html + `<script>window.addEventListener('load',function(){setTimeout(function(){try{window.focus();window.print();}catch(e){}},120)});<\/script>`);
    w.document.close();
  }
};

/** Aviso visible cuando el navegador impide abrir el diálogo de impresión. */
const notifyPrintBlocked = () => {
  const msg = 'El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes para este sitio e inténtalo de nuevo.';
  try {
    window.dispatchEvent(new CustomEvent('cristaliris:print-blocked', { detail: msg }));
  } catch { /* navegadores sin CustomEvent */ }
  // eslint-disable-next-line no-alert
  window.alert(msg);
};

