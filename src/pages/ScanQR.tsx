import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ESTADOS_PRODUCTO } from '@/types';
import { toast } from 'sonner';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { QrCode, ChevronRight, RotateCcw, CheckCircle2, Loader2, Search } from 'lucide-react';

interface ScannedProduct {
  id: string;
  descripcion: string;
  estado_actual: string;
  tipo_producto: string;
  paciente_nombre: string;
  laboratorio_nombre: string;
}

export default function ScanQR() {
  const [scanning, setScanning] = useState(false);
  const [product, setProduct] = useState<ScannedProduct | null>(null);
  const [updating, setUpdating] = useState(false);
  const [success, setSuccess] = useState(false);
  const [manualId, setManualId] = useState('');
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // Always render the qr-reader div, just hide it when not scanning
  const startScan = async () => {
    setProduct(null);
    setSuccess(false);
    setScanning(true);

    // Wait for next frame so the div is visible
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
          let productId = text;
          try {
            const url = new URL(text);
            productId = url.searchParams.get('id') || text;
          } catch { /* not a URL */ }
          await fetchProduct(productId);
        },
        () => {},
      );
    } catch (err: any) {
      const msg = typeof err === 'string' ? err : err?.message || 'No se pudo acceder a la cámara. Verifique los permisos del navegador.';
      toast.error(msg);
      setScanning(false);
    }
  };

  const stopScan = async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch {}
      scannerRef.current = null;
    }
    setScanning(false);
  };

  useEffect(() => {
    return () => { stopScan(); };
  }, []);

  const fetchProduct = async (id: string) => {
    const { data, error } = await supabase
      .from('orden_productos')
      .select('id, descripcion, estado_actual, tipo_producto, laboratorios(nombre), ordenes(pacientes(nombres, apellidos))')
      .eq('id', id)
      .single();
    if (error || !data) {
      toast.error('Producto no encontrado');
      return;
    }
    setProduct({
      id: data.id,
      descripcion: data.descripcion,
      estado_actual: data.estado_actual,
      tipo_producto: data.tipo_producto,
      paciente_nombre: `${(data as any).ordenes?.pacientes?.nombres || ''} ${(data as any).ordenes?.pacientes?.apellidos || ''}`.trim(),
      laboratorio_nombre: (data as any).laboratorios?.nombre || 'N/A',
    });
  };

  const handleManualSearch = async () => {
    const id = manualId.trim();
    if (!id) return;
    await fetchProduct(id);
    setManualId('');
  };

  const getNextState = () => {
    if (!product) return null;
    const idx = ESTADOS_PRODUCTO.findIndex(e => e.key === product.estado_actual);
    return idx >= 0 && idx < ESTADOS_PRODUCTO.length - 1 ? ESTADOS_PRODUCTO[idx + 1] : null;
  };

  const advanceState = async () => {
    if (!product) return;
    const next = getNextState();
    if (!next) return;
    setUpdating(true);
    try {
      const { error: e1 } = await supabase.from('orden_productos').update({ estado_actual: next.key as any }).eq('id', product.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('estados_producto').insert({
        orden_producto_id: product.id,
        estado_anterior: product.estado_actual as any,
        estado_nuevo: next.key as any,
        metodo: 'qr_scan',
      });
      if (e2) throw e2;
      setProduct(prev => prev ? { ...prev, estado_actual: next.key } : null);
      setSuccess(true);
      toast.success(`Estado actualizado a: ${next.label}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUpdating(false);
    }
  };

  const currentLabel = product ? ESTADOS_PRODUCTO.find(e => e.key === product.estado_actual)?.label : '';
  const nextState = getNextState();

  return (
    <AppLayout>
      <PageHeader title="Escanear QR" description="Escanee el QR de una orden para actualizar su estado" />

      <div className="max-w-md mx-auto space-y-4">
        {/* QR reader div - always in DOM, hidden when not scanning */}
        <div id="qr-reader" className={scanning ? 'rounded-lg overflow-hidden' : 'hidden'} />

        {!scanning && !product && (
          <>
            <Button onClick={startScan} className="w-full" size="lg">
              <QrCode className="h-5 w-5 mr-2" />Iniciar Escáner
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">o buscar por ID</span></div>
            </div>

            <div className="flex gap-2">
              <Input
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                placeholder="Pegar ID del producto"
                onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
              />
              <Button onClick={handleManualSearch} variant="outline" size="icon">
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}

        {scanning && (
          <Button onClick={stopScan} variant="outline" className="w-full">Cancelar</Button>
        )}

        {product && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{product.paciente_nombre}</CardTitle>
            </CardHeader>
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
                  <Button onClick={() => { setProduct(null); setSuccess(false); }} variant="outline">
                    <RotateCcw className="h-4 w-4 mr-1" />Escanear Otro
                  </Button>
                </div>
              ) : nextState ? (
                <Button onClick={advanceState} disabled={updating} className="w-full">
                  {updating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ChevronRight className="h-4 w-4 mr-1" />}
                  Avanzar a: {nextState.label}
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-2">Este producto ya está en su estado final.</p>
              )}

              {!success && (
                <Button onClick={() => { setProduct(null); }} variant="ghost" size="sm" className="w-full">
                  <RotateCcw className="h-3 w-3 mr-1" />Escanear Otro
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
