import { SidebarTrigger } from '@/components/ui/sidebar';
import { Building2 } from 'lucide-react';
import { GlobalSearch } from './GlobalSearch';
import { NotificationBell } from './NotificationBell';

export function Header() {
  return (
    <header className="h-14 border-b flex items-center justify-between px-4 bg-card">
      <div className="flex items-center gap-2">
        <SidebarTrigger />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Building2 className="h-4 w-4" />
          <span>Sede Norte</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <GlobalSearch />
        <NotificationBell />
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-xs font-medium text-primary-foreground">AD</div>
          <div className="hidden md:block text-sm">
            <p className="font-medium leading-none">Admin</p>
            <p className="text-xs text-muted-foreground">Administrador</p>
          </div>
        </div>
      </div>
    </header>
  );
}
