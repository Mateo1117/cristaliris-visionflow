import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { KanbanBoard } from '@/components/orders/KanbanBoard';
import { AlertasProduccion } from '@/components/dashboard/AlertasProduccion';
import { OrderListView } from '@/components/orders/OrderListView';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectGroup, SelectLabel, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, Kanban, List, Ruler, MessageCircle } from 'lucide-react';
import { useState, useMemo, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  MEDIOS_PAGO,
  DESCUENTO_MONTURA_PROPIA,
  calcularTotales,
  descuentoEfectivo,
  reglaMedioPago,
} from '@/lib/pricing';

interface OrderItem {
  producto_catalogo_id?: string | null;
  descripcion: string;
  categoria?: string;
  cantidad: number;
  precio_unitario: number;
  tipo_producto: string;
  tipo_lente_tiempo?: string | null;
  aplica_descuento: boolean;
  descuento_porcentaje: number;
  laboratorio_id?: string | null;
  numero_montura?: string;
  medidas_progresivo?: {
    puente?: string;
    distancia_vertice?: string;
    angulo_pantoscopico?: string;
    dp_od?: string;
    dp_oi?: string;
    altura_od?: string;
    altura_oi?: string;
    montura_vertical?: string;
    montura_horizontal?: string;
    montura_efectiva?: string;
    montura_mecanica?: string;
  };
}

const nuevoItem = (descDefecto = 0): OrderItem => ({
  producto_catalogo_id: null,
  descripcion: '',
  categoria: '',
  cantidad: 1,
  precio_unitario: 0,
  tipo_producto: 'lente',
  tipo_lente_tiempo: null,
  aplica_descuento: true,
  descuento_porcentaje: descDefecto,
  numero_montura: '',
  medidas_progresivo: {},
});

const categoriaLabel: Record<string, string> = {
  monofocal: 'Monofocales',
  bifocal: 'Bifocales',
  progresivo: 'Progresivos',
  lente_contacto: 'Lentes de Contacto',
  otros: 'Otros',
};

export default function Orders() {
  const [showForm, setShowForm] = useState(false);
  const [selectedPaciente, setSelectedPaciente] = useState('');
  const [items, setItems] = useState<OrderItem[]>([nuevoItem()]);
  const [monturaPropia, setMonturaPropia] = useState(false);
  const [observaciones, setObservaciones] = useState('');
  const [abono, setAbono] = useState(0);
  const [medioPagoAbono, setMedioPagoAbono] = useState('efectivo');
  const [medioPagoSaldo, setMedioPagoSaldo] = useState('efectivo');
  const queryClient = useQueryClient();

  const { data: pacientes = [] } = useQuery({
    queryKey: ['pacientes-ordenes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pacientes')
        .select('id, nombres, apellidos, numero_documento, telefono, email, modalidad_pago, empresa_id, empresas(razon_social, porcentaje_descuento)')
        .order('nombres');
      if (error) throw error;
      return data;
    },
  });

  const { data: productos = [] } = useQuery({
    queryKey: ['productos-catalogo-ordenes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('productos_catalogo').select('*').eq('activo', true).order('orden_display');
      if (error) throw error;
      return data;
    },
  });

  const { data: labs = [] } = useQuery({
    queryKey: ['laboratorios-ordenes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('laboratorios').select('id, nombre').eq('estado_activo', true);
      if (error) throw error;
      return data;
    },
  });

  const pacienteSel = pacientes.find((p: any) => p.id === selectedPaciente);
  const descuentoConvenio: number = (pacienteSel?.empresas?.porcentaje_descuento as number) || 0;

  // Descuento realmente aplicable: el del convenio menos 5 puntos si el medio de pago
  // del saldo es tarjeta / Addi / Sistecrédito / link de pago (README 6.1).
  const pctEfectivo = descuentoEfectivo(descuentoConvenio, medioPagoSaldo);
  const reglaSaldo = reglaMedioPago(medioPagoSaldo);

  // Al cambiar el convenio o el medio de pago se recalcula el % de cada línea.
  useEffect(() => {
    setItems((prev) => prev.map((it) =>
      it.aplica_descuento ? { ...it, descuento_porcentaje: pctEfectivo } : { ...it, descuento_porcentaje: 0 }
    ));
  }, [pctEfectivo]);

  const addItem = () => setItems([...items, nuevoItem(pctEfectivo)]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, patch: Partial<OrderItem>) => {
    const updated = [...items];
    updated[i] = { ...updated[i], ...patch };
    setItems(updated);
  };

  const handleProductoChange = (index: number, productoId: string) => {
    if (productoId === 'free') {
      updateItem(index, {
        producto_catalogo_id: null, descripcion: '', categoria: '', precio_unitario: 0,
        aplica_descuento: true, descuento_porcentaje: pctEfectivo, tipo_lente_tiempo: null,
      });
      return;
    }
    const prod = productos.find((p: any) => p.id === productoId);
    if (!prod) return;
    const tipoTiempo = prod.categoria === 'progresivo' ? 'progresivo'
      : prod.categoria === 'bifocal' ? 'talla'
      : prod.categoria === 'monofocal' ? 'terminado'
      : null;
    updateItem(index, {
      producto_catalogo_id: prod.id,
      descripcion: prod.nombre,
      categoria: prod.categoria,
      precio_unitario: Number(prod.precio_full) || 0,
      tipo_producto: 'lente',
      tipo_lente_tiempo: tipoTiempo,
      aplica_descuento: !!prod.aplica_descuento,
      descuento_porcentaje: prod.aplica_descuento ? pctEfectivo : 0,
    });
  };

  const updateMedida = (i: number, field: string, value: string) => {
    const cur = items[i].medidas_progresivo || {};
    updateItem(i, { medidas_progresivo: { ...cur, [field]: value } });
  };

  /**
   * Totales de la orden a partir de `pricing.ts` (fuente única de la lógica
   * financiera). Se usa tanto para la vista previa como para lo que se persiste.
   */
  const computeTotales = (lista: OrderItem[]) =>
    calcularTotales({
      items: lista.map((it) => ({
        cantidad: it.cantidad,
        precioUnitario: it.precio_unitario,
        aplicaDescuento: it.aplica_descuento,
        descuentoPorcentaje: it.descuento_porcentaje,
      })),
      pctEmpresa: descuentoConvenio,
      medioPago: medioPagoSaldo,
      descuentoAdicional: monturaPropia ? DESCUENTO_MONTURA_PROPIA : 0,
    });

  const totales = useMemo(() => {
    const t = computeTotales(items);
    return { ...t, saldo: Math.max(0, t.total - (abono || 0)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, monturaPropia, abono, descuentoConvenio, medioPagoSaldo]);

  const productosPorCategoria = useMemo(() => {
    const groups: Record<string, any[]> = {};
    productos.forEach((p: any) => {
      const key = p.categoria || 'otros';
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    });
    return groups;
  }, [productos]);

  const resetForm = () => {
    setSelectedPaciente(''); setItems([nuevoItem()]); setMonturaPropia(false);
    setObservaciones(''); setAbono(0); setMedioPagoAbono('efectivo'); setMedioPagoSaldo('efectivo');
  };

  const createOrden = useMutation({
    mutationFn: async () => {
      if (!selectedPaciente) throw new Error('Seleccione un paciente');
      const lineas = items.filter(it => it.descripcion);
      if (lineas.length === 0) throw new Error('Agregue al menos un ítem');

      // Se recalculan los totales SOLO con las líneas que realmente se guardan,
      // para que la orden y sus productos siempre cuadren.
      const t = computeTotales(lineas);
      const saldo = Math.max(0, t.total - (abono || 0));
      if (abono > t.total) throw new Error('El abono inicial no puede superar el total de la orden');

      const { data: orden, error: oe } = await supabase.from('ordenes').insert({
        paciente_id: selectedPaciente,
        empresa_id: pacienteSel?.empresa_id || null,
        modalidad_pago: medioPagoSaldo,
        subtotal: t.subtotal,
        // descuento_empresa / descuento_porcentaje son el DESGLOSE informativo de la
        // orden. El descuento ya viene restado en orden_productos.precio_venta, pero
        // total_final se deriva del subtotal bruto (no de la suma de precio_venta),
        // por lo que no se descuenta dos veces.
        descuento_empresa: t.descuentoValor,
        descuento_porcentaje: t.descuentoPct,
        descuento_montura_propia: t.descuentoAdicional,
        montura_propia: monturaPropia,
        recargo_financiero: t.recargoFinanciero,
        total_final: t.total,
        saldo_pendiente: saldo,
        estado_pago: saldo === 0 ? 'pagado' : (abono > 0 ? 'parcial' : 'pendiente'),
        observaciones: observaciones || null,
      }).select('id, numero_orden').single();
      if (oe) throw oe;

      const productosOrden = lineas.map((it, i) => ({
        orden_id: orden.id,
        tipo_producto: it.tipo_producto || 'lente',
        descripcion: it.descripcion,
        // Precio NETO de descuentos de convenio (cantidad × precio − descuento de la
        // línea). Los reportes de utilidad asumen que precio_venta ya viene neto.
        // LIMITACIÓN: `orden_productos` no tiene columna `cantidad`, así que la
        // cantidad queda embebida en el precio total de la línea (ver utilityCalc.ts).
        precio_venta: t.lineas[i].neto,
        producto_catalogo_id: it.producto_catalogo_id || null,
        laboratorio_id: it.laboratorio_id || null,
        tipo_lente_tiempo: it.tipo_lente_tiempo || null,
        numero_montura: it.numero_montura || null,
        medidas_progresivo: it.tipo_lente_tiempo === 'progresivo' && it.medidas_progresivo
          ? it.medidas_progresivo as any
          : null,
      }));
      const { error: pe } = await supabase.from('orden_productos').insert(productosOrden);
      if (pe) throw pe;

      const advertencias: string[] = [];

      // Abono inicial
      if (abono > 0) {
        const { error: ae } = await supabase.from('abonos').insert({
          paciente_id: selectedPaciente,
          orden_id: orden.id,
          monto: abono,
          medio_pago: medioPagoAbono,
          observaciones: `Abono inicial al crear orden`,
        });
        if (ae) advertencias.push(`La orden se creó pero el abono inicial no se registró: ${ae.message}`);
      }

      // Notificación interna automática (no crítica)
      const { error: ne } = await supabase.from('notificaciones').insert({
        tipo: 'orden_creada',
        titulo: `Nueva orden ORD-${String(orden.numero_orden).padStart(5, '0')}`,
        detalle: `${pacienteSel?.nombres} ${pacienteSel?.apellidos} — Total $${t.total.toLocaleString('es-CO')}`,
      });
      if (ne) advertencias.push('No se pudo crear la notificación interna');

      return { orden, paciente: pacienteSel, total: t.total, saldo, advertencias };
    },
    onSuccess: ({ orden, paciente, total, saldo, advertencias }) => {
      advertencias.forEach((msg) => toast.warning(msg));
      queryClient.invalidateQueries({ queryKey: ['orden-productos'] });
      queryClient.invalidateQueries({ queryKey: ['notificaciones'] });
      queryClient.invalidateQueries({ queryKey: ['ordenes-cartera'] });
      const numeroLabel = `ORD-${String(orden.numero_orden).padStart(5, '0')}`;
      toast.success(`Orden ${numeroLabel} creada`, {
        action: paciente?.telefono ? {
          label: 'Avisar por WhatsApp',
          onClick: () => {
            const clean = (paciente.telefono as string).replace(/\D/g, '');
            const phone = clean.startsWith('57') ? clean : `57${clean}`;
            const msg = encodeURIComponent(
              `Hola ${paciente.nombres}, hemos creado su orden ${numeroLabel} en Cristal Iris. ` +
              `Total: $${total.toLocaleString('es-CO')}. ` +
              (saldo > 0 ? `Saldo pendiente: $${saldo.toLocaleString('es-CO')}.` : 'Pago completo registrado.')
            );
            window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
          },
        } : undefined,
      });
      setShowForm(false);
      resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    createOrden.mutate();
  };

  return (
    <AppLayout>
      <PageHeader title="Órdenes" description="Seguimiento de producción y entregas">
        <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4 mr-1" />Nueva Orden</Button>
      </PageHeader>

      <AlertasProduccion />

      <Tabs defaultValue="kanban" className="space-y-4 mt-4">
        <TabsList>
          <TabsTrigger value="kanban" className="gap-1.5"><Kanban className="h-4 w-4" />Kanban</TabsTrigger>
          <TabsTrigger value="lista" className="gap-1.5"><List className="h-4 w-4" />Lista</TabsTrigger>
        </TabsList>
        <TabsContent value="kanban"><KanbanBoard /></TabsContent>
        <TabsContent value="lista"><OrderListView /></TabsContent>
      </Tabs>

      <Dialog open={showForm} onOpenChange={(o) => { setShowForm(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nueva Orden</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Paciente */}
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
                <p className="text-xs text-muted-foreground">
                  Convenio {descuentoConvenio}% · descuento efectivo aplicado:{' '}
                  <span className="font-semibold text-primary">{pctEfectivo}%</span>
                  {reglaSaldo.ajustaDescuento && (
                    <span className="text-warning"> (−5 puntos por pago con {reglaSaldo.l})</span>
                  )}
                </p>
              )}
            </div>

            {/* Ítems */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Productos / Ítems</Label>
                <Button type="button" size="sm" variant="outline" onClick={addItem}><Plus className="h-3 w-3 mr-1" />Agregar ítem</Button>
              </div>

              {items.map((it, i) => (
                <Card key={i} className="border-dashed">
                  <CardContent className="p-3 space-y-3">
                    <div className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-12 md:col-span-5 space-y-1">
                        <Label className="text-xs">Producto</Label>
                        <Select value={it.producto_catalogo_id || 'free'} onValueChange={(v) => handleProductoChange(i, v)}>
                          <SelectTrigger><SelectValue placeholder="Seleccione del catálogo" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="free">— Personalizado (libre) —</SelectItem>
                            {Object.entries(productosPorCategoria).map(([cat, prods]) => (
                              <SelectGroup key={cat}>
                                <SelectLabel>{categoriaLabel[cat] || cat}</SelectLabel>
                                {prods.map((p: any) => (
                                  <SelectItem key={p.id} value={p.id}>{p.nombre} — ${Number(p.precio_full).toLocaleString('es-CO')}</SelectItem>
                                ))}
                              </SelectGroup>
                            ))}
                          </SelectContent>
                        </Select>
                        {!it.producto_catalogo_id && (
                          <Input
                            value={it.descripcion}
                            onChange={(e) => updateItem(i, { descripcion: e.target.value })}
                            placeholder="Descripción libre"
                            className="mt-1"
                          />
                        )}
                      </div>
                      <div className="col-span-4 md:col-span-2 space-y-1">
                        <Label className="text-xs">Cant.</Label>
                        <Input type="number" min={1} value={it.cantidad} onChange={(e) => updateItem(i, { cantidad: parseInt(e.target.value) || 1 })} />
                      </div>
                      <div className="col-span-8 md:col-span-2 space-y-1">
                        <Label className="text-xs">Precio</Label>
                        <Input type="number" step="100" value={it.precio_unitario || ''} onChange={(e) => updateItem(i, { precio_unitario: parseFloat(e.target.value) || 0 })} />
                      </div>
                      <div className="col-span-8 md:col-span-2 space-y-1">
                        <Label className="text-xs">% Desc.</Label>
                        <Input
                          type="number" min={0} max={100}
                          disabled={!it.aplica_descuento}
                          value={it.aplica_descuento ? (it.descuento_porcentaje || 0) : 0}
                          onChange={(e) => updateItem(i, { descuento_porcentaje: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div className="col-span-4 md:col-span-1 flex justify-end">
                        {items.length > 1 && (
                          <Button type="button" size="icon" variant="ghost" onClick={() => removeItem(i)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Laboratorio</Label>
                        <Select value={it.laboratorio_id || 'none'} onValueChange={(v) => updateItem(i, { laboratorio_id: v === 'none' ? null : v })}>
                          <SelectTrigger><SelectValue placeholder="Sin laboratorio" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin laboratorio</SelectItem>
                            {labs.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.nombre}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs"># Montura</Label>
                        <Input value={it.numero_montura || ''} onChange={(e) => updateItem(i, { numero_montura: e.target.value })} placeholder="Ej: M-1234" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Tipo / Tiempo</Label>
                        <Select value={it.tipo_lente_tiempo || 'none'} onValueChange={(v) => updateItem(i, { tipo_lente_tiempo: v === 'none' ? null : v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">—</SelectItem>
                            <SelectItem value="progresivo">Progresivo (3d)</SelectItem>
                            <SelectItem value="talla">Talla (3d)</SelectItem>
                            <SelectItem value="sol_formula">Sol con fórmula (3d)</SelectItem>
                            <SelectItem value="terminado">Terminado (1d)</SelectItem>
                            <SelectItem value="montura_3piezas">Montura 3 piezas (2d)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Medidas progresivo */}
                    {it.tipo_lente_tiempo === 'progresivo' && (
                      <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                        <div className="flex items-center gap-1 text-xs font-semibold text-primary">
                          <Ruler className="h-3.5 w-3.5" />Medidas Progresivo
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                          {[
                            ['puente', 'Puente'],
                            ['distancia_vertice', 'Dist. Vértice'],
                            ['angulo_pantoscopico', 'Áng. Pantoscópico'],
                            ['dp_od', 'DP OD'],
                            ['dp_oi', 'DP OI'],
                            ['altura_od', 'Altura OD'],
                            ['altura_oi', 'Altura OI'],
                            ['montura_vertical', 'M. Vertical'],
                            ['montura_horizontal', 'M. Horizontal'],
                            ['montura_efectiva', 'M. Efectiva'],
                            ['montura_mecanica', 'M. Mecánica'],
                          ].map(([k, l]) => (
                            <div key={k} className="space-y-0.5">
                              <Label className="text-[10px] text-muted-foreground">{l}</Label>
                              <Input
                                className="h-8 text-xs"
                                value={(it.medidas_progresivo as any)?.[k] || ''}
                                onChange={(e) => updateMedida(i, k, e.target.value)}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Montura propia */}
            <div className="flex items-center gap-2 p-3 rounded-md border">
              <Checkbox id="montura-propia" checked={monturaPropia} onCheckedChange={(c) => setMonturaPropia(!!c)} />
              <Label htmlFor="montura-propia" className="text-sm cursor-pointer">
                Paciente trae su propia montura (descuento ${DESCUENTO_MONTURA_PROPIA.toLocaleString('es-CO')})
              </Label>
            </div>

            <Separator />

            {/* Totales */}
            <div className="rounded-lg border p-4 space-y-2 bg-muted/20">
              <div className="flex justify-between text-sm"><span>Subtotal</span><span>${totales.subtotal.toLocaleString('es-CO')}</span></div>
              <div className="flex justify-between text-sm text-destructive">
                <span>Descuento convenio {totales.descuentoPct > 0 && `(${totales.descuentoPct}%)`}</span>
                <span>-${totales.descuentoValor.toLocaleString('es-CO')}</span>
              </div>
              {monturaPropia && (
                <div className="flex justify-between text-sm text-destructive"><span>Montura propia</span><span>-${totales.descuentoAdicional.toLocaleString('es-CO')}</span></div>
              )}
              {totales.recargoFinanciero > 0 && (
                <div className="flex justify-between text-sm text-warning">
                  <span>Recargo financiero (9% · {reglaSaldo.l})</span>
                  <span>+${totales.recargoFinanciero.toLocaleString('es-CO')}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-lg font-bold"><span>Total</span><span className="text-primary">${totales.total.toLocaleString('es-CO')}</span></div>

              <div className="grid grid-cols-2 gap-3 pt-3">
                <div className="space-y-1">
                  <Label className="text-xs">Abono inicial</Label>
                  <Input type="number" min={0} max={totales.total} value={abono || ''} onChange={(e) => setAbono(parseFloat(e.target.value) || 0)} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Medio del abono</Label>
                  <Select value={medioPagoAbono} onValueChange={setMedioPagoAbono} disabled={abono <= 0}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MEDIOS_PAGO.map(m => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Saldo pendiente</Label>
                  <Input value={`$${totales.saldo.toLocaleString('es-CO')}`} disabled className="font-medium" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Medio del saldo</Label>
                  <Select value={medioPagoSaldo} onValueChange={setMedioPagoSaldo}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MEDIOS_PAGO.map(m => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Observaciones */}
            <div className="space-y-1">
              <Label className="text-sm">Observaciones</Label>
              <Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Notas internas, instrucciones para laboratorio, etc." rows={3} />
            </div>

            <div className="flex items-center justify-between pt-4 border-t">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MessageCircle className="h-3 w-3" />Se notificará al paciente automáticamente al crear la orden
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
                <Button type="submit" disabled={createOrden.isPending}>
                  {createOrden.isPending ? 'Creando...' : 'Crear Orden'}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
