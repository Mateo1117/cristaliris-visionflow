import { ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions, ROLE_LABELS } from '@/hooks/usePermissions';
import type { AppRole } from '@/types';

interface ProtectedRouteProps {
  children: ReactNode;
  /** Si se indica, solo estos roles pueden ver la sección. */
  roles?: AppRole[];
}

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-pulse text-muted-foreground">Cargando...</div>
    </div>
  );
}

function SinPermiso({ roles, role }: { roles: AppRole[]; role: AppRole | null }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center space-y-4">
          <div className="flex justify-center">
            <div className="h-12 w-12 rounded-xl bg-destructive/10 flex items-center justify-center">
              <ShieldAlert className="h-6 w-6 text-destructive" />
            </div>
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">No tienes permiso para ver esta sección</h1>
            <p className="text-sm text-muted-foreground">
              Tu rol actual es{' '}
              <span className="font-medium text-foreground">
                {role ? ROLE_LABELS[role] : 'sin rol asignado'}
              </span>
              . Esta sección está disponible para: {roles.map((r) => ROLE_LABELS[r]).join(', ')}.
            </p>
            <p className="text-xs text-muted-foreground">
              Si crees que es un error, contacta a un administrador.
            </p>
          </div>
          <Button className="w-full" onClick={() => navigate('/dashboard')}>
            Volver al inicio
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const { role, isLoading: rolLoading } = usePermissions();

  if (loading) {
    return <Spinner />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (roles && roles.length > 0) {
    if (rolLoading) {
      return <Spinner />;
    }
    if (!role || !roles.includes(role)) {
      return <SinPermiso roles={roles} role={role} />;
    }
  }

  return <>{children}</>;
}
