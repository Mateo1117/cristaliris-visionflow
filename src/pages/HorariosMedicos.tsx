import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CalendarClock, CalendarOff, Calendar, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { EditorSemanal } from '@/components/schedule/EditorSemanal';
import { AusenciasMedico } from '@/components/schedule/AusenciasMedico';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { useExcepciones, useHorariosMedicos, useOptometras, useSedesActivas } from '@/lib/useAgendaDatos';
import { DIAS_SEMANA, diaCompletoBloqueado, resumenSemanal } from '@/lib/disponibilidad';
import { hoyEnColombia } from '@/lib/agendaGrid';

/**
 * Horarios de los médicos: horario semanal por días con varias franjas,
 * y ausencias o bloqueos. Antes vivía como una pestaña de la Agenda con un
 * diálogo pequeño que solo permitía agregar y borrar bloques sueltos.
 */
export default function HorariosMedicos() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const { role, canWrite } = usePermissions();
  const puedeEditar = canWrite('horarios');
  const { data: medicos = [], isLoading } = useOptometras();
  const { data: horarios = [] } = useHorariosMedicos();
  const { data: excepciones = [] } = useExcepciones();
  const { data: sedes = [] } = useSedesActivas();
  const pendientes = useRef(false);
  const hoy = hoyEnColombia();

  // La optómetra ve su propio horario; el admin elige.
  const seleccionado = params.get('medico')
    ?? (role === 'optometra' ? user?.id : undefined)
    ?? medicos[0]?.user_id;
  const medico = medicos.find((m) => m.user_id === seleccionado);
  const [pestana, setPestana] = useState('semana');

  useEffect(() => {
    // Aviso del navegador al salir con cambios sin guardar.
    const antesDeSalir = (e: BeforeUnloadEvent) => { if (pendientes.current) e.preventDefault(); };
    window.addEventListener('beforeunload', antesDeSalir);
    return () => window.removeEventListener('beforeunload', antesDeSalir);
  }, []);

  const elegir = (id: string) => {
    if (id === seleccionado) return;
    if (pendientes.current && !confirm('Hay cambios sin guardar en el horario. ¿Descartarlos?')) return;
    pendientes.current = false;
    setParams({ medico: id }, { replace: true });
  };

  return (
    <AppLayout>
      <PageHeader title="Horarios médicos" description="Días y franjas de atención de cada optómetra, y sus ausencias">
        <Button variant="outline" onClick={() => navigate('/agenda')}><Calendar className="h-4 w-4 mr-1" />Ir a la agenda</Button>
      </PageHeader>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : medicos.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          No hay optómetras registrados. Cree un usuario con rol "Optómetra" en <Button variant="link" className="p-0 h-auto" onClick={() => navigate('/usuarios')}>Usuarios</Button>.
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 items-start">
          {/* Lista de médicos */}
          <div className="space-y-2">
            {medicos.map((m) => {
              const propios = horarios.filter((h) => h.medico_id === m.user_id);
              const r = resumenSemanal(propios);
              const dias = [...new Set(propios.filter((h) => h.activo).map((h) => h.dia_semana))]
                .sort((a, b) => ((a || 7) - (b || 7))).map((d) => DIAS_SEMANA[d].slice(0, 2));
              const ausenteHoy = diaCompletoBloqueado(m.user_id, hoy, excepciones);
              const activo = m.user_id === seleccionado;
              return (
                <button
                  key={m.user_id}
                  type="button"
                  onClick={() => elegir(m.user_id)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${activo ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                >
                  <p className="font-medium text-sm flex items-center gap-1.5"><UserRound className="h-4 w-4 text-muted-foreground" />{m.nombre}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {propios.length === 0 ? 'Sin horario configurado' : `${r.horas} h/sem · ${dias.join(' ')}`}
                  </p>
                  {ausenteHoy && <Badge variant="outline" className="mt-1.5 text-[10px] border-warning/50 text-warning">Hoy: {ausenteHoy.motivo}</Badge>}
                </button>
              );
            })}
          </div>

          {/* Editor del médico elegido */}
          {medico && (
            <div className="min-w-0">
              <h2 className="text-lg font-semibold mb-3">{medico.nombre}</h2>
              <Tabs value={pestana} onValueChange={setPestana}>
                <TabsList className="mb-4">
                  <TabsTrigger value="semana" className="gap-1.5"><CalendarClock className="h-4 w-4" />Horario semanal</TabsTrigger>
                  <TabsTrigger value="ausencias" className="gap-1.5">
                    <CalendarOff className="h-4 w-4" />Ausencias y bloqueos
                    {excepciones.filter((e) => e.medico_id === medico.user_id && e.fecha_fin >= hoy).length > 0 && (
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                        {excepciones.filter((e) => e.medico_id === medico.user_id && e.fecha_fin >= hoy).length}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="semana">
                  <EditorSemanal
                    key={medico.user_id}
                    medicoId={medico.user_id}
                    medicoNombre={medico.nombre}
                    bloques={horarios.filter((h) => h.medico_id === medico.user_id)}
                    sedes={sedes}
                    puedeEditar={puedeEditar}
                    onCambiosPendientes={(p) => { pendientes.current = p; }}
                  />
                </TabsContent>
                <TabsContent value="ausencias">
                  <AusenciasMedico medicoId={medico.user_id} medicoNombre={medico.nombre} excepciones={excepciones} puedeEditar={puedeEditar} />
                </TabsContent>
              </Tabs>
              {!puedeEditar && <p className="text-xs text-muted-foreground mt-3">Solo un administrador puede modificar los horarios.</p>}
            </div>
          )}
        </div>
      )}
    </AppLayout>
  );
}
