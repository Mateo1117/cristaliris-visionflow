import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DeudaEmpresasCard } from '@/components/reports/DeudaEmpresasCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { DollarSign, TrendingUp, CreditCard, Wallet, Split } from 'lucide-react';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MEDIOS_PAGO, RANGOS_ANTIGUEDAD, clasificarAntiguedad, diasAntiguedad, resumenAntiguedad, type RangoAntiguedad } from '@/lib/pricing';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { CajaDiaria } from '@/components/billing/CajaDiaria';
import { AplicacionAbonos, type AbonoAplicable, type OrdenAplicable } from '@/components/billing/AplicacionAbonos';
import { listarAplicaciones, registrarAplicacionDirecta } from '@/components/billing/abonosDb';
import { disponibleAbono, totalesAplicados } from '@/components/billing/repartoAbonos';

export default function Billing() {
  const [showAbono, setShowAbono] = useState(false);
  const [selectedOrden, setSelectedOrden] = useState<any>(null);
  /** Diálogo de reparto: `null` = registrar un abono nuevo y distribuirlo. */
  const [showReparto, setShowReparto] = useState(false);
  const [abonoARepartir, setAbonoARepartir] = useState<AbonoAplicable | null>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Escritura de cartera/caja: admin, contador y asesor_comercial
  // (ESCRITURA_MODULO.cartera, alineado con las políticas RLS de `abonos`,
  // `aplicacion_abonos` y `caja_diaria`).
  const { canWrite, isLoading: permisosCargando } = usePermissions();
  const puedeEscribir = !permisosCargando && canWrite('cartera');

  const { data: ordenes = [], isLoading } = useQuery({
    queryKey: ['ordenes-cartera'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ordenes')
        .select('*, pacientes(nombres, apellidos, numero_documento), sedes(nombre)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: abonos = [] } = useQuery({
    queryKey: ['abonos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('abonos')
        .select('*, pacientes(nombres, apellidos), ordenes(id)')
        .order('fecha_abono', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  /**
   * Cuánto de cada abono listado ya está imputado a órdenes (README 6.3).
   * Si la migración `20260828020000_aplicacion_abonos` aún no se aplicó, la
   * consulta falla y se asume 0 aplicado: la pestaña sigue siendo legible y
   * solo se desactiva el botón de repartir.
   */
  const abonoIds = useMemo(() => abonos.map((a) => a.id), [abonos]);

  const { data: aplicaciones = [], isError: sinTablaAplicaciones } = useQuery({
    queryKey: ['aplicaciones-abonos', abonoIds.join(',')],
    enabled: abonoIds.length > 0,
    retry: false,
    queryFn: () => listarAplicaciones(abonoIds),
  });

  const aplicadoPorAbono = useMemo(() => totalesAplicados(aplicaciones), [aplicaciones]);

  const createAbono = useMutation({
    mutationFn: async (formData: Record<string, any>) => {
      const monto = Math.round(parseFloat(formData.monto));

      if (!Number.isFinite(monto) || monto <= 0) {
        throw new Error('El monto del abono debe ser mayor a cero');
      }

      // Se relee el saldo desde la BD justo antes de calcular, no se usa el valor en
      // memoria: entre que se abrió el diálogo y se envió el formulario otro usuario
      // pudo haber registrado un abono sobre la misma orden.
      const { data: ordenActual, error: se } = await supabase
        .from('ordenes')
        .select('id, saldo_pendiente, total_final, estado_pago')
        .eq('id', formData.orden_id)
        .single();
      if (se) throw se;
      if (!ordenActual) throw new Error('La orden ya no existe');

      const saldoActual = Number(ordenActual.saldo_pendiente) || 0;
      if (saldoActual <= 0) {
        throw new Error('Esta orden ya no tiene saldo pendiente');
      }
      if (monto > saldoActual) {
        throw new Error(
          `El abono ($${monto.toLocaleString('es-CO')}) supera el saldo pendiente ($${saldoActual.toLocaleString('es-CO')})`,
        );
      }

      const { data: abonoCreado, error: ae } = await supabase.from('abonos').insert({
        orden_id: formData.orden_id,
        paciente_id: formData.paciente_id,
        monto,
        medio_pago: formData.medio_pago,
        referencia_pago: formData.referencia_pago || null,
        observaciones: formData.observaciones || null,
      }).select('id').single();
      if (ae) throw ae;

      // README 6.3: el libro de imputaciones debe reflejar TODO abono, también
      // los de una sola orden. Sin esta fila el abono figuraría como "sin
      // aplicar" y podría repartirse otra vez, descontando el saldo dos veces.
      // Si falla no se revierte nada: el dinero y el saldo ya quedan correctos.
      if (abonoCreado?.id) {
        try {
          await registrarAplicacionDirecta({
            abono_id: abonoCreado.id,
            orden_id: formData.orden_id,
            monto_aplicado: monto,
            usuario_id: user?.id ?? null,
          });
        } catch {
          toast.warning('El abono quedó registrado, pero no se pudo anotar su aplicación a la orden');
        }
      }

      const nuevoSaldo = Math.max(0, saldoActual - monto);
      const { error: ue } = await supabase.from('ordenes').update({
        saldo_pendiente: nuevoSaldo,
        estado_pago: nuevoSaldo === 0 ? 'pagado' : 'parcial',
      }).eq('id', formData.orden_id);
      if (ue) {
        throw new Error(`El abono se registró pero no se pudo actualizar el saldo de la orden: ${ue.message}`);
      }

      return { monto, nuevoSaldo };
    },
    onSuccess: ({ monto, nuevoSaldo }) => {
      queryClient.invalidateQueries({ queryKey: ['ordenes-cartera'] });
      queryClient.invalidateQueries({ queryKey: ['abonos'] });
      queryClient.invalidateQueries({ queryKey: ['aplicaciones-abonos'] });
      setShowAbono(false);
      setSelectedOrden(null);
      toast.success(
        `Abono de $${monto.toLocaleString('es-CO')} registrado` +
        (nuevoSaldo === 0 ? ' — orden pagada por completo' : ` — saldo restante $${nuevoSaldo.toLocaleString('es-CO')}`),
      );
    },
    onError: (e: any) => toast.error(e.message || 'No se pudo registrar el abono'),
  });

  const handleAbonoSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedOrden) return;
    const fd = new FormData(e.currentTarget);
    const data: Record<string, any> = { orden_id: selectedOrden.id, paciente_id: selectedOrden.paciente_id };
    fd.forEach((v, k) => { data[k] = v; });

    const monto = parseFloat(data.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      toast.error('Ingrese un monto mayor a cero');
      return;
    }
    const saldo = Number(selectedOrden.saldo_pendiente) || 0;
    if (monto > saldo) {
      toast.error(`El abono no puede superar el saldo pendiente ($${saldo.toLocaleString('es-CO')})`);
      return;
    }
    createAbono.mutate(data);
  };

  const totalPendiente = ordenes.reduce((s: number, o: any) => s + (o.saldo_pendiente || 0), 0);
  const totalVentas = ordenes.reduce((s: number, o: any) => s + (o.total_final || 0), 0);

  // Antigüedad de cartera (README 6.3): 0-30, 31-60, 61-90 y >90 días.
  const antiguedad = useMemo(
    () => resumenAntiguedad(
      (ordenes as any[]).map((o) => ({ fecha: o.created_at, saldo: Number(o.saldo_pendiente) || 0 })),
    ),
    [ordenes],
  );

  /** Órdenes con saldo, en el formato que espera el diálogo de reparto. */
  const ordenesAplicables = useMemo<OrdenAplicable[]>(
    () => ordenes
      .filter((o) => (Number(o.saldo_pendiente) || 0) > 0)
      .map((o) => ({
        id: o.id,
        numero_orden: o.numero_orden ?? null,
        paciente_id: o.paciente_id,
        paciente_nombre: `${o.pacientes?.nombres || ''} ${o.pacientes?.apellidos || ''}`.trim() || 'Sin nombre',
        saldo_pendiente: Number(o.saldo_pendiente) || 0,
        created_at: o.created_at,
      })),
    [ordenes],
  );

  const abrirReparto = (abono: AbonoAplicable | null) => {
    setAbonoARepartir(abono);
    setShowReparto(true);
  };

  const antiguedadColor: Record<RangoAntiguedad, string> = {
    '0-30': 'bg-success/10 text-success',
    '31-60': 'bg-warning/10 text-warning',
    '61-90': 'bg-accent/10 text-accent',
    '>90': 'bg-destructive/10 text-destructive',
  };

  const estadoPagoColor: Record<string, string> = {
    pendiente: 'bg-destructive/10 text-destructive',
    parcial: 'bg-warning/10 text-warning',
    pagado: 'bg-success/10 text-success',
  };

  return (
    <AppLayout>
      <PageHeader title="Cartera" description="Control financiero, abonos y caja diaria" />

      {!permisosCargando && !puedeEscribir && (
        <p className="text-xs text-muted-foreground mb-4">
          Su rol solo permite consultar la cartera. Registrar abonos, aplicarlos y operar la caja está
          reservado a administrador, asesor comercial y contador.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><DollarSign className="h-5 w-5 text-primary" /></div>
          <div><p className="text-xs text-muted-foreground">Total Ventas</p><p className="text-lg font-bold">${totalVentas.toLocaleString('es-CO')}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center"><Wallet className="h-5 w-5 text-warning" /></div>
          <div><p className="text-xs text-muted-foreground">Cartera Pendiente</p><p className="text-lg font-bold">${totalPendiente.toLocaleString('es-CO')}</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center"><TrendingUp className="h-5 w-5 text-success" /></div>
          <div><p className="text-xs text-muted-foreground">Recaudo</p><p className="text-lg font-bold">${(totalVentas - totalPendiente).toLocaleString('es-CO')}</p></div>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="cartera">
        <TabsList className="mb-4">
          <TabsTrigger value="cartera">Cartera</TabsTrigger>
          <TabsTrigger value="nomina">Deuda Nómina</TabsTrigger>
          <TabsTrigger value="abonos">Abonos Recientes</TabsTrigger>
          <TabsTrigger value="caja">Caja Diaria</TabsTrigger>
        </TabsList>

        <TabsContent value="cartera">
          <Card className="mb-4">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Antigüedad de Cartera</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {RANGOS_ANTIGUEDAD.map((r) => (
                <div key={r} className="rounded-lg border p-3">
                  <Badge className={`text-[10px] ${antiguedadColor[r]}`}>{r} días</Badge>
                  <p className="text-base font-bold mt-1">${antiguedad[r].toLocaleString('es-CO')}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {totalPendiente > 0 ? ((antiguedad[r] / totalPendiente) * 100).toFixed(1) : '0.0'}% de la cartera
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex justify-end mb-3">
            <Button
              size="sm"
              variant="outline"
              disabled={!puedeEscribir || ordenesAplicables.length === 0}
              onClick={() => abrirReparto(null)}
            >
              <Split className="h-3.5 w-3.5 mr-1" />Abono a varias órdenes
            </Button>
          </div>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Saldo</TableHead>
                  <TableHead>Antigüedad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Modalidad</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
                ) : ordenes.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No hay órdenes registradas</TableCell></TableRow>
                ) : ordenes.map((o: any) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-medium">{o.pacientes?.nombres} {o.pacientes?.apellidos}</TableCell>
                    <TableCell>${(o.total_final || 0).toLocaleString('es-CO')}</TableCell>
                    <TableCell className="font-medium">${(o.saldo_pendiente || 0).toLocaleString('es-CO')}</TableCell>
                    <TableCell>
                      {(o.saldo_pendiente || 0) > 0 ? (
                        <Badge className={`text-[10px] ${antiguedadColor[clasificarAntiguedad(o.created_at)]}`}>
                          {clasificarAntiguedad(o.created_at)} · {diasAntiguedad(o.created_at)}d
                        </Badge>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell><Badge className={`text-[10px] ${estadoPagoColor[o.estado_pago] || ''}`}>{o.estado_pago}</Badge></TableCell>
                    <TableCell className="text-sm">{o.modalidad_pago}</TableCell>
                    <TableCell>
                      {o.estado_pago !== 'pagado' && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!puedeEscribir}
                          onClick={() => { setSelectedOrden(o); setShowAbono(true); }}
                        >
                          <CreditCard className="h-3.5 w-3.5 mr-1" />Abonar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="nomina">
          <DeudaEmpresasCard />
        </TabsContent>

        <TabsContent value="abonos">
          {sinTablaAplicaciones && (
            <p className="text-xs text-muted-foreground mb-2">
              No se pudo leer la aplicación de abonos: verifique que la migración
              <code className="mx-1">20260828020000_aplicacion_abonos</code> esté aplicada.
            </p>
          )}
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Aplicado</TableHead>
                  <TableHead>Por aplicar</TableHead>
                  <TableHead>Medio de Pago</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {abonos.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No hay abonos registrados</TableCell></TableRow>
                ) : abonos.map((a: any) => {
                  const aplicado = aplicadoPorAbono[a.id] || 0;
                  const disponible = disponibleAbono(Number(a.monto) || 0, aplicado);
                  const paciente = `${a.pacientes?.nombres || ''} ${a.pacientes?.apellidos || ''}`.trim();
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="text-sm">{new Date(a.fecha_abono).toLocaleDateString('es-CO')}</TableCell>
                      <TableCell className="font-medium">{paciente || '—'}</TableCell>
                      <TableCell className="font-medium text-success">${a.monto.toLocaleString('es-CO')}</TableCell>
                      <TableCell className="text-sm">${aplicado.toLocaleString('es-CO')}</TableCell>
                      <TableCell className="text-sm">
                        {disponible > 0 ? (
                          <Badge className="text-[10px] bg-warning/10 text-warning">
                            ${disponible.toLocaleString('es-CO')}
                          </Badge>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-sm">{a.medio_pago}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.referencia_pago || '—'}</TableCell>
                      <TableCell>
                        {disponible > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!puedeEscribir}
                            onClick={() => abrirReparto({
                              id: a.id,
                              monto: Number(a.monto) || 0,
                              paciente_id: a.paciente_id,
                              paciente_nombre: paciente || 'Sin nombre',
                              disponible,
                            })}
                          >
                            <Split className="h-3.5 w-3.5 mr-1" />Aplicar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="caja">
          <CajaDiaria />
        </TabsContent>
      </Tabs>

      <AplicacionAbonos
        open={showReparto}
        onOpenChange={setShowReparto}
        abono={abonoARepartir}
        ordenes={ordenesAplicables}
        puedeEscribir={puedeEscribir}
      />

      <Dialog open={showAbono} onOpenChange={setShowAbono}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Registrar Abono</DialogTitle></DialogHeader>
          {selectedOrden && (
            <div className="text-sm text-muted-foreground mb-2">
              Paciente: <strong>{selectedOrden.pacientes?.nombres} {selectedOrden.pacientes?.apellidos}</strong><br />
              Saldo pendiente: <strong>${(selectedOrden.saldo_pendiente || 0).toLocaleString('es-CO')}</strong>
            </div>
          )}
          <form onSubmit={handleAbonoSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Monto *</Label>
              <Input
                name="monto"
                type="number"
                step="100"
                min={1}
                max={selectedOrden?.saldo_pendiente || undefined}
                required
                placeholder="0"
              />
              <p className="text-[11px] text-muted-foreground">
                Debe ser mayor a cero y no puede superar el saldo pendiente.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Medio de Pago *</Label>
              <Select name="medio_pago" required defaultValue="efectivo">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MEDIOS_PAGO.map((m) => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>Referencia de Pago</Label><Input name="referencia_pago" placeholder="No. comprobante" /></div>
            <div className="space-y-2"><Label>Observaciones</Label><Textarea name="observaciones" placeholder="Notas adicionales..." rows={2} /></div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setShowAbono(false)}>Cancelar</Button>
              <Button type="submit" disabled={createAbono.isPending || !puedeEscribir}>{createAbono.isPending ? 'Guardando...' : 'Registrar Abono'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
