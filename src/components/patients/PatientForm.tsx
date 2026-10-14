import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useEffect, useState } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { toast } from 'sonner';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { pacienteSchema, valoresIniciales, type PacienteFormValues } from './patientSchema';
import { EmpresaDialog } from './EmpresaDialog';
import { Plus } from 'lucide-react';

const NUEVA_EMPRESA = '__nueva__';
const EMPRESA_NUEVA = {}; // referencia estable: el diálogo se reinicia al cambiar de objeto

interface PatientFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Record<string, any>) => void;
  isPending?: boolean;
  initialData?: Record<string, any> | null;
}


export function PatientForm({ open, onOpenChange, onSubmit, isPending, initialData }: PatientFormProps) {
  const isEditing = !!initialData;
  const [creandoEmpresa, setCreandoEmpresa] = useState(false);

  const form = useForm<PacienteFormValues>({
    resolver: zodResolver(pacienteSchema),
    defaultValues: valoresIniciales(initialData),
    mode: 'onBlur',
  });

  // Al abrir el diálogo (o cambiar el paciente en edición) se recarga el estado.
  useEffect(() => {
    form.reset(valoresIniciales(initialData));
  }, [initialData, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas-activas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('empresas')
        .select('id, razon_social')
        .eq('estado_activa', true)
        .order('razon_social');
      if (error) throw error;
      return data;
    },
  });

  // Los mensajes de error quedan junto a cada campo y, en un formulario largo,
  // fuera de la vista: el botón "Guardar" parecía no hacer nada. Pacientes
  // registrados antes de la validación (p. ej. con un celular de 11 dígitos)
  // no se podían editar sin saber por qué.
  const avisarErrores = (errores: FieldErrors<PacienteFormValues>) => {
    const mensajes = Object.values(errores)
      .map((e) => e?.message)
      .filter(Boolean) as string[];
    toast.error('Revise los datos antes de guardar', {
      description: mensajes.slice(0, 3).join(' · '),
    });
  };

  const enviar = (v: PacienteFormValues) => {
    const conConvenio = v.empresa_id !== 'ninguna';
    onSubmit({
      ...(initialData?.id ? { id: initialData.id } : {}),
      tipo_documento: v.tipo_documento,
      numero_documento: v.numero_documento,
      nombres: v.nombres,
      apellidos: v.apellidos,
      fecha_nacimiento: v.fecha_nacimiento || null,
      genero: v.genero || null,
      telefono: v.telefono,
      email: v.email,
      direccion: v.direccion,
      ciudad: v.ciudad,
      departamento: v.departamento,
      ocupacion: v.ocupacion || null,
      referido_por: v.referido_por || null,
      empresa_id: conConvenio ? v.empresa_id : null,
      modalidad_pago: conConvenio ? 'nomina' : v.modalidad_pago,
      empleado_titular_id: conConvenio && v.empleado_titular_id !== 'nuevo' ? v.empleado_titular_id : null,
      empleado_titular_nombre: conConvenio ? v.empleado_titular_nombre || null : null,
      empleado_titular_cedula: conConvenio ? v.empleado_titular_cedula || null : null,
      empleado_titular_celular: conConvenio ? v.empleado_titular_celular || null : null,
    });
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Paciente' : 'Nuevo Paciente'}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Fecha de nacimiento, dirección y ocupación se completan al crear la historia clínica.
          </p>
        </DialogHeader>
        <Form {...form}>
          <form className="grid grid-cols-1 md:grid-cols-2 gap-4" onSubmit={form.handleSubmit(enviar, avisarErrores)} noValidate>
            <FormField
              control={form.control}
              name="tipo_documento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo Documento *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="CC">Cédula de Ciudadanía</SelectItem>
                      <SelectItem value="CE">Cédula de Extranjería</SelectItem>
                      <SelectItem value="TI">Tarjeta de Identidad</SelectItem>
                      <SelectItem value="PA">Pasaporte</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="numero_documento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de Documento *</FormLabel>
                  <FormControl><Input placeholder="Ingrese número" inputMode="numeric" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nombres"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombres *</FormLabel>
                  <FormControl><Input placeholder="Nombres" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="apellidos"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Apellidos *</FormLabel>
                  <FormControl><Input placeholder="Apellidos" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />


            <FormField
              control={form.control}
              name="telefono"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Teléfono *</FormLabel>
                  <FormControl><Input placeholder="3XX XXX XXXX" inputMode="tel" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="genero"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Género *</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="M">Masculino</SelectItem>
                      <SelectItem value="F">Femenino</SelectItem>
                      <SelectItem value="O">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />


            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Correo (opcional)</FormLabel>
                  <FormControl><Input type="email" placeholder="email@ejemplo.com" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />



            <FormField
              control={form.control}
              name="empresa_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Empresa de la que viene *</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={(v) => (v === NUEVA_EMPRESA ? setCreandoEmpresa(true) : field.onChange(v))}
                  >
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Sin empresa" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="ninguna">Particular (sin empresa)</SelectItem>
                      {empresas.map((e) => (
                        <SelectItem key={e.id} value={e.id}>{e.razon_social}</SelectItem>
                      ))}
                      <SelectItem value={NUEVA_EMPRESA} className="text-primary font-medium">
                        <span className="flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" />Nueva empresa…</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="ciudad"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ciudad *</FormLabel>
                  <FormControl><Input placeholder="Ciudad" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="departamento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Departamento *</FormLabel>
                  <FormControl><Input placeholder="Departamento" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />


            <div className="md:col-span-2 flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={isPending}>{isPending ? 'Guardando...' : isEditing ? 'Actualizar Paciente' : 'Guardar Paciente'}</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
    <EmpresaDialog
      empresa={creandoEmpresa ? EMPRESA_NUEVA : null}
      onOpenChange={(o) => !o && setCreandoEmpresa(false)}
      onGuardada={(e) => form.setValue('empresa_id', e.id, { shouldDirty: true, shouldValidate: true })}
    />
    </>
  );
}
