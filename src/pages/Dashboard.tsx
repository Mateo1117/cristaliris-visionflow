import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { KPICards } from '@/components/dashboard/KPICards';
import { DashboardCharts } from '@/components/dashboard/DashboardCharts';

export default function Dashboard() {
  return (
    <AppLayout>
      <PageHeader title="Dashboard" description="Resumen general de la óptica Cristal Iris" />
      <KPICards />
      <DashboardCharts />
    </AppLayout>
  );
}
