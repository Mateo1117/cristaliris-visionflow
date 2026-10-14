import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PatientSearch } from '@/components/patients/PatientSearch';
import { PatientForm } from '@/components/patients/PatientForm';
import { PatientTable } from '@/components/patients/PatientTable';
import { PatientDetailDialog } from '@/components/patients/PatientDetailDialog';
import { PatientHistoryDialog } from '@/components/patients/PatientHistoryDialog';
import { filtroBusquedaPacientes } from '@/components/patients/patientUtils';
import { construirPayloadPaciente } from '@/components/patients/guardarPaciente';
import { toast } from 'sonner';

/** Pacientes por página: el listado se pagina en el servidor con `.range()`. */
const POR_PAGINA = 25;
/** Espera antes de consultar mientras se escribe (evita una consulta por tecla). */
const DEBOUNCE_MS = 350;

export default function Patients() {
  const [search, setSearch] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [editingPatient, setEditingPatient] = useState<any>(null);
  const [detailPatient, setDetailPatient] = useState<any>(null);
  const [historyPacienteId, setHistoryPacienteId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Debounce del texto de búsqueda; cada término nuevo vuelve a la página 1.
  useEffect(() => {
    const t = setTimeout(() => {
      setBusqueda(search.trim());
      setPagina(0);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['pacientes', busqueda, pagina],
    queryFn: async () => {
      const desde = pagina * POR_PAGINA;
      let query = supabase
        .from('pacientes')
        .select('*, sedes(nombre), empresas(razon_social)', { count: 'exact' })
        .order('created_at', { ascending: false });

      // La búsqueda filtra en el servidor: antes se descargaba la tabla entera
      // y se filtraba en memoria.
      const filtro = filtroBusquedaPacientes(busqueda);
      if (filtro) query = query.or(filtro);

      const { data, error, count } = await query.range(desde, desde + POR_PAGINA - 1);
      if (error) throw error;
      return { pacientes: data ?? [], total: count ?? 0 };
    },
    placeholderData: keepPreviousData,
  });

  const pacientes = data?.pacientes ?? [];
  const total = data?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const desde = total === 0 ? 0 : pagina * POR_PAGINA + 1;
  const hasta = pagina * POR_PAGINA + pacientes.length;

  // Si la página actual queda vacía (p. ej. tras filtrar), se retrocede.
  useEffect(() => {
    if (!isFetching && pagina > 0 && pacientes.length === 0) setPagina((p) => Math.max(0, p - 1));
  }, [isFetching, pagina, pacientes.length]);

  const createPaciente = useMutation({
    mutationFn: async (formData: Record<string, any>) => {
      const payload = await construirPayloadPaciente(formData);
      const { error } = await supabase.from('pacientes').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pacientes'] });
      setShowForm(false);
      toast.success('Paciente registrado exitosamente');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updatePaciente = useMutation({
    mutationFn: async (formData: Record<string, any>) => {
      const { id, ...rest } = formData;
      const payload = await construirPayloadPaciente(rest);
      const { error } = await supabase.from('pacientes').update(payload).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pacientes'] });
      setEditingPatient(null);
      toast.success('Paciente actualizado exitosamente');
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Abrir la edición cierra el detalle. Se difiere un tick porque el clic en
  // "Editar" del menú (que vive en un portal) también llegaba a la fila y abría
  // el detalle encima del formulario, dejándolo bloqueado.
  const abrirEdicion = (p: any) => {
    setTimeout(() => {
      setDetailPatient(null);
      setEditingPatient(p);
    }, 0);
  };

  const handleFormSubmit = (data: Record<string, any>) => {
    if (data.id) updatePaciente.mutate(data);
    else createPaciente.mutate(data);
  };

  return (
    <AppLayout>
      <PageHeader title="Pacientes" description="Gestión de pacientes registrados">
        <Button onClick={() => { setEditingPatient(null); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-1" />Nuevo Paciente
        </Button>
      </PageHeader>
      <PatientSearch value={search} onChange={setSearch} />
      <PatientTable
        pacientes={pacientes}
        isLoading={isLoading}
        onEdit={abrirEdicion}
        onViewDetail={(p) => setDetailPatient(p)}
        onViewHistory={(id) => setHistoryPacienteId(id)}
      />

      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 mt-4">
        <p className="text-sm text-muted-foreground">
          {total === 0
            ? 'Sin pacientes'
            : `Mostrando ${desde}–${hasta} de ${total} paciente${total !== 1 ? 's' : ''}`}
          {isFetching && ' · actualizando…'}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Página {pagina + 1} de {totalPaginas}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
            disabled={pagina === 0 || isFetching}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPagina((p) => p + 1)}
            disabled={pagina + 1 >= totalPaginas || isFetching}
          >
            Siguiente<ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>

      <PatientForm
        open={showForm || !!editingPatient}
        onOpenChange={(o) => { if (!o) { setShowForm(false); setEditingPatient(null); } }}
        onSubmit={handleFormSubmit}
        isPending={createPaciente.isPending || updatePaciente.isPending}
        initialData={editingPatient}
      />
      <PatientDetailDialog
        paciente={detailPatient}
        open={!!detailPatient}
        onOpenChange={(o) => { if (!o) setDetailPatient(null); }}
        onEdit={abrirEdicion}
      />
      <PatientHistoryDialog
        pacienteId={historyPacienteId}
        open={!!historyPacienteId}
        onOpenChange={(o) => { if (!o) setHistoryPacienteId(null); }}
      />
    </AppLayout>
  );
}
