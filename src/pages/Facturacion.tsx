import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShoppingBag, ClipboardList, FileText, XCircle, Clock, Stethoscope, Phone, Building2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { VentaDirectaDialog } from '@/components/billing/VentaDirectaDialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/usePermissions';
import {
  RESULTADO_LABEL, registrarResultadoConsulta, resumenOjo, usePorFacturar, type HistoriaPorFacturar,
} from '@/lib/flujoAtencion';

const hace = (iso: string) => {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `hace ${h} h ${min % 60} min` : new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
};

const colorResultado: Record<string, string> = {
  orden: 'bg-success/15 text-success border-success/30',
  cotizacion: 'bg-info/15 text-info border-info/30',
  sin_compra: 'bg-muted text-muted-foreground',
};

/**
 * Cola "Por facturar": pacientes que salieron de consulta (historia clínica
 * guardada) y todavía no pasaron por caja. Desde aquí el asesor decide:
 * compra → orden, no compra → cotización (o sin compra).
 */
export default function Facturacion() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { canWrite } = usePermissions();
  const { data, isLoading } = usePorFacturar();
  const filas = data?.filas ?? [];
  const pendientes = filas.filter((f) => f.estado_facturacion === 'pendiente');
  const resueltos = filas.filter((f) => f.estado_facturacion !== 'pendiente');
  const cuenta = (r: string) => resueltos.filter((f) => f.estado_facturacion === r).length;
  const puedeEscribir = canWrite('facturacion');
  const [ventaDirecta, setVentaDirecta] = useState(false);

  const sinCompra = useMutation({
    mutationFn: (h: HistoriaPorFacturar) => registrarResultadoConsulta(h.historia_id, 'sin_compra'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['por-facturar'] });
      toast.success('Registrado: el paciente no compró');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const ir = (ruta: string, h: HistoriaPorFacturar) =>
    navigate(`${ruta}?paciente=${h.paciente_id}&historia=${h.historia_id}`);

  return (
    <AppLayout>
      <PageHeader title="Por facturar" description="Pacientes que salieron de consulta: genere la orden si compra o la cotización si no compra">
        {puedeEscribir && (
          <Button onClick={() => setVentaDirecta(true)}><ShoppingBag className="h-4 w-4 mr-1" />Venta directa (sin consulta)</Button>
        )}
      </PageHeader>
      <VentaDirectaDialog open={ventaDirecta} onOpenChange={setVentaDirecta} />

      {data?.sinMigracion && (
        <Alert className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Falta activar el flujo de atención</AlertTitle>
          <AlertDescription>
            Aplique la migración <code>20261014000000_flujo_atencion_y_orden_transaccional.sql</code> en el SQL editor de Lovable Cloud.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Por facturar', valor: pendientes.length, icon: Clock, clase: 'text-warning' },
          { label: 'Compraron hoy', valor: cuenta('orden'), icon: CheckCircle2, clase: 'text-success' },
          { label: 'Cotizaciones hoy', valor: cuenta('cotizacion'), icon: FileText, clase: 'text-info' },
          { label: 'Sin compra hoy', valor: cuenta('sin_compra'), icon: XCircle, clase: 'text-muted-foreground' },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <k.icon className={`h-5 w-5 ${k.clase}`} />
              <div>
                <p className="text-2xl font-semibold tabular-nums leading-none">{k.valor}</p>
                <p className="text-xs text-muted-foreground mt-1">{k.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <h2 className="text-sm font-semibold mb-3">Esperando en caja</h2>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : pendientes.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          No hay pacientes por facturar. Aparecen aquí cuando la optómetra guarda la historia clínica.
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {pendientes.map((h) => (
            <Card key={h.historia_id} className="border-warning/40">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{h.paciente_nombre}</p>
                    <p className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>{h.paciente_documento}</span>
                      {h.paciente_telefono && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{h.paciente_telefono}</span>}
                      {h.empresa && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{h.empresa}</span>}
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px]"><Clock className="h-3 w-3 mr-1" />{hace(h.fecha_consulta)}</Badge>
                </div>

                <div className="rounded-md bg-muted/50 px-3 py-2 text-xs space-y-0.5">
                  <p className="flex items-center gap-1 text-muted-foreground"><Stethoscope className="h-3 w-3" />{h.optometra_nombre ?? 'Optómetra'}</p>
                  <p className="font-mono tabular-nums">OD {resumenOjo(h.formula?.od)}</p>
                  <p className="font-mono tabular-nums">OI {resumenOjo(h.formula?.oi)}{h.formula?.dp ? `   DP ${h.formula.dp}` : ''}</p>
                  {(h.formula?.tipo_lente || h.formula?.filtros) && (
                    <p>{[h.formula.tipo_lente, h.formula.filtros].filter(Boolean).join(' · ')}</p>
                  )}
                </div>

                {puedeEscribir && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => ir('/ordenes', h)}>
                      <ClipboardList className="h-4 w-4 mr-1" />Compra: generar orden
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => ir('/cotizaciones', h)}>
                      <FileText className="h-4 w-4 mr-1" />No compra: cotizar
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="text-muted-foreground"
                      disabled={sinCompra.isPending}
                      onClick={() => { if (confirm(`¿${h.paciente_nombre} se va sin comprar y sin cotización?`)) sinCompra.mutate(h); }}
                    >
                      Sin compra
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {resueltos.length > 0 && (
        <>
          <h2 className="text-sm font-semibold mt-8 mb-3">Atendidos hoy</h2>
          <Card>
            <CardContent className="p-0 divide-y">
              {resueltos.map((h) => (
                <div key={h.historia_id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium">{h.paciente_nombre}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{h.optometra_nombre}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className={colorResultado[h.estado_facturacion]}>{RESULTADO_LABEL[h.estado_facturacion]}</Badge>
                    {h.estado_facturacion === 'orden' && <Button size="sm" variant="link" className="h-auto p-0" onClick={() => navigate('/ordenes')}>Ver orden</Button>}
                    {h.estado_facturacion === 'cotizacion' && <Button size="sm" variant="link" className="h-auto p-0" onClick={() => navigate('/cotizaciones')}>Ver cotización</Button>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </AppLayout>
  );
}
