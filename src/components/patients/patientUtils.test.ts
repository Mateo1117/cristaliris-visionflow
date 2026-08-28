import { describe, it, expect } from 'vitest';
import {
  calcularEdad,
  esBogota,
  esFueraDeBogota,
  filtroBusquedaPacientes,
  formatearFechaColombia,
  normalizarCiudad,
} from './patientUtils';
import { pacienteSchema, valoresIniciales, type PacienteFormValues } from './patientSchema';

describe('calcularEdad', () => {
  it('cuenta años cumplidos', () => {
    expect(calcularEdad('1990-05-30', '2026-08-27')).toBe(36);
    expect(calcularEdad('1990-12-01', '2026-08-27')).toBe(35);
  });

  it('cumple años el mismo día', () => {
    expect(calcularEdad('2000-08-27', '2026-08-27')).toBe(26);
    expect(calcularEdad('2000-08-28', '2026-08-27')).toBe(25);
  });

  it('usa la fecha civil colombiana, no el día UTC', () => {
    // 2026-08-28T02:00:00Z = 27 de agosto, 9 p.m. en Bogotá: aún no cumple.
    expect(calcularEdad('2000-08-28', '2026-08-28T02:00:00Z')).toBe(25);
  });

  it('devuelve null sin fecha, con fecha inválida o futura', () => {
    expect(calcularEdad(null)).toBeNull();
    expect(calcularEdad('')).toBeNull();
    expect(calcularEdad('no-es-fecha')).toBeNull();
    expect(calcularEdad('2030-01-01', '2026-08-27')).toBeNull();
  });
});

describe('formatearFechaColombia', () => {
  it('no corre el día por la zona horaria', () => {
    expect(formatearFechaColombia('1990-05-30')).toBe('30/5/1990');
    expect(formatearFechaColombia('2026-08-28T02:00:00Z')).toBe('27/8/2026');
    expect(formatearFechaColombia(null)).toBe('—');
  });
});

describe('ciudad y es_fuera_bogota', () => {
  it('usa Bogotá cuando el campo viene vacío y NO la marca como fuera', () => {
    const ciudad = normalizarCiudad('   ');
    expect(ciudad).toBe('Bogotá');
    expect(esFueraDeBogota(ciudad)).toBe(false);
  });

  it('ignora mayúsculas, tildes y variantes D.C.', () => {
    expect(esBogota('bogota')).toBe(true);
    expect(esBogota('BOGOTÁ')).toBe(true);
    expect(esBogota('Bogotá D.C.')).toBe(true);
    expect(esBogota('bogota dc')).toBe(true);
  });

  it('marca como fuera de Bogotá otras ciudades', () => {
    expect(esFueraDeBogota('Medellín')).toBe(true);
    expect(esFueraDeBogota('Cali')).toBe(true);
  });
});

describe('filtroBusquedaPacientes', () => {
  it('devuelve null sin término', () => {
    expect(filtroBusquedaPacientes('')).toBeNull();
    expect(filtroBusquedaPacientes('   ')).toBeNull();
  });

  it('genera un filtro or() por las columnas buscables', () => {
    expect(filtroBusquedaPacientes('maria')).toBe(
      'numero_documento.ilike.%maria%,nombres.ilike.%maria%,apellidos.ilike.%maria%,telefono.ilike.%maria%,referido_por.ilike.%maria%',
    );
  });

  it('neutraliza los caracteres que romperían la consulta', () => {
    const filtro = filtroBusquedaPacientes('a,b(%)') as string;
    expect(filtro).toContain('nombres.ilike.%a b%');
  });
});

describe('pacienteSchema', () => {
  const base = (extra: Partial<PacienteFormValues> = {}): PacienteFormValues => ({
    ...valoresIniciales(null),
    numero_documento: '1023456789',
    nombres: 'María',
    apellidos: 'García',
    ...extra,
  });

  const errores = (valores: PacienteFormValues) => {
    const r = pacienteSchema.safeParse(valores);
    return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]));
  };

  it('acepta un paciente mínimo válido', () => {
    expect(pacienteSchema.safeParse(base()).success).toBe(true);
  });

  it('exige documento numérico, nombres y apellidos', () => {
    const e = errores(base({ numero_documento: 'ABC123', nombres: '', apellidos: '' }));
    expect(e.numero_documento).toBeTruthy();
    expect(e.nombres).toBeTruthy();
    expect(e.apellidos).toBeTruthy();
  });

  it('permite pasaporte alfanumérico', () => {
    expect(pacienteSchema.safeParse(base({ tipo_documento: 'PA', numero_documento: 'AV12345' })).success).toBe(true);
  });

  it('valida email y teléfono sólo si vienen llenos', () => {
    expect(pacienteSchema.safeParse(base({ email: '', telefono: '' })).success).toBe(true);
    expect(errores(base({ email: 'correo-malo' })).email).toBeTruthy();
    expect(errores(base({ telefono: '123' })).telefono).toBeTruthy();
    expect(pacienteSchema.safeParse(base({ telefono: '310 123 4567' })).success).toBe(true);
    expect(pacienteSchema.safeParse(base({ telefono: '+57 3101234567' })).success).toBe(true);
    expect(pacienteSchema.safeParse(base({ telefono: '6012345' })).success).toBe(true);
  });

  it('rechaza fechas de nacimiento futuras', () => {
    const manana = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    expect(errores(base({ fecha_nacimiento: manana })).fecha_nacimiento).toBeTruthy();
    expect(pacienteSchema.safeParse(base({ fecha_nacimiento: '1990-05-30' })).success).toBe(true);
  });

  it('exige el titular cuando hay empresa de convenio', () => {
    const e = errores(base({ empresa_id: 'emp-1' }));
    expect(e.empleado_titular_nombre).toBeTruthy();
    expect(e.empleado_titular_cedula).toBeTruthy();
  });
});
