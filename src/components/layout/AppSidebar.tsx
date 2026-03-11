import {
  LayoutDashboard, Users, Calendar, ClipboardList, Stethoscope,
  Package, Wallet, ShieldCheck, BarChart3, Settings, Eye, QrCode, UserCog, CheckSquare, FileText
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation } from 'react-router-dom';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';

const mainItems = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Pacientes', url: '/pacientes', icon: Users },
  { title: 'Agenda', url: '/agenda', icon: Calendar },
  { title: 'Órdenes', url: '/ordenes', icon: ClipboardList },
  { title: 'Historia Clínica', url: '/historia-clinica', icon: Stethoscope },
  { title: 'Control Calidad', url: '/control-calidad', icon: CheckSquare },
];

const operacionItems = [
  { title: 'Inventario', url: '/inventario', icon: Package },
  { title: 'Cartera', url: '/cartera', icon: Wallet },
  { title: 'Garantías', url: '/garantias', icon: ShieldCheck },
  { title: 'Reportes', url: '/reportes', icon: BarChart3 },
  { title: 'Escanear QR', url: '/scan', icon: QrCode },
];

const configItems = [
  { title: 'Usuarios', url: '/usuarios', icon: UserCog },
  { title: 'Configuración', url: '/configuracion', icon: Settings },
  { title: 'API Docs', url: '/api-docs', icon: FileText },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  const renderGroup = (label: string, items: typeof mainItems) => (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                <NavLink to={item.url} end className="hover:bg-sidebar-accent/50" activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium">
                  <item.icon className="h-4 w-4" />
                  {!collapsed && <span>{item.title}</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <Eye className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-sidebar-foreground tracking-tight truncate">Cristaliris</h2>
              <p className="text-[10px] text-sidebar-foreground/60 truncate">Sistema Óptico</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {renderGroup('Principal', mainItems)}
        {renderGroup('Operación', operacionItems)}
        {renderGroup('Sistema', configItems)}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        {!collapsed && (
          <p className="text-[10px] text-sidebar-foreground/40 text-center">v1.0 · Cristal Iris</p>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
