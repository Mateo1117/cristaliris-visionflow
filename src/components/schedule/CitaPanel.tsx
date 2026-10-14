/**
 * Panel lateral de una cita (Agenda → clic en la cita). Pensado para la
 * optómetra: datos del paciente, botones grandes para marcar llegada,
 * atender, asistió o no asistió, y sus historias clínicas desplegables con
 * un clic (fórmula, diagnóstico y plan) sin salir de la agenda.
 */
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Building2, CalendarClock, CheckCircle2, ChevronDown, FileText, LogIn, MessageCircle, Phone, Stethoscope, UserX, XCircle,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ESTADO_CITA_COLOR, ESTADO_CITA_LABEL, resumenOjo } from '@/lib/flujoAtencion';
import { calcularEdad } from '@/components/patients/patientUtils';
import { aHoraCorta } from '@/lib/agendaGrid';

interface Props {
  cita: any | null;
  medicoNombre?: string;
  hoy: string;
  puedeAgendar: boolean;
  puedeAtender: boolean;
  onOpenChange: (o: boolean) => void;
  onCambiarEstado: (estado: string) => void;
  onAtender: () => void;
}

const fechaLarga = (iso: string) =>
  new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });

export function CitaPanel({ cita, medicoNombre, hoy, puedeAgendar, puedeAtender, onOpenChange, onCambiarEstado, onAtender }: Props) {
  const pacienteId = cita?.paciente_id;

  const { data: paciente } = useQuery({
    queryKey: ['cita-panel-paciente', pacienteId],
    queryFn: async () => {
      const { data, error } = await supabase.from('pacientes')
        .select('id, nombres, apellidos, tipo_documento, numero_documento, telefono, email, fecha_nacimiento, ocupacion, empresas(razon_social)')
        .eq('id', pacienteId).maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!pacienteId,
  });

  const { data: historias = [], isLoading: cargandoHC } = useQuery({
    queryKey: ['cita-panel-historias', pacienteId],
    queryFn: async () => {
      const { data, error } = await supabase.from('historias_clinicas')
        .select('*')
        .eq('paciente_id', pacienteId).order('fecha_consulta', { ascending: false }).limit(10);
      // Sin permiso para ver historias (p. ej. recepción): se muestra vacío.
      if (error || !data?.length) return [];
      const ids = [...new Set(data.map((h: any) => h.optometra_id).filter(Boolean))];
      const { data: perfiles } = ids.length
        ? await supabase.from('profiles').select('user_id, nombre').in('user_id', ids as string[])
        : { data: [] as any[] };
      return data.map((h: any) => ({ ...h, optometra_nombre: perfiles?.find((p: any) => p.user_id === h.optometra_id)?.nombre?.trim() }));
    },
    enabled: !!pacienteId && puedeAtender,
  });

  if (!cita) return null;
  const estado = cita.estado as string;
  const esHoy = cita.fecha === hoy;
  const edad = calcularEdad(paciente?.fecha_nacimiento);
  const telefono = (paciente?.telefono ?? cita.pacientes?.telefono ?? '').replace(/\D/g, '');
  const whatsapp = telefono ? `https://wa.me/${telefono.startsWith('57') ? telefono : `57${telefono}`}` : null;
  const cerrada = ['atendida', 'asistio', 'no_asistio', 'cancelada'].includes(estado);

  return (
    <Sheet open={!!cita} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="text-left space-y-1">
          <SheetTitle className="text-xl">{paciente ? `${paciente.nombres} ${paciente.apellidos}` : `${cita.pacientes?.nombres ?? ''} ${cita.pacientes?.apellidos ?? ''}`}</SheetTitle>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {paciente && <span>{paciente.tipo_documento} {paciente.numero_documento}</span>}
            {edad != null && <span>{edad} años</span>}
            {paciente?.empresas?.razon_social && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{paciente.empresas.razon_social}</span>}
          </div>
        </SheetHeader>

        {/* Cita */}
        <div className="mt-4 rounded-lg border p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium flex items-center gap-1.5"><CalendarClock className="h-4 w-4 text-primary" />
              {new Date(`${cita.fecha}T12:00:00`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })} · {aHoraCorta(cita.hora_inicio)}–{aHoraCorta(cita.hora_fin)}
            </p>
            <Badge variant="outline" className={ESTADO_CITA_COLOR[estado]}>{ESTADO_CITA_LABEL[estado] ?? estado}</Badge>
          </div>
          {medicoNombre && <p className="text-sm text-muted-foreground flex items-center gap-1.5"><Stethoscope className="h-3.5 w-3.5" />{medicoNombre}</p>}
          {cita.observaciones && <p className="text-sm rounded bg-muted/50 px-2 py-1">{cita.observaciones}</p>}
          {telefono && (
            <div className="flex gap-2 pt-1">
              <Button asChild variant="outline" size="sm"><a href={`tel:${telefono}`}><Phone className="h-4 w-4 mr-1" />{paciente?.telefono ?? telefono}</a></Button>
              {whatsapp && <Button asChild variant="outline" size="sm"><a href={whatsapp} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4 mr-1" />WhatsApp</a></Button>}
            </div>
          )}
        </div>

        {/* Acciones */}
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Gestionar cita</p>
          {puedeAtender && !cerrada && (
            <Button size="lg" className="w-full h-12 text-base" onClick={onAtender}>
              <Stethoscope className="h-5 w-5 mr-2" />{estado === 'en_consulta' ? 'Continuar consulta' : 'Atender y abrir historia clínica'}
            </Button>
          )}
          <div className="grid grid-cols-2 gap-2">
            {puedeAgendar && esHoy && ['agendada', 'confirmada'].includes(estado) && (
              <Button variant="secondary" className="h-11" onClick={() => onCambiarEstado('en_espera')}><LogIn className="h-4 w-4 mr-1.5" />Llegó (en sala)</Button>
            )}
            {puedeAgendar && estado === 'agendada' && (
              <Button variant="outline" className="h-11" onClick={() => onCambiarEstado('confirmada')}><CheckCircle2 className="h-4 w-4 mr-1.5" />Confirmó</Button>
            )}
            {puedeAgendar && !cerrada && (
              <Button variant="outline" className="h-11 border-success/40 text-success hover:bg-success/10" onClick={() => onCambiarEstado('atendida')}>
                <CheckCircle2 className="h-4 w-4 mr-1.5" />Asistió
              </Button>
            )}
            {puedeAgendar && !cerrada && (
              <Button variant="outline" className="h-11 border-warning/50 text-warning hover:bg-warning/10" onClick={() => onCambiarEstado('no_asistio')}>
                <UserX className="h-4 w-4 mr-1.5" />No asistió
              </Button>
            )}
            {puedeAgendar && !cerrada && (
              <Button variant="ghost" className="h-11 text-destructive" onClick={() => { if (confirm('¿Cancelar esta cita? El turno quedará libre.')) onCambiarEstado('cancelada'); }}>
                <XCircle className="h-4 w-4 mr-1.5" />Cancelar cita
              </Button>
            )}
            {puedeAgendar && cerrada && (
              <Button variant="outline" className="h-11 col-span-2" onClick={() => onCambiarEstado('agendada')}>Reabrir cita</Button>
            )}
          </div>
        </div>

        {/* Historias clínicas */}
        {puedeAtender && (
          <div className="mt-6 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />Historias clínicas ({historias.length})
            </p>
            {cargandoHC ? <p className="text-sm text-muted-foreground">Cargando…</p>
              : historias.length === 0 ? <p className="text-sm text-muted-foreground rounded-md border border-dashed p-3 text-center">Primera consulta: sin historias anteriores.</p>
              : historias.map((h, i) => (
                <Collapsible key={h.id} defaultOpen={i === 0} className="rounded-lg border">
                  <CollapsibleTrigger className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/50 group">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{fechaLarga(h.fecha_consulta)}{i === 0 && <Badge variant="secondary" className="ml-2 text-[10px]">Última</Badge>}</p>
                      <p className="text-xs text-muted-foreground truncate">{h.optometra_nombre ?? 'Optómetra'}{h.diagnostico ? ` · ${h.diagnostico}` : ''}</p>
                    </div>
                    <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="px-3 pb-3 space-y-2 text-sm">
                    <div className="rounded-md bg-muted/50 p-2 font-mono text-xs space-y-0.5">
                      <p>OD {resumenOjo({ esfera: h.formula_od_esfera, cilindro: h.formula_od_cilindro, eje: h.formula_od_eje, adicion: h.formula_od_adicion })}</p>
                      <p>OI {resumenOjo({ esfera: h.formula_oi_esfera, cilindro: h.formula_oi_cilindro, eje: h.formula_oi_eje, adicion: h.formula_oi_adicion })}</p>
                      {(h.distancia_pupilar || h.altura_pupilar_od) && (
                        <p>{h.distancia_pupilar ? `DP ${h.distancia_pupilar}` : ''}{h.altura_pupilar_od ? `  Alt OD ${h.altura_pupilar_od} / OI ${h.altura_pupilar_oi ?? '—'}` : ''}</p>
                      )}
                    </div>
                    {h.agudeza_visual_od && <p><span className="text-muted-foreground">AV:</span> OD {h.agudeza_visual_od} · OI {h.agudeza_visual_oi}</p>}
                    {h.formula_tipo_lente && <p><span className="text-muted-foreground">Lente:</span> {h.formula_tipo_lente}{h.formula_filtros ? ` · ${h.formula_filtros}` : ''}</p>}
                    {h.anamnesis && <p><span className="text-muted-foreground">Motivo:</span> {h.anamnesis}</p>}
                    {h.diagnostico && <p><span className="text-muted-foreground">Diagnóstico:</span> {h.diagnostico}{h.codigo_cie10 ? ` (${h.codigo_cie10})` : ''}</p>}
                    {h.plan_manejo && <p><span className="text-muted-foreground">Plan:</span> {h.plan_manejo}</p>}
                    {h.observaciones && <p><span className="text-muted-foreground">Obs.:</span> {h.observaciones}</p>}
                  </CollapsibleContent>
                </Collapsible>
              ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
