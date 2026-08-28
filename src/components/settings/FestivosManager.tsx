/**
 * Administración de días festivos (README 3.4).
 *
 * El cálculo de días hábiles (`src/lib/businessDays.ts`) excluye sábados,
 * domingos y las fechas de la tabla `festivos`. Hasta ahora no existía pantalla
 * para cargarlas, así que en la práctica solo se excluían los fines de semana.
 *
 * Esta pestaña permite crear, editar y borrar festivos, filtrarlos por año y
 * generar automáticamente el calendario festivo colombiano de un año.
 *
 * Al guardar se invalida la queryKey ['festivos'] (la que usa `useFestivos`)
 * para que el Kanban y los KPIs recalculen los tiempos al instante.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CalendarDays,
  Download,
  Info,
  Lock,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { usePermissions } from '@/hooks/usePermissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// ────────────────────────────────────────────────────────────────────────────
// Calendario festivo colombiano
// ────────────────────────────────────────────────────────────────────────────
//
// Colombia tiene 18 festivos al año, de tres clases:
//
//  1. FIJOS: caen siempre en la misma fecha (1 ene, 1 may, 20 jul, 7 ago,
//     8 dic, 25 dic).
//  2. TRASLADABLES (Ley 51 de 1983, «Ley Emiliani»): tienen fecha nominal fija
//     pero se celebran el LUNES SIGUIENTE (si ya caen en lunes, se quedan).
//  3. MÓVILES: se cuentan a partir del Domingo de Pascua. Jueves y Viernes
//     Santo NO se trasladan; Ascensión, Corpus Christi y Sagrado Corazón sí
//     (por eso se suman los desplazamientos ya corridos al lunes).
//
// Todo se calcula en UTC y se serializa como "YYYY-MM-DD" para que la zona
// horaria del navegador no corra las fechas un día (mismo criterio que
// `businessDays.ts`, que trabaja sobre la fecha civil colombiana).

const MS_DIA = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DD" a partir de las partes UTC de la fecha. */
function claveFecha(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

const fechaUtc = (anio: number, mes: number, dia: number) => new Date(Date.UTC(anio, mes - 1, dia));
const sumarDias = (d: Date, n: number) => new Date(d.getTime() + n * MS_DIA);

/** Traslado de la Ley Emiliani: el lunes siguiente (o el mismo día si es lunes). */
const lunesSiguiente = (d: Date) => sumarDias(d, (8 - d.getUTCDay()) % 7);

/**
 * Domingo de Pascua del año dado (algoritmo gregoriano anónimo,
 * Meeus/Jones/Butcher). Válido para todo el calendario gregoriano.
 *
 * Comprobación rápida: 2024 → 31 de marzo · 2025 → 20 de abril ·
 * 2026 → 5 de abril · 2027 → 28 de marzo.
 */
export function domingoDePascua(anio: number): Date {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const total = h + l - 7 * m + 114;
  const mes = Math.floor(total / 31); // 3 = marzo, 4 = abril
  const dia = (total % 31) + 1;
  return fechaUtc(anio, mes, dia);
}

export interface FestivoCalculado {
  fecha: string;
  descripcion: string;
}

/**
 * Los festivos de Colombia del año indicado, ordenados por fecha y sin fechas
 * repetidas.
 *
 * Son 18 celebraciones, pero de vez en cuando dos coinciden en el mismo día y
 * quedan 17 fechas: p. ej. en 2025 San Pedro y San Pablo (trasladado del
 * domingo 29 de junio) cae en el mismo lunes 30 que el Sagrado Corazón. En ese
 * caso se fusionan en un solo registro (la columna `fecha` es UNIQUE).
 */
export function festivosColombia(anio: number): FestivoCalculado[] {
  const pascua = domingoDePascua(anio);

  const lista: Array<{ fecha: Date; descripcion: string }> = [
    // 1. Fijos
    { fecha: fechaUtc(anio, 1, 1), descripcion: 'Año Nuevo' },
    { fecha: fechaUtc(anio, 5, 1), descripcion: 'Día del Trabajo' },
    { fecha: fechaUtc(anio, 7, 20), descripcion: 'Día de la Independencia' },
    { fecha: fechaUtc(anio, 8, 7), descripcion: 'Batalla de Boyacá' },
    { fecha: fechaUtc(anio, 12, 8), descripcion: 'Inmaculada Concepción' },
    { fecha: fechaUtc(anio, 12, 25), descripcion: 'Navidad' },

    // 2. Ley Emiliani: se trasladan al lunes siguiente
    { fecha: lunesSiguiente(fechaUtc(anio, 1, 6)), descripcion: 'Reyes Magos' },
    { fecha: lunesSiguiente(fechaUtc(anio, 3, 19)), descripcion: 'San José' },
    { fecha: lunesSiguiente(fechaUtc(anio, 6, 29)), descripcion: 'San Pedro y San Pablo' },
    { fecha: lunesSiguiente(fechaUtc(anio, 8, 15)), descripcion: 'Asunción de la Virgen' },
    { fecha: lunesSiguiente(fechaUtc(anio, 10, 12)), descripcion: 'Día de la Raza' },
    { fecha: lunesSiguiente(fechaUtc(anio, 11, 1)), descripcion: 'Todos los Santos' },
    { fecha: lunesSiguiente(fechaUtc(anio, 11, 11)), descripcion: 'Independencia de Cartagena' },

    // 3. Móviles (Pascua). Los tres últimos ya vienen corridos al lunes:
    //    Ascensión 39+4, Corpus Christi 60+4 y Sagrado Corazón 68+3.
    { fecha: sumarDias(pascua, -3), descripcion: 'Jueves Santo' },
    { fecha: sumarDias(pascua, -2), descripcion: 'Viernes Santo' },
    { fecha: sumarDias(pascua, 43), descripcion: 'Ascensión del Señor' },
    { fecha: sumarDias(pascua, 64), descripcion: 'Corpus Christi' },
    { fecha: sumarDias(pascua, 71), descripcion: 'Sagrado Corazón de Jesús' },
  ];

  const porFecha = new Map<string, string>();
  for (const f of lista) {
    const clave = claveFecha(f.fecha);
    if (!clave.startsWith(`${anio}-`)) continue; // defensivo: nunca debería ocurrir
    const previa = porFecha.get(clave);
    porFecha.set(clave, previa ? `${previa} / ${f.descripcion}` : f.descripcion);
  }

  return [...porFecha.entries()]
    .map(([fecha, descripcion]) => ({ fecha, descripcion }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// ────────────────────────────────────────────────────────────────────────────
// Presentación
// ────────────────────────────────────────────────────────────────────────────

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const RE_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `Date` en UTC de una clave "YYYY-MM-DD" (null si no es válida). */
function parseClave(clave: string): Date | null {
  const m = RE_FECHA.exec(clave ?? '');
  if (!m) return null;
  const d = fechaUtc(Number(m[1]), Number(m[2]), Number(m[3]));
  return claveFecha(d) === clave ? d : null;
}

const anioDeClave = (clave: string) => Number(clave.slice(0, 4));

function nombreDiaSemana(clave: string): string {
  const d = parseClave(clave);
  return d ? DIAS_SEMANA[d.getUTCDay()] : '—';
}

function esFinDeSemana(clave: string): boolean {
  const d = parseClave(clave);
  if (!d) return false;
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}

function fechaLarga(clave: string): string {
  const d = parseClave(clave);
  if (!d) return clave;
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

interface FestivoRow {
  id: string;
  fecha: string;
  descripcion: string | null;
  anio: number | null;
}

const TODOS = 'todos';

export function FestivosManager() {
  const queryClient = useQueryClient();
  const { isAdmin, isLoading: permisosCargando } = usePermissions();

  const anioActual = new Date().getUTCFullYear();
  const [anioFiltro, setAnioFiltro] = useState<string>(String(anioActual));
  const [anioCarga, setAnioCarga] = useState<string>(String(anioActual));
  const [editando, setEditando] = useState<FestivoRow | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [porBorrar, setPorBorrar] = useState<FestivoRow | null>(null);
  const [form, setForm] = useState<{ fecha: string; descripcion: string }>({ fecha: '', descripcion: '' });

  const { data: festivos = [], isLoading } = useQuery({
    queryKey: ['festivos-config'],
    queryFn: async (): Promise<FestivoRow[]> => {
      const { data, error } = await supabase
        .from('festivos')
        .select('id, fecha, descripcion, anio')
        .order('fecha', { ascending: true });
      if (error) throw error;
      return (data ?? []) as FestivoRow[];
    },
  });

  /**
   * Refresca la tabla Y la caché que consume el cálculo de días hábiles
   * (`useFestivos` ⇒ queryKey ['festivos']), que está cacheada 24 h.
   */
  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: ['festivos-config'] });
    queryClient.invalidateQueries({ queryKey: ['festivos'] });
    // Los días hábiles de cada tarjeta del Kanban se recalculan al cambiar
    // los festivos (forman parte de su queryKey).
    queryClient.invalidateQueries({ queryKey: ['orden-productos'] });
  };

  const aniosDisponibles = useMemo(() => {
    const set = new Set<number>();
    for (let a = anioActual - 2; a <= anioActual + 3; a++) set.add(a);
    for (const f of festivos) {
      const a = anioDeClave(f.fecha);
      if (Number.isFinite(a)) set.add(a);
    }
    return [...set].sort((a, b) => b - a);
  }, [festivos, anioActual]);

  const visibles = useMemo(() => {
    if (anioFiltro === TODOS) return festivos;
    return festivos.filter((f) => f.fecha.startsWith(`${anioFiltro}-`));
  }, [festivos, anioFiltro]);

  const fechasExistentes = useMemo(() => new Set(festivos.map((f) => f.fecha)), [festivos]);

  const anioCargaValido =
    Number.isInteger(Number(anioCarga)) && Number(anioCarga) >= 2000 && Number(anioCarga) <= 2100;

  const resumenCarga = useMemo(() => {
    if (!anioCargaValido) return null;
    const calculados = festivosColombia(Number(anioCarga));
    const faltantes = calculados.filter((f) => !fechasExistentes.has(f.fecha));
    return { total: calculados.length, faltantes: faltantes.length };
  }, [anioCarga, anioCargaValido, fechasExistentes]);

  // ── Mutaciones ────────────────────────────────────────────────────────────

  const guardar = useMutation({
    mutationFn: async ({ id, fecha, descripcion }: { id?: string; fecha: string; descripcion: string }) => {
      const payload = {
        fecha,
        descripcion: descripcion.trim() || null,
        anio: anioDeClave(fecha),
      };
      if (id) {
        const { error } = await supabase.from('festivos').update(payload).eq('id', id);
        if (error) throw error;
        return 'actualizado' as const;
      }
      const { error } = await supabase.from('festivos').insert(payload);
      if (error) throw error;
      return 'creado' as const;
    },
    onSuccess: (accion) => {
      refrescar();
      cerrarForm();
      toast.success(accion === 'creado' ? 'Festivo creado' : 'Festivo actualizado');
    },
    onError: (e: any) =>
      toast.error(
        e?.code === '23505'
          ? 'Ya existe un festivo con esa fecha'
          : e?.message || 'No se pudo guardar el festivo',
      ),
  });

  const borrar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('festivos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      refrescar();
      setPorBorrar(null);
      toast.success('Festivo eliminado');
    },
    onError: (e: any) => toast.error(e?.message || 'No se pudo eliminar el festivo'),
  });

  const cargarColombia = useMutation({
    mutationFn: async (anio: number) => {
      const calculados = festivosColombia(anio);
      // `fecha` es UNIQUE: se ignoran los duplicados para no pisar las
      // descripciones que el usuario haya ajustado a mano.
      const { data, error } = await supabase
        .from('festivos')
        .upsert(
          calculados.map((f) => ({ fecha: f.fecha, descripcion: f.descripcion, anio })),
          { onConflict: 'fecha', ignoreDuplicates: true },
        )
        .select('id');
      if (error) throw error;
      return { insertados: data?.length ?? 0, total: calculados.length };
    },
    onSuccess: ({ insertados, total }, anio) => {
      refrescar();
      setAnioFiltro(String(anio));
      toast.success(
        insertados === 0
          ? `Los ${total} festivos de ${anio} ya estaban cargados`
          : `Se cargaron ${insertados} festivos de ${anio} (${total} en total ese año)`,
      );
    },
    onError: (e: any) => toast.error(e?.message || 'No se pudieron cargar los festivos'),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const abrirNuevo = () => {
    const anioBase = anioFiltro === TODOS ? anioActual : anioFiltro;
    setForm({ fecha: `${anioBase}-01-01`, descripcion: '' });
    setEditando(null);
    setNuevo(true);
  };

  const abrirEdicion = (f: FestivoRow) => {
    setForm({ fecha: f.fecha, descripcion: f.descripcion ?? '' });
    setEditando(f);
    setNuevo(false);
  };

  const cerrarForm = () => {
    setNuevo(false);
    setEditando(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parseClave(form.fecha)) {
      toast.error('La fecha no es válida');
      return;
    }
    const duplicado = festivos.some((f) => f.fecha === form.fecha && f.id !== editando?.id);
    if (duplicado) {
      toast.error('Ya existe un festivo con esa fecha');
      return;
    }
    guardar.mutate({ id: editando?.id, fecha: form.fecha, descripcion: form.descripcion });
  };

  const formAbierto = nuevo || !!editando;
  const puedeEditar = isAdmin;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground space-y-2">
          <p className="flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Los tiempos de laboratorio se miden en <strong>días hábiles</strong>: lunes a viernes,
              excluyendo los festivos de esta lista. Los sábados y domingos ya se excluyen siempre,
              no hace falta registrarlos.
            </span>
          </p>
          {!permisosCargando && !puedeEditar && (
            <p className="flex items-center gap-2 text-warning">
              <Lock className="h-4 w-4 shrink-0" />
              Solo un administrador puede modificar el calendario de festivos.
            </p>
          )}
        </CardContent>
      </Card>

      {puedeEditar && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cargar festivos de Colombia</CardTitle>
            <p className="text-xs text-muted-foreground">
              Genera el calendario festivo del año: los fijos, los que la Ley Emiliani traslada al
              lunes siguiente y los móviles derivados de la Pascua. Las fechas ya registradas no se
              modifican.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Año</Label>
                <Input
                  type="number"
                  min={2000}
                  max={2100}
                  className="w-28"
                  value={anioCarga}
                  onChange={(e) => setAnioCarga(e.target.value)}
                />
              </div>
              <Button
                onClick={() => cargarColombia.mutate(Number(anioCarga))}
                disabled={cargarColombia.isPending || !anioCargaValido}
              >
                <Download className="h-4 w-4 mr-1" />
                {cargarColombia.isPending ? 'Cargando…' : `Cargar ${anioCarga}`}
              </Button>
              <span className="text-xs text-muted-foreground pb-2">
                {!resumenCarga
                  ? 'Indique un año entre 2000 y 2100.'
                  : resumenCarga.faltantes > 0
                    ? `Faltan ${resumenCarga.faltantes} de ${resumenCarga.total} festivos de ${anioCarga}.`
                    : `Los ${resumenCarga.total} festivos de ${anioCarga} ya están cargados.`}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Año</Label>
          <Select value={anioFiltro} onValueChange={setAnioFiltro}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todos los años</SelectItem>
              {aniosDisponibles.map((a) => (
                <SelectItem key={a} value={String(a)}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="secondary">{visibles.length} festivo{visibles.length === 1 ? '' : 's'}</Badge>
        </div>
        {puedeEditar && (
          <Button onClick={abrirNuevo}>
            <Plus className="h-4 w-4 mr-1" />Nuevo Festivo
          </Button>
        )}
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-36">Fecha</TableHead>
              <TableHead className="w-32">Día</TableHead>
              <TableHead>Descripción</TableHead>
              {puedeEditar && <TableHead className="w-28 text-right">Acciones</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={puedeEditar ? 4 : 3} className="text-center py-8 text-muted-foreground">
                  Cargando festivos…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && visibles.length === 0 && (
              <TableRow>
                <TableCell colSpan={puedeEditar ? 4 : 3} className="text-center py-8 text-muted-foreground">
                  No hay festivos registrados
                  {anioFiltro === TODOS ? '' : ` para ${anioFiltro}`}.
                  {puedeEditar && ' Usa «Cargar festivos de Colombia» para generarlos.'}
                </TableCell>
              </TableRow>
            )}
            {!isLoading && visibles.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    {f.fecha}
                  </span>
                </TableCell>
                <TableCell className="text-sm">
                  <span className="flex items-center gap-2">
                    {nombreDiaSemana(f.fecha)}
                    {esFinDeSemana(f.fecha) && (
                      <Badge variant="outline" className="text-[10px] h-5" title="Ya no era hábil: no cambia el conteo">
                        fin de semana
                      </Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-sm">{f.descripcion || '—'}</TableCell>
                {puedeEditar && (
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => abrirEdicion(f)} title="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setPorBorrar(f)} title="Eliminar">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Alta / edición */}
      <Dialog open={formAbierto} onOpenChange={(o) => { if (!o) cerrarForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editando ? 'Editar Festivo' : 'Nuevo Festivo'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Fecha *</Label>
              <Input
                type="date"
                required
                value={form.fecha}
                onChange={(e) => setForm((p) => ({ ...p, fecha: e.target.value }))}
              />
              {parseClave(form.fecha) && (
                <p className="text-xs text-muted-foreground">
                  {nombreDiaSemana(form.fecha)}, {fechaLarga(form.fecha)}
                  {esFinDeSemana(form.fecha) && ' — ya es día no hábil por ser fin de semana'}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input
                value={form.descripcion}
                placeholder="Ej. Batalla de Boyacá"
                onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={cerrarForm}>Cancelar</Button>
              <Button type="submit" disabled={guardar.isPending}>
                {guardar.isPending ? 'Guardando…' : editando ? 'Guardar Cambios' : 'Crear Festivo'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmación de borrado */}
      <Dialog open={!!porBorrar} onOpenChange={(o) => { if (!o) setPorBorrar(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar Festivo</DialogTitle>
          </DialogHeader>
          {porBorrar && (
            <div className="space-y-4">
              <p className="text-sm">
                Se eliminará <strong>{porBorrar.descripcion || 'el festivo'}</strong> del{' '}
                {fechaLarga(porBorrar.fecha)}. Ese día volverá a contar como hábil.
              </p>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" onClick={() => setPorBorrar(null)}>Cancelar</Button>
                <Button
                  variant="destructive"
                  onClick={() => borrar.mutate(porBorrar.id)}
                  disabled={borrar.isPending}
                >
                  {borrar.isPending ? 'Eliminando…' : 'Eliminar'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
