import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PatientSearch } from '@/components/patients/PatientSearch';
import { PatientForm } from '@/components/patients/PatientForm';
import { PatientTable } from '@/components/patients/PatientTable';
import { PatientDetailDialog } from '@/components/patients/PatientDetailDialog';
import { toast } from 'sonner';

export default function Patients() {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingPatient, setEditingPatient] = useState<any>(null);
  const [detailPatient, setDetailPatient] = useState<any>(null);
  const queryClient = useQueryClient();

  const { data: pacientes = [], isLoading } = useQuery({
    queryKey: ['pacientes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pacientes')
        .select('*, sedes(nombre), empresas(razon_social)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createPaciente = useMutation({
    mutationFn: async (formData: Record<string, any>) => {
      const { error } = await supabase.from('pacientes').insert({
        tipo_documento: formData.tipo_documento,
        numero_documento: formData.numero_documento,
        nombres: formData.nombres,
        apellidos: formData.apellidos,
        fecha_nacimiento: formData.fecha_nacimiento || null,
        genero: formData.genero || null,
        telefono: formData.telefono,
        email: formData.email,
        direccion: formData.direccion,
        ciudad: formData.ciudad || 'Bogotá',
        departamento: formData.departamento || 'Cundinamarca',
        modalidad_pago: formData.modalidad_pago || 'contado',
        es_fuera_bogota: formData.ciudad !== 'Bogotá',
        empresa_id: formData.empresa_id || null,
        referido_por: formData.referido_por || null,
      });
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
      const { error } = await supabase.from('pacientes').update({
        tipo_documento: rest.tipo_documento,
        numero_documento: rest.numero_documento,
        nombres: rest.nombres,
        apellidos: rest.apellidos,
        fecha_nacimiento: rest.fecha_nacimiento || null,
        genero: rest.genero || null,
        telefono: rest.telefono,
        email: rest.email,
        direccion: rest.direccion,
        ciudad: rest.ciudad || 'Bogotá',
        departamento: rest.departamento || 'Cundinamarca',
        modalidad_pago: rest.modalidad_pago || 'contado',
        es_fuera_bogota: rest.ciudad !== 'Bogotá',
        empresa_id: rest.empresa_id || null,
        referido_por: rest.referido_por || null,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pacientes'] });
      setEditingPatient(null);
      toast.success('Paciente actualizado exitosamente');
    },
    onError: (e: any) => toast.error(e.message),
  });

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
        searchQuery={search}
        pacientes={pacientes}
        isLoading={isLoading}
        onEdit={(p) => setEditingPatient(p)}
        onViewDetail={(p) => setDetailPatient(p)}
      />
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
      />
    </AppLayout>
  );
}
