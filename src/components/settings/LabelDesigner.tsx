/**
 * Diseñador visual de etiqueta — drag & drop sobre un canvas a escala (px/mm).
 * El estado vive en el padre (LabelLayout); este componente sólo edita.
 */
import { useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Plus, Trash2, Bold, AlignLeft, AlignCenter, AlignRight, QrCode, RotateCw } from 'lucide-react';
import {
  type LabelElement,
  type LabelField,
  type LabelLayout,
  FIELD_LABELS,
  SAMPLE_VALUES,
  LABEL_PX_PER_MM,
  buildDefaultLayout,
} from '@/lib/printing/labelLayout';

interface Props {
  widthMm: number;
  heightMm: number;
  layout: LabelLayout;
  onChange: (l: LabelLayout) => void;
}

const uid = () => Math.random().toString(36).slice(2, 10);

const TEXT_FIELDS: LabelField[] = ['numero', 'paciente', 'descripcion', 'laboratorio', 'numeroMontura', 'fechaEntrega', 'sede', 'custom'];

export function LabelDesigner({ widthMm, heightMm, layout, onChange }: Props) {
  const PX = LABEL_PX_PER_MM * Math.min(2, Math.max(0.8, 30 / widthMm));
  // escala adaptable: muestra al menos ~240px de ancho
  const px = Math.max(LABEL_PX_PER_MM, Math.min(20, 320 / widthMm));
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(layout.elements[0]?.id ?? null);
  const [previewRot, setPreviewRot] = useState<0 | 90 | 180 | 270>(0);
  const dragRef = useRef<{ id: string; offX: number; offY: number } | null>(null);

  const selected = layout.elements.find(e => e.id === selectedId) || null;

  const update = useCallback((id: string, patch: Partial<LabelElement>) => {
    onChange({ ...layout, elements: layout.elements.map(e => e.id === id ? { ...e, ...patch } : e) });
  }, [layout, onChange]);

  const remove = (id: string) => {
    onChange({ ...layout, elements: layout.elements.filter(e => e.id !== id) });
    if (selectedId === id) setSelectedId(null);
  };

  const addElement = (field: LabelField) => {
    const isQr = field === 'qr';
    const el: LabelElement = isQr
      ? { id: uid(), field, xMm: 2, yMm: 2, wMm: Math.min(widthMm, heightMm) * 0.45, hMm: Math.min(widthMm, heightMm) * 0.45, fontSize: 0 }
      : { id: uid(), field, xMm: 2, yMm: Math.min(heightMm - 4, 20), wMm: widthMm - 4, hMm: 4, fontSize: 6.5, align: 'center', bold: field === 'numero' || field === 'paciente' };
    onChange({ ...layout, elements: [...layout.elements, el] });
    setSelectedId(el.id);
  };

  // ─── Drag ────────────────────────────────────────────────────────────────
  // Convierte un punto de pantalla (clientX/Y) a coords px del canvas SIN rotar.
  const screenToCanvas = (cx: number, cy: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = cx - centerX;
    const dy = cy - centerY;
    const rad = (-previewRot * Math.PI) / 180;
    const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
    return { x: lx + (widthMm * px) / 2, y: ly + (heightMm * px) / 2 };
  };

  const onPointerDown = (e: React.PointerEvent, el: LabelElement) => {
    if (!canvasRef.current) return;
    e.stopPropagation();
    setSelectedId(el.id);
    const p = screenToCanvas(e.clientX, e.clientY);
    const offX = p.x - el.xMm * px;
    const offY = p.y - el.yMm * px;
    dragRef.current = { id: el.id, offX, offY };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !canvasRef.current) return;
    const { id, offX, offY } = dragRef.current;
    const el = layout.elements.find(x => x.id === id);
    if (!el) return;
    const p = screenToCanvas(e.clientX, e.clientY);
    const xMm = Math.round(((p.x - offX) / px) * 10) / 10;
    const yMm = Math.round(((p.y - offY) / px) * 10) / 10;
    const maxW = el.field === 'qr' ? el.wMm : el.wMm;
    const elH = el.field === 'qr' ? el.wMm : Math.max(2, el.fontSize * 0.45);
    update(id, {
      xMm: Math.max(0, Math.min(widthMm - maxW, xMm)),
      yMm: Math.max(0, Math.min(heightMm - elH, yMm)),
    });
  };
  const onPointerUp = () => { dragRef.current = null; };

  // ─── Render ──────────────────────────────────────────────────────────────
  const previewW = widthMm * px;
  const previewH = heightMm * px;
  const rotated = previewRot === 90 || previewRot === 270;
  const outerW = rotated ? previewH : previewW;
  const outerH = rotated ? previewW : previewH;



  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground mr-2">Añadir:</span>
        <Button size="sm" variant="outline" type="button" onClick={() => addElement('qr')}>
          <QrCode className="h-3.5 w-3.5 mr-1" /> QR
        </Button>
        {TEXT_FIELDS.map(f => (
          <Button key={f} size="sm" variant="outline" type="button" onClick={() => addElement(f)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> {FIELD_LABELS[f]}
          </Button>
        ))}
        <Button
          size="sm"
          variant="outline"
          type="button"
          className="ml-auto"
          onClick={() => setPreviewRot(r => ((r + 90) % 360) as 0 | 90 | 180 | 270)}
          title="Girar vista previa"
        >
          <RotateCw className="h-3.5 w-3.5 mr-1" /> Girar ({previewRot}°)
        </Button>
        <Button
          size="sm"
          variant="ghost"
          type="button"
          className="text-xs"
          onClick={() => onChange(buildDefaultLayout(widthMm, heightMm))}
        >
          Restaurar diseño por defecto
        </Button>
      </div>

      <div className="grid md:grid-cols-[auto_1fr] gap-4 items-start">
        {/* Canvas */}
        <div className="space-y-1">
          <div className="text-[10px] text-muted-foreground">
            {widthMm} × {heightMm} mm · arrastra los elementos
          </div>
          <div
            ref={canvasRef}
            className="relative bg-white border-2 border-dashed border-border rounded shadow-inner select-none"
            style={{ width: previewW, height: previewH }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onClick={() => setSelectedId(null)}
          >
            {layout.elements.map(el => {
              const isSel = el.id === selectedId;
              const isQr = el.field === 'qr';
              const w = (isQr ? el.wMm : el.wMm) * px;
              const h = (isQr ? el.wMm : Math.max(2, el.fontSize * 0.5)) * px;
              const label = isQr ? 'QR' : (SAMPLE_VALUES[el.field] || FIELD_LABELS[el.field]);
              return (
                <div
                  key={el.id}
                  onPointerDown={(e) => onPointerDown(e, el)}
                  onClick={(e) => { e.stopPropagation(); setSelectedId(el.id); }}
                  className={[
                    'absolute cursor-move flex items-center overflow-hidden text-black',
                    isSel ? 'outline outline-2 outline-primary' : 'outline outline-1 outline-muted-foreground/40 hover:outline-primary/60',
                    isQr ? 'bg-black/90 text-white justify-center' : 'bg-yellow-50/70',
                  ].join(' ')}
                  style={{
                    left: el.xMm * px,
                    top: el.yMm * px,
                    width: w,
                    height: h,
                    fontSize: isQr ? 10 : Math.max(6, el.fontSize * px * 0.32),
                    fontWeight: el.bold ? 700 : 400,
                    justifyContent: isQr ? 'center' : (el.align === 'center' ? 'center' : el.align === 'right' ? 'flex-end' : 'flex-start'),
                    paddingLeft: isQr ? 0 : 1,
                    paddingRight: isQr ? 0 : 1,
                    lineHeight: 1,
                  }}
                  title={FIELD_LABELS[el.field]}
                >
                  <span className="truncate whitespace-nowrap">{(el.prefix || '') + label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Panel de propiedades */}
        <Card className="p-3 text-sm">
          {!selected ? (
            <div className="text-xs text-muted-foreground">Selecciona un elemento del lienzo para editar su posición, tamaño y formato.</div>
          ) : (
            <ElementProps el={selected} widthMm={widthMm} heightMm={heightMm} onChange={(p) => update(selected.id, p)} onRemove={() => remove(selected.id)} />
          )}
        </Card>
      </div>
    </div>
  );
}

function ElementProps({
  el, widthMm, heightMm, onChange, onRemove,
}: {
  el: LabelElement; widthMm: number; heightMm: number;
  onChange: (p: Partial<LabelElement>) => void; onRemove: () => void;
}) {
  const isQr = el.field === 'qr';
  const num = (v: string) => Number(v) || 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-medium">{FIELD_LABELS[el.field]}</div>
        <Button size="sm" variant="ghost" type="button" onClick={onRemove} className="text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">X (mm)</Label>
          <Input type="number" step="0.5" min={0} max={widthMm} value={el.xMm}
            onChange={(e) => onChange({ xMm: num(e.target.value) })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Y (mm)</Label>
          <Input type="number" step="0.5" min={0} max={heightMm} value={el.yMm}
            onChange={(e) => onChange({ yMm: num(e.target.value) })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{isQr ? 'Tamaño (mm)' : 'Ancho (mm)'}</Label>
          <Input type="number" step="0.5" min={2} max={widthMm} value={el.wMm}
            onChange={(e) => onChange({ wMm: num(e.target.value) })} />
        </div>
        {!isQr && (
          <div className="space-y-1">
            <Label className="text-xs">Tamaño fuente (pt)</Label>
            <Input type="number" step="0.5" min={4} max={24} value={el.fontSize}
              onChange={(e) => onChange({ fontSize: num(e.target.value) })} />
          </div>
        )}
      </div>

      {!isQr && (
        <>
          <div className="space-y-1">
            <Label className="text-xs">Prefijo (opcional)</Label>
            <Input value={el.prefix || ''} placeholder='Ej: "M: "'
              onChange={(e) => onChange({ prefix: e.target.value })} />
          </div>
          {el.field === 'custom' && (
            <div className="space-y-1">
              <Label className="text-xs">Texto fijo</Label>
              <Input value={el.text || ''} onChange={(e) => onChange({ text: e.target.value })} />
            </div>
          )}
          <div className="flex items-center gap-1">
            <Button size="sm" type="button" variant={el.bold ? 'default' : 'outline'} onClick={() => onChange({ bold: !el.bold })}>
              <Bold className="h-3.5 w-3.5" />
            </Button>
            <div className="mx-1 h-5 w-px bg-border" />
            {(['left', 'center', 'right'] as const).map(a => (
              <Button key={a} size="sm" type="button" variant={el.align === a ? 'default' : 'outline'} onClick={() => onChange({ align: a })}>
                {a === 'left' ? <AlignLeft className="h-3.5 w-3.5" /> : a === 'center' ? <AlignCenter className="h-3.5 w-3.5" /> : <AlignRight className="h-3.5 w-3.5" />}
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
