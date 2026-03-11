import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { PatientTable } from '@/components/patients/PatientTable';
import { PatientSearch } from '@/components/patients/PatientSearch';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { PatientForm } from '@/components/patients/PatientForm';

export default function Patients() {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);

  return (
    <AppLayout>
      <PageHeader title="Pacientes" description="Gestión de pacientes registrados">
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Nuevo Paciente
        </Button>
      </PageHeader>
      <PatientSearch value={search} onChange={setSearch} />
      <PatientTable searchQuery={search} />
      <PatientForm open={showForm} onOpenChange={setShowForm} />
    </AppLayout>
  );
}
