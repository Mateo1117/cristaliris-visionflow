import { ReactNode, useEffect } from 'react';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { Header } from './Header';
import { fetchPrintSettings } from '@/lib/printing/printSettings';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  // Rehidrata la caché local de parámetros de impresión desde la BD
  // al entrar a cualquier vista que use el layout principal.
  useEffect(() => {
    fetchPrintSettings().catch(() => {/* offline o sin permisos: usa caché */});
  }, []);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Header />
          <main className="flex-1 p-4 md:p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
