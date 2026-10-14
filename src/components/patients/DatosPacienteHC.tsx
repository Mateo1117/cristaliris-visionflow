/**
 * Datos complementarios del paciente que se piden en la historia clínica.
 *
 * El registro del paciente solo pide lo básico (documento, nombre, teléfono,
 * género, ciudad, empresa); fecha de nacimiento, dirección, ocupación y
 * referido se completan en la consulta y se guardan también en `pacientes`.
 */
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { calcularEdad } from './patientUtils';
import { PREFIJO_PACIENTE as P, type PacienteComplementario } from './pacienteComplementario';

export function DatosPacienteHC({ paciente }: { paciente: PacienteComplementario | null | undefined }) {
  if (!paciente) return null;
  const edad = calcularEdad(paciente.fecha_nacimiento);
  // `key` por paciente: los inputs no controlados toman de nuevo sus valores al cambiar de paciente.
  return (
    <div key={paciente.id} className="rounded-lg border p-3 space-y-3">
      <div>
        <p className="text-sm font-medium">Datos del paciente</p>
        <p className="text-xs text-muted-foreground">Se guardan en la ficha del paciente.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Fecha de nacimiento{edad != null && <span className="text-muted-foreground"> · {edad} años</span>}</Label>
          <Input type="date" name={`${P}fecha_nacimiento`} defaultValue={paciente.fecha_nacimiento ?? ''} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ocupación</Label>
          <Input name={`${P}ocupacion`} defaultValue={paciente.ocupacion ?? ''} placeholder="Ej: Contador, estudiante…" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Dirección</Label>
          <Input name={`${P}direccion`} defaultValue={paciente.direccion ?? ''} placeholder="Dirección de residencia" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Referido por</Label>
          <Input name={`${P}referido_por`} defaultValue={paciente.referido_por ?? ''} placeholder="Opcional" />
        </div>
      </div>
    </div>
  );
}
