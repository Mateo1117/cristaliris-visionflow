import { useState } from 'react';
import type { EstadoProducto, OrdenProducto } from '@/types';
import { KanbanCard } from './KanbanCard';
import { Badge } from '@/components/ui/badge';
import { UserRound } from 'lucide-react';

interface KanbanColumnProps {
  estado: EstadoProducto;
  label: string;
  /** Clase del punto de color de la etapa. */
  colorPunto?: string;
  responsable?: string | null;
  oculta?: boolean;
  items: OrdenProducto[];
  onCardClick: (item: OrdenProducto) => void;
  onDrop: (itemId: string, oldState: string, newState: EstadoProducto) => void;
}

export function KanbanColumn({ estado, label, colorPunto, responsable, oculta, items, onCardClick, onDrop }: KanbanColumnProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'));
      if (data.estado_actual !== estado) {
        onDrop(data.id, data.estado_actual, estado);
      }
    } catch { /* arrastre que no es una tarjeta */ }
  };

  return (
    <div
      className={`w-[250px] flex-shrink-0 rounded-lg p-2 transition-colors ${dragOver ? 'bg-primary/10 ring-2 ring-primary/30' : 'bg-muted/50'}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="mb-2 px-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 min-w-0">
            {colorPunto && <span className={`h-2 w-2 rounded-full shrink-0 ${colorPunto}`} />}
            <span className="truncate">{label}</span>
          </h3>
          <Badge variant="secondary" className="h-5 text-[10px] shrink-0">{items.length}</Badge>
        </div>
        {(responsable || oculta) && (
          <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
            {oculta ? 'Etapa oculta (tiene trabajos)' : <><UserRound className="h-3 w-3" />{responsable}</>}
          </p>
        )}
      </div>
      <div className="space-y-2 min-h-[100px]">
        {items.map((item) => (
          <KanbanCard key={item.id} item={item} onClick={() => onCardClick(item)} />
        ))}
      </div>
    </div>
  );
}
