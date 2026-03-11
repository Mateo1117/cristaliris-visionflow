import { ESTADOS_PRODUCTO } from '@/types';
import { mockProductos } from '@/lib/mock-data';
import { KanbanColumn } from './KanbanColumn';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

export function KanbanBoard() {
  return (
    <ScrollArea className="w-full">
      <div className="flex gap-3 pb-4" style={{ minWidth: `${ESTADOS_PRODUCTO.length * 260}px` }}>
        {ESTADOS_PRODUCTO.map(({ key, label }) => {
          const items = mockProductos.filter((p) => p.estado_actual === key);
          return <KanbanColumn key={key} estado={key} label={label} items={items} />;
        })}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}
