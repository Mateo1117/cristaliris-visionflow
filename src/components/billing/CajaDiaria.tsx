import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ArrowDownCircle, Info, LockKeyhole, Unlock, Wallet } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';

import {
  INGRESOS_VACIOS,
  LIMITACIONES_CAJA,
  agruparIngresos,
  calcularDiferencia,
  esperadoEfectivo,
  etiquetaDiferencia,
  montoEsperado,
  redondear2,
  type IngresosCaja,
} from './cajaCalc';

/** Fila de `caja_diaria` tal como la devuelve el select (incluye la sede embebida). */
interface CajaRow {
  id: string;
  sede_id: string | null;
  usuario_id: string | null;
  fecha: string;
  hora_apertura: string;
  hora_cierre: string | null;
  monto_apertura: number | null;
  ingresos_efectivo: number | null;
  ingresos_tarjeta: number | null;
  ingresos_transferencia: number | null;
  egresos: number | null;
  monto_cierre: number | null;
  diferencia: number | null;
  estado: string;
  observaciones: string | null;
  sedes?: { nombre: string } | null;
}

const pesos = (n: number | null | undefined) => `$${(Number(n) || 0).toLocaleString('es-CO')}`;

/** `fecha` es DATE ('YYYY-MM-DD'): se formatea sin pasar por UTC para no restar un día. */
function formatFecha(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return new Date(fecha).toLocaleDateString('es-CO');
}

const formatHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '—';

/**
 * Caja diaria (README 6.4): apertura por usuario/sede, ingresos y egresos del
 * día, y cierre con arqueo (esperado vs. real, diferencia y observaciones
 * obligatorias si no cuadra) más el histórico de cierres.
 *
 * Las columnas usadas son EXACTAMENTE las de `caja_diaria` en
 * src/integrations/supabase/types.ts. Lo que el esquema no permite guardar
 * está documentado en `LIMITACIONES_CAJA` y se muestra al final de la pestaña.
 */
export function CajaDiaria() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { canWrite, isLoading: permisosCargando } = usePermissions();

  // Escritura de caja: admin, asesor_comercial y contador
  // (ESCRITURA_MODULO.cartera en src/hooks/usePermissions.ts, alineado con las
  // políticas RLS de `caja_diaria`).
  const puedeOperar = !permisosCargando && canWrite('cartera');

  const [showApertura, setShowApertura] = useState(false);
  const [showEgreso, setShowEgreso] = useState(false);
  const [showCierre, setShowCierre] = useState(false);
  const [sedeApertura, setSedeApertura] = useState<string>('');
  const [montoReal, setMontoReal] = useState<string>('');
  const [obsCierre, setObsCierre] = useState<string>('');

  const { data: sedes = [] } = useQuery({
    queryKey: ['sedes-activas-caja'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sedes')
        .select('id, nombre')
        .eq('estado_activa', true)
        .order('nombre');
      if (error) throw error;
      return data;
    },
  });

  /** Todas las cajas abiertas: sirven para el bloqueo de doble apertura. */
  const { data: abiertas = [], isLoading: cargandoAbiertas } = useQuery({
    queryKey: ['caja-diaria', 'abiertas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('caja_diaria')
        .select('*, sedes(nombre)')
        .eq('estado', 'abierta')
        .order('hora_apertura', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as CajaRow[];
    },
  });

  /** Histórico de cierres (README 6.4: "histórico de cierres consultable"). */
  const { data: cerradas = [] } = useQuery({
    queryKey: ['caja-diaria', 'cerradas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('caja_diaria')
        .select('*, sedes(nombre)')
        .eq('estado', 'cerrada')
        .order('fecha', { ascending: false })
        .order('hora_cierre', { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data || []) as unknown as CajaRow[];
    },
  });

  /** La caja del usuario actual: es la única que puede operar y cerrar. */
  const cajaActual = useMemo(
    () => abiertas.find((c) => c.usuario_id && c.usuario_id === user?.id) ?? null,
    [abiertas, user?.id],
  );

  /**
   * Ingresos de la caja abierta: abonos registrados en la sede de la caja
   * desde su hora de apertura.
   *
   * `abonos` no tiene `sede_id`, así que la sede se toma de la orden asociada
   * y el filtrado por sede se hace en memoria (el rango de fechas ya acota la
   * consulta a un turno).
   */
  const { data: ingresos = INGRESOS_VACIOS, isLoading: cargandoIngresos } = useQuery({
    queryKey: ['caja-ingresos', cajaActual?.id],
    enabled: !!cajaActual,
    queryFn: async (): Promise<IngresosCaja> => {
      const caja = cajaActual!;
      const { data, error } = await supabase
        .from('abonos')
        .select('monto, medio_pago, fecha_abono, ordenes(sede_id)')
        .gte('fecha_abono', caja.hora_apertura);
      if (error) throw error;

      const propios = (data || []).filter((a) => {
        if (!caja.sede_id) return true; // caja sin sede: no se puede discriminar
        const sede = (a as { ordenes?: { sede_id: string | null } | null }).ordenes?.sede_id;
        return sede === caja.sede_id;
      });
      return agruparIngresos(propios as Array<{ monto: number | null; medio_pago: string | null }>);
    },
    refetchOnWindowFocus: true,
  });

  const egresosActuales = Number(cajaActual?.egresos) || 0;

  /** Base del arqueo: apertura + ingresos calculados - egresos acumulados. */
  const baseCierre = useMemo(
    () => ({
      monto_apertura: Number(cajaActual?.monto_apertura) || 0,
      ingresos_efectivo: ingresos.efectivo,
      ingresos_tarjeta: ingresos.tarjeta,
      ingresos_transferencia: ingresos.transferencia,
      egresos: egresosActuales,
    }),
    [cajaActual?.monto_apertura, ingresos, egresosActuales],
  );

  const esperado = montoEsperado(baseCierre);
  const enCajon = esperadoEfectivo(baseCierre);
  const realNum = Number(montoReal);
  const diferencia = Number.isFinite(realNum) && montoReal !== '' ? calcularDiferencia(esperado, realNum) : 0;
  const hayDiferencia = montoReal !== '' && Number.isFinite(realNum) && diferencia !== 0;

  // ------------------------------------------------------------------ abrir
  const abrirCaja = useMutation({
    mutationFn: async ({ sedeId, monto }: { sedeId: string; monto: number }) => {
      if (!user?.id) throw new Error('Debe iniciar sesión para abrir la caja');
      if (!sedeId) throw new Error('Seleccione la sede');
      if (!Number.isFinite(monto) || monto < 0) throw new Error('El monto de apertura no puede ser negativo');

      // Relectura: entre que se abrió el diálogo y se envió el formulario otro
      // usuario pudo haber abierto la caja de esta sede.
      const { data: yaAbiertas, error: qe } = await supabase
        .from('caja_diaria')
        .select('id, sede_id, usuario_id, sedes(nombre)')
        .eq('estado', 'abierta');
      if (qe) throw qe;

      const propia = (yaAbiertas || []).find((c) => c.usuario_id === user.id);
      if (propia) {
        const nombre = (propia as { sedes?: { nombre: string } | null }).sedes?.nombre;
        throw new Error(
          `Ya tiene una caja abierta${nombre ? ` en ${nombre}` : ''}. Ciérrela antes de abrir otra.`,
        );
      }
      const deLaSede = (yaAbiertas || []).find((c) => c.sede_id === sedeId);
      if (deLaSede) {
        throw new Error('Ya hay una caja abierta en esta sede. Debe cerrarse antes de abrir otra.');
      }

      const { error } = await supabase.from('caja_diaria').insert({
        sede_id: sedeId,
        usuario_id: user.id,
        monto_apertura: redondear2(monto),
        estado: 'abierta',
        // `fecha` y `hora_apertura` los pone la base (CURRENT_DATE / now()) para
        // que la hora de apertura sea la del servidor, no la del navegador.
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['caja-diaria'] });
      setShowApertura(false);
      setSedeApertura('');
      toast.success('Caja abierta');
    },
    onError: (e: Error) => toast.error(e.message || 'No se pudo abrir la caja'),
  });

  // ---------------------------------------------------------------- egresos
  const registrarEgreso = useMutation({
    mutationFn: async ({ monto, concepto }: { monto: number; concepto: string }) => {
      if (!cajaActual) throw new Error('No hay una caja abierta');
      if (!Number.isFinite(monto) || monto <= 0) throw new Error('El egreso debe ser mayor a cero');
      if (!concepto.trim()) throw new Error('Describa el concepto del egreso');

      // Relectura del acumulado antes de sumar, igual que con el saldo de las
      // órdenes: el valor en memoria puede estar desactualizado.
      const { data: actual, error: re } = await supabase
        .from('caja_diaria')
        .select('egresos, observaciones, estado')
        .eq('id', cajaActual.id)
        .single();
      if (re) throw re;
      if (actual.estado !== 'abierta') throw new Error('La caja ya fue cerrada');

      const nuevoTotal = redondear2((Number(actual.egresos) || 0) + monto);
      const sello = new Date().toLocaleString('es-CO');
      const linea = `[Egreso ${sello}] ${pesos(monto)} — ${concepto.trim()}`;
      const observaciones = actual.observaciones ? `${actual.observaciones}\n${linea}` : linea;

      const { error } = await supabase
        .from('caja_diaria')
        .update({ egresos: nuevoTotal, observaciones })
        .eq('id', cajaActual.id)
        .eq('estado', 'abierta');
      if (error) throw error;
      return { monto, nuevoTotal };
    },
    onSuccess: ({ monto }) => {
      queryClient.invalidateQueries({ queryKey: ['caja-diaria'] });
      setShowEgreso(false);
      toast.success(`Egreso de ${pesos(monto)} registrado`);
    },
    onError: (e: Error) => toast.error(e.message || 'No se pudo registrar el egreso'),
  });

  // ----------------------------------------------------------------- cierre
  const cerrarCaja = useMutation({
    mutationFn: async () => {
      if (!cajaActual) throw new Error('No hay una caja abierta');
      const real = Number(montoReal);
      if (montoReal === '' || !Number.isFinite(real) || real < 0) {
        throw new Error('Digite el monto real contado (no puede ser negativo)');
      }

      const dif = calcularDiferencia(esperado, real);
      // README 6.4: observaciones obligatorias si hay diferencia.
      if (dif !== 0 && !obsCierre.trim()) {
        throw new Error(
          `Hay una diferencia de ${pesos(Math.abs(dif))} (${etiquetaDiferencia(dif).toLowerCase()}): las observaciones son obligatorias`,
        );
      }

      const observaciones = [cajaActual.observaciones, obsCierre.trim() ? `[Cierre] ${obsCierre.trim()}` : '']
        .filter(Boolean)
        .join('\n') || null;

      const { error } = await supabase
        .from('caja_diaria')
        .update({
          ingresos_efectivo: redondear2(ingresos.efectivo),
          ingresos_tarjeta: redondear2(ingresos.tarjeta),
          ingresos_transferencia: redondear2(ingresos.transferencia),
          egresos: redondear2(egresosActuales),
          monto_cierre: redondear2(real),
          diferencia: dif,
          hora_cierre: new Date().toISOString(),
          estado: 'cerrada',
          observaciones,
        })
        .eq('id', cajaActual.id)
        .eq('estado', 'abierta');
      if (error) throw error;
      return dif;
    },
    onSuccess: (dif) => {
      queryClient.invalidateQueries({ queryKey: ['caja-diaria'] });
      queryClient.invalidateQueries({ queryKey: ['caja-ingresos'] });
      setShowCierre(false);
      setMontoReal('');
      setObsCierre('');
      toast.success(
        dif === 0
          ? 'Caja cerrada — el arqueo cuadra'
          : `Caja cerrada con ${etiquetaDiferencia(dif).toLowerCase()} de ${pesos(Math.abs(dif))}`,
      );
    },
    onError: (e: Error) => toast.error(e.message || 'No se pudo cerrar la caja'),
  });

  const sinPermiso = !permisosCargando && !puedeOperar;

  return (
    <div className="space-y-4">
      {sinPermiso && (
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <Info className="h-3.5 w-3.5" />
          Su rol solo permite consultar la caja. La apertura, los egresos y el cierre están reservados a
          administrador, asesor comercial y contador.
        </p>
      )}

      {/* ---------------------------------------------------------- Caja del día */}
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            Caja del turno
          </CardTitle>
          {cajaActual ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!puedeOperar}
                onClick={() => setShowEgreso(true)}
              >
                <ArrowDownCircle className="h-3.5 w-3.5 mr-1" />Registrar egreso
              </Button>
              <Button
                size="sm"
                // Sin los ingresos cargados el monto esperado sería 0 y el
                // arqueo saldría con un "sobrante" falso.
                disabled={!puedeOperar || cargandoIngresos}
                onClick={() => { setMontoReal(''); setObsCierre(''); setShowCierre(true); }}
              >
                <LockKeyhole className="h-3.5 w-3.5 mr-1" />Cerrar caja
              </Button>
            </div>
          ) : (
            <Button size="sm" disabled={!puedeOperar || cargandoAbiertas} onClick={() => setShowApertura(true)}>
              <Unlock className="h-3.5 w-3.5 mr-1" />Abrir caja
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {cargandoAbiertas ? (
            <p className="text-center py-6 text-muted-foreground text-sm">Cargando...</p>
          ) : !cajaActual ? (
            <div className="py-6 text-center space-y-2">
              <p className="text-sm text-muted-foreground">No tiene ninguna caja abierta.</p>
              {abiertas.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Cajas abiertas por otros usuarios:{' '}
                  {abiertas.map((c) => `${c.sedes?.nombre || 'sin sede'} (${formatHora(c.hora_apertura)})`).join(', ')}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="default" className="text-[10px]">abierta</Badge>
                <span>Sede: <strong>{cajaActual.sedes?.nombre || '—'}</strong></span>
                <span>·</span>
                <span>Fecha: <strong>{formatFecha(cajaActual.fecha)}</strong></span>
                <span>·</span>
                <span>Apertura: <strong>{formatHora(cajaActual.hora_apertura)}</strong></span>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] text-muted-foreground">Monto de apertura</p>
                  <p className="text-base font-bold">{pesos(cajaActual.monto_apertura)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] text-muted-foreground">Efectivo</p>
                  <p className="text-base font-bold text-success">{pesos(ingresos.efectivo)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] text-muted-foreground">Tarjeta</p>
                  <p className="text-base font-bold text-success">{pesos(ingresos.tarjeta)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] text-muted-foreground">Transferencia</p>
                  <p className="text-base font-bold text-success">{pesos(ingresos.transferencia)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] text-muted-foreground">Egresos</p>
                  <p className="text-base font-bold text-destructive">{pesos(egresosActuales)}</p>
                </div>
                <div className="rounded-lg border p-3 bg-primary/5 border-primary/30">
                  <p className="text-[10px] text-muted-foreground">Monto esperado</p>
                  <p className="text-base font-bold">{cargandoIngresos ? '…' : pesos(esperado)}</p>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Esperado = apertura + ingresos − egresos. Solo en efectivo debería haber{' '}
                <strong>{pesos(enCajon)}</strong> en el cajón.
                {ingresos.otro > 0 && (
                  <> Hay además {pesos(ingresos.otro)} en medios que no mueven caja (nómina); no se incluyen.</>
                )}
              </p>

              {cajaActual.observaciones && (
                <div className="rounded-lg border p-3">
                  <p className="text-[10px] text-muted-foreground mb-1">Movimientos y notas</p>
                  <pre className="text-[11px] whitespace-pre-wrap font-sans">{cajaActual.observaciones}</pre>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* --------------------------------------------------------- Histórico */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Histórico de cierres</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Sede</TableHead>
                <TableHead>Apertura</TableHead>
                <TableHead>Efectivo</TableHead>
                <TableHead>Tarjeta</TableHead>
                <TableHead>Transf.</TableHead>
                <TableHead>Egresos</TableHead>
                <TableHead>Esperado</TableHead>
                <TableHead>Real</TableHead>
                <TableHead>Diferencia</TableHead>
                <TableHead>Cierre</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cerradas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                    No hay cierres de caja registrados
                  </TableCell>
                </TableRow>
              ) : cerradas.map((c) => {
                const dif = Number(c.diferencia) || 0;
                const etiqueta = etiquetaDiferencia(dif);
                return (
                  <TableRow key={c.id} title={c.observaciones || undefined}>
                    <TableCell className="text-sm">{formatFecha(c.fecha)}</TableCell>
                    <TableCell className="text-sm">{c.sedes?.nombre || '—'}</TableCell>
                    <TableCell className="text-sm">{pesos(c.monto_apertura)}</TableCell>
                    <TableCell className="text-sm">{pesos(c.ingresos_efectivo)}</TableCell>
                    <TableCell className="text-sm">{pesos(c.ingresos_tarjeta)}</TableCell>
                    <TableCell className="text-sm">{pesos(c.ingresos_transferencia)}</TableCell>
                    <TableCell className="text-sm text-destructive">{pesos(c.egresos)}</TableCell>
                    <TableCell className="text-sm">{pesos(montoEsperado(c))}</TableCell>
                    <TableCell className="text-sm font-medium">{pesos(c.monto_cierre)}</TableCell>
                    <TableCell>
                      <Badge
                        className={`text-[10px] ${
                          etiqueta === 'Cuadra'
                            ? 'bg-success/10 text-success'
                            : etiqueta === 'Sobrante'
                              ? 'bg-warning/10 text-warning'
                              : 'bg-destructive/10 text-destructive'
                        }`}
                      >
                        {etiqueta}{dif !== 0 ? ` ${pesos(Math.abs(dif))}` : ''}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatHora(c.hora_cierre)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <details className="text-[11px] text-muted-foreground">
        <summary className="cursor-pointer">Limitaciones del esquema actual de caja</summary>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          {LIMITACIONES_CAJA.map((l) => <li key={l}>{l}</li>)}
          <li>
            El bloqueo de doble apertura se valida en la aplicación (con relectura antes de insertar);
            la base no tiene un índice único que lo garantice ante escrituras simultáneas.
          </li>
        </ul>
      </details>

      {/* ---------------------------------------------------- Diálogo apertura */}
      <Dialog open={showApertura} onOpenChange={setShowApertura}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Abrir Caja</DialogTitle></DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              abrirCaja.mutate({
                sedeId: sedeApertura,
                monto: parseFloat(String(fd.get('monto_apertura') ?? '')),
              });
            }}
          >
            <div className="space-y-2">
              <Label>Sede *</Label>
              <Select value={sedeApertura} onValueChange={setSedeApertura}>
                <SelectTrigger><SelectValue placeholder="Seleccione la sede" /></SelectTrigger>
                <SelectContent>
                  {sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Monto de apertura *</Label>
              <Input name="monto_apertura" type="number" step="100" min={0} defaultValue={0} required />
              <p className="text-[11px] text-muted-foreground">
                Base con la que inicia el cajón. La fecha y la hora de apertura las registra el servidor.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setShowApertura(false)}>Cancelar</Button>
              <Button type="submit" disabled={abrirCaja.isPending || !sedeApertura}>
                {abrirCaja.isPending ? 'Abriendo...' : 'Abrir Caja'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ----------------------------------------------------- Diálogo egreso */}
      <Dialog open={showEgreso} onOpenChange={setShowEgreso}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Registrar Egreso</DialogTitle></DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              registrarEgreso.mutate({
                monto: parseFloat(String(fd.get('monto') ?? '')),
                concepto: String(fd.get('concepto') ?? ''),
              });
            }}
          >
            <div className="space-y-2">
              <Label>Monto *</Label>
              <Input name="monto" type="number" step="100" min={1} required placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>Concepto *</Label>
              <Textarea name="concepto" rows={2} required placeholder="Domicilio, papelería, retiro a banco..." />
              <p className="text-[11px] text-muted-foreground">
                El esquema solo guarda el total de egresos; el concepto queda anexado a las observaciones
                de la caja con fecha, hora y monto.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setShowEgreso(false)}>Cancelar</Button>
              <Button type="submit" disabled={registrarEgreso.isPending}>
                {registrarEgreso.isPending ? 'Guardando...' : 'Registrar Egreso'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ----------------------------------------------------- Diálogo cierre */}
      <Dialog open={showCierre} onOpenChange={setShowCierre}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Cierre y Arqueo de Caja</DialogTitle></DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); cerrarCaja.mutate(); }}
          >
            <div className="rounded-lg border p-3 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Monto de apertura</span><span>{pesos(cajaActual?.monto_apertura)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">+ Efectivo</span><span>{pesos(ingresos.efectivo)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">+ Tarjeta</span><span>{pesos(ingresos.tarjeta)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">+ Transferencia</span><span>{pesos(ingresos.transferencia)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">− Egresos</span><span className="text-destructive">{pesos(egresosActuales)}</span></div>
              <div className="flex justify-between font-bold pt-1 border-t"><span>Monto esperado</span><span>{pesos(esperado)}</span></div>
            </div>

            <div className="space-y-2">
              <Label>Monto real contado *</Label>
              <Input
                type="number"
                step="100"
                min={0}
                required
                value={montoReal}
                onChange={(e) => setMontoReal(e.target.value)}
                placeholder="0"
              />
            </div>

            <div
              className={`rounded-lg p-3 text-sm flex items-center justify-between ${
                !hayDiferencia ? 'bg-success/10' : diferencia > 0 ? 'bg-warning/10' : 'bg-destructive/10'
              }`}
            >
              <span className="font-medium">
                {montoReal === '' ? 'Diferencia' : etiquetaDiferencia(diferencia)}
              </span>
              <span className="font-bold">
                {montoReal === '' ? '—' : pesos(Math.abs(diferencia))}
              </span>
            </div>

            <div className="space-y-2">
              <Label>Observaciones {hayDiferencia && <span className="text-destructive">*</span>}</Label>
              <Textarea
                rows={3}
                value={obsCierre}
                onChange={(e) => setObsCierre(e.target.value)}
                placeholder={hayDiferencia ? 'Explique el sobrante o faltante...' : 'Notas del cierre (opcional)'}
              />
              {hayDiferencia && (
                <p className="text-[11px] text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  El arqueo no cuadra: las observaciones son obligatorias.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => setShowCierre(false)}>Cancelar</Button>
              <Button
                type="submit"
                disabled={cerrarCaja.isPending || montoReal === '' || (hayDiferencia && !obsCierre.trim())}
              >
                {cerrarCaja.isPending ? 'Cerrando...' : 'Cerrar Caja'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
