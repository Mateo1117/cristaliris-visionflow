import { useState } from 'react';
import { ESTADOS_PRODUCTO } from '@/types';
import { KanbanColumn } from './KanbanColumn';
import { OrderDetailDialog } from './OrderDetailDialog';
import { ReadyForDeliveryDialog } from './ReadyForDeliveryDialog';
import { QualityCheckDialog } from './QualityCheckDialog';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { EstadoProducto, OrdenProducto } from '@/types';
import { usePermissions } from '@/hooks/usePermissions';
import {
  diasHabilesEntre,
  esEstadoLaboratorio,
  esRetroceso,
  sellosDeFecha,
  useFestivos,
} from '@/lib/businessDays';
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

const etiquetaEstado = (key: string) =>
  ESTADOS_PRODUCTO.find((e) => e.key === key)?.label || key.replace(/_/g, ' ');

interface MovimientoEstado {
  id: string;
  oldState: string;
  newState: EstadoProducto;
  observaciones?: string;
  /** Retroceso autorizado por un administrador (exige justificación). */
  retroceso?: boolean;
}

export function KanbanBoard() {
  const [selectedItem, setSelectedItem] = useState<OrdenProducto | null>(null);
  const [pendingDelivery, setPendingDelivery] = useState<{ id: string; oldState: string; newState: EstadoProducto } | null>(null);
  const [pendingQC, setPendingQC] = useState<{ id: string; oldState: string; newState: EstadoProducto; item: OrdenProducto } | null>(null);
  const [pendingRetroceso, setPendingRetroceso] = useState<{ id: string; oldState: string; newState: EstadoProducto } | null>(null);
  const [justificacion, setJustificacion] = useState('');
  const queryClient = useQueryClient();
  const { isAdmin, canWrite, isLoading: permisosCargando } = usePermissions();
  const { festivos } = useFestivos();

  const { data: productos = [], isLoading } = useQuery({
    // `festivos` forma parte de la clave: al cargarlos se recalculan los días
    // hábiles de cada tarjeta. Las invalidaciones con ['orden-productos']
    // siguen alcanzando esta consulta (react-query compara por prefijo).
    queryKey: ['orden-productos', 'kanban', festivos],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orden_productos')
        .select('*, laboratorios(nombre, tiempo_promedio_entrega), ordenes(numero_orden, paciente_id, sede_id, pacientes(nombres, apellidos), sedes(nombre))')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data.map((p: any) => ({
        id: p.id,
        orden_id: p.orden_id,
        numero_orden: p.ordenes?.numero_orden || null,
        numero_montura: p.numero_montura || null,
        medidas_progresivo: p.medidas_progresivo || null,
        paciente_nombre: `${p.ordenes?.pacientes?.nombres || ''} ${p.ordenes?.pacientes?.apellidos || ''}`.trim(),
        // Necesarios para imprimir la etiqueta completa (fórmula, sede, nº de lab).
        paciente_id: p.ordenes?.paciente_id || null,
        sede_nombre: p.ordenes?.sedes?.nombre || null,
        numero_orden_laboratorio: p.numero_orden_laboratorio || null,
        fecha_entrega_prometida: p.fecha_listo_entrega || null,
        tipo_producto: p.tipo_producto,
        tipo_lente_tiempo: p.tipo_lente_tiempo,
        descripcion: p.descripcion,
        laboratorio_nombre: p.laboratorios?.nombre || 'N/A',
        estado_actual: p.estado_actual,
        fecha_creacion: p.created_at,
        created_at: p.created_at,
        // Días HÁBILES en el estado actual (lun-vie, sin festivos) — README 3.3.
        dias_en_estado: Math.max(0, diasHabilesEntre(p.updated_at, new Date(), festivos)),
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
    mutationFn: async ({ id, oldState, newState, observaciones, retroceso }: MovimientoEstado) => {
      const { data: { user } } = await supabase.auth.getUser();
      const ahora = new Date();

      // Reproceso interno: se retrocede desde control de calidad hacia el laboratorio.
      const esReproceso = retroceso && oldState === 'control_calidad' && esEstadoLaboratorio(newState);

      const cambios: Record<string, any> = {
        estado_actual: newState,
        // Sella la fecha del ciclo correspondiente al estado alcanzado.
        ...sellosDeFecha(newState, ahora),
      };
      if (esReproceso) {
        cambios.es_reproceso = true;
        // Reinicia el conteo de tiempo de laboratorio (README 3.2).
        cambios.fecha_envio_lab = ahora.toISOString();
      }
      if (oldState === 'control_calidad' && observaciones) {
        cambios.observaciones = observaciones;
      }

      const { error: e1 } = await supabase.from('orden_productos')
        .update(cambios as any)
        .eq('id', id);
      if (e1) throw e1;

      const { error: e2 } = await supabase.from('estados_producto').insert({
        orden_producto_id: id,
        estado_anterior: oldState as any,
        estado_nuevo: newState as any,
        metodo: retroceso ? 'admin_retroceso' : 'manual',
        usuario_id: user?.id || null,
        justificacion: observaciones || null,
      });
      if (e2) throw e2;

      return { esReproceso };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['orden-productos'] });
      queryClient.invalidateQueries({ queryKey: ['qc-productos'] });
      queryClient.invalidateQueries({ queryKey: ['alertas-produccion-lab'] });
      toast.success(res?.esReproceso ? 'Estado actualizado — marcado como reproceso interno' : 'Estado actualizado');
    },
    onError: (e: any) => toast.error(e.message || 'No se pudo actualizar el estado'),
  });

  const handleDrop = (itemId: string, oldState: string, newState: EstadoProducto) => {
    if (permisosCargando) {
      toast.info('Cargando permisos, intente de nuevo en un momento');
      return;
    }
    if (!canWrite('ordenes')) {
      toast.error('No tiene permisos para cambiar estados de órdenes');
      return;
    }

    // Retroceso: solo administradores y con justificación obligatoria (README 3.2).
    if (esRetroceso(oldState, newState)) {
      if (!isAdmin) {
        toast.error('Solo un administrador puede retroceder estados');
        return;
      }
      setJustificacion('');
      setPendingRetroceso({ id: itemId, oldState, newState });
      return;
    }

    // Salir de "control_calidad" hacia adelante ⇒ checklist de calidad,
    // respetando SIEMPRE la columna destino elegida.
    if (oldState === 'control_calidad') {
      const item = productos.find((p: any) => p.id === itemId);
      if (item) {
        setPendingQC({ id: itemId, oldState, newState, item });
        return;
      }
    }

    // Aviso al paciente antes de marcar "listo para entrega".
    if (newState === 'listo_entrega') {
      setPendingDelivery({ id: itemId, oldState, newState });
      return;
    }

    moveItem.mutate({ id: itemId, oldState, newState });
  };

  const handleConfirmQC = (observaciones: string) => {
    if (!pendingQC) return;
    moveItem.mutate({ id: pendingQC.id, oldState: pendingQC.oldState, newState: pendingQC.newState, observaciones });
    setPendingQC(null);
  };

  const handleConfirmDelivery = () => {
    if (!pendingDelivery) return;
    moveItem.mutate({ id: pendingDelivery.id, oldState: pendingDelivery.oldState, newState: pendingDelivery.newState });
    setPendingDelivery(null);
  };

  const handleConfirmRetroceso = () => {
    if (!pendingRetroceso) return;
    if (justificacion.trim().length < 5) {
      toast.error('La justificación es obligatoria');
      return;
    }
    moveItem.mutate({
      id: pendingRetroceso.id,
      oldState: pendingRetroceso.oldState,
      newState: pendingRetroceso.newState,
      observaciones: justificacion.trim(),
      retroceso: true,
    });
    setPendingRetroceso(null);
    setJustificacion('');
  };

  const retrocesoEsReproceso = !!pendingRetroceso
    && pendingRetroceso.oldState === 'control_calidad'
    && esEstadoLaboratorio(pendingRetroceso.newState);

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
      <QualityCheckDialog
        open={!!pendingQC}
        onOpenChange={(open) => { if (!open) setPendingQC(null); }}
        onConfirm={handleConfirmQC}
        pacienteNombre={pendingQC?.item.paciente_nombre}
        descripcion={pendingQC?.item.descripcion}
      />

      {/* Retroceso de estado — solo administrador, con justificación obligatoria */}
      <Dialog open={!!pendingRetroceso} onOpenChange={(o) => { if (!o) { setPendingRetroceso(null); setJustificacion(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Retroceder Estado
            </DialogTitle>
          </DialogHeader>
          {pendingRetroceso && (
            <div className="space-y-4">
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm space-y-1">
                <p className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">{etiquetaEstado(pendingRetroceso.oldState)}</Badge>
                  <span>→</span>
                  <Badge variant="destructive">{etiquetaEstado(pendingRetroceso.newState)}</Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  El retroceso queda registrado en la auditoría con su usuario, fecha y justificación.
                </p>
              </div>

              {retrocesoEsReproceso && (
                <div className="rounded-lg bg-warning/10 border border-warning/30 p-3 text-xs">
                  Se marcará como <strong>reproceso interno</strong> y se reiniciará el conteo de tiempo de laboratorio.
                </div>
              )}

              <div className="space-y-2">
                <Label>Justificación *</Label>
                <Textarea
                  value={justificacion}
                  onChange={(e) => setJustificacion(e.target.value)}
                  placeholder="Explique por qué se retrocede el estado..."
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" onClick={() => { setPendingRetroceso(null); setJustificacion(''); }}>Cancelar</Button>
                <Button variant="destructive" onClick={handleConfirmRetroceso} disabled={moveItem.isPending || justificacion.trim().length < 5}>
                  Confirmar Retroceso
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
