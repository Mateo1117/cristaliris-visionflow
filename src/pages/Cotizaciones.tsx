import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Plus, FileText, TrendingUp, ArrowRightCircle, Trash2, PercentCircle, Package, Copy } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const DESCUENTO_MONTURA_PROPIA = 90000;

interface CotizacionItem {
  producto_catalogo_id?: string | null;
  descripcion: string;
  categoria?: string;
  cantidad: number;
  precio_unitario: number;
  tipo_producto: string;
  aplica_descuento: boolean;
  descuento_porcentaje: number;
  inventario_id?: string | null;
  laboratorio_id?: string | null;
  costo_unitario?: number;
}

const nuevoItem = (descDefecto = 0): CotizacionItem => ({
  producto_catalogo_id: null,
  descripcion: '',
  categoria: '',
  cantidad: 1,
  precio_unitario: 0,
  tipo_producto: 'lente',
  aplica_descuento: true,
  descuento_porcentaje: descDefecto,
});

export default function Cotizaciones() {
  const [showForm, setShowForm] = useState(false);
  const [showConvert, setShowConvert] = useState<any>(null);
  const [showDetail, setShowDetail] = useState<any>(null);
  const [selectedPaciente, setSelectedPaciente] = useState('');
  const [items, setItems] = useState<CotizacionItem[]>([nuevoItem()]);
  const [monturaPropia, setMonturaPropia] = useState(false);
  const queryClient = useQueryClient();

  const { data: cotizaciones = [], isLoading } = useQuery({
    queryKey: ['cotizaciones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cotizaciones')
        .select('*, pacientes(nombres, apellidos, numero_documento, modalidad_pago, empresa_id, empresas(razon_social, porcentaje_descuento))')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: pacientes = [] } = useQuery({
    queryKey: ['pacientes-cotizaciones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pacientes')
        .select('id, nombres, apellidos, numero_documento, empresa_id, empresas(razon_social, porcentaje_descuento)')
        .order('nombres');
      if (error) throw error;
      return data;
    },
  });

  const { data: productos = [] } = useQuery({
    queryKey: ['productos-catalogo'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('productos_catalogo')
        .select('*')
        .eq('activo', true)
        .order('orden_display');
      if (error) throw error;
      return data;
    },
  });

  const { data: inventario = [] } = useQuery({
    queryKey: ['inventario-cotizaciones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventario')
        .select('id, codigo_referencia, marca, modelo, descripcion, precio_venta, costo_unitario, cantidad_disponible, tipo, sedes(nombre)')
        .gt('cantidad_disponible', 0)
        .eq('estado', 'activo')
        .order('marca');
      if (error) throw error;
      return data;
    },
  });

  const { data: labs = [] } = useQuery({
    queryKey: ['laboratorios-cotizaciones'],
    queryFn: async () => {
      const { data, error } = await supabase.from('laboratorios').select('id, nombre').eq('estado_activo', true);
      if (error) throw error;
      return data;
    },
  });

  const pacienteSel = pacientes.find((p: any) => p.id === selectedPaciente);
  const descuentoConvenio: number = (pacienteSel?.empresas?.porcentaje_descuento as number) || 0;

  // Cuando cambia el paciente, ajustar descuento por defecto a sus items con descuento aplicable
  useEffect(() => {
    setItems((prev) => prev.map((it) => it.aplica_descuento ? { ...it, descuento_porcentaje: descuentoConvenio } : { ...it, descuento_porcentaje: 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [descuentoConvenio]);

  // Metrics
  const totalCotizaciones = cotizaciones.length;
  const convertidas = cotizaciones.filter((c: any) => c.estado === 'convertida').length;
  const vigentes = cotizaciones.filter((c: any) => c.estado === 'vigente').length;
  const tasaCierre = totalCotizaciones > 0 ? ((convertidas / totalCotizaciones) * 100).toFixed(1) : '0.0';
  const totalEstimado = cotizaciones.filter((c: any) => c.estado === 'vigente').reduce((s: number, c: any) => s + (c.total_estimado || 0), 0);

  const addItem = () => setItems([...items, nuevoItem(descuentoConvenio)]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, patch: Partial<CotizacionItem>) => {
    const updated = [...items];
    updated[i] = { ...updated[i], ...patch };
    setItems(updated);
  };

  const handleProductoChange = (index: number, productoId: string) => {
    if (productoId === 'free') {
      updateItem(index, { producto_catalogo_id: null, descripcion: '', categoria: '', precio_unitario: 0, aplica_descuento: true, descuento_porcentaje: descuentoConvenio });
      return;
    }
    const prod = productos.find((p: any) => p.id === productoId);
    if (!prod) return;
    const tipo = prod.categoria === 'lente_contacto' ? 'lente' : 'lente';
    updateItem(index, {
      producto_catalogo_id: prod.id,
      descripcion: prod.nombre,
      categoria: prod.categoria,
      precio_unitario: Number(prod.precio_full) || 0,
      tipo_producto: tipo,
      aplica_descuento: !!prod.aplica_descuento,
      descuento_porcentaje: prod.aplica_descuento ? descuentoConvenio : 0,
    });
  };

  const handleInventarioChange = (index: number, invId: string) => {
    if (invId === 'none') {
      updateItem(index, { inventario_id: null });
      return;
    }
    const inv = inventario.find((m: any) => m.id === invId);
    if (inv) {
      updateItem(index, {
        inventario_id: inv.id,
        descripcion: `${inv.marca || ''} ${inv.modelo || ''} ${inv.descripcion || ''}`.trim(),
        precio_unitario: inv.precio_venta || 0,
        costo_unitario: inv.costo_unitario || 0,
        tipo_producto: inv.tipo || 'montura',
        producto_catalogo_id: null,
        aplica_descuento: false,
        descuento_porcentaje: 0,
      });
    }
  };

  const totales = useMemo(() => {
    const subtotal = items.reduce((s, it) => s + it.cantidad * it.precio_unitario, 0);
    const descuento = items.reduce((s, it) => {
      const lineSub = it.cantidad * it.precio_unitario;
      const pct = it.aplica_descuento ? (it.descuento_porcentaje || 0) : 0;
      return s + lineSub * (pct / 100);
    }, 0);
    const descMontura = monturaPropia ? DESCUENTO_MONTURA_PROPIA : 0;
    const total = Math.max(0, subtotal - descuento - descMontura);
    return { subtotal, descuento, descMontura, total };
  }, [items, monturaPropia]);

  const resetForm = () => {
    setSelectedPaciente('');
    setItems([nuevoItem()]);
    setMonturaPropia(false);
  };

  const createCotizacion = useMutation({
    mutationFn: async (data: { paciente_id: string; items: CotizacionItem[]; total_estimado: number; fecha_vencimiento?: string; montura_propia: boolean }) => {
      const payload: any = {
        paciente_id: data.paciente_id,
        items: { lineas: data.items, montura_propia: data.montura_propia, descuento_montura_propia: data.montura_propia ? DESCUENTO_MONTURA_PROPIA : 0 } as any,
        total_estimado: data.total_estimado,
        fecha_vencimiento: data.fecha_vencimiento || null,
      };
      const { error } = await supabase.from('cotizaciones').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cotizaciones'] });
      setShowForm(false);
      resetForm();
      toast.success('Cotización creada exitosamente');
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Helper para normalizar items (formato viejo y nuevo)
  const parseItems = (raw: any): { lineas: CotizacionItem[]; montura_propia: boolean; descuento_montura_propia: number } => {
    if (!raw) return { lineas: [], montura_propia: false, descuento_montura_propia: 0 };
    if (Array.isArray(raw)) {
      return { lineas: raw as CotizacionItem[], montura_propia: false, descuento_montura_propia: 0 };
    }
    return {
      lineas: (raw.lineas || []) as CotizacionItem[],
      montura_propia: !!raw.montura_propia,
      descuento_montura_propia: Number(raw.descuento_montura_propia) || 0,
    };
  };

  const convertirAOrden = useMutation({
    mutationFn: async (cotizacion: any) => {
      const { lineas, montura_propia, descuento_montura_propia } = parseItems(cotizacion.items);

      const subtotal = lineas.reduce((s, it) => s + (it.cantidad || 1) * (it.precio_unitario || 0), 0);
      const descuento = lineas.reduce((s, it) => {
        const ls = (it.cantidad || 1) * (it.precio_unitario || 0);
        const pct = it.aplica_descuento ? (it.descuento_porcentaje || 0) : 0;
        return s + ls * (pct / 100);
      }, 0);
      const totalFinal = Math.max(0, subtotal - descuento - descuento_montura_propia);

      const { data: orden, error: oe } = await supabase.from('ordenes').insert({
        paciente_id: cotizacion.paciente_id,
        empresa_id: cotizacion.pacientes?.empresa_id || null,
        modalidad_pago: cotizacion.pacientes?.modalidad_pago || 'contado',
        subtotal,
        descuento_empresa: descuento,
        descuento_porcentaje: cotizacion.pacientes?.empresas?.porcentaje_descuento || 0,
        total_final: totalFinal,
        saldo_pendiente: totalFinal,
        cotizacion_id: cotizacion.id,
        montura_propia,
        descuento_montura_propia,
      }).select('id').single();
      if (oe) throw oe;

      if (lineas.length > 0) {
        const productosOrden = lineas.map((it) => ({
          orden_id: orden.id,
          tipo_producto: it.tipo_producto || 'lente',
          descripcion: it.descripcion || 'Producto de cotización',
          precio_venta: (it.cantidad || 1) * (it.precio_unitario || 0),
          montura_id: it.inventario_id || null,
          producto_catalogo_id: it.producto_catalogo_id || null,
          laboratorio_id: it.laboratorio_id || null,
          costo_montura: it.inventario_id ? (it.costo_unitario || 0) : 0,
        }));
        const { error: pe } = await supabase.from('orden_productos').insert(productosOrden);
        if (pe) throw pe;
      }

      for (const it of lineas) {
        if (it.inventario_id) {
          const inv = inventario.find((m: any) => m.id === it.inventario_id);
          if (inv) {
            const newQty = Math.max(0, inv.cantidad_disponible - (it.cantidad || 1));
            const { error: ie } = await supabase.from('inventario').update({ cantidad_disponible: newQty }).eq('id', it.inventario_id);
            if (ie) throw ie;
          }
        }
      }

      const { error: ue } = await supabase.from('cotizaciones').update({
        estado: 'convertida',
        orden_id_convertida: orden.id,
      }).eq('id', cotizacion.id);
      if (ue) throw ue;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cotizaciones'] });
      queryClient.invalidateQueries({ queryKey: ['orden-productos'] });
      queryClient.invalidateQueries({ queryKey: ['inventario-cotizaciones'] });
      queryClient.invalidateQueries({ queryKey: ['inventario'] });
      setShowConvert(null);
      toast.success('Cotización convertida a orden exitosamente');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleDuplicate = (cotizacion: any) => {
    const parsed = parseItems(cotizacion.items);
    setSelectedPaciente(cotizacion.paciente_id);
    setMonturaPropia(parsed.montura_propia);
    setItems(parsed.lineas.length > 0 ? parsed.lineas.map(it => ({ ...nuevoItem(), ...it })) : [nuevoItem()]);
    setShowForm(true);
    toast.info('Cotización duplicada — modifique y guarde');
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedPaciente) { toast.error('Seleccione un paciente'); return; }
    if (items.every(it => !it.descripcion)) { toast.error('Agregue al menos un ítem'); return; }
    const fd = new FormData(e.currentTarget);
    createCotizacion.mutate({
      paciente_id: selectedPaciente,
      items: items.filter(it => it.descripcion),
      total_estimado: totales.total,
      fecha_vencimiento: fd.get('fecha_vencimiento') as string || undefined,
      montura_propia: monturaPropia,
    });
  };

  const estadoColor: Record<string, string> = {
    vigente: 'bg-primary/10 text-primary',
    convertida: 'bg-success/10 text-success',
    vencida: 'bg-destructive/10 text-destructive',
    cancelada: 'bg-muted text-muted-foreground',
  };

  // Agrupar productos por categoria para el dropdown
  const productosPorCategoria = useMemo(() => {
    const groups: Record<string, any[]> = {};
    productos.forEach((p: any) => {
      const key = p.categoria || 'otros';
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    });
    return groups;
  }, [productos]);

  const categoriaLabel: Record<string, string> = {
    monofocal: 'Monofocales',
    bifocal: 'Bifocales',
    progresivo: 'Progresivos',
    lente_contacto: 'Lentes de Contacto',
    otros: 'Otros',
  };

  return (
    <AppLayout>
      <PageHeader title="Cotizaciones" description="Gestión de cotizaciones y conversión a órdenes">
        <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4 mr-1" />Nueva Cotización</Button>
      </PageHeader>

      {/* KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><FileText className="h-5 w-5 text-primary" /></div>
          <div><p className="text-xs text-muted-foreground">Total Cotizaciones</p><p className="text-lg font-bold">{totalCotizaciones}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center"><ArrowRightCircle className="h-5 w-5 text-success" /></div>
          <div><p className="text-xs text-muted-foreground">Convertidas</p><p className="text-lg font-bold">{convertidas}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center"><PercentCircle className="h-5 w-5 text-accent" /></div>
          <div><p className="text-xs text-muted-foreground">Tasa de Cierre</p><p className="text-lg font-bold">{tasaCierre}%</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center"><TrendingUp className="h-5 w-5 text-warning" /></div>
          <div><p className="text-xs text-muted-foreground">Vigentes (valor)</p><p className="text-lg font-bold">${totalEstimado.toLocaleString('es-CO')}</p></div>
        </CardContent></Card>
      </div>

      {/* Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Paciente</TableHead>
              <TableHead>Convenio</TableHead>
              <TableHead>Ítems</TableHead>
              <TableHead>Total Estimado</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : cotizaciones.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No hay cotizaciones registradas</TableCell></TableRow>
            ) : cotizaciones.map((c: any) => {
              const parsed = parseItems(c.items);
              return (
                <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setShowDetail(c)}>
                  <TableCell className="text-sm">{new Date(c.created_at).toLocaleDateString('es-CO')}</TableCell>
                  <TableCell className="font-medium">{c.pacientes?.nombres} {c.pacientes?.apellidos}</TableCell>
                  <TableCell className="text-xs">
                    {c.pacientes?.empresas
                      ? <Badge variant="secondary" className="text-[10px]">{c.pacientes.empresas.razon_social} · {c.pacientes.empresas.porcentaje_descuento}%</Badge>
                      : <span className="text-muted-foreground">Particular</span>}
                  </TableCell>
                  <TableCell className="text-sm">{parsed.lineas.length} ítem(s){parsed.montura_propia && ' · Montura propia'}</TableCell>
                  <TableCell className="font-medium">${(c.total_estimado || 0).toLocaleString('es-CO')}</TableCell>
                  <TableCell><Badge className={`text-[10px] ${estadoColor[c.estado] || ''}`}>{c.estado}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      {c.estado === 'vigente' && (
                        <Button size="sm" variant="outline" onClick={() => setShowConvert(c)}>
                          <ArrowRightCircle className="h-3.5 w-3.5 mr-1" />Convertir
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => handleDuplicate(c)} title="Duplicar cotización">
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showForm} onOpenChange={(o) => { setShowForm(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nueva Cotización</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Paciente *</Label>
                <Select value={selectedPaciente} onValueChange={setSelectedPaciente}>
                  <SelectTrigger><SelectValue placeholder="Seleccione paciente" /></SelectTrigger>
                  <SelectContent>
                    {pacientes.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.numero_documento} — {p.nombres} {p.apellidos}
                        {p.empresas ? ` · ${p.empresas.razon_social} (${p.empresas.porcentaje_descuento}%)` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {pacienteSel?.empresas && (
                  <p className="text-[11px] text-success">Convenio: {pacienteSel.empresas.razon_social} — descuento {descuentoConvenio}%</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Fecha Vencimiento</Label>
                <Input name="fecha_vencimiento" type="date" />
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Ítems de la Cotización</Label>
                <Button type="button" size="sm" variant="outline" onClick={addItem}><Plus className="h-3.5 w-3.5 mr-1" />Agregar Ítem</Button>
              </div>
              {items.map((item, i) => {
                const lineSubtotal = item.cantidad * item.precio_unitario;
                const lineDesc = lineSubtotal * ((item.aplica_descuento ? item.descuento_porcentaje : 0) / 100);
                const lineTotal = lineSubtotal - lineDesc;
                return (
                  <Card key={i} className="p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">Ítem {i + 1}</span>
                      <Button type="button" size="icon" variant="ghost" className="text-destructive h-7 w-7" onClick={() => removeItem(i)} disabled={items.length === 1}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Producto del Catálogo *</Label>
                      <Select value={item.producto_catalogo_id || 'free'} onValueChange={(v) => handleProductoChange(i, v)}>
                        <SelectTrigger><SelectValue placeholder="Seleccione producto..." /></SelectTrigger>
                        <SelectContent className="max-h-80">
                          <SelectItem value="free">— Texto libre / Montura —</SelectItem>
                          {Object.entries(productosPorCategoria).map(([cat, list]) => (
                            <div key={cat}>
                              <div className="px-2 py-1 text-[10px] uppercase font-semibold text-muted-foreground bg-muted/50">{categoriaLabel[cat] || cat}</div>
                              {list.map((p: any) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.nombre} — ${Number(p.precio_full).toLocaleString('es-CO')}
                                  {!p.aplica_descuento && ' · sin desc.'}
                                </SelectItem>
                              ))}
                            </div>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Tipo Producto</Label>
                        <Select value={item.tipo_producto} onValueChange={(v) => updateItem(i, { tipo_producto: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="lente">Lente</SelectItem>
                            <SelectItem value="montura">Montura</SelectItem>
                            <SelectItem value="insumo">Insumo</SelectItem>
                            <SelectItem value="accesorio">Accesorio</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Laboratorio</Label>
                        <Select value={item.laboratorio_id || 'none'} onValueChange={(v) => updateItem(i, { laboratorio_id: v === 'none' ? null : v })}>
                          <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin laboratorio</SelectItem>
                            {labs.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.nombre}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {(item.tipo_producto === 'montura' || !item.producto_catalogo_id) && (
                      <div className="space-y-1">
                        <Label className="text-xs flex items-center gap-1"><Package className="h-3 w-3" />Vincular Montura del Inventario (opcional)</Label>
                        <Select value={item.inventario_id || 'none'} onValueChange={(v) => handleInventarioChange(i, v)}>
                          <SelectTrigger><SelectValue placeholder="Buscar en inventario..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin vincular</SelectItem>
                            {inventario.map((inv: any) => (
                              <SelectItem key={inv.id} value={inv.id}>
                                {inv.codigo_referencia ? `[${inv.codigo_referencia}] ` : ''}{inv.marca || ''} {inv.modelo || ''} — Stock: {inv.cantidad_disponible} — ${(inv.precio_venta || 0).toLocaleString('es-CO')}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="grid grid-cols-[1fr_70px_110px_90px] gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Descripción</Label>
                        <Input placeholder="Descripción..." value={item.descripcion} onChange={e => updateItem(i, { descripcion: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Cant.</Label>
                        <Input type="number" min={1} value={item.cantidad} onChange={e => updateItem(i, { cantidad: parseInt(e.target.value) || 1 })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Precio Full</Label>
                        <Input type="number" step="100" value={item.precio_unitario || ''} onChange={e => updateItem(i, { precio_unitario: parseFloat(e.target.value) || 0 })} placeholder="0" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Desc. %</Label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          value={item.descuento_porcentaje || 0}
                          disabled={!item.aplica_descuento}
                          onChange={e => updateItem(i, { descuento_porcentaje: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <label className="flex items-center gap-2 text-muted-foreground">
                        <Checkbox
                          checked={item.aplica_descuento}
                          onCheckedChange={(v) => updateItem(i, { aplica_descuento: !!v, descuento_porcentaje: v ? descuentoConvenio : 0 })}
                        />
                        Aplica descuento de convenio
                        {item.categoria === 'lente_contacto' && <span className="text-warning">(LC sin descuento)</span>}
                      </label>
                      <div className="text-right">
                        <p className="text-muted-foreground">Subtotal: ${lineSubtotal.toLocaleString('es-CO')} {lineDesc > 0 && <span className="text-success">− ${lineDesc.toLocaleString('es-CO')}</span>}</p>
                        <p className="font-semibold text-foreground">${lineTotal.toLocaleString('es-CO')}</p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            <Separator />

            <div className="flex items-center gap-2 rounded-lg bg-muted/40 border p-3">
              <Checkbox id="montura-propia" checked={monturaPropia} onCheckedChange={(v) => setMonturaPropia(!!v)} />
              <Label htmlFor="montura-propia" className="cursor-pointer text-sm">
                Paciente trae su montura
                <span className="ml-2 text-xs text-muted-foreground">(descuento de ${DESCUENTO_MONTURA_PROPIA.toLocaleString('es-CO')})</span>
              </Label>
            </div>

            <div className="rounded-lg p-3 bg-primary/5 border border-primary/20 space-y-1 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>${totales.subtotal.toLocaleString('es-CO')}</span></div>
              {totales.descuento > 0 && (
                <div className="flex justify-between text-success"><span>Descuento convenio</span><span>− ${totales.descuento.toLocaleString('es-CO')}</span></div>
              )}
              {totales.descMontura > 0 && (
                <div className="flex justify-between text-success"><span>Descuento montura propia</span><span>− ${totales.descMontura.toLocaleString('es-CO')}</span></div>
              )}
              <Separator className="my-1" />
              <div className="flex justify-between text-base font-bold text-primary"><span>Total</span><span>${totales.total.toLocaleString('es-CO')}</span></div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button type="submit" disabled={createCotizacion.isPending}>{createCotizacion.isPending ? 'Creando...' : 'Crear Cotización'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Convert to Order Dialog */}
      <Dialog open={!!showConvert} onOpenChange={(o) => { if (!o) setShowConvert(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Convertir a Orden</DialogTitle></DialogHeader>
          {showConvert && (() => {
            const parsed = parseItems(showConvert.items);
            const itemsConInv = parsed.lineas.filter(it => it.inventario_id);
            return (
              <div className="space-y-4">
                <div className="text-sm space-y-1">
                  <p>Paciente: <strong>{showConvert.pacientes?.nombres} {showConvert.pacientes?.apellidos}</strong></p>
                  {showConvert.pacientes?.empresas && (
                    <p className="text-xs text-success">Convenio: {showConvert.pacientes.empresas.razon_social} ({showConvert.pacientes.empresas.porcentaje_descuento}%)</p>
                  )}
                  <p>Total estimado: <strong>${(showConvert.total_estimado || 0).toLocaleString('es-CO')}</strong></p>
                  {parsed.montura_propia && <p className="text-xs text-success">Incluye descuento por montura propia</p>}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Ítems ({parsed.lineas.length})</Label>
                  {parsed.lineas.map((it, i) => (
                    <div key={i} className="flex items-center justify-between text-sm border rounded-md p-2">
                      <div>
                        <p className="font-medium">{it.descripcion}</p>
                        <p className="text-xs text-muted-foreground">
                          {it.tipo_producto} · Cant: {it.cantidad}
                          {it.aplica_descuento && it.descuento_porcentaje > 0 && ` · ${it.descuento_porcentaje}% desc`}
                          {it.inventario_id && <span className="ml-1">· 📦 Inventario</span>}
                        </p>
                      </div>
                      <span className="font-medium">${(it.cantidad * it.precio_unitario).toLocaleString('es-CO')}</span>
                    </div>
                  ))}
                </div>

                {itemsConInv.length > 0 && (
                  <div className="bg-info/10 border border-info/30 rounded-lg p-3 text-sm text-info">
                    📦 Se descontará el stock de {itemsConInv.length} ítem(s) vinculados al inventario.
                  </div>
                )}

                <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 text-sm text-warning">
                  Se creará <strong>una sola orden</strong> con {parsed.lineas.length} producto(s).
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button variant="outline" onClick={() => setShowConvert(null)}>Cancelar</Button>
                  <Button onClick={() => convertirAOrden.mutate(showConvert)} disabled={convertirAOrden.isPending}>
                    {convertirAOrden.isPending ? 'Convirtiendo...' : 'Confirmar Conversión'}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!showDetail} onOpenChange={(o) => { if (!o) setShowDetail(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />Detalle de Cotización</DialogTitle></DialogHeader>
          {showDetail && (() => {
            const parsed = parseItems(showDetail.items);
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Paciente</p>
                    <p className="font-medium">{showDetail.pacientes?.nombres} {showDetail.pacientes?.apellidos}</p>
                    <p className="text-xs text-muted-foreground">{showDetail.pacientes?.numero_documento}</p>
                    {showDetail.pacientes?.empresas && (
                      <p className="text-xs text-success mt-1">Convenio: {showDetail.pacientes.empresas.razon_social} ({showDetail.pacientes.empresas.porcentaje_descuento}%)</p>
                    )}
                  </div>
                  <div>
                    <p className="text-muted-foreground">Estado</p>
                    <Badge className={`text-[10px] ${estadoColor[showDetail.estado] || ''}`}>{showDetail.estado}</Badge>
                    <p className="text-xs text-muted-foreground mt-2">Fecha: {new Date(showDetail.created_at).toLocaleDateString('es-CO')}</p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Ítems ({parsed.lineas.length})</Label>
                  {parsed.lineas.map((it, i) => {
                    const ls = it.cantidad * it.precio_unitario;
                    const ld = ls * ((it.aplica_descuento ? it.descuento_porcentaje : 0) / 100);
                    return (
                      <Card key={i} className="p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <p className="text-sm font-medium">{it.descripcion || 'Sin descripción'}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <Badge variant="outline" className="text-[10px]">{it.tipo_producto || 'lente'}</Badge>
                              {it.categoria && <Badge variant="outline" className="text-[10px]">{categoriaLabel[it.categoria] || it.categoria}</Badge>}
                              {it.aplica_descuento && it.descuento_porcentaje > 0 && (
                                <Badge variant="secondary" className="text-[10px]">{it.descuento_porcentaje}% desc</Badge>
                              )}
                              {it.inventario_id && (
                                <Badge variant="secondary" className="text-[10px] gap-1"><Package className="h-3 w-3" />Inventario</Badge>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold">${(ls - ld).toLocaleString('es-CO')}</p>
                            <p className="text-[10px] text-muted-foreground">{it.cantidad} × ${it.precio_unitario.toLocaleString('es-CO')}</p>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>

                {parsed.montura_propia && (
                  <div className="text-sm flex justify-between text-success border-t pt-2">
                    <span>Descuento montura propia</span><span>− ${parsed.descuento_montura_propia.toLocaleString('es-CO')}</span>
                  </div>
                )}

                <div className="rounded-lg p-3 bg-primary/5 border border-primary/20 flex items-center justify-between">
                  <span className="text-sm font-medium">Total Estimado</span>
                  <span className="text-lg font-bold text-primary">${(showDetail.total_estimado || 0).toLocaleString('es-CO')}</span>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button variant="ghost" size="sm" onClick={() => { handleDuplicate(showDetail); setShowDetail(null); }}>
                    <Copy className="h-3.5 w-3.5 mr-1" />Duplicar
                  </Button>
                  {showDetail.estado === 'vigente' && (
                    <Button size="sm" onClick={() => { setShowConvert(showDetail); setShowDetail(null); }}>
                      <ArrowRightCircle className="h-3.5 w-3.5 mr-1" />Convertir a Orden
                    </Button>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
