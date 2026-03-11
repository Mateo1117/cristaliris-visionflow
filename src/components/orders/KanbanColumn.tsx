import { useState } from 'react';
import type { EstadoProducto, OrdenProducto } from '@/types';
import { KanbanCard } from './KanbanCard';
import { Badge } from '@/components/ui/badge';

interface KanbanColumnProps {
  estado: EstadoProducto;
  label: string;
  items: OrdenProducto[];
  onCardClick: (item: OrdenProducto) => void;
  onDrop: (itemId: string, oldState: string, newState: EstadoProducto) => void;
}

export function KanbanColumn({ estado, label, items, onCardClick, onDrop }: KanbanColumnProps) {
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
    } catch {}
  };

  return (
    <div
      className={`w-[250px] flex-shrink-0 rounded-lg p-2 transition-colors ${dragOver ? 'bg-primary/10 ring-2 ring-primary/30' : 'bg-muted/50'}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex items-center justify-between mb-2 px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
        <Badge variant="secondary" className="h-5 text-[10px]">{items.length}</Badge>
      </div>
      <div className="space-y-2 min-h-[100px]">
        {items.map((item) => (
          <KanbanCard key={item.id} item={item} onClick={() => onCardClick(item)} />
        ))}
      </div>
    </div>
  );
}
