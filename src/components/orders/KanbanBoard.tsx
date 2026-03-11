import { useState } from 'react';
import { ESTADOS_PRODUCTO } from '@/types';
import { KanbanColumn } from './KanbanColumn';
import { OrderDetailDialog } from './OrderDetailDialog';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { OrdenProducto } from '@/types';

export function KanbanBoard() {
  const [selectedItem, setSelectedItem] = useState<OrdenProducto | null>(null);

  const { data: productos = [], isLoading } = useQuery({
    queryKey: ['orden-productos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orden_productos')
        .select('*, laboratorios(nombre, tiempo_promedio_entrega), ordenes(pacientes(nombres, apellidos))')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data.map((p: any) => ({
        id: p.id,
        orden_id: p.orden_id,
        paciente_nombre: `${p.ordenes?.pacientes?.nombres || ''} ${p.ordenes?.pacientes?.apellidos || ''}`.trim(),
        tipo_producto: p.tipo_producto,
        descripcion: p.descripcion,
        laboratorio_nombre: p.laboratorios?.nombre || 'N/A',
        estado_actual: p.estado_actual,
        fecha_creacion: p.created_at,
        dias_en_estado: Math.max(0, Math.floor((Date.now() - new Date(p.updated_at).getTime()) / 86400000)),
        tiempo_esperado_dias: p.laboratorios?.tiempo_promedio_entrega || 3,
        es_garantia: p.es_garantia || false,
        es_reproceso: p.es_reproceso || false,
      }));
    },
  });

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">Cargando tablero...</div>;
  }

  return (
    <>
      <ScrollArea className="w-full">
        <div className="flex gap-3 pb-4" style={{ minWidth: `${ESTADOS_PRODUCTO.length * 260}px` }}>
          {ESTADOS_PRODUCTO.map(({ key, label }) => {
            const items = productos.filter((p: any) => p.estado_actual === key);
            return <KanbanColumn key={key} estado={key} label={label} items={items} onCardClick={setSelectedItem} />;
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <OrderDetailDialog item={selectedItem} open={!!selectedItem} onOpenChange={(open) => { if (!open) setSelectedItem(null); }} />
    </>
  );
}
