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
import { toast } from 'sonner';

export default function Patients() {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
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

  return (
    <AppLayout>
      <PageHeader title="Pacientes" description="Gestión de pacientes registrados">
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-1" />Nuevo Paciente
        </Button>
      </PageHeader>
      <PatientSearch value={search} onChange={setSearch} />
      <PatientTable searchQuery={search} pacientes={pacientes} isLoading={isLoading} />
      <PatientForm open={showForm} onOpenChange={setShowForm} onSubmit={(data) => createPaciente.mutate(data)} isPending={createPaciente.isPending} />
    </AppLayout>
  );
}
