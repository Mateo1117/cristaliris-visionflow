import { useState } from 'react';
import { ESTADOS_PRODUCTO } from '@/types';
import { KanbanColumn } from './KanbanColumn';
import { OrderDetailDialog } from './OrderDetailDialog';
import { ReadyForDeliveryDialog } from './ReadyForDeliveryDialog';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { EstadoProducto, OrdenProducto } from '@/types';
import { toast } from 'sonner';

function getTiempoEsperado(tipoLenteTiempo: string | null, labDefault: number | null): number {
  switch (tipoLenteTiempo) {
    case 'progresivo':
    case 'talla':
    case 'sol_formula':
      return 3;
    case 'terminado':
      return 1;
    case 'montura_3piezas':
      return 2;
    default:
      return labDefault || 3;
  }
}

export function KanbanBoard() {
  const [selectedItem, setSelectedItem] = useState<OrdenProducto | null>(null);
  const [pendingDelivery, setPendingDelivery] = useState<{ id: string; oldState: string } | null>(null);
  const queryClient = useQueryClient();

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
        tipo_lente_tiempo: p.tipo_lente_tiempo,
        descripcion: p.descripcion,
        laboratorio_nombre: p.laboratorios?.nombre || 'N/A',
        estado_actual: p.estado_actual,
        fecha_creacion: p.created_at,
        dias_en_estado: Math.max(0, Math.floor((Date.now() - new Date(p.updated_at).getTime()) / 86400000)),
        tiempo_esperado_dias: getTiempoEsperado(p.tipo_lente_tiempo, p.laboratorios?.tiempo_promedio_entrega),
        es_garantia: p.es_garantia || false,
        es_reproceso: p.es_reproceso || false,
        precio_venta: p.precio_venta || 0,
        costo_laboratorio: p.costo_laboratorio || 0,
        costo_montura: p.costo_montura || 0,
        costo_lente: p.costo_lente || 0,
        costo_insumos: p.costo_insumos || 0,
        comision_financiera: p.comision_financiera || 0,
        utilidad_calculada: p.utilidad_calculada || 0,
      }));
    },
  });

  const moveItem = useMutation({
    mutationFn: async ({ id, oldState, newState }: { id: string; oldState: string; newState: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: e1 } = await supabase.from('orden_productos')
        .update({ estado_actual: newState as any })
        .eq('id', id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('estados_producto').insert({
        orden_producto_id: id,
        estado_anterior: oldState as any,
        estado_nuevo: newState as any,
        metodo: 'manual',
        usuario_id: user?.id || null,
      });
      if (e2) throw e2;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orden-productos'] });
      toast.success('Estado actualizado');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleDrop = (itemId: string, oldState: string, newState: EstadoProducto) => {
    // Intercept "listo_entrega" to show notification dialog
    if (newState === 'listo_entrega') {
      setPendingDelivery({ id: itemId, oldState });
      return;
    }
    moveItem.mutate({ id: itemId, oldState, newState });
  };

  const handleConfirmDelivery = () => {
    if (pendingDelivery) {
      moveItem.mutate({ id: pendingDelivery.id, oldState: pendingDelivery.oldState, newState: 'listo_entrega' });
      setPendingDelivery(null);
    }
  };

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">Cargando tablero...</div>;
  }

  return (
    <>
      <ScrollArea className="w-full">
        <div className="flex gap-3 pb-4" style={{ minWidth: `${ESTADOS_PRODUCTO.length * 260}px` }}>
          {ESTADOS_PRODUCTO.map(({ key, label }) => {
            const items = productos.filter((p: any) => p.estado_actual === key);
            return (
              <KanbanColumn
                key={key}
                estado={key}
                label={label}
                items={items}
                onCardClick={setSelectedItem}
                onDrop={handleDrop}
              />
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <OrderDetailDialog item={selectedItem} open={!!selectedItem} onOpenChange={(open) => { if (!open) setSelectedItem(null); }} />
      <ReadyForDeliveryDialog
        open={!!pendingDelivery}
        onOpenChange={(open) => { if (!open) setPendingDelivery(null); }}
        ordenProductoId={pendingDelivery?.id || null}
        onConfirm={handleConfirmDelivery}
      />
    </>
  );
}
