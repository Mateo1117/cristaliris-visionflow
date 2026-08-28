import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ESTADOS_PRODUCTO, type EstadoProducto } from '@/types';
import { toast } from 'sonner';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { usePermissions } from '@/hooks/usePermissions';
import { esEstadoLaboratorio, esRetroceso, sellosDeFecha, siguienteEstado } from '@/lib/businessDays';
import { QrCode, ChevronRight, RotateCcw, CheckCircle2, Loader2, Search, Minus, Plus, Package, ShoppingCart, AlertTriangle } from 'lucide-react';

type ScanMode = 'idle' | 'order' | 'inventory';
type InvStep = 'view' | 'select-order' | 'done';

interface ScannedProduct {
  id: string;
  descripcion: string;
  estado_actual: string;
  tipo_producto: string;
  paciente_nombre: string;
  laboratorio_nombre: string;
}

interface ScannedInventory {
  id: string;
  descripcion: string;
  marca: string;
  modelo: string;
  tipo: string;
  codigo_referencia: string;
  cantidad_disponible: number;
  sede_nombre: string;
}

interface OrderOption {
  producto_id: string;
  orden_id: string;
  descripcion: string;
  paciente: string;
  fecha: string;
}

export default function ScanQR() {
  const { isAdmin, canWrite, isLoading: permisosCargando } = usePermissions();
  const [scanning, setScanning] = useState(false);
  const [mode, setMode] = useState<ScanMode>('idle');
  const [product, setProduct] = useState<ScannedProduct | null>(null);
  // Estado destino elegido y justificación (obligatoria si sale del flujo lógico)
  const [targetState, setTargetState] = useState<EstadoProducto | ''>('');
  const [justificacion, setJustificacion] = useState('');
  const [invItem, setInvItem] = useState<ScannedInventory | null>(null);
  const [updating, setUpdating] = useState(false);
  const [success, setSuccess] = useState(false);
  const [manualId, setManualId] = useState('');
  const [adjustQty, setAdjustQty] = useState(1);
  // Inventory → order linking
  const [invStep, setInvStep] = useState<InvStep>('view');
  const [pendingDelta, setPendingDelta] = useState(0);
  const [orderOptions, setOrderOptions] = useState<OrderOption[]>([]);
  const [selectedProductoId, setSelectedProductoId] = useState('');
  const [loadingOrders, setLoadingOrders] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const resetAll = () => {
    setProduct(null);
    setInvItem(null);
    setSuccess(false);
    setMode('idle');
    setTargetState('');
    setJustificacion('');
    setAdjustQty(1);
    setInvStep('view');
    setPendingDelta(0);
    setOrderOptions([]);
    setSelectedProductoId('');
  };

  const handleScannedText = async (text: string) => {
    try {
      const parsed = JSON.parse(text);
      if (parsed.inv_id) { await fetchInventory(parsed.inv_id); return; }
    } catch { /* not JSON */ }
    let productId = text;
    try {
      const url = new URL(text);
      productId = url.searchParams.get('id') || text;
    } catch { /* not a URL */ }
    await fetchProduct(productId);
  };

  const startScan = async () => {
    resetAll();
    setScanning(true);
    await new Promise(r => setTimeout(r, 100));
    try {
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (text) => {
          try { await scanner.stop(); } catch {}
          scannerRef.current = null;
          setScanning(false);
          await handleScannedText(text);
        },
        () => {},
      );
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : err?.message || 'No se pudo acceder a la cámara.');
      setScanning(false);
    }
  };

  const stopScan = async () => {
    if (scannerRef.current) { try { await scannerRef.current.stop(); } catch {} scannerRef.current = null; }
    setScanning(false);
  };

  useEffect(() => { return () => { stopScan(); }; }, []);

  const fetchProduct = async (id: string) => {
    const { data, error } = await supabase
      .from('orden_productos')
      .select('id, descripcion, estado_actual, tipo_producto, laboratorios(nombre), ordenes(pacientes(nombres, apellidos))')
      .eq('id', id)
      .single();
    if (error || !data) { toast.error(error?.message || 'Producto no encontrado'); return; }
    setMode('order');
    setProduct({
      id: data.id, descripcion: data.descripcion, estado_actual: data.estado_actual,
      tipo_producto: data.tipo_producto,
      paciente_nombre: `${(data as any).ordenes?.pacientes?.nombres || ''} ${(data as any).ordenes?.pacientes?.apellidos || ''}`.trim(),
      laboratorio_nombre: (data as any).laboratorios?.nombre || 'N/A',
    });
    // Por defecto se propone el paso lógico siguiente del flujo.
    setTargetState(siguienteEstado(data.estado_actual)?.key ?? '');
    setJustificacion('');
  };

  const fetchInventory = async (id: string) => {
    const { data, error } = await supabase.from('inventario').select('*, sedes(nombre)').eq('id', id).single();
    if (error || !data) { toast.error('Ítem de inventario no encontrado'); return; }
    setMode('inventory');
    setInvStep('view');
    setInvItem({
      id: data.id,
      descripcion: data.descripcion || `${data.marca || ''} ${data.modelo || ''}`.trim(),
      marca: data.marca || '', modelo: data.modelo || '', tipo: data.tipo,
      codigo_referencia: data.codigo_referencia || data.id.slice(0, 12),
      cantidad_disponible: data.cantidad_disponible,
      sede_nombre: (data as any).sedes?.nombre || '—',
    });
  };

  const handleManualSearch = async () => {
    const id = manualId.trim();
    if (!id) return;
    await handleScannedText(id);
    setManualId('');
  };

  // Fetch orders that could receive this inventory item
  const fetchOrdersForLinking = async () => {
    setLoadingOrders(true);
    try {
      const { data, error } = await supabase
        .from('orden_productos')
        .select('id, descripcion, orden_id, tipo_producto, ordenes(created_at, pacientes(nombres, apellidos))')
        .is('montura_id', null)
        .neq('estado_actual', 'entregado')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      const options: OrderOption[] = (data || []).map((op: any) => ({
        producto_id: op.id,
        orden_id: op.orden_id,
        descripcion: op.descripcion,
        paciente: `${op.ordenes?.pacientes?.nombres || ''} ${op.ordenes?.pacientes?.apellidos || ''}`.trim(),
        fecha: new Date(op.ordenes?.created_at || '').toLocaleDateString('es-CO'),
      }));
      setOrderOptions(options);
    } catch (err: any) {
      toast.error('Error cargando órdenes');
    } finally {
      setLoadingOrders(false);
    }
  };

  // When user clicks "Descontar" → go to order selection step
  const handleDiscount = async (qty: number) => {
    if (!invItem) return;
    if (invItem.cantidad_disponible - qty < 0) { toast.error('No puede quedar en negativo'); return; }
    setPendingDelta(-qty);
    setInvStep('select-order');
    await fetchOrdersForLinking();
  };

  // Confirm discount + link to order
  const confirmDiscountWithOrder = async () => {
    if (!invItem) return;
    const newQty = invItem.cantidad_disponible + pendingDelta;
    setUpdating(true);
    try {
      // Update stock
      const { error: e1 } = await supabase.from('inventario').update({ cantidad_disponible: newQty }).eq('id', invItem.id);
      if (e1) throw e1;

      // Log movement
      const { data: { user } } = await supabase.auth.getUser();
      const { error: eMov } = await supabase.from('movimientos_inventario').insert({
        inventario_id: invItem.id,
        tipo_movimiento: 'salida',
        cantidad: Math.abs(pendingDelta),
        cantidad_anterior: invItem.cantidad_disponible,
        cantidad_nueva: newQty,
        motivo: selectedProductoId ? 'Vinculado a orden via QR' : 'Descuento via QR',
        orden_producto_id: selectedProductoId || null,
        usuario_id: user?.id || null,
      });
      if (eMov) throw eMov;

      // Link to order product if selected
      if (selectedProductoId) {
        const { error: e2 } = await supabase.from('orden_productos')
          .update({ montura_id: invItem.id })
          .eq('id', selectedProductoId);
        if (e2) throw e2;
      }

      setInvItem(prev => prev ? { ...prev, cantidad_disponible: newQty } : null);
      setInvStep('done');
      setSuccess(true);
      const linkMsg = selectedProductoId ? ' y vinculado a la orden' : '';
      toast.success(`Stock descontado${linkMsg}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUpdating(false);
    }
  };

  // Add stock (no order link needed)
  const addStock = async (qty: number) => {
    if (!invItem) return;
    setUpdating(true);
    try {
      const newQty = invItem.cantidad_disponible + qty;
      const { error } = await supabase.from('inventario').update({ cantidad_disponible: newQty }).eq('id', invItem.id);
      if (error) throw error;
      const { data: { user } } = await supabase.auth.getUser();
      const { error: eMov } = await supabase.from('movimientos_inventario').insert({
        inventario_id: invItem.id,
        tipo_movimiento: 'entrada',
        cantidad: qty,
        cantidad_anterior: invItem.cantidad_disponible,
        cantidad_nueva: newQty,
        motivo: 'Ingreso via QR',
        usuario_id: user?.id || null,
      });
      if (eMov) throw eMov;
      setInvItem(prev => prev ? { ...prev, cantidad_disponible: newQty } : null);
      setSuccess(true);
      setInvStep('done');
      toast.success(`Stock aumentado: ${qty} unidad(es)`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUpdating(false);
    }
  };

  // ── Cambio de estado por QR ────────────────────────────────────────────────
  const nextState = product ? siguienteEstado(product.estado_actual) : null;
  const targetLabel = ESTADOS_PRODUCTO.find(e => e.key === targetState)?.label || '';
  /** El estado elegido no es el paso lógico siguiente (README 3.2). */
  const fueraDeSecuencia = !!product && !!targetState && targetState !== nextState?.key;
  const esRetrocesoQR = !!product && !!targetState && esRetroceso(product.estado_actual, targetState);
  const necesitaJustificacion = fueraDeSecuencia || esRetrocesoQR;

  /**
   * Registra el estado escaneado. Si no corresponde al paso lógico siguiente
   * NO se bloquea: se exige justificación y se deja todo en `estados_producto`.
   * El retroceso sí queda reservado al administrador (README 3.2).
   */
  const registrarEstado = async () => {
    if (!product || !targetState) return;
    if (permisosCargando) { toast.info('Cargando permisos, intente de nuevo en un momento'); return; }
    if (!canWrite('scan')) { toast.error('No tiene permisos para cambiar estados'); return; }
    if (targetState === product.estado_actual) { toast.error('El producto ya está en ese estado'); return; }
    if (esRetrocesoQR && !isAdmin) { toast.error('Solo un administrador puede retroceder estados'); return; }
    if (necesitaJustificacion && justificacion.trim().length < 5) {
      toast.error('Debe registrar una justificación para este cambio fuera de secuencia');
      return;
    }

    setUpdating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const ahora = new Date();

      // Reproceso interno: se devuelve desde control de calidad al laboratorio.
      const esReproceso = esRetrocesoQR
        && product.estado_actual === 'control_calidad'
        && esEstadoLaboratorio(targetState);

      const cambios: Record<string, any> = {
        estado_actual: targetState,
        // Sella la fecha del ciclo correspondiente al estado alcanzado.
        ...sellosDeFecha(targetState, ahora),
      };
      if (esReproceso) {
        cambios.es_reproceso = true;
        cambios.fecha_envio_lab = ahora.toISOString();
      }

      const { error: e1 } = await supabase.from('orden_productos').update(cambios as any).eq('id', product.id);
      if (e1) throw e1;

      const { error: e2 } = await supabase.from('estados_producto').insert({
        orden_producto_id: product.id,
        estado_anterior: product.estado_actual as any,
        estado_nuevo: targetState as any,
        metodo: esRetrocesoQR ? 'admin_retroceso' : 'qr_scan',
        justificacion: necesitaJustificacion ? justificacion.trim() : null,
        usuario_id: user?.id || null,
      });
      if (e2) throw e2;

      setProduct(prev => prev ? { ...prev, estado_actual: targetState } : null);
      setJustificacion('');
      setSuccess(true);
      toast.success(
        esReproceso
          ? `Estado actualizado a: ${targetLabel} — marcado como reproceso interno`
          : `Estado actualizado a: ${targetLabel}`,
      );
    } catch (err: any) {
      toast.error(err.message || 'No se pudo actualizar el estado');
    } finally {
      setUpdating(false);
    }
  };

  const currentLabel = product ? ESTADOS_PRODUCTO.find(e => e.key === product.estado_actual)?.label : '';
  const showInitial = !scanning && mode === 'idle';

  return (
    <AppLayout>
      <PageHeader title="Escanear QR" description="Escanee QR de órdenes o inventario para gestionar estados y stock" />

      <div className="max-w-md mx-auto space-y-4">
        <div id="qr-reader" className={scanning ? 'rounded-lg overflow-hidden' : 'hidden'} />

        {showInitial && (
          <>
            <Button onClick={startScan} className="w-full" size="lg">
              <QrCode className="h-5 w-5 mr-2" />Iniciar Escáner
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">o buscar por ID</span></div>
            </div>
            <div className="flex gap-2">
              <Input value={manualId} onChange={(e) => setManualId(e.target.value)} placeholder="Pegar ID o JSON de inventario" onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()} />
              <Button onClick={handleManualSearch} variant="outline" size="icon"><Search className="h-4 w-4" /></Button>
            </div>
          </>
        )}

        {scanning && <Button onClick={stopScan} variant="outline" className="w-full">Cancelar</Button>}

        {/* ORDER PRODUCT CARD */}
        {mode === 'order' && product && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">{product.paciente_nombre}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm space-y-1">
                <div><span className="text-muted-foreground">Producto:</span> {product.descripcion}</div>
                <div><span className="text-muted-foreground">Tipo:</span> {product.tipo_producto}</div>
                <div><span className="text-muted-foreground">Laboratorio:</span> {product.laboratorio_nombre}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Estado:</span>
                <Badge>{currentLabel}</Badge>
              </div>
              {success ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <CheckCircle2 className="h-12 w-12 text-green-500" />
                  <p className="text-sm font-medium">Estado actualizado correctamente</p>
                  <Button onClick={resetAll} variant="outline"><RotateCcw className="h-4 w-4 mr-1" />Escanear Otro</Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Registrar estado</Label>
                    <Select value={targetState} onValueChange={(v) => setTargetState(v as EstadoProducto)}>
                      <SelectTrigger><SelectValue placeholder="Seleccione el estado" /></SelectTrigger>
                      <SelectContent>
                        {ESTADOS_PRODUCTO.filter(e => e.key !== product.estado_actual).map(e => (
                          <SelectItem key={e.key} value={e.key}>
                            {e.label}{e.key === nextState?.key ? ' — siguiente paso' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {fueraDeSecuencia && (
                    <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs space-y-1">
                      <p className="flex items-center gap-1 font-medium text-warning">
                        <AlertTriangle className="h-4 w-4" />Escaneo fuera de secuencia
                      </p>
                      <p>
                        Estado actual: <strong>{currentLabel}</strong> · Esperado:{' '}
                        <strong>{nextState?.label || 'ninguno (estado final)'}</strong> · Registrando:{' '}
                        <strong>{targetLabel}</strong>
                      </p>
                    </div>
                  )}

                  {esRetrocesoQR && (
                    <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                      {isAdmin
                        ? 'Retroceso de estado: quedará registrado como admin_retroceso con su justificación.'
                        : 'Solo un administrador puede retroceder estados.'}
                    </div>
                  )}

                  {necesitaJustificacion && (
                    <div className="space-y-1">
                      <Label className="text-xs">Justificación *</Label>
                      <Textarea
                        rows={2}
                        value={justificacion}
                        onChange={(e) => setJustificacion(e.target.value)}
                        placeholder="Explique por qué se registra este estado fuera de secuencia..."
                      />
                    </div>
                  )}

                  <Button
                    onClick={registrarEstado}
                    disabled={updating || !targetState || (esRetrocesoQR && !isAdmin)}
                    className="w-full"
                    variant={necesitaJustificacion ? 'destructive' : 'default'}
                  >
                    {updating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ChevronRight className="h-4 w-4 mr-1" />}
                    {targetState ? `Registrar: ${targetLabel}` : 'Seleccione un estado'}
                  </Button>

                  {!nextState && (
                    <p className="text-xs text-muted-foreground text-center">Este producto ya está en su estado final.</p>
                  )}
                </div>
              )}
              {!success && (
                <div className="flex gap-2">
                  <Button onClick={resetAll} variant="ghost" size="sm" className="flex-1"><RotateCcw className="h-3 w-3 mr-1" />Escanear Otro</Button>
                  <Button onClick={resetAll} variant="outline" size="sm" className="flex-1"><CheckCircle2 className="h-3 w-3 mr-1" />Finalizar</Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* INVENTORY CARD */}
        {mode === 'inventory' && invItem && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                {invItem.descripcion}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-sm space-y-1">
                <div><span className="text-muted-foreground">Código:</span> <span className="font-mono">{invItem.codigo_referencia}</span></div>
                <div><span className="text-muted-foreground">Tipo:</span> <Badge variant="outline">{invItem.tipo}</Badge></div>
                {invItem.marca && <div><span className="text-muted-foreground">Marca:</span> {invItem.marca}</div>}
                <div><span className="text-muted-foreground">Sede:</span> {invItem.sede_nombre}</div>
              </div>

              {/* STEP: VIEW — show stock + adjust buttons */}
              {invStep === 'view' && (
                <>
                  <div className="text-center">
                    <p className="text-3xl font-bold">{invItem.cantidad_disponible}</p>
                    <p className="text-sm text-muted-foreground">unidades en stock</p>
                  </div>
                  <div className="flex items-center justify-center gap-3">
                    <Label className="text-sm">Cantidad:</Label>
                    <Input type="number" min="1" value={adjustQty} onChange={(e) => setAdjustQty(Math.max(1, parseInt(e.target.value) || 1))} className="w-20 text-center" />
                  </div>
                  <div className="flex gap-3">
                    <Button variant="destructive" className="flex-1" onClick={() => handleDiscount(adjustQty)} disabled={updating}>
                      <Minus className="h-4 w-4 mr-1" />Descontar
                    </Button>
                    <Button className="flex-1" onClick={() => addStock(adjustQty)} disabled={updating}>
                      {updating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}Agregar
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={resetAll} variant="ghost" size="sm" className="flex-1"><RotateCcw className="h-3 w-3 mr-1" />Escanear Otro</Button>
                    <Button onClick={resetAll} variant="outline" size="sm" className="flex-1"><CheckCircle2 className="h-3 w-3 mr-1" />Finalizar</Button>
                  </div>
                </>
              )}

              {/* STEP: SELECT ORDER — pick which order to link */}
              {invStep === 'select-order' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <ShoppingCart className="h-4 w-4 text-primary" />
                    Vincular a una orden ({Math.abs(pendingDelta)} unidad(es) a descontar)
                  </div>

                  {loadingOrders ? (
                    <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                  ) : orderOptions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-2">No hay órdenes pendientes sin montura asignada.</p>
                  ) : (
                    <Select value={selectedProductoId} onValueChange={setSelectedProductoId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar orden..." />
                      </SelectTrigger>
                      <SelectContent>
                        {orderOptions.map(o => (
                          <SelectItem key={o.producto_id} value={o.producto_id}>
                            <span className="font-medium">{o.paciente}</span>
                            <span className="text-muted-foreground ml-2">— {o.descripcion}</span>
                            <span className="text-muted-foreground ml-1 text-xs">({o.fecha})</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={() => { setInvStep('view'); setPendingDelta(0); setSelectedProductoId(''); }}>
                      Volver
                    </Button>
                    <Button className="flex-1" onClick={confirmDiscountWithOrder} disabled={updating}>
                      {updating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Minus className="h-4 w-4 mr-1" />}
                      {selectedProductoId ? 'Descontar y Vincular' : 'Descontar sin Orden'}
                    </Button>
                  </div>
                </div>
              )}

              {/* STEP: DONE */}
              {invStep === 'done' && success && (
                <div className="flex flex-col items-center gap-3 py-4">
                  <CheckCircle2 className="h-12 w-12 text-green-500" />
                  <p className="text-sm font-medium">Stock actualizado: {invItem.cantidad_disponible} unidades</p>
                  {selectedProductoId && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <ShoppingCart className="h-3 w-3" />Vinculado a orden
                    </Badge>
                  )}
                  <div className="flex gap-2 flex-wrap justify-center">
                    <Button onClick={() => { setSuccess(false); setInvStep('view'); setSelectedProductoId(''); }} variant="outline" size="sm">Ajustar más</Button>
                    <Button onClick={resetAll} variant="outline" size="sm"><RotateCcw className="h-4 w-4 mr-1" />Escanear Otro</Button>
                    <Button onClick={resetAll} size="sm"><CheckCircle2 className="h-4 w-4 mr-1" />Finalizar</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
