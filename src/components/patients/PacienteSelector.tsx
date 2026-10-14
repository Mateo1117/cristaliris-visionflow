/**
 * Selector de paciente con búsqueda en el servidor.
 *
 * Órdenes, cotizaciones e historias clínicas cargaban TODOS los pacientes en
 * un <Select>: lento con cientos de opciones y, pasadas las 1000 filas (límite
 * por defecto de la API), los últimos pacientes simplemente no aparecían.
 * Aquí se busca por documento, nombre o teléfono y se traen 8 resultados.
 */
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, X, UserPlus } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PatientForm } from './PatientForm';
import { crearPaciente } from './guardarPaciente';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { filtroBusquedaPacientes } from './patientUtils';
import { COLUMNAS_LISTA, usePacienteSeleccionado } from './usePacienteSeleccionado';


interface Props {
  /** id del paciente elegido ('' o null si no hay). */
  value: string | null | undefined;
  onChange: (id: string) => void;
  /** Columnas que necesita la pantalla del paciente elegido (ver usePacienteSeleccionado). */
  columnas?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Ofrece registrar al paciente ahí mismo (paciente que llega sin estar registrado). */
  permitirCrear?: boolean;
}

export function PacienteSelector({ value, onChange, columnas, disabled, autoFocus, permitirCrear }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [termino, setTermino] = useState('');
  const [abierto, setAbierto] = useState(false);
  const [registrando, setRegistrando] = useState(false);
  const queryClient = useQueryClient();
  const crear = useMutation({
    mutationFn: crearPaciente,
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['pacientes'] });
      setRegistrando(false);
      setBusqueda('');
      onChange(id);
      toast.success('Paciente registrado');
    },
    onError: (e: any) => toast.error(e.message),
  });
  // El formulario va en un portal, pero en React su "submit" burbujea hasta el
  // formulario que contiene al selector (p. ej. Nueva cita): se corta aquí.
  const formularioNuevo = permitirCrear && (
    <div onSubmit={(e) => e.stopPropagation()}>
      <PatientForm
        open={registrando}
        onOpenChange={setRegistrando}
        onSubmit={(datos) => crear.mutate(datos)}
        isPending={crear.isPending}
        initialData={null}
      />
    </div>
  );
  const contenedor = useRef<HTMLDivElement>(null);
  const { data: elegido } = usePacienteSeleccionado(value, columnas ?? COLUMNAS_LISTA);

  useEffect(() => {
    const t = setTimeout(() => setTermino(busqueda.trim()), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  // Cierra la lista al hacer clic fuera.
  useEffect(() => {
    const cerrar = (e: MouseEvent) => {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, []);

  const { data: resultados = [], isFetching } = useQuery({
    queryKey: ['pacientes-busqueda', termino],
    queryFn: async () => {
      const filtro = filtroBusquedaPacientes(termino);
      if (!filtro) return [];
      const { data, error } = await supabase.from('pacientes')
        .select(COLUMNAS_LISTA).or(filtro).order('nombres').limit(8);
      if (error) throw error;
      return data as any[];
    },
    enabled: termino.length >= 2 && !value,
  });

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-md border px-3 py-2 bg-muted/40 min-h-10">
        <div className="text-sm min-w-0">
          {elegido ? (
            <>
              <span className="font-medium">{elegido.nombres} {elegido.apellidos}</span>
              <span className="text-muted-foreground ml-2">{elegido.tipo_documento} {elegido.numero_documento}</span>
              {elegido.empresas?.razon_social && <span className="text-muted-foreground ml-2">· {elegido.empresas.razon_social}</span>}
            </>
          ) : <span className="text-muted-foreground">Cargando…</span>}
        </div>
        {!disabled && (
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => onChange('')} aria-label="Cambiar paciente">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={contenedor}>
      {formularioNuevo}
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder="Buscar por documento, nombre o teléfono…"
        value={busqueda}
        onChange={(e) => { setBusqueda(e.target.value); setAbierto(true); }}
        onFocus={() => setAbierto(true)}
        className="pl-9"
      />
      {abierto && termino.length >= 2 && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-64 overflow-y-auto">
          {resultados.length === 0 ? (
            <p className="text-sm text-muted-foreground px-3 py-2">{isFetching ? 'Buscando…' : 'Sin resultados. Registre al paciente en el módulo Pacientes.'}</p>
          ) : resultados.map((p) => (
            <button
              type="button" key={p.id}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
              onClick={() => { onChange(p.id); setBusqueda(''); setAbierto(false); }}
            >
              <span className="font-medium">{p.nombres} {p.apellidos}</span>
              <span className="text-muted-foreground ml-2">{p.numero_documento}</span>
              {p.empresas && <span className="text-muted-foreground ml-2">· {p.empresas.razon_social} ({p.empresas.porcentaje_descuento}%)</span>}
            </button>
          ))}
          {permitirCrear && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-primary border-t hover:bg-accent flex items-center gap-1.5"
              onClick={() => { setAbierto(false); setRegistrando(true); }}
            >
              <UserPlus className="h-4 w-4" />Registrar paciente nuevo
            </button>
          )}
        </div>
      )}
      {permitirCrear && !abierto && (
        <button type="button" className="text-xs text-primary mt-1 hover:underline" onClick={() => setRegistrando(true)}>
          + Registrar paciente nuevo
        </button>
      )}
    </div>
  );
}
