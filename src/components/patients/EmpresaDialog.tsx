/**
 * Crear o editar una empresa (convenio). Se usa desde el registro del
 * paciente ("+ Nueva empresa" en el desplegable) y desde Configuración →
 * Empresas. El % de descuento del convenio se aplica en Órdenes.
 */
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/** Valores que admite la base de datos (CHECK empresas_porcentaje_descuento_check). */
export const DESCUENTOS_CONVENIO = [40, 45, 50] as const;

export interface Empresa {
  id?: string;
  razon_social: string;
  nit: string;
  porcentaje_descuento: number;
  contacto_rrhh?: string | null;
  telefono?: string | null;
  email?: string | null;
  estado_activa?: boolean;
}

const VACIA: Empresa = { razon_social: '', nit: '', porcentaje_descuento: 45, contacto_rrhh: '', telefono: '', email: '' };

interface Props {
  /** null = cerrado; {} o sin id = nueva; con id = editar. */
  empresa: Partial<Empresa> | null;
  onOpenChange: (o: boolean) => void;
  onGuardada?: (e: { id: string; razon_social: string }) => void;
}

export function EmpresaDialog({ empresa, onOpenChange, onGuardada }: Props) {
  const queryClient = useQueryClient();
  const [datos, setDatos] = useState<Empresa>(VACIA);
  const editando = !!empresa?.id;

  useEffect(() => {
    if (empresa) setDatos({ ...VACIA, ...empresa } as Empresa);
  }, [empresa]);

  const campo = (k: keyof Empresa) => (e: React.ChangeEvent<HTMLInputElement>) => setDatos((d) => ({ ...d, [k]: e.target.value }));

  const guardar = useMutation({
    mutationFn: async () => {
      const fila = {
        razon_social: datos.razon_social.trim(),
        nit: datos.nit.trim(),
        porcentaje_descuento: datos.porcentaje_descuento,
        contacto_rrhh: datos.contacto_rrhh?.trim() || null,
        telefono: datos.telefono?.trim() || null,
        email: datos.email?.trim() || null,
      };
      if (!fila.razon_social) throw new Error('Escriba el nombre de la empresa');
      if (!fila.nit) throw new Error('Escriba el NIT');
      const q = editando
        ? supabase.from('empresas').update(fila).eq('id', empresa!.id!).select('id, razon_social').single()
        : supabase.from('empresas').insert(fila).select('id, razon_social').single();
      const { data, error } = await q;
      if (error) throw new Error(error.code === '23505' ? 'Ya existe una empresa con ese NIT' : error.message);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['empresas-activas'] });
      queryClient.invalidateQueries({ queryKey: ['empresas-admin'] });
      toast.success(editando ? 'Empresa actualizada' : `Empresa "${data.razon_social}" creada`);
      onGuardada?.(data);
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={!!empresa} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar empresa' : 'Nueva empresa'}</DialogTitle>
          <DialogDescription>Empresa con convenio de la que vienen los pacientes. El descuento se aplica al crear la orden.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); guardar.mutate(); }}>
          <div className="space-y-1.5">
            <Label htmlFor="emp-nombre">Nombre / razón social *</Label>
            <Input id="emp-nombre" autoFocus value={datos.razon_social} onChange={campo('razon_social')} placeholder="Ej: Industrias ABC S.A.S." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="emp-nit">NIT *</Label>
              <Input id="emp-nit" value={datos.nit} onChange={campo('nit')} placeholder="900123456-7" />
            </div>
            <div className="space-y-1.5">
              <Label>Descuento convenio *</Label>
              <Select value={String(datos.porcentaje_descuento)} onValueChange={(v) => setDatos((d) => ({ ...d, porcentaje_descuento: Number(v) }))}>
                <SelectTrigger aria-label="Descuento convenio"><SelectValue /></SelectTrigger>
                <SelectContent>{DESCUENTOS_CONVENIO.map((p) => <SelectItem key={p} value={String(p)}>{p} %</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="emp-contacto">Contacto RR. HH.</Label>
              <Input id="emp-contacto" value={datos.contacto_rrhh ?? ''} onChange={campo('contacto_rrhh')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emp-tel">Teléfono</Label>
              <Input id="emp-tel" value={datos.telefono ?? ''} onChange={campo('telefono')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="emp-email">Correo</Label>
            <Input id="emp-email" type="email" value={datos.email ?? ''} onChange={campo('email')} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={guardar.isPending}>{guardar.isPending ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear empresa'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
