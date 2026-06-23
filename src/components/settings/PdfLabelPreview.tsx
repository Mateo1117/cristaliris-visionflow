/**
 * Vista previa "tal cual saldrá impreso" — aplica EXACTAMENTE la misma lógica
 * de rotación que `printThermalLabel` (src/lib/printing/thermal.ts).
 *
 * - `orientation` = orientación FINAL del papel.
 * - `rotateContent` = compensación driver térmico (gira el contenido 90° más
 *   sin cambiar el papel).
 */
import { Card } from '@/components/ui/card';
import {
  type LabelLayout,
  FIELD_LABELS,
  SAMPLE_VALUES,
  buildDefaultLayout,
} from '@/lib/printing/labelLayout';
import type { Orientation } from '@/lib/printing/printSettings';
import { LABEL_PADDING_MM } from '@/lib/printing/thermal';

interface Props {
  widthMm: number;
  heightMm: number;
  orientation: Orientation;
  rotateContent?: boolean;
  layout: LabelLayout;
  /** Calibración por dispositivo: margen interno (sobreescribe el padding por defecto). */
  marginMm?: number;
  /** Calibración: desplazamiento horizontal en mm. */
  offsetXMm?: number;
  /** Calibración: desplazamiento vertical en mm. */
  offsetYMm?: number;
}

const layoutFits = (layout: LabelLayout, widthMm: number, heightMm: number): boolean => {
  return layout.elements.every((el) => {
    const h = el.field === 'qr' ? el.wMm : Math.max(2, el.fontSize * 0.5);
    return el.xMm >= 0 && el.yMm >= 0 && el.xMm + el.wMm <= widthMm + 0.5 && el.yMm + h <= heightMm + 0.5;
  });
};

export function PdfLabelPreview({ widthMm, heightMm, orientation, rotateContent, layout, marginMm, offsetXMm = 0, offsetYMm = 0 }: Props) {
  const pageW = Math.max(10, widthMm);
  const pageH = Math.max(10, heightMm);

  // ─── Misma lógica que printThermalLabel ────────────────────────────────
  const longSide = Math.max(pageW, pageH);
  const shortSide = Math.min(pageW, pageH);
  const contentW = orientation === 'landscape' ? longSide : shortSide;
  const contentH = orientation === 'landscape' ? shortSide : longSide;
  const samePhysicalDirection = Math.abs(contentW - pageW) < 0.01 && Math.abs(contentH - pageH) < 0.01;
  let rot: 0 | 90 | 180 | 270 = samePhysicalDirection ? 0 : 90;
  if (rotateContent) rot = ((rot + 90) % 360) as 0 | 90 | 180 | 270;

  const swap = rot === 90 || rot === 270;

  // Escala visual: limitar el lado mayor a 260px
  const MAX_PX = 260;
  const scale = MAX_PX / Math.max(pageW, pageH);
  const pagePxW = pageW * scale;
  const pagePxH = pageH * scale;

  // Padding interno (idéntico al PDF real) — usa calibración si está definida.
  const pad = typeof marginMm === 'number' ? marginMm : LABEL_PADDING_MM;
  const padPx = pad * scale;
  const innerPxW = Math.max(1, pagePxW - padPx * 2);
  const innerPxH = Math.max(1, pagePxH - padPx * 2);

  // Renderizamos el diseño pre-rotación y lo encajamos centrado dentro del
  // papel físico fijo, igual que `composeFixedPaperCanvas` en thermal.ts.
  const pxPerMm = scale;
  const designPxW = contentW * pxPerMm;
  const designPxH = contentH * pxPerMm;
  const rotatedPxW = swap ? designPxH : designPxW;
  const rotatedPxH = swap ? designPxW : designPxH;
  const fit = Math.min(innerPxW / rotatedPxW, innerPxH / rotatedPxH);
  const centerX = padPx + innerPxW / 2 + offsetXMm * scale;
  const centerY = padPx + innerPxH / 2 + offsetYMm * scale;
  const previewLayout = layoutFits(layout, contentW, contentH) ? layout : buildDefaultLayout(contentW, contentH);

  const pdfOrientation: 'portrait' | 'landscape' = pageW >= pageH ? 'landscape' : 'portrait';

  return (
    <Card className="p-3">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-sm font-medium">Vista previa del PDF</div>
        <div className="text-[10px] text-muted-foreground">
          {pageW} × {pageH} mm fijo · {pdfOrientation === 'portrait' ? 'vertical' : 'horizontal'}
          {rot ? ` · contenido girado ${rot}°` : ''} · padding {pad} mm
        </div>
      </div>

      <div className="flex items-center justify-center bg-muted/30 rounded p-4">
        {/* "Hoja" PDF a escala — bordes del papel */}
        <div
          className="relative bg-white border border-border shadow-md"
          style={{ width: pagePxW, height: pagePxH }}
        >
          {/* Guía visual del área interior (padding) */}
          <div
            className="absolute border border-dashed border-muted-foreground/30 pointer-events-none"
            style={{ left: padPx, top: padPx, width: innerPxW, height: innerPxH }}
          />
          {/* Capa de diseño: tamaño natural dW×dH, rotada y centrada en el área interior */}
          <div
            className="absolute"
            style={{
              width: designPxW,
              height: designPxH,
              left: centerX - designPxW / 2,
              top: centerY - designPxH / 2,
              transform: `rotate(${rot}deg) scale(${fit})`,
              transformOrigin: 'center center',
            }}
          >
            {previewLayout.elements.map(el => {
              const isQr = el.field === 'qr';
              const w = el.wMm * pxPerMm;
              const h = (isQr ? el.wMm : Math.max(2, el.fontSize * 0.5)) * pxPerMm;
              const label = isQr ? '' : (SAMPLE_VALUES[el.field] || FIELD_LABELS[el.field]);
              return (
                <div
                  key={el.id}
                  className={[
                    'absolute flex items-center overflow-hidden text-black',
                    isQr ? 'bg-black' : '',
                  ].join(' ')}
                  style={{
                    left: el.xMm * pxPerMm,
                    top: el.yMm * pxPerMm,
                    width: w,
                    height: h,
                    fontSize: isQr ? 0 : Math.max(5, el.fontSize * pxPerMm * 0.32),
                    fontWeight: el.bold ? 700 : 400,
                    justifyContent:
                      isQr ? 'center'
                      : el.align === 'center' ? 'center'
                      : el.align === 'right' ? 'flex-end' : 'flex-start',
                    lineHeight: 1,
                  }}
                >
                  {isQr ? (
                    <QrMock />
                  ) : (
                    <span className="truncate whitespace-nowrap px-[1px]">
                      {(el.prefix || '') + label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground mt-2">
        Esto refleja exactamente cómo se enviará a la impresora con los ajustes actuales
        (orientación y "Rotar 90°"). Cambia esos parámetros arriba para ver el resultado.
      </p>
    </Card>
  );
}

/** Mock visual de un QR (cuadrícula 5×5) — sólo para previsualización. */
function QrMock() {
  const pattern = [
    [1,1,1,0,1],
    [1,0,1,0,1],
    [1,1,1,0,0],
    [0,0,1,1,1],
    [1,1,0,1,1],
  ];
  return (
    <div className="w-full h-full grid grid-cols-5 grid-rows-5 p-[6%]">
      {pattern.flat().map((v, i) => (
        <div key={i} className={v ? 'bg-white' : 'bg-black'} />
      ))}
    </div>
  );
}
