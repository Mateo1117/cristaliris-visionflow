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
import { ChevronRight, ChevronLeft, Printer, Upload, Trash2, Clock, AlertTriangle, Camera, Image, Calculator, Save, Loader2, Receipt, Tag } from 'lucide-react';
import { printThermalLabel, printThermalReceipt } from '@/lib/printing/thermal';

interface Props {
  item: OrdenProducto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrderDetailDialog({ item, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

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
      setEditingCosts(false);
      toast.success('Costos y utilidad actualizados');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const currentIndex = item ? ESTADOS_PRODUCTO.findIndex(e => e.key === item.estado_actual) : -1;
  const nextEstado = currentIndex >= 0 && currentIndex < ESTADOS_PRODUCTO.length - 1 ? ESTADOS_PRODUCTO[currentIndex + 1] : null;
  const prevEstado = currentIndex > 0 ? ESTADOS_PRODUCTO[currentIndex - 1] : null;

  const changeState = useMutation({
    mutationFn: async ({ id, newState, oldState }: { id: string; newState: string; oldState: string }) => {
      const { error: e1 } = await supabase.from('orden_productos').update({ estado_actual: newState as any }).eq('id', id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('estados_producto').insert({
        orden_producto_id: id, estado_anterior: oldState as any, estado_nuevo: newState as any, metodo: 'manual',
      });
      if (e2) throw e2;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['orden-productos'] }); toast.success('Estado actualizado'); },
    onError: (e: any) => toast.error(e.message),
  });

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
      return data.map(f => ({
        name: f.name,
        url: supabase.storage.from('orden-fotos').getPublicUrl(`${item.id}/${f.name}`).data.publicUrl,
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

  const printLabel = () => {
    const svg = document.getElementById('qr-print-area');
    if (!svg || !item) return;
    printThermalLabel({
      numero: numeroOrdenLabel || '',
      qrSvg: svg.outerHTML,
      paciente: item.paciente_nombre,
      descripcion: item.descripcion,
      laboratorio: item.laboratorio_nombre,
      numeroMontura: item.numero_montura || undefined,
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

  const qrUrl = item ? `${window.location.origin}/scan?id=${item.id}` : '';

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
            {item.dias_en_estado}d / {item.tiempo_esperado_dias}d
          </span>
        </div>

        <div className="flex gap-2 mb-4">
          {prevEstado && (
            <Button size="sm" variant="outline" onClick={() => changeState.mutate({ id: item.id, newState: prevEstado.key, oldState: item.estado_actual })} disabled={changeState.isPending}>
              <ChevronLeft className="h-3 w-3 mr-1" />{prevEstado.label}
            </Button>
          )}
          {nextEstado && (
            <Button size="sm" onClick={() => changeState.mutate({ id: item.id, newState: nextEstado.key, oldState: item.estado_actual })} disabled={changeState.isPending}>
              {nextEstado.label}<ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          )}
        </div>

        <Tabs defaultValue="detalle">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="detalle">Detalle</TabsTrigger>
            <TabsTrigger value="costos">Costos</TabsTrigger>
            <TabsTrigger value="qr">QR</TabsTrigger>
            <TabsTrigger value="fotos">Fotos</TabsTrigger>
            <TabsTrigger value="historial">Historial</TabsTrigger>
          </TabsList>

          <TabsContent value="detalle" className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-muted-foreground">Producto:</span> {item.tipo_producto}</div>
              <div><span className="text-muted-foreground">Lab:</span> {item.laboratorio_nombre}</div>
            </div>
            <div><span className="text-muted-foreground">Descripción:</span> {item.descripcion}</div>
            {item.es_garantia && <Badge variant="outline" className="text-yellow-600">Garantía</Badge>}
            {item.es_reproceso && <Badge variant="outline" className="text-red-600">Reproceso</Badge>}
            {alertLevel !== 'ok' && (
              <Card className={`border-${alertLevel === 'destructive' ? 'destructive' : 'yellow-500'}`}>
                <CardContent className="p-3 text-xs">
                  <AlertTriangle className={`h-4 w-4 inline mr-1 ${alertLevel === 'destructive' ? 'text-destructive' : 'text-yellow-500'}`} />
                  {alertLevel === 'destructive'
                    ? `⚠️ Excedido: ${item.dias_en_estado - item.tiempo_esperado_dias} día(s) de retraso`
                    : `⏳ Próximo a vencer: ${item.tiempo_esperado_dias - item.dias_en_estado} día(s) restantes`}
                </CardContent>
              </Card>
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
            <QRCodeSVG id="qr-print-area" value={qrUrl} size={200} />
            <p className="text-xs text-muted-foreground text-center break-all">{item.id.slice(0, 8)}</p>
            {item.numero_montura && <p className="text-xs"># Montura: <span className="font-medium">{item.numero_montura}</span></p>}
            <Button onClick={printQR} variant="outline" size="sm"><Printer className="h-4 w-4 mr-1" />Imprimir QR</Button>
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
