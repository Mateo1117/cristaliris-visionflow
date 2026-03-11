import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { AgendaCalendar } from '@/components/agenda/AgendaCalendar';

export default function Agenda() {
  return (
    <AppLayout>
      <PageHeader title="Agenda" description="Gestión de citas y agenda de optómetras" />
      <AgendaCalendar />
    </AppLayout>
  );
}
