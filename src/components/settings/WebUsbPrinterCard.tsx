/**
 * Tarjeta de configuración para impresora térmica vía WebUSB.
 * Permite vincular, desvincular y probar la impresora; cuando está vinculada,
 * `printThermalLabel` envía los comandos TSPL directamente (sin driver).
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Usb, Unplug, PrinterCheck, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  isWebUsbSupported,
  isPrinterConnected,
  getPrinterName,
  requestPrinter,
  tryReconnectPrinter,
  disconnectPrinter,
  printTestPattern,
  onPrinterStateChange,
} from '@/lib/printing/webusbPrinter';

interface Props {
  pageWmm: number;
  pageHmm: number;
}

export function WebUsbPrinterCard({ pageWmm, pageHmm }: Props) {
  const { toast } = useToast();
  const [connected, setConnected] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const supported = isWebUsbSupported();

  // Reconectar silenciosamente al cargar
  useEffect(() => {
    let cancelled = false;
    if (supported) {
      tryReconnectPrinter().then(ok => {
        if (cancelled) return;
        setConnected(ok && isPrinterConnected());
        setName(getPrinterName());
      });
    }
    const off = onPrinterStateChange(() => {
      setConnected(isPrinterConnected());
      setName(getPrinterName());
    });
    return () => { cancelled = true; off(); };
  }, [supported]);

  const handleConnect = async () => {
    setBusy(true);
    try {
      await requestPrinter();
      toast({ title: 'Impresora vinculada', description: getPrinterName() });
    } catch (e: any) {
      // El usuario puede cancelar el diálogo: no mostrar error en ese caso
      if (e?.name !== 'NotFoundError') {
        toast({ title: 'No se pudo vincular', description: e?.message ?? String(e), variant: 'destructive' });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    await disconnectPrinter();
    setBusy(false);
  };

  const handleTest = async () => {
    setBusy(true);
    try {
      await printTestPattern(Math.min(pageWmm, pageHmm), Math.max(pageWmm, pageHmm));
      toast({ title: 'Comando enviado', description: 'Verifica la salida física en la impresora.' });
    } catch (e: any) {
      toast({ title: 'Error al imprimir', description: e?.message ?? String(e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Usb className="h-4 w-4" /> Impresora térmica directa (WebUSB)
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Envía los comandos TSPL directamente a la impresora — el sistema operativo y su escalado quedan fuera del camino.
          Garantiza tamaño físico exacto ({pageWmm}×{pageHmm} mm) sin importar el papel por defecto del driver.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!supported ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
            <div>
              Tu navegador no soporta WebUSB. Usa <strong>Chrome</strong>, <strong>Edge</strong> u Opera para impresión directa.
              Mientras tanto se seguirá usando el flujo de impresión HTML.
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3">
              <div className="text-sm">
                Estado:{' '}
                {connected
                  ? <span className="text-primary font-medium">Vinculada — {name}</span>
                  : <span className="text-muted-foreground">No vinculada</span>}
              </div>
              <div className="flex gap-2">
                {connected ? (
                  <>
                    <Button size="sm" variant="outline" onClick={handleTest} disabled={busy}>
                      <PrinterCheck className="h-3.5 w-3.5 mr-1" /> Probar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleDisconnect} disabled={busy}>
                      <Unplug className="h-3.5 w-3.5 mr-1" /> Desvincular
                    </Button>
                  </>
                ) : (
                  <Button size="sm" onClick={handleConnect} disabled={busy}>
                    <Usb className="h-3.5 w-3.5 mr-1" /> Vincular impresora
                  </Button>
                )}
              </div>
            </div>

            <ul className="text-[11px] text-muted-foreground space-y-1 pl-4 list-disc">
              <li>Conecta la impresora por USB y enciéndela <em>antes</em> de vincular.</li>
              <li>El navegador te pedirá permiso una sola vez por equipo.</li>
              <li>Si "Vincular" no la muestra: cierra cualquier app que la esté usando (ej. spooler) y reintenta.</li>
              <li>Cuando esté vinculada, todas las etiquetas saldrán por aquí automáticamente.</li>
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
