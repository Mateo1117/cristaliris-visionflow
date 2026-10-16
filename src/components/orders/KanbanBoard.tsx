import { useState } from 'react';
import { etiquetaEstadoProducto } from '@/types';
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
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { FlaskConical, Search, Settings2, X } from 'lucide-react';
import { COLORES_ETAPA, mensajeMovimiento, moverEtapa, nombreCorto, useEtapasKanban } from '@/lib/etapasKanban';
import { EtapasKanbanDialog } from './EtapasKanbanDialog';
import { filtrarKanban, monturasPorOrden, resumenLaboratorios, type FiltrosKanban, type TipoFiltro } from '@/lib/kanbanFiltros';
import { usePermissions } from '@/hooks/usePermissions';
import {
  diasHabilesEntre,
  esEstadoLaboratorio,
  esRetroceso,
  useFestivos,
} from '@/lib/businessDays';
import { toast } from 'sonner';
import { tiempoEntrega } from '@/lib/tiempoEntrega';

const etiquetaEstado = (key: string) => etiquetaEstadoProducto(key);

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
  const { data: etapas = [] } = useEtapasKanban();
  const { data: perfiles = [] } = useQuery({
    queryKey: ['perfiles-responsables'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('user_id, nombre');
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
  const [configurando, setConfigurando] = useState(false);
  const [filtros, setFiltros] = useState<FiltrosKanban>({ laboratorioId: null, tipo: 'todos', texto: '' });
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
        laboratorio_nombre: p.laboratorios?.nombre || 'Sin laboratorio',
        laboratorio_id: p.laboratorio_id || null,
        estado_actual: p.estado_actual,
        fecha_creacion: p.created_at,
        created_at: p.created_at,
        // Días HÁBILES en el estado actual (lun-vie, sin festivos) — README 3.3.
        dias_en_estado: Math.max(0, diasHabilesEntre(p.updated_at, new Date(), festivos)),
        // Manda el tiempo configurado del laboratorio (Configuración → Laboratorios).
        tiempo_esperado_dias: tiempoEntrega(p.laboratorios?.tiempo_promedio_entrega, p.tipo_lente_tiempo).dias,
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
    // mover_etapa valida permisos y retrocesos, sella las fechas del ciclo y
    // deja el historial (también para el mensajero, que no edita órdenes).
    mutationFn: ({ id, newState, observaciones, retroceso }: MovimientoEstado) =>
      moverEtapa({
        id,
        estado: newState,
        justificacion: retroceso ? observaciones : null,
        observaciones: retroceso ? null : observaciones,
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['orden-productos'] });
      queryClient.invalidateQueries({ queryKey: ['qc-productos'] });
      queryClient.invalidateQueries({ queryKey: ['alertas-produccion-lab'] });
      toast.success(mensajeMovimiento(res));
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
      // Devolver de control de calidad al laboratorio (reproceso) lo puede hacer quien revisa calidad.
      const esReprocesoCalidad = oldState === 'control_calidad' && esEstadoLaboratorio(newState);
      if (!isAdmin && !esReprocesoCalidad) {
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

  const monturas = monturasPorOrden(productos as any);
  const conMontura = (productos as any[]).map((p) => ({
    ...p,
    montura_orden: p.tipo_producto !== 'montura' ? (monturas.get(p.orden_id)?.join(' / ') ?? null) : null,
  }));
  const visibles = filtrarKanban(conMontura, filtros);
  const resumen = resumenLaboratorios(conMontura);
  // Columnas: etapas visibles + las ocultas que todavía tengan trabajos (para que nada desaparezca).
  const conTrabajos = new Set(conMontura.map((p: any) => p.estado_actual));
  const columnas = etapas
    .filter((e) => e.visible || conTrabajos.has(e.clave))
    .map((e) => ({ key: e.clave as EstadoProducto, label: e.nombre }));
  const hayFiltro = !!filtros.laboratorioId || filtros.tipo !== 'todos' || !!filtros.texto.trim();

  return (
    <>
      {/* Laboratorios: cuántos trabajos tiene cada uno; clic para filtrar */}
      <div className="flex flex-wrap gap-2 mb-3">
        {resumen.map((r) => {
          const activo = filtros.laboratorioId === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setFiltros((f) => ({ ...f, laboratorioId: activo ? null : r.id }))}
              className={`rounded-lg border px-3 py-1.5 text-left transition-colors ${activo ? 'border-primary bg-primary/10' : 'hover:bg-muted/60'}`}
              title={`${r.activos} trabajos sin entregar · ${r.enLaboratorio} en el laboratorio · ${r.atrasados} atrasados`}
            >
              <p className="text-xs font-medium flex items-center gap-1.5">
                <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />{r.nombre}
                <span className="tabular-nums font-semibold">{r.activos}</span>
              </p>
              <p className="text-[10px] text-muted-foreground">
                {r.enLaboratorio} en laboratorio{r.atrasados > 0 && <span className="text-destructive"> · {r.atrasados} atrasado{r.atrasados !== 1 ? 's' : ''}</span>}
              </p>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9 h-9" placeholder="Paciente, ORD-…, referencia de montura…"
            value={filtros.texto} onChange={(e) => setFiltros((f) => ({ ...f, texto: e.target.value }))} />
        </div>
        <ToggleGroup type="single" variant="outline" size="sm" value={filtros.tipo}
          onValueChange={(v) => v && setFiltros((f) => ({ ...f, tipo: v as TipoFiltro }))}>
          <ToggleGroupItem value="todos" className="px-3 text-xs">Todo</ToggleGroupItem>
          <ToggleGroupItem value="lente" className="px-3 text-xs">Lentes</ToggleGroupItem>
          <ToggleGroupItem value="montura" className="px-3 text-xs">Monturas</ToggleGroupItem>
        </ToggleGroup>
        {isAdmin && (
          <Button variant="outline" size="sm" className="sm:ml-auto" onClick={() => setConfigurando(true)}>
            <Settings2 className="h-4 w-4 mr-1" />Configurar etapas
          </Button>
        )}
        {hayFiltro && (
          <>
            <span className="text-xs text-muted-foreground">{visibles.length} de {conMontura.length} trabajos</span>
            <Button variant="ghost" size="sm" onClick={() => setFiltros({ laboratorioId: null, tipo: 'todos', texto: '' })}>
              <X className="h-3.5 w-3.5 mr-1" />Quitar filtros
            </Button>
          </>
        )}
      </div>

      <ScrollArea className="w-full">
        <div className="flex gap-3 pb-4" style={{ minWidth: `${columnas.length * 260}px` }}>
          {columnas.map(({ key, label }) => {
            const items = visibles.filter((p: any) => p.estado_actual === key);
            const etapa = etapas.find((e) => e.clave === key);
            return (
              <KanbanColumn
                key={key}
                estado={key}
                label={label}
                colorPunto={COLORES_ETAPA[etapa?.color ?? 'gris']?.punto}
                responsable={nombreCorto(perfiles.find((pr) => pr.user_id === etapa?.responsable_id)?.nombre) || null}
                oculta={etapa ? !etapa.visible : false}
                items={items}
                onCardClick={setSelectedItem}
                onDrop={handleDrop}
              />
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <EtapasKanbanDialog open={configurando} onOpenChange={setConfigurando} etapas={etapas} perfiles={perfiles}
        trabajosPorEtapa={Object.fromEntries([...conTrabajos].map((c) => [c, conMontura.filter((p: any) => p.estado_actual === c).length]))} />
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
