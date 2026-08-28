import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye } from 'lucide-react';
import { toast } from 'sonner';

export default function Auth() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');

  const handleForgotPassword = async () => {
    if (!forgotEmail) {
      toast.error('Ingresa tu correo electrónico');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Se envió un enlace de recuperación a tu correo.');
      setShowForgot(false);
    }
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.auth.signInWithPassword({
      email: fd.get('email') as string,
      password: fd.get('password') as string,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
              <Eye className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl">Cristaliris</CardTitle>
          <p className="text-sm text-muted-foreground">Sistema de Gestión Óptica</p>
        </CardHeader>
        <CardContent className="pt-4">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label>Correo electrónico</Label>
              <Input name="email" type="email" placeholder="usuario@cristaliris.com" required />
            </div>
            <div className="space-y-2">
              <Label>Contraseña</Label>
              <Input name="password" type="password" placeholder="••••••••" required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Ingresando...' : 'Ingresar'}
            </Button>
            <div className="text-center">
              <button
                type="button"
                className="text-sm text-primary hover:underline"
                onClick={() => setShowForgot(true)}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          </form>
          <p className="text-xs text-muted-foreground text-center mt-6 pt-4 border-t">
            ¿No tienes cuenta? Solicítala a un administrador del sistema.
          </p>
        </CardContent>
      </Card>

      {/* Forgot Password Modal */}
      {showForgot && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForgot(false)}>
          <Card className="w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Recuperar Contraseña</CardTitle>
              <p className="text-sm text-muted-foreground">Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Correo electrónico</Label>
                <Input
                  type="email"
                  placeholder="usuario@cristaliris.com"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowForgot(false)}>
                  Cancelar
                </Button>
                <Button className="flex-1" onClick={handleForgotPassword} disabled={loading}>
                  {loading ? 'Enviando...' : 'Enviar enlace'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
