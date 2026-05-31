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

  const buildPayload = async (f: Record<string, any>) => {
    let empleadoId = f.empleado_titular_id || null;
    // Auto-crear empleado si modalidad nómina, hay empresa y titular nuevo
    if (f.modalidad_pago === 'nomina' && f.empresa_id && !empleadoId && f.empleado_titular_cedula) {
      const { data: existing } = await supabase
        .from('empleados_nomina')
        .select('id')
        .eq('empresa_id', f.empresa_id)
        .eq('cedula', f.empleado_titular_cedula)
        .maybeSingle();
      if (existing) {
        empleadoId = existing.id;
      } else {
        const { data: nuevo, error: errEmp } = await supabase
          .from('empleados_nomina')
          .insert({
            empresa_id: f.empresa_id,
            nombre: f.empleado_titular_nombre,
            cedula: f.empleado_titular_cedula,
            celular: f.empleado_titular_celular || null,
          })
          .select('id')
          .single();
        if (errEmp) throw errEmp;
        empleadoId = nuevo.id;
      }
    }
    return {
      tipo_documento: f.tipo_documento,
      numero_documento: f.numero_documento,
      nombres: f.nombres,
      apellidos: f.apellidos,
      fecha_nacimiento: f.fecha_nacimiento || null,
      genero: f.genero || null,
      telefono: f.telefono,
      email: f.email,
      direccion: f.direccion,
      ciudad: f.ciudad || 'Bogotá',
      departamento: f.departamento || 'Cundinamarca',
      modalidad_pago: f.modalidad_pago || 'contado',
      es_fuera_bogota: f.ciudad !== 'Bogotá',
      empresa_id: f.empresa_id || null,
      referido_por: f.referido_por || null,
      ocupacion: f.ocupacion || null,
      empleado_titular_id: empleadoId,
      empleado_titular_nombre: f.empleado_titular_nombre || null,
      empleado_titular_cedula: f.empleado_titular_cedula || null,
      empleado_titular_celular: f.empleado_titular_celular || null,
    };
  };

  const createPaciente = useMutation({
    mutationFn: async (formData: Record<string, any>) => {
      const payload = await buildPayload(formData);
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
      const payload = await buildPayload(rest);
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
