import type { EstadoProducto, OrdenProducto } from '@/types';
import { KanbanCard } from './KanbanCard';
import { Badge } from '@/components/ui/badge';

interface KanbanColumnProps {
  estado: EstadoProducto;
  label: string;
  items: OrdenProducto[];
  onCardClick: (item: OrdenProducto) => void;
}

export function KanbanColumn({ label, items, onCardClick }: KanbanColumnProps) {
  return (
    <div className="w-[250px] flex-shrink-0 rounded-lg bg-muted/50 p-2">
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
