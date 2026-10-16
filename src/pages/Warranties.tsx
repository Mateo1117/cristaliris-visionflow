import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Plus, ShieldAlert, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { FormulaEditor, aFormula, aTexto, type FormulaTexto } from '@/components/orders/FormulaEditor';
import { TablaFormula, useFormulaOrden } from '@/components/orders/FormulaOrdenCard';
import { textoFormulaCompleta, tieneFormula } from '@/components/orders/formulaOrden';
import { toast } from 'sonner';

const estadoColor: Record<string, string> = {
  solicitada: 'bg-warning/10 text-warning',
  en_proceso: 'bg-info/10 text-info',
  aprobada: 'bg-success/10 text-success',
  rechazada: 'bg-destructive/10 text-destructive',
  entregada: 'bg-muted text-muted-foreground',
};

/**
 * ÚNICA fuente de verdad del subcódigo de garantía (README, Módulo 5.2).
 *
 * Formato: `G{ciclo}-{8 primeros caracteres del id del producto}`, p. ej.
 * `G2-3F9A1C0B`. El control de calidad ya NO genera garantías (un rechazo antes
 * de entregar es un reproceso interno), así que este generador vive solo aquí.
 */
function generarSubcodigoGarantia(ordenProductoId: string, ciclo: number): string {
  return `G${ciclo}-${ordenProductoId.slice(0, 8).toUpperCase()}`;
}

export default function Warranties() {
  const [search, setSearch] = useState('');
  const [origen, setOrigen] = useState<'todas' | 'calidad' | 'cliente'>('todas');
  const [showForm, setShowForm] = useState(false);
  const [selectedProducto, setSelectedProducto] = useState('');
  const [selectedLab, setSelectedLab] = useState('');
  /** Defecto físico (rayado, torcido…) o adaptación (no se adapta a la fórmula o al lente). Sin espera en ninguno. */
  const [tipoGarantia, setTipoGarantia] = useState<'defecto' | 'adaptacion'>('defecto');
  /** Rehacer el trabajo: ¿cambia la fórmula? y con qué tipo / tiempo de lente. */
  const [cambiaFormula, setCambiaFormula] = useState(false);
  const [formulaNueva, setFormulaNueva] = useState<FormulaTexto>(aTexto(null));
  const [tipoTiempo, setTipoTiempo] = useState('');
  const queryClient = useQueryClient();

  const { data: garantias = [], isLoading } = useQuery({
    queryKey: ['garantias'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('garantias')
        .select('*, laboratorios(nombre), orden_productos(descripcion, ordenes(pacientes(nombres, apellidos)))')
        .order('fecha_solicitud', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  /**
   * Productos que pueden pedir garantía: SOLO los ya ENTREGADOS.
   * La garantía aplica DESPUÉS de la entrega (README, Módulo 3.2). Antes de
   * entregar, un error se gestiona como reproceso interno desde Control de Calidad.
   *
   * `fecha_entrega_real` es la referencia del protocolo de adaptación. Como en
   * datos históricos puede estar vacía, se usa como respaldo la fecha del cambio
   * de estado a 'entregado' registrado en `estados_producto`.
   */
  const { data: productos = [] } = useQuery({
    queryKey: ['orden-productos-garantia'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orden_productos')
        .select('id, descripcion, tipo_producto, orden_id, laboratorio_id, tipo_lente_tiempo, fecha_entrega_real, ciclo_garantia, ordenes(paciente_id, pacientes(nombres, apellidos))')
        .eq('estado_actual', 'entregado')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const lista = data ?? [];
      const sinFecha = lista.filter((p: any) => !p.fecha_entrega_real).map((p: any) => p.id);
      const respaldo: Record<string, string> = {};

      if (sinFecha.length > 0) {
        const { data: cambios, error: errCambios } = await supabase
          .from('estados_producto')
          .select('orden_producto_id, fecha_cambio')
          .in('orden_producto_id', sinFecha)
          .eq('estado_nuevo', 'entregado')
          .order('fecha_cambio', { ascending: false });
        if (errCambios) throw errCambios;
        // El primero de cada producto es el cambio a 'entregado' más reciente.
        (cambios ?? []).forEach((c: any) => {
          if (!respaldo[c.orden_producto_id]) respaldo[c.orden_producto_id] = c.fecha_cambio;
        });
      }

      return lista.map((p: any) => ({
        ...p,
        fecha_entrega_efectiva: p.fecha_entrega_real || respaldo[p.id] || null,
      }));
    },
  });

  const { data: labs = [] } = useQuery({
    queryKey: ['laboratorios-garantia'],
    queryFn: async () => {
      const { data, error } = await supabase.from('laboratorios').select('id, nombre').eq('estado_activo', true);
      if (error) throw error;
      return data;
    },
  });

  const createGarantia = useMutation({
    mutationFn: async (formData: Record<string, any>) => {
      const { data: { user } } = await supabase.auth.getUser();

      // El ciclo se deriva de las garantías ya registradas para el producto.
      const { count, error: errCount } = await supabase
        .from('garantias')
        .select('id', { count: 'exact', head: true })
        .eq('orden_producto_id', formData.orden_producto_id);
      if (errCount) throw errCount;

      const ciclo = (count || 0) + 1;
      const subcodigo = generarSubcodigoGarantia(formData.orden_producto_id, ciclo);

      const { error } = await supabase.from('garantias').insert({
        orden_producto_id: formData.orden_producto_id,
        laboratorio_id: formData.laboratorio_id || null,
        motivo: formData.motivo,
        observaciones: formData.observaciones || null,
        ciclo,
        subcodigo,
        envio_asumido_por: formData.envio_asumido_por || null,
        guia_envio: formData.guia_envio || null,
        tipo: formData.tipo,
        formula_nueva: formData.formula_nueva ?? null,
        tipo_lente_tiempo: formData.tipo_lente_tiempo || null,
      } as any);
      if (error) throw error;

      // La garantía recorre de nuevo el flujo de estados, marcada como garantía.
      // Se rehace con el laboratorio y el tipo de lente elegidos en la garantía.
      const { error: errProducto } = await supabase.from('orden_productos').update({
        estado_actual: 'pedido_creado' as any,
        es_garantia: true,
        ciclo_garantia: ciclo,
        garantia_codigo: subcodigo,
        ...(formData.laboratorio_id ? { laboratorio_id: formData.laboratorio_id } : {}),
        ...(formData.tipo_lente_tiempo ? { tipo_lente_tiempo: formData.tipo_lente_tiempo } : {}),
      }).eq('id', formData.orden_producto_id);
      if (errProducto) throw errProducto;

      // Registra el reinicio del ciclo en la trazabilidad de estados.
      const { error: errEstado } = await supabase.from('estados_producto').insert({
        orden_producto_id: formData.orden_producto_id,
        estado_anterior: 'entregado' as any,
        estado_nuevo: 'pedido_creado' as any,
        metodo: 'garantia',
        justificacion: `Garantía ${subcodigo}: ${formData.motivo}`
          + (formData.formula_nueva ? ` · Nueva fórmula: ${textoFormulaCompleta(formData.formula_nueva)}` : ''),
        usuario_id: user?.id || null,
      });
      if (errEstado) throw errEstado;

      // Módulo 5.2: más de una garantía ⇒ alerta automática al administrador.
      if (ciclo > 1) {
        const { error: errNotif } = await supabase.from('notificaciones').insert({
          tipo: 'garantia_reincidente',
          titulo: `Producto con ${ciclo} garantías (${subcodigo})`,
          detalle: `Este producto ya tiene más de una garantía. Motivo actual: ${formData.motivo}`,
          orden_producto_id: formData.orden_producto_id,
        });
        // La notificación no debe impedir la creación de la garantía.
        if (errNotif) toast.error('Garantía creada, pero no se pudo notificar al administrador');
      }

      return { subcodigo, ciclo };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['garantias'] });
      queryClient.invalidateQueries({ queryKey: ['orden-productos'] });
      queryClient.invalidateQueries({ queryKey: ['orden-productos-garantia'] });
      queryClient.invalidateQueries({ queryKey: ['db-notificaciones'] });
      queryClient.invalidateQueries({ queryKey: ['formula-orden'] });
      setShowForm(false);
      setSelectedProducto('');
      setSelectedLab('');
      setTipoGarantia('defecto');
      setCambiaFormula(false);
      setTipoTiempo('');
      toast.success(`Garantía ${res.subcodigo} creada exitosamente`);
    },
    onError: (e: any) => toast.error(e.message || 'No se pudo crear la garantía'),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedProducto) { toast.error('Seleccione un producto'); return; }
    const nueva = cambiaFormula ? aFormula(formulaNueva) : null;
    if (cambiaFormula && !tieneFormula(nueva)) { toast.error('Escriba la nueva fórmula (al menos la esfera o el cilindro)'); return; }
    const fd = new FormData(e.currentTarget);
    const data: Record<string, any> = { orden_producto_id: selectedProducto };
    fd.forEach((v, k) => { data[k] = v; });
    data.laboratorio_id = selectedLab || null;
    data.tipo = tipoGarantia;
    data.formula_nueva = nueva;
    data.tipo_lente_tiempo = tipoTiempo || null;
    createGarantia.mutate(data);
  };

  const filtered = garantias.filter((g: any) => {
    if (origen === 'calidad' && !g.observaciones?.toLowerCase().includes('rechazado en control de calidad')) return false;
    if (origen === 'cliente' && g.observaciones?.toLowerCase().includes('rechazado en control de calidad')) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    const paciente = g.orden_productos?.ordenes?.pacientes;
    return (
      g.subcodigo?.toLowerCase().includes(q) ||
      g.motivo?.toLowerCase().includes(q) ||
      paciente?.nombres?.toLowerCase().includes(q) ||
      paciente?.apellidos?.toLowerCase().includes(q)
    );
  });

  const countCalidad = garantias.filter((g: any) => g.observaciones?.toLowerCase().includes('rechazado en control de calidad')).length;
  const countCliente = garantias.length - countCalidad;

  const selectedProd: any = productos.find((p: any) => p.id === selectedProducto);

  const fechaEntregaSeleccionada: string | null = selectedProd?.fecha_entrega_efectiva || null;

  // Fórmula actual del trabajo (historia de la orden, venta directa o garantía anterior).
  const { data: formulaActual } = useFormulaOrden(selectedProd?.orden_id, selectedProd?.ordenes?.paciente_id, selectedProd?.id);
  const formulaBase = formulaActual && formulaActual.origen !== 'externa' ? formulaActual.formula : null;

  // Al elegir otro producto: su laboratorio y tipo de lente, y la fórmula actual como punto de partida.
  useEffect(() => {
    setSelectedLab(selectedProd?.laboratorio_id ?? '');
    setTipoTiempo(selectedProd?.tipo_lente_tiempo ?? '');
  }, [selectedProducto]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setFormulaNueva(aTexto(formulaBase)); }, [selectedProducto, formulaActual]); // eslint-disable-line react-hooks/exhaustive-deps
  // Por adaptación casi siempre se corrige la fórmula.
  useEffect(() => { setCambiaFormula(tipoGarantia === 'adaptacion'); }, [tipoGarantia]);

  return (
    <AppLayout>
      <PageHeader title="Garantías" description="Protocolo de adaptación y gestión de garantías">
        <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4 mr-1" />Nueva Garantía</Button>
      </PageHeader>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por subcódigo, paciente o motivo..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Tabs value={origen} onValueChange={(v) => setOrigen(v as any)}>
          <TabsList>
            <TabsTrigger value="todas">Todas ({garantias.length})</TabsTrigger>
            <TabsTrigger value="calidad">Rechazo Calidad — histórico ({countCalidad})</TabsTrigger>
            <TabsTrigger value="cliente">Solicitud Cliente ({countCliente})</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subcódigo</TableHead>
              <TableHead>Paciente</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead className="hidden md:table-cell">Motivo</TableHead>
              <TableHead>Ciclo</TableHead>
              <TableHead>Origen</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="hidden md:table-cell">Laboratorio</TableHead>
              <TableHead className="hidden lg:table-cell">Fecha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No hay garantías{search ? ' que coincidan' : ''}</TableCell></TableRow>
            ) : filtered.map((g: any) => {
              const paciente = g.orden_productos?.ordenes?.pacientes;
              return (
                <TableRow key={g.id}>
                  <TableCell className="font-mono font-medium">{g.subcodigo}</TableCell>
                  <TableCell className="font-medium">{paciente?.nombres} {paciente?.apellidos}</TableCell>
                  <TableCell className="text-sm">{g.orden_productos?.descripcion || '—'}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground truncate max-w-[200px]">{g.motivo}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">G{g.ciclo}</Badge></TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] ${g.observaciones?.toLowerCase().includes('rechazado en control de calidad') ? 'border-destructive/30 text-destructive' : 'border-primary/30 text-primary'}`}>
                      {g.observaciones?.toLowerCase().includes('rechazado en control de calidad') ? 'Calidad' : 'Cliente'}
                    </Badge>
                  </TableCell>
                  <TableCell><Badge className={`text-[10px] ${estadoColor[g.estado] || ''}`}>{g.estado}</Badge></TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{g.laboratorios?.nombre || '—'}</TableCell>
                  <TableCell className="hidden lg:table-cell text-sm">{new Date(g.fecha_solicitud).toLocaleDateString('es-CO')}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Create Warranty Dialog */}
      <Dialog open={showForm} onOpenChange={(o) => { setShowForm(o); if (!o) { setSelectedProducto(''); setSelectedLab(''); setTipoGarantia('defecto'); } }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nueva Garantía</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Producto de Orden * <span className="text-muted-foreground font-normal">(solo productos entregados)</span></Label>
              <Select value={selectedProducto} onValueChange={setSelectedProducto}>
                <SelectTrigger><SelectValue placeholder="Seleccione producto" /></SelectTrigger>
                <SelectContent>
                  {productos.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground">No hay productos entregados</div>
                  ) : productos.map((p: any) => {
                    const pac = p.ordenes?.pacientes;
                    return (
                      <SelectItem key={p.id} value={p.id}>
                        {pac?.nombres} {pac?.apellidos} — {p.descripcion}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {selectedProd && (
                <div className="bg-muted/50 rounded-md p-2 text-xs space-y-1">
                  <p><span className="text-muted-foreground">Paciente:</span> <strong>{selectedProd.ordenes?.pacientes?.nombres} {selectedProd.ordenes?.pacientes?.apellidos}</strong></p>
                  <p><span className="text-muted-foreground">Producto:</span> {selectedProd.descripcion}</p>
                  <p><span className="text-muted-foreground">Tipo:</span> <Badge variant="outline" className="text-[10px]">{selectedProd.tipo_producto}</Badge></p>
                  <p>
                    <span className="text-muted-foreground">Entregado:</span>{' '}
                    {fechaEntregaSeleccionada ? new Date(fechaEntregaSeleccionada).toLocaleDateString('es-CO') : '—'}
                    {selectedProd.fecha_entrega_real ? '' : fechaEntregaSeleccionada ? ' (según historial de estados)' : ''}
                  </p>
                  {(selectedProd.ciclo_garantia || 0) >= 1 && (
                    <p className="text-warning flex items-center gap-1">
                      <ShieldAlert className="h-3 w-3" />
                      Este producto ya tiene {selectedProd.ciclo_garantia} garantía(s) previa(s)
                    </p>
                  )}
                </div>
              )}

              {/* Tipo: el periodo de adaptación solo aplica a "Adaptación" */}
              <div className="space-y-1.5 pt-1">
                <Label className="text-xs">Tipo de garantía *</Label>
                <RadioGroup value={tipoGarantia} onValueChange={(v) => setTipoGarantia(v as 'defecto' | 'adaptacion')} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className={`flex items-start gap-2 rounded-md border p-2 text-xs cursor-pointer ${tipoGarantia === 'defecto' ? 'border-primary bg-primary/5' : ''}`}>
                    <RadioGroupItem value="defecto" className="mt-0.5" />
                    <span><span className="font-medium block text-sm">Defecto físico</span>Lente rayado, montura torcida, error de fabricación. Sin espera.</span>
                  </label>
                  <label className={`flex items-start gap-2 rounded-md border p-2 text-xs cursor-pointer ${tipoGarantia === 'adaptacion' ? 'border-primary bg-primary/5' : ''}`}>
                    <RadioGroupItem value="adaptacion" className="mt-0.5" />
                    <span><span className="font-medium block text-sm">Adaptación</span>No se adapta a la fórmula o al lente. Se rehace con la fórmula corregida.</span>
                  </label>
                </RadioGroup>
              </div>

            </div>

            <div className="space-y-2">
              <Label>Motivo de la Garantía *</Label>
              <Textarea name="motivo" required placeholder="Describe el motivo de la garantía..." rows={3} />
            </div>

            {/* Rehacer el trabajo: laboratorio, tipo de lente y fórmula */}
            <div className="rounded-lg border p-3 space-y-3">
              <p className="text-sm font-medium flex items-center gap-1.5"><Wrench className="h-4 w-4 text-primary" />Rehacer el trabajo</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Laboratorio</Label>
                  <Select value={selectedLab} onValueChange={setSelectedLab}>
                    <SelectTrigger><SelectValue placeholder="Seleccione laboratorio" /></SelectTrigger>
                    <SelectContent>
                      {labs.map((l: any) => <SelectItem key={l.id} value={l.id}>{l.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tipo de lente</Label>
                  <Select value={tipoTiempo || 'none'} onValueChange={(v) => setTipoTiempo(v === 'none' ? '' : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      <SelectItem value="progresivo">Progresivo</SelectItem>
                      <SelectItem value="talla">Talla</SelectItem>
                      <SelectItem value="sol_formula">Sol con fórmula</SelectItem>
                      <SelectItem value="terminado">Terminado</SelectItem>
                      <SelectItem value="montura_3piezas">Montura 3 piezas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <label className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 cursor-pointer">
                <span className="text-sm">
                  <span className="font-medium">Cambia la fórmula</span>
                  <span className="block text-xs text-muted-foreground">Escriba la fórmula corregida; el laboratorio y la etiqueta la usarán.</span>
                </span>
                <Switch checked={cambiaFormula} onCheckedChange={setCambiaFormula} aria-label="Cambia la fórmula" />
              </label>

              {cambiaFormula ? (
                <FormulaEditor valor={formulaNueva} onChange={setFormulaNueva} />
              ) : selectedProd ? (
                formulaBase
                  ? <div className="space-y-1"><p className="text-xs text-muted-foreground">Se rehace con la fórmula actual:</p><TablaFormula f={formulaBase} /></div>
                  : formulaActual?.origen === 'externa'
                    ? <p className="text-xs whitespace-pre-line text-muted-foreground">Se rehace con la fórmula actual:{'\n'}{formulaActual.texto}</p>
                    : <p className="text-xs text-muted-foreground">El paciente no tiene fórmula registrada. Active "Cambia la fórmula" para escribirla.</p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Envío asumido por</Label>
                <Select name="envio_asumido_por">
                  <SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="optica">Óptica</SelectItem>
                    <SelectItem value="laboratorio">Laboratorio</SelectItem>
                    <SelectItem value="paciente">Paciente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Guía de Envío</Label>
                <Input name="guia_envio" placeholder="No. guía" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Observaciones</Label>
              <Textarea name="observaciones" placeholder="Observaciones adicionales..." rows={2} />
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
              <Button type="submit" disabled={createGarantia.isPending || !selectedProd}>
                {createGarantia.isPending ? 'Creando...' : 'Solicitar Garantía'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
