import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ESTADOS_PRODUCTO, type OrdenProducto } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { ChevronRight, ChevronLeft, Printer, Upload, Trash2, Clock, AlertTriangle, Camera, Image, Calculator, Save, Loader2, Receipt, Tag, Usb, Pencil, X } from 'lucide-react';
import { printThermalLabel, printThermalReceipt } from '@/lib/printing/thermal';
import { printReceiptUSB, printLabelUSB, pickUsbPrinter } from '@/lib/printing/escpos';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { usePermissions } from '@/hooks/usePermissions';
import { esEstadoLaboratorio, sellosDeFecha } from '@/lib/businessDays';

interface Props {
  item: OrdenProducto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrderDetailDialog({ item, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const { isAdmin } = usePermissions();
  const [uploading, setUploading] = useState(false);

  // Retroceso de estado (solo administrador, con justificación obligatoria)
  const [showRetroceso, setShowRetroceso] = useState(false);
  const [justificacion, setJustificacion] = useState('');

  // Editable order data
  const [editingOrder, setEditingOrder] = useState(false);
  const [orderEdit, setOrderEdit] = useState({
    tipo_producto: 'lente' as 'lente' | 'montura' | 'insumo',
    descripcion: '',
    laboratorio_id: null as string | null,
    numero_orden_laboratorio: '',
    numero_montura: '',
    tipo_lente_tiempo: '',
    es_garantia: false,
    es_reproceso: false,
    observaciones: '',
  });

  /**
   * Datos FRESCOS del producto desde la base de datos.
   *
   * El prop `item` es una copia tomada al abrir el diálogo; tras editar (por
   * ejemplo, cambiar el laboratorio) esa copia queda desactualizada y la
   * etiqueta se imprimía con los valores anteriores. Esta consulta se invalida
   * con cada guardado, de modo que lo que se ve y lo que se imprime siempre es
   * lo que está guardado.
   */
  const { data: detalle } = useQuery({
    queryKey: ['orden-producto-detalle', item?.id],
    queryFn: async () => {
      if (!item) return null;
      const { data, error } = await supabase
        .from('orden_productos')
        .select('*, laboratorios(nombre), ordenes(numero_orden, paciente_id, pacientes(nombres, apellidos), sedes(nombre))')
        .eq('id', item.id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!item && open,
  });

  /** Valor efectivo de un campo: primero lo guardado, luego la copia inicial. */
  const campo = <T,>(deLaBase: T | null | undefined, delItem: T | null | undefined): T | undefined =>
    (deLaBase ?? delItem ?? undefined) as T | undefined;

  const { data: laboratorios = [] } = useQuery({
    queryKey: ['laboratorios-edit'],
    queryFn: async () => {
      const { data, error } = await supabase.from('laboratorios').select('id, nombre').eq('estado_activo', true).order('nombre');
      if (error) throw error;
      return data;
    },
  });

  const startEditOrder = async () => {
    if (!item) return;
    const { data, error } = await supabase.from('orden_productos')
      .select('tipo_producto, descripcion, laboratorio_id, numero_orden_laboratorio, numero_montura, tipo_lente_tiempo, es_garantia, es_reproceso, observaciones')
      .eq('id', item.id).single();
    if (error) { toast.error(error.message); return; }
    if (data) {
      setOrderEdit({
        tipo_producto: (data.tipo_producto as any) || 'lente',
        descripcion: data.descripcion || '',
        laboratorio_id: data.laboratorio_id,
        numero_orden_laboratorio: (data as any).numero_orden_laboratorio || '',
        numero_montura: data.numero_montura || '',
        tipo_lente_tiempo: data.tipo_lente_tiempo || '',
        es_garantia: !!data.es_garantia,
        es_reproceso: !!data.es_reproceso,
        observaciones: data.observaciones || '',
      });
      setEditingOrder(true);
    }
  };

  const saveOrder = useMutation({
    mutationFn: async () => {
      if (!item) return;
      const { error } = await supabase.from('orden_productos').update({
        tipo_producto: orderEdit.tipo_producto,
        descripcion: orderEdit.descripcion,
        laboratorio_id: orderEdit.laboratorio_id,
        numero_orden_laboratorio: orderEdit.numero_orden_laboratorio || null,
        numero_montura: orderEdit.numero_montura || null,
        tipo_lente_tiempo: orderEdit.tipo_lente_tiempo || null,
        es_garantia: orderEdit.es_garantia,
        es_reproceso: orderEdit.es_reproceso,
        observaciones: orderEdit.observaciones || null,
      }).eq('id', item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orden-productos'] });
      // También el detalle abierto, para que lo editado se vea y se imprima ya.
      queryClient.invalidateQueries({ queryKey: ['orden-producto-detalle', item?.id] });
      setEditingOrder(false);
      toast.success('Orden actualizada');
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Editable costs
  const [editingCosts, setEditingCosts] = useState(false);
  const [costs, setCosts] = useState({
    precio_venta: 0, costo_laboratorio: 0, costo_montura: 0,
    costo_lente: 0, costo_insumos: 0, comision_financiera: 0,
  });

  const startEditCosts = () => {
    if (!item) return;
    setCosts({
      precio_venta: item.precio_venta || 0,
      costo_laboratorio: item.costo_laboratorio || 0,
      costo_montura: item.costo_montura || 0,
      costo_lente: item.costo_lente || 0,
      costo_insumos: item.costo_insumos || 0,
      comision_financiera: item.comision_financiera || 0,
    });
    setEditingCosts(true);
  };

  const editUtilidad = costs.precio_venta - costs.costo_laboratorio - costs.costo_montura - costs.costo_lente - costs.costo_insumos - costs.comision_financiera;

  const saveCosts = useMutation({
    mutationFn: async () => {
      if (!item) return;
      const utilidad_calculada = costs.precio_venta - costs.costo_laboratorio - costs.costo_montura - costs.costo_lente - costs.costo_insumos - costs.comision_financiera;
      const { error } = await supabase.from('orden_productos').update({
        ...costs,
        utilidad_calculada,
      }).eq('id', item.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orden-productos'] });
      // También el detalle abierto, para que lo editado se vea y se imprima ya.
      queryClient.invalidateQueries({ queryKey: ['orden-producto-detalle', item?.id] });
      setEditingCosts(false);
      toast.success('Costos y utilidad actualizados');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const currentIndex = item ? ESTADOS_PRODUCTO.findIndex(e => e.key === item.estado_actual) : -1;
  const nextEstado = currentIndex >= 0 && currentIndex < ESTADOS_PRODUCTO.length - 1 ? ESTADOS_PRODUCTO[currentIndex + 1] : null;
  const prevEstado = currentIndex > 0 ? ESTADOS_PRODUCTO[currentIndex - 1] : null;

  const changeState = useMutation({
    mutationFn: async ({ id, newState, oldState, justificacion, retroceso }: { id: string; newState: string; oldState: string; justificacion?: string; retroceso?: boolean }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const ahora = new Date();

      // Reproceso interno: retroceso desde control de calidad hacia el laboratorio.
      const esReproceso = !!retroceso && oldState === 'control_calidad' && esEstadoLaboratorio(newState);

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

      const { error: e1 } = await supabase.from('orden_productos').update(cambios as any).eq('id', id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('estados_producto').insert({
        orden_producto_id: id,
        estado_anterior: oldState as any,
        estado_nuevo: newState as any,
        metodo: retroceso ? 'admin_retroceso' : 'manual',
        usuario_id: user?.id || null,
        justificacion: justificacion || null,
      });
      if (e2) throw e2;
      return { esReproceso };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['orden-productos'] });
      // También el detalle abierto, para que lo editado se vea y se imprima ya.
      queryClient.invalidateQueries({ queryKey: ['orden-producto-detalle', item?.id] });
      queryClient.invalidateQueries({ queryKey: ['estado-historial', item?.id] });
      queryClient.invalidateQueries({ queryKey: ['alertas-produccion-lab'] });
      toast.success(res?.esReproceso ? 'Estado actualizado — marcado como reproceso interno' : 'Estado actualizado');
    },
    onError: (e: any) => toast.error(e.message || 'No se pudo actualizar el estado'),
  });

  const handleRetroceder = () => {
    if (!item || !prevEstado) return;
    if (!isAdmin) {
      toast.error('Solo un administrador puede retroceder estados');
      return;
    }
    setJustificacion('');
    setShowRetroceso(true);
  };

  const confirmarRetroceso = () => {
    if (!item || !prevEstado) return;
    if (justificacion.trim().length < 5) {
      toast.error('La justificación es obligatoria');
      return;
    }
    changeState.mutate({
      id: item.id,
      newState: prevEstado.key,
      oldState: item.estado_actual,
      justificacion: justificacion.trim(),
      retroceso: true,
    });
    setShowRetroceso(false);
    setJustificacion('');
  };

  const { data: historial = [] } = useQuery({
    queryKey: ['estado-historial', item?.id],
    queryFn: async () => {
      if (!item) return [];
      const { data, error } = await supabase.from('estados_producto').select('*').eq('orden_producto_id', item.id).order('fecha_cambio', { ascending: false });
      if (error) throw error;
      const userIds = [...new Set(data.filter(d => d.usuario_id).map(d => d.usuario_id))];
      let profileMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('user_id, nombre').in('user_id', userIds);
        if (profiles) profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p.nombre]));
      }
      return data.map(d => ({ ...d, usuario_nombre: d.usuario_id ? profileMap[d.usuario_id] || null : null }));
    },
    enabled: !!item && open,
  });

  const { data: fotos = [], refetch: refetchFotos } = useQuery({
    queryKey: ['orden-fotos', item?.id],
    queryFn: async () => {
      if (!item) return [];
      const { data, error } = await supabase.storage.from('orden-fotos').list(item.id);
      if (error) throw error;
      // El bucket es privado (las fotos pueden incluir soportes de pago y datos
      // del paciente), así que se piden enlaces firmados temporales en vez de
      // URLs públicas.
      const rutas = data.map(f => `${item.id}/${f.name}`);
      if (!rutas.length) return [];
      const { data: firmados, error: errFirma } = await supabase
        .storage.from('orden-fotos')
        .createSignedUrls(rutas, 60 * 60); // 1 hora
      if (errFirma) throw errFirma;
      return data.map((f, i) => ({
        name: f.name,
        url: firmados?.[i]?.signedUrl ?? '',
      }));
    },
    enabled: !!item && open,
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!item || !e.target.files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(e.target.files)) {
        const path = `${item.id}/${Date.now()}_${file.name}`;
        const { error } = await supabase.storage.from('orden-fotos').upload(path, file);
        if (error) throw error;
      }
      refetchFotos();
      toast.success('Foto(s) subida(s)');
    } catch (err: any) { toast.error(err.message); } finally { setUploading(false); }
  };

  const handleDeletePhoto = async (name: string) => {
    if (!item) return;
    const { error } = await supabase.storage.from('orden-fotos').remove([`${item.id}/${name}`]);
    if (error) toast.error(error.message);
    else { refetchFotos(); toast.success('Foto eliminada'); }
  };

  const numeroOrdenLabel = item?.numero_orden ? `ORD-${String(item.numero_orden).padStart(5, '0')}` : item?.id.slice(0, 8);

  const fmtNum = (n: number | null | undefined) => {
    if (n === null || n === undefined) return '';
    const s = (n >= 0 ? '+' : '') + Number(n).toFixed(2);
    return s;
  };

  const buildFormulaText = async (): Promise<string | undefined> => {
    // El id del paciente sale de la consulta de detalle; el listado no siempre
    // lo trae, y por eso la fórmula nunca llegaba a la etiqueta.
    const pacienteId = detalle?.ordenes?.paciente_id ?? (item as any)?.paciente_id;
    if (!pacienteId) return undefined;
    const { data } = await supabase
      .from('historias_clinicas')
      .select('formula_od_esfera, formula_od_cilindro, formula_od_eje, formula_od_adicion, formula_oi_esfera, formula_oi_cilindro, formula_oi_eje, formula_oi_adicion')
      .eq('paciente_id', pacienteId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return undefined;
    const od = `OD ${fmtNum(data.formula_od_esfera)} ${fmtNum(data.formula_od_cilindro)} x${data.formula_od_eje ?? '—'}${data.formula_od_adicion ? ` Add ${fmtNum(data.formula_od_adicion)}` : ''}`.trim();
    const oi = `OI ${fmtNum(data.formula_oi_esfera)} ${fmtNum(data.formula_oi_cilindro)} x${data.formula_oi_eje ?? '—'}${data.formula_oi_adicion ? ` Add ${fmtNum(data.formula_oi_adicion)}` : ''}`.trim();
    return `${od} / ${oi}`;
  };

  const printLabel = async () => {
    const svg = document.getElementById('qr-print-area');
    if (!svg || !item) return;
    const formula = await buildFormulaText();
    const pacienteNombre = detalle?.ordenes?.pacientes
      ? `${detalle.ordenes.pacientes.nombres || ''} ${detalle.ordenes.pacientes.apellidos || ''}`.trim()
      : item.paciente_nombre;

    printThermalLabel({
      numero: numeroOrdenLabel || '',
      qrSvg: svg.outerHTML,
      qrPayload: qrUrl,
      // Siempre lo guardado en la base de datos; la copia del listado es sólo
      // el respaldo mientras la consulta de detalle carga.
      paciente: pacienteNombre,
      descripcion: campo(detalle?.descripcion, item.descripcion),
      laboratorio: campo(detalle?.laboratorios?.nombre, item.laboratorio_nombre),
      numeroOrdenLab: campo(detalle?.numero_orden_laboratorio, (item as any).numero_orden_laboratorio),
      numeroMontura: campo(detalle?.numero_montura, item.numero_montura),
      // Fecha impresa en la etiqueta: la de entrega prometida si existe y, en
      // su defecto, la de creación de la orden.
      fechaEntrega:
        detalle?.fecha_listo_entrega ||
        (item as any).fecha_entrega_prometida ||
        detalle?.created_at ||
        (item as any).created_at ||
        new Date(),
      sede: campo(detalle?.ordenes?.sedes?.nombre, (item as any).sede_nombre),
      formula,
    });
  };

  const printReceipt = () => {
    if (!item) return;
    printThermalReceipt({
      numero: numeroOrdenLabel || '',
      paciente: item.paciente_nombre,
      items: [{ descripcion: item.descripcion, cantidad: 1, precio: item.precio_venta || 0 }],
      total: item.precio_venta || 0,
      notas: `Laboratorio: ${item.laboratorio_nombre}${item.numero_montura ? ` · Montura: ${item.numero_montura}` : ''}`,
    });
  };

  const printLabelUsb = async () => {
    if (!item) return;
    try {
      await printLabelUSB({
        numero: numeroOrdenLabel || '',
        qrPayload: item.id,
        paciente: item.paciente_nombre,
        descripcion: item.descripcion,
        laboratorio: item.laboratorio_nombre,
        numeroMontura: item.numero_montura || undefined,
      });
      toast.success('Etiqueta enviada por USB');
    } catch (e: any) {
      toast.error(e.message || 'Error USB. Usando PDF como respaldo.');
      printLabel();
    }
  };

  const printReceiptUsb = async () => {
    if (!item) return;
    try {
      await printReceiptUSB({
        numero: numeroOrdenLabel || '',
        paciente: item.paciente_nombre,
        items: [{ descripcion: item.descripcion, cantidad: 1, precio: item.precio_venta || 0 }],
        total: item.precio_venta || 0,
        notas: `Lab: ${item.laboratorio_nombre}${item.numero_montura ? ' M:' + item.numero_montura : ''}`,
      });
      toast.success('Recibo enviado por USB');
    } catch (e: any) {
      toast.error(e.message || 'Error USB. Usando PDF como respaldo.');
      printReceipt();
    }
  };

  const pairUsb = async () => {
    try { await pickUsbPrinter(); toast.success('Impresora USB vinculada'); }
    catch (e: any) { if (e.name !== 'NotFoundError') toast.error(e.message); }
  };

  const qrUrl = item
    ? `${window.location.origin}/scan?tipo=orden&id=${item.id}` +
      `&oid=${encodeURIComponent(item.orden_id || '')}` +
      `&n=${encodeURIComponent(numeroOrdenLabel || '')}`
    : '';

  if (!item) return null;

  const alertLevel = item.dias_en_estado >= item.tiempo_esperado_dias ? 'destructive' : item.dias_en_estado >= item.tiempo_esperado_dias * 0.8 ? 'warning' : 'ok';

  // Read-only utility from DB
  const currentUtilidad = (item.precio_venta || 0) - (item.costo_laboratorio || 0) - (item.costo_montura || 0) - (item.costo_lente || 0) - (item.costo_insumos || 0) - (item.comision_financiera || 0);

  const fmt = (n: number) => `$${(n || 0).toLocaleString('es-CO')}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {item.paciente_nombre}
            {alertLevel === 'destructive' && <AlertTriangle className="h-4 w-4 text-destructive" />}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-2">
          <Badge variant="outline">{ESTADOS_PRODUCTO[currentIndex]?.label}</Badge>
          <span className={`text-xs flex items-center gap-1 ${alertLevel === 'destructive' ? 'text-destructive' : alertLevel === 'warning' ? 'text-yellow-500' : 'text-muted-foreground'}`}>
            <Clock className="h-3 w-3" />
            {item.dias_en_estado} / {item.tiempo_esperado_dias} días hábiles
          </span>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          {prevEstado && isAdmin && (
            <Button size="sm" variant="outline" onClick={handleRetroceder} disabled={changeState.isPending}>
              <ChevronLeft className="h-3 w-3 mr-1" />{prevEstado.label}
            </Button>
          )}
          {prevEstado && !isAdmin && (
            <span className="text-[11px] text-muted-foreground self-center">
              Solo un administrador puede retroceder estados
            </span>
          )}
          {nextEstado && (
            <Button size="sm" onClick={() => changeState.mutate({ id: item.id, newState: nextEstado.key, oldState: item.estado_actual })} disabled={changeState.isPending}>
              {nextEstado.label}<ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          )}
        </div>

        {/* Retroceso de estado — justificación obligatoria (README 3.2) */}
        {showRetroceso && prevEstado && (
          <Card className="border-destructive/40 mb-4">
            <CardContent className="p-3 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                <AlertTriangle className="h-4 w-4" />
                Retroceder a "{prevEstado.label}"
              </div>
              {item.estado_actual === 'control_calidad' && esEstadoLaboratorio(prevEstado.key) && (
                <p className="text-xs text-warning">
                  Se marcará como reproceso interno y se reiniciará el conteo de tiempo de laboratorio.
                </p>
              )}
              <div className="space-y-1">
                <Label className="text-xs">Justificación *</Label>
                <Textarea
                  rows={2}
                  value={justificacion}
                  onChange={(e) => setJustificacion(e.target.value)}
                  placeholder="Explique por qué se retrocede el estado..."
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => { setShowRetroceso(false); setJustificacion(''); }}>Cancelar</Button>
                <Button size="sm" variant="destructive" onClick={confirmarRetroceso} disabled={changeState.isPending || justificacion.trim().length < 5}>
                  Confirmar Retroceso
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="detalle">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="detalle">Detalle</TabsTrigger>
            <TabsTrigger value="costos">Costos</TabsTrigger>
            <TabsTrigger value="qr">QR</TabsTrigger>
            <TabsTrigger value="fotos">Fotos</TabsTrigger>
            <TabsTrigger value="historial">Historial</TabsTrigger>
          </TabsList>

          <TabsContent value="detalle" className="space-y-3 text-sm">
            {!editingOrder ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-muted-foreground">Producto:</span> {item.tipo_producto}</div>
                  <div><span className="text-muted-foreground">Lab:</span> {item.laboratorio_nombre}</div>
                </div>
                <div><span className="text-muted-foreground">Descripción:</span> {item.descripcion}</div>
                {item.numero_montura && <div><span className="text-muted-foreground"># Montura:</span> {item.numero_montura}</div>}
                <div className="flex gap-2 flex-wrap">
                  {item.es_garantia && <Badge variant="outline" className="text-yellow-600">Garantía</Badge>}
                  {item.es_reproceso && <Badge variant="outline" className="text-red-600">Reproceso</Badge>}
                </div>
                {alertLevel !== 'ok' && (
                  <Card className={`border-${alertLevel === 'destructive' ? 'destructive' : 'yellow-500'}`}>
                    <CardContent className="p-3 text-xs">
                      <AlertTriangle className={`h-4 w-4 inline mr-1 ${alertLevel === 'destructive' ? 'text-destructive' : 'text-yellow-500'}`} />
                      {alertLevel === 'destructive'
                        ? `⚠️ Excedido: ${item.dias_en_estado - item.tiempo_esperado_dias} día(s) hábil(es) de retraso`
                        : `⏳ Próximo a vencer: ${item.tiempo_esperado_dias - item.dias_en_estado} día(s) hábil(es) restantes`}
                    </CardContent>
                  </Card>
                )}
                <Button onClick={startEditOrder} variant="outline" size="sm" className="w-full">
                  <Pencil className="h-4 w-4 mr-1" />Editar Orden
                </Button>
              </>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo de Producto</Label>
                    <Select value={orderEdit.tipo_producto} onValueChange={(v: any) => setOrderEdit(p => ({ ...p, tipo_producto: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lente">Lente</SelectItem>
                        <SelectItem value="montura">Montura</SelectItem>
                        <SelectItem value="insumo">Insumo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Laboratorio</Label>
                    <Select value={orderEdit.laboratorio_id || 'none'} onValueChange={(v) => setOrderEdit(p => ({ ...p, laboratorio_id: v === 'none' ? null : v }))}>
                      <SelectTrigger><SelectValue placeholder="N/A" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">N/A</SelectItem>
                        {laboratorios.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.nombre}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">N° de orden del laboratorio</Label>
                  <Input
                    value={orderEdit.numero_orden_laboratorio}
                    placeholder="El que asigna el laboratorio, ej. LAB-4821"
                    onChange={(e) => setOrderEdit(p => ({ ...p, numero_orden_laboratorio: e.target.value }))}
                  />
                  <p className="text-[11px] text-muted-foreground">Sale impreso en la etiqueta del producto.</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Descripción</Label>
                  <Textarea rows={2} value={orderEdit.descripcion} onChange={(e) => setOrderEdit(p => ({ ...p, descripcion: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs"># Montura</Label>
                    <Input value={orderEdit.numero_montura} onChange={(e) => setOrderEdit(p => ({ ...p, numero_montura: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo Lente / Tiempo</Label>
                    <Input value={orderEdit.tipo_lente_tiempo} onChange={(e) => setOrderEdit(p => ({ ...p, tipo_lente_tiempo: e.target.value }))} placeholder="monofocal, progresivo..." />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Observaciones</Label>
                  <Textarea rows={2} value={orderEdit.observaciones} onChange={(e) => setOrderEdit(p => ({ ...p, observaciones: e.target.value }))} />
                </div>
                <div className="flex items-center justify-between rounded-md border p-2">
                  <Label className="text-xs">Garantía</Label>
                  <Switch checked={orderEdit.es_garantia} onCheckedChange={(v) => setOrderEdit(p => ({ ...p, es_garantia: v }))} />
                </div>
                <div className="flex items-center justify-between rounded-md border p-2">
                  <Label className="text-xs">Reproceso</Label>
                  <Switch checked={orderEdit.es_reproceso} onCheckedChange={(v) => setOrderEdit(p => ({ ...p, es_reproceso: v }))} />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setEditingOrder(false)}><X className="h-4 w-4 mr-1" />Cancelar</Button>
                  <Button className="flex-1" onClick={() => saveOrder.mutate()} disabled={saveOrder.isPending}>
                    {saveOrder.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                    Guardar
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>


          {/* COSTS TAB */}
          <TabsContent value="costos" className="space-y-4 py-2">
            {!editingCosts ? (
              <>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Precio Final</span><span className="font-medium">{fmt(item.precio_venta || 0)}</span></div>
                  <Separator />
                  <div className="flex justify-between"><span className="text-muted-foreground">Costo Laboratorio</span><span className="text-destructive">-{fmt(item.costo_laboratorio || 0)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Costo Montura</span><span className="text-destructive">-{fmt(item.costo_montura || 0)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Costo Lente</span><span className="text-destructive">-{fmt(item.costo_lente || 0)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Costo Insumos</span><span className="text-destructive">-{fmt(item.costo_insumos || 0)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Comisión Financiera</span><span className="text-destructive">-{fmt(item.comision_financiera || 0)}</span></div>
                  <Separator />
                  <div className={`flex justify-between items-center rounded-lg p-3 ${currentUtilidad >= 0 ? 'bg-green-500/10' : 'bg-destructive/10'}`}>
                    <span className="font-semibold flex items-center gap-1"><Calculator className="h-4 w-4" />Utilidad</span>
                    <span className={`text-lg font-bold ${currentUtilidad >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                      {fmt(currentUtilidad)}
                    </span>
                  </div>
                </div>
                <Button onClick={startEditCosts} variant="outline" size="sm" className="w-full">
                  <Calculator className="h-4 w-4 mr-1" />Editar Costos
                </Button>
              </>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {([
                    ['precio_venta', 'Precio Final'],
                    ['costo_laboratorio', 'Costo Laboratorio'],
                    ['costo_montura', 'Costo Montura'],
                    ['costo_lente', 'Costo Lente'],
                    ['costo_insumos', 'Costo Insumos'],
                    ['comision_financiera', 'Comisión Financiera'],
                  ] as const).map(([key, label]) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-xs">{label}</Label>
                      <Input
                        type="number"
                        step="100"
                        value={costs[key] || ''}
                        onChange={(e) => setCosts(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                      />
                    </div>
                  ))}
                </div>
                <div className={`rounded-lg p-3 flex items-center justify-between ${editUtilidad >= 0 ? 'bg-green-500/10 border border-green-500/30' : 'bg-destructive/10 border border-destructive/30'}`}>
                  <span className="text-sm font-medium">Utilidad</span>
                  <span className={`text-lg font-bold ${editUtilidad >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                    {fmt(editUtilidad)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setEditingCosts(false)}>Cancelar</Button>
                  <Button className="flex-1" onClick={() => saveCosts.mutate()} disabled={saveCosts.isPending}>
                    {saveCosts.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                    Guardar
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="qr" className="flex flex-col items-center gap-3 py-4">
            <div className="text-2xl font-bold tracking-widest text-primary">{numeroOrdenLabel}</div>
            <QRCodeSVG
              id="qr-print-area"
              value={qrUrl}
              size={256}
              level="M"
              includeMargin
            />
            <p className="text-[10px] text-muted-foreground text-center break-all font-mono">{item.id}</p>
            {item.numero_montura && <p className="text-xs"># Montura: <span className="font-medium">{item.numero_montura}</span></p>}
            <div className="w-full pt-2 space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground text-center">
                Impresión recomendada · USB directo (sin drivers)
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                <Button onClick={printLabelUsb} size="sm"><Tag className="h-4 w-4 mr-1" />Etiqueta</Button>
                <Button onClick={printReceiptUsb} size="sm"><Receipt className="h-4 w-4 mr-1" />Recibo</Button>
                <Button onClick={pairUsb} variant="ghost" size="sm"><Usb className="h-4 w-4 mr-1" />Vincular</Button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center px-2 leading-tight">
                Conecta la JAL-838L por USB y pulsa <b>Vincular</b> la primera vez. Envía los bytes ESC/POS y TSPL directos a la impresora — evita el diálogo del navegador.
              </p>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground text-center pt-2">
                Respaldo (PDF por driver del sistema)
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                <Button onClick={printLabel} variant="outline" size="sm"><Tag className="h-4 w-4 mr-1" />Etiqueta PDF</Button>
                <Button onClick={printReceipt} variant="outline" size="sm"><Receipt className="h-4 w-4 mr-1" />Recibo PDF</Button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center px-2 leading-tight">
                En el diálogo del navegador: <b>Tamaño de papel = 60×40 mm</b> para etiqueta o <b>30×50 mm</b> para recibo, <b>Escala 100%</b>, márgenes <b>Ninguno</b>.
              </p>
            </div>
          </TabsContent>


          <TabsContent value="fotos" className="space-y-3">
            <div className="flex items-center gap-2">
              <label className="cursor-pointer">
                <Input type="file" accept="image/*" multiple capture="environment" onChange={handleUpload} className="hidden" />
                <Button variant="outline" size="sm" asChild disabled={uploading}>
                  <span><Camera className="h-4 w-4 mr-1" />{uploading ? 'Subiendo...' : 'Agregar Foto'}</span>
                </Button>
              </label>
            </div>
            {fotos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center"><Image className="h-8 w-8 mx-auto mb-2 opacity-30" />Sin fotos registradas</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {fotos.map(f => (
                  <div key={f.name} className="relative group rounded overflow-hidden">
                    <img src={f.url} alt={f.name} className="w-full h-24 object-cover" />
                    <button onClick={() => handleDeletePhoto(f.name)} className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="historial" className="space-y-2">
            {historial.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Sin cambios registrados</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {historial.map((h: any) => (
                  <div key={h.id} className="flex items-start gap-2 text-xs border-l-2 border-primary/30 pl-3 py-1">
                    <div className="flex-1">
                      <span className="text-muted-foreground">{h.estado_anterior || '—'}</span>
                      <span className="mx-1">→</span>
                      <span className="font-medium">{h.estado_nuevo}</span>
                      {h.usuario_nombre && <div className="text-foreground mt-0.5">👤 {h.usuario_nombre}</div>}
                      {h.justificacion && <div className="text-muted-foreground mt-0.5 italic">💬 {h.justificacion}</div>}
                      <div className="text-muted-foreground mt-0.5">
                        {new Date(h.fecha_cambio).toLocaleString('es-CO')} · {h.metodo}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
