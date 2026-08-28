import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Split } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { MEDIOS_PAGO } from '@/lib/pricing';

import { aplicarAbono, listarAplicaciones } from './abonosDb';
import {
  disponibleAbono,
  distribuirPorAntiguedad,
  redondear2,
  sumaReparto,
  totalesAplicados,
  validarReparto,
} from './repartoAbonos';

/** Orden con saldo pendiente, candidata a recibir parte del abono. */
export interface OrdenAplicable {
  id: string;
  numero_orden: number | null;
  paciente_id: string;
  paciente_nombre: string;
  saldo_pendiente: number;
  created_at: string;
}

export interface AbonoAplicable {
  id: string;
  monto: number;
  paciente_id: string;
  paciente_nombre: string;
  /** Monto del abono que todavía no está imputado a ninguna orden. */
  disponible: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Abono ya registrado cuyo saldo se quiere repartir. Si es `null` el diálogo
   * funciona en modo "registrar un abono nuevo y repartirlo".
   */
  abono?: AbonoAplicable | null;
  /** Órdenes con saldo pendiente (las mismas que ya carga la pestaña Cartera). */
  ordenes: OrdenAplicable[];
  /** ¿El rol permite escribir? Se recibe del padre para no reconsultar el rol. */
  puedeEscribir: boolean;
}

const pesos = (n: number) => `$${(Number(n) || 0).toLocaleString('es-CO')}`;

/**
 * Aplicación de un abono a una o varias órdenes con montos parciales
 * (README 6.3), respaldada por la tabla `aplicacion_abonos`.
 *
 * Dos modos:
 *  - con `abono`: reparte el saldo por aplicar de un abono ya registrado.
 *  - sin `abono`: registra un abono nuevo por el total recibido y lo distribuye
 *    en el mismo paso. El abono queda asociado (columna `abonos.orden_id`, que
 *    es NOT NULL) a la orden que recibe la mayor porción; el reparto real vive
 *    en `aplicacion_abonos`.
 */
export function AplicacionAbonos({ open, onOpenChange, abono, ordenes, puedeEscribir }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const modoCrear = !abono;

  const [pacienteId, setPacienteId] = useState<string>('');
  const [montoTotal, setMontoTotal] = useState<string>('');
  const [medioPago, setMedioPago] = useState<string>('efectivo');
  const [referencia, setReferencia] = useState<string>('');
  const [observaciones, setObservaciones] = useState<string>('');
  const [repartos, setRepartos] = useState<Record<string, string>>({});

  // Al abrir/cambiar de abono se reinicia el formulario.
  useEffect(() => {
    if (!open) return;
    setPacienteId(abono?.paciente_id ?? '');
    setMontoTotal(abono ? String(abono.disponible) : '');
    setMedioPago('efectivo');
    setReferencia('');
    setObservaciones('');
    setRepartos({});
  }, [open, abono]);

  /** Pacientes con al menos una orden con saldo (solo para el modo crear). */
  const pacientes = useMemo(() => {
    const m = new Map<string, string>();
    ordenes.forEach((o) => { if (!m.has(o.paciente_id)) m.set(o.paciente_id, o.paciente_nombre); });
    return Array.from(m, ([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [ordenes]);

  /** Órdenes del paciente elegido, de la más antigua a la más reciente. */
  const ordenesPaciente = useMemo(
    () => ordenes
      .filter((o) => o.paciente_id === pacienteId && o.saldo_pendiente > 0)
      .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [ordenes, pacienteId],
  );

  /**
   * Disponible del abono releído desde la base: la lista de abonos del padre
   * puede estar cacheada, y repartir de más es un descuadre de cartera.
   */
  const { data: disponibleReal } = useQuery({
    queryKey: ['abono-disponible', abono?.id],
    enabled: open && !!abono?.id,
    queryFn: async () => {
      const aplicaciones = await listarAplicaciones([abono!.id]);
      return disponibleAbono(abono!.monto, totalesAplicados(aplicaciones)[abono!.id] || 0);
    },
  });

  const disponible = modoCrear
    ? (Number(montoTotal) || 0)
    : (disponibleReal ?? abono!.disponible);

  const lineas = useMemo(
    () => ordenesPaciente.map((o) => ({
      orden_id: o.id,
      saldo_pendiente: o.saldo_pendiente,
      monto: Number(repartos[o.id]) || 0,
      etiqueta: o.numero_orden ? `#${o.numero_orden}` : o.id.slice(0, 8),
    })),
    [ordenesPaciente, repartos],
  );

  const sumaAplicada = sumaReparto(lineas);
  const restante = redondear2(disponible - sumaAplicada);
  const errorValidacion = validarReparto(disponible, lineas);

  /** Reparte el disponible entre las órdenes, de la más antigua a la más nueva. */
  const distribuirAuto = () => {
    const reparto = distribuirPorAntiguedad(disponible, ordenesPaciente);
    setRepartos(Object.fromEntries(Object.entries(reparto).map(([id, m]) => [id, String(m)])));
  };

  const guardar = useMutation({
    mutationFn: async () => {
      if (!puedeEscribir) throw new Error('No tiene permisos para aplicar abonos');

      const activas = lineas.filter((l) => l.monto > 0);
      const error = validarReparto(disponible, lineas);
      if (error) throw new Error(error);

      let abonoId = abono?.id;
      let montoAbono = abono?.monto ?? 0;

      if (modoCrear) {
        const total = redondear2(Number(montoTotal) || 0);
        if (!Number.isFinite(total) || total <= 0) {
          throw new Error('El monto del abono debe ser mayor a cero');
        }
        // La orden "principal" (columna NOT NULL `abonos.orden_id`) es la que
        // recibe la mayor porción; el reparto completo va en aplicacion_abonos.
        const principal = [...activas].sort((a, b) => b.monto - a.monto)[0];
        const { data, error: ae } = await supabase
          .from('abonos')
          .insert({
            orden_id: principal.orden_id,
            paciente_id: pacienteId,
            monto: total,
            medio_pago: medioPago,
            referencia_pago: referencia || null,
            observaciones: observaciones || null,
            registrado_por: user?.id ?? null,
          })
          .select('id, monto')
          .single();
        if (ae) throw ae;
        abonoId = data.id;
        montoAbono = Number(data.monto) || total;
      }

      if (!abonoId) throw new Error('No se pudo identificar el abono');

      return aplicarAbono({
        abonoId,
        montoAbono,
        usuarioId: user?.id ?? null,
        lineas: activas.map((l) => ({ orden_id: l.orden_id, monto: l.monto, etiqueta: l.etiqueta })),
      });
    },
    onSuccess: ({ aplicado, ordenes: n }) => {
      queryClient.invalidateQueries({ queryKey: ['ordenes-cartera'] });
      queryClient.invalidateQueries({ queryKey: ['abonos'] });
      queryClient.invalidateQueries({ queryKey: ['aplicaciones-abonos'] });
      queryClient.invalidateQueries({ queryKey: ['abono-disponible'] });
      onOpenChange(false);
      toast.success(`${pesos(aplicado)} aplicados a ${n} ${n === 1 ? 'orden' : 'órdenes'}`);
    },
    onError: (e: Error) => toast.error(e.message || 'No se pudo aplicar el abono'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {modoCrear ? 'Registrar Abono y Distribuirlo' : 'Aplicar Abono a Órdenes'}
          </DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); guardar.mutate(); }}
        >
          {modoCrear ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Paciente *</Label>
                <Select value={pacienteId} onValueChange={(v) => { setPacienteId(v); setRepartos({}); }}>
                  <SelectTrigger><SelectValue placeholder="Seleccione el paciente" /></SelectTrigger>
                  <SelectContent>
                    {pacientes.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Monto recibido *</Label>
                <Input
                  type="number"
                  step="100"
                  min={1}
                  required
                  value={montoTotal}
                  onChange={(e) => setMontoTotal(e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Medio de Pago *</Label>
                <Select value={medioPago} onValueChange={setMedioPago}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MEDIOS_PAGO.map((m) => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Referencia de Pago</Label>
                <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="No. comprobante" />
              </div>
            </div>
          ) : (
            <div className="rounded-lg border p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paciente</span>
                <strong>{abono!.paciente_nombre}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monto del abono</span>
                <span>{pesos(abono!.monto)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Disponible por aplicar</span>
                <span>{pesos(disponible)}</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Distribuya el abono entre las órdenes con saldo. Puede aplicar montos parciales.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!pacienteId || disponible <= 0}
              onClick={distribuirAuto}
            >
              <Split className="h-3.5 w-3.5 mr-1" />Distribuir (más antigua primero)
            </Button>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Orden</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="w-40 text-right">Aplicar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!pacienteId ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">Seleccione un paciente</TableCell></TableRow>
                ) : ordenesPaciente.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">El paciente no tiene órdenes con saldo pendiente</TableCell></TableRow>
                ) : ordenesPaciente.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="text-sm font-medium">
                      {o.numero_orden ? `#${o.numero_orden}` : o.id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleDateString('es-CO')}
                    </TableCell>
                    <TableCell className="text-right text-sm">{pesos(o.saldo_pendiente)}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        step="100"
                        min={0}
                        max={o.saldo_pendiente}
                        className="h-8 text-right"
                        value={repartos[o.id] ?? ''}
                        onChange={(e) => setRepartos((p) => ({ ...p, [o.id]: e.target.value }))}
                        placeholder="0"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg border p-2">
              <p className="text-[10px] text-muted-foreground">Disponible</p>
              <p className="font-bold">{pesos(disponible)}</p>
            </div>
            <div className="rounded-lg border p-2">
              <p className="text-[10px] text-muted-foreground">Aplicado</p>
              <p className="font-bold">{pesos(sumaAplicada)}</p>
            </div>
            <div className={`rounded-lg border p-2 ${restante < 0 ? 'bg-destructive/10 border-destructive/30' : ''}`}>
              <p className="text-[10px] text-muted-foreground">Sin aplicar</p>
              <p className="font-bold">{pesos(restante)}</p>
            </div>
          </div>

          {modoCrear && (
            <div className="space-y-2">
              <Label>Observaciones</Label>
              <Textarea rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Notas adicionales..." />
            </div>
          )}

          {errorValidacion && sumaAplicada > 0 && (
            <p className="text-[11px] text-destructive">{errorValidacion}</p>
          )}
          {restante > 0 && sumaAplicada > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Quedarán {pesos(restante)} sin aplicar; podrá imputarlos después desde la pestaña de abonos.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button
              type="submit"
              disabled={
                guardar.isPending || !puedeEscribir || !pacienteId || !!errorValidacion ||
                (modoCrear && !(Number(montoTotal) > 0))
              }
            >
              {guardar.isPending ? 'Guardando...' : modoCrear ? 'Registrar y Aplicar' : 'Aplicar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
