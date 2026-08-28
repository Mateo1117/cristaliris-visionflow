import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogOut, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { GlobalSearch } from './GlobalSearch';
import { NotificationBell } from './NotificationBell';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions, useCurrentProfile } from '@/hooks/usePermissions';

function iniciales(nombre: string) {
  return nombre
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';
}

export function Header() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { roleLabel, isLoading } = usePermissions();
  const { data: profile } = useCurrentProfile();

  const nombre = profile?.nombre || user?.email || 'Usuario';
  const rolTexto = isLoading ? 'Cargando...' : (roleLabel ?? 'Sin rol asignado');

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth', { replace: true });
  };

  return (
    <header className="h-14 border-b flex items-center justify-between px-4 bg-card">
      <div className="flex items-center gap-2">
        <SidebarTrigger />
      </div>
      <div className="flex items-center gap-3">
        <GlobalSearch />
        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 h-10 px-2">
              <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-xs font-medium text-primary-foreground flex-shrink-0">
                {iniciales(nombre)}
              </div>
              <div className="hidden md:block text-sm text-left min-w-0">
                <p className="font-medium leading-none truncate max-w-[10rem]">{nombre}</p>
                <p className="text-xs text-muted-foreground truncate max-w-[10rem]">{rolTexto}</p>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground hidden md:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-medium leading-none truncate">{nombre}</p>
              <p className="text-xs text-muted-foreground mt-1 truncate">{user?.email}</p>
              <p className="text-xs text-muted-foreground mt-1">{rolTexto}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4 mr-2" />Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
