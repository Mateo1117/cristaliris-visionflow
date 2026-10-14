import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Building2, CalendarClock, ChevronDown, Download, Glasses, MessageCircle, NotebookPen, Phone, Search, Users, Wallet,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/usePermissions';
import { exportToCSV } from '@/lib/export-csv';
import { formatoCOP } from '@/lib/catalogo';
import {
  agruparClientes, filtrarClientes, mensajeWhatsApp, telefonoWhatsApp,
  MOTIVO_CONTACTO, PENDIENTE_LABEL, RESULTADO_CONTACTO, TIPO_CONTACTO,
  type ClienteCrm, type FiltroCrm, type MotivoContacto, type Pendiente, type ProductoEntregado,
  type ResultadoContacto, type Seguimiento, type TipoContacto,
} from '@/lib/crm';

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fecha = (iso?: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const COLOR_PENDIENTE: Record<Pendiente, string> = {
  satisfaccion: 'bg-primary/10 text-primary border-primary/30',
  contacto_programado: 'bg-primary/10 text-primary border-primary/30',
  control_anual: 'bg-warning/10 text-warning border-warning/40',
  control_vencido: 'bg-destructive/10 text-destructive border-destructive/30',
  saldo: 'bg-muted text-muted-foreground',
};

/**
 * CRM: registro de pacientes que compraron y ya recibieron sus gafas, con su
 * historial de compras y el seguimiento posterior (satisfacción, control
 * anual, cobro), para contactarlos por llamada o WhatsApp y dejar constancia.
 */
export default function Crm() {
  const { canWrite } = usePermissions();
  const puedeRegistrar = canWrite('crm');
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<FiltroCrm>('todos');
  const [registrando, setRegistrando] = useState<{ cliente: ClienteCrm; motivo: MotivoContacto; tipo: TipoContacto } | null>(null);
  const hoy = hoyISO();

  const { data: entregados = [], isLoading } = useQuery({
    queryKey: ['crm-entregados'],
    queryFn: async () => {
      const { data, error } = await supabase.from('orden_productos')
        .select(`id, orden_id, descripcion, tipo_producto, numero_montura, precio_venta, fecha_entrega_real, updated_at,
          laboratorios(nombre),
          ordenes!inner(id, numero_orden, created_at, total_final, saldo_pendiente, paciente_id,
            pacientes(id, nombres, apellidos, tipo_documento, numero_documento, telefono, email, ciudad, fecha_nacimiento, empresas(razon_social)))`)
        .eq('estado_actual', 'entregado')
        .order('fecha_entrega_real', { ascending: false });
      if (error) throw error;
      return (data ?? []).filter((f: any) => f.ordenes?.pacientes).map((f: any): ProductoEntregado => ({
        id: f.id, orden_id: f.orden_id, descripcion: f.descripcion, tipo_producto: f.tipo_producto,
        numero_montura: f.numero_montura, precio_venta: f.precio_venta, fecha_entrega_real: f.fecha_entrega_real,
        updated_at: f.updated_at, laboratorio_nombre: f.laboratorios?.nombre ?? null,
        orden: {
          id: f.ordenes.id, numero_orden: f.ordenes.numero_orden != null ? String(f.ordenes.numero_orden) : null,
          created_at: f.ordenes.created_at, total_final: f.ordenes.total_final, saldo_pendiente: f.ordenes.saldo_pendiente,
          paciente_id: f.ordenes.paciente_id,
        },
        paciente: { ...f.ordenes.pacientes, empresa: f.ordenes.pacientes.empresas?.razon_social ?? null },
      }));
    },
  });

  const { data: seguimientos = [] } = useQuery({
    queryKey: ['crm-seguimientos'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('crm_seguimientos').select('*').order('created_at', { ascending: false });
      if (error) return [] as Seguimiento[]; // tabla aún no creada: el CRM funciona sin historial
      return data as Seguimiento[];
    },
  });

  const { data: perfiles = [] } = useQuery({
    queryKey: ['crm-perfiles'],
    queryFn: async () => (await supabase.from('profiles').select('user_id, nombre')).data ?? [],
  });
  const nombreUsuario = (id: string | null) => perfiles.find((p: any) => p.user_id === id)?.nombre?.trim() ?? '';

  const clientes = useMemo(() => agruparClientes(entregados, seguimientos, hoy), [entregados, seguimientos, hoy]);
  const visibles = useMemo(() => filtrarClientes(clientes, filtro, busqueda), [clientes, filtro, busqueda]);

  const cuenta = (f: FiltroCrm) => filtrarClientes(clientes, f, '').length;
  const totalVendido = clientes.reduce((s, c) => s + c.totalComprado, 0);

  const exportar = () => exportToCSV(visibles.map((c) => ({
    documento: `${c.paciente.tipo_documento ?? ''} ${c.paciente.numero_documento ?? ''}`.trim(),
    nombre: `${c.paciente.nombres} ${c.paciente.apellidos}`,
    telefono: c.paciente.telefono, email: c.paciente.email, ciudad: c.paciente.ciudad, empresa: c.paciente.empresa,
    compras: c.compras.length, total: c.totalComprado, saldo: c.saldo,
    ultima_entrega: c.ultimaEntrega.slice(0, 10), proximo_control: c.proximoControl,
    productos: c.compras.flatMap((o) => o.productos.map((p) => p.descripcion + (p.montura ? ` (${p.montura})` : ''))).join(' | '),
    pendiente: c.pendientes.map((p) => PENDIENTE_LABEL[p]).join(' | '),
    ultimo_contacto: c.ultimoContacto ? `${c.ultimoContacto.created_at.slice(0, 10)} ${RESULTADO_CONTACTO[c.ultimoContacto.resultado]}` : '',
  })), 'crm_clientes', [
    { key: 'documento', label: 'Documento' }, { key: 'nombre', label: 'Nombre' }, { key: 'telefono', label: 'Teléfono' },
    { key: 'email', label: 'Correo' }, { key: 'ciudad', label: 'Ciudad' }, { key: 'empresa', label: 'Empresa' },
    { key: 'compras', label: 'Compras' }, { key: 'total', label: 'Total comprado' }, { key: 'saldo', label: 'Saldo' },
    { key: 'ultima_entrega', label: 'Última entrega' }, { key: 'proximo_control', label: 'Próximo control' },
    { key: 'productos', label: 'Productos' }, { key: 'pendiente', label: 'Pendiente' }, { key: 'ultimo_contacto', label: 'Último contacto' },
  ]);

  const abrirWhatsApp = (c: ClienteCrm, motivo: MotivoContacto) => {
    const tel = telefonoWhatsApp(c.paciente.telefono);
    if (!tel) return toast.error('El paciente no tiene teléfono');
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(mensajeWhatsApp(c, motivo))}`, '_blank');
    if (puedeRegistrar) setRegistrando({ cliente: c, motivo, tipo: 'whatsapp' });
  };

  const motivoSugerido = (c: ClienteCrm): MotivoContacto =>
    c.pendientes.includes('control_anual') || c.pendientes.includes('control_vencido') ? 'control_anual'
      : c.pendientes.includes('satisfaccion') ? 'satisfaccion'
      : c.saldo > 0 ? 'cobro' : 'satisfaccion';

  return (
    <AppLayout>
      <PageHeader title="CRM" description="Pacientes que compraron y recibieron sus gafas: historial y seguimiento">
        <Button variant="outline" onClick={exportar} disabled={!visibles.length}><Download className="h-4 w-4 mr-1.5" />Exportar</Button>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[
          { icono: Users, titulo: 'Clientes con entrega', valor: String(clientes.length) },
          { icono: Glasses, titulo: 'Vendido (entregado)', valor: formatoCOP(totalVendido) },
          { icono: Phone, titulo: 'Por contactar', valor: String(cuenta('por_contactar')) },
          { icono: CalendarClock, titulo: 'Control anual', valor: String(cuenta('control')) },
        ].map((k) => (
          <Card key={k.titulo}><CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5"><k.icono className="h-3.5 w-3.5" />{k.titulo}</p>
            <p className="text-xl font-semibold mt-1">{k.valor}</p>
          </CardContent></Card>
        ))}
      </div>

      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nombre, documento, teléfono, orden o montura…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <ToggleGroup type="single" value={filtro} onValueChange={(v) => v && setFiltro(v as FiltroCrm)} className="flex-wrap justify-start">
          {([
            ['todos', 'Todos'], ['por_contactar', 'Por contactar'], ['control', 'Control anual'], ['saldo', 'Con saldo'], ['al_dia', 'Al día'],
          ] as [FiltroCrm, string][]).map(([v, t]) => (
            <ToggleGroupItem key={v} value={v} variant="outline" size="sm" className="gap-1.5">
              {t}<span className="text-[10px] text-muted-foreground">{cuenta(v)}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p>
        : visibles.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
            {clientes.length === 0
              ? 'Aún no hay entregas. Los pacientes aparecen aquí cuando su trabajo pasa a "Entregado" en el tablero de órdenes.'
              : 'Ningún paciente coincide con la búsqueda o el filtro.'}
          </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {visibles.map((c) => {
              const tel = telefonoWhatsApp(c.paciente.telefono);
              return (
                <Collapsible key={c.paciente.id} className="rounded-lg border bg-card">
                  <div className="flex flex-col lg:flex-row lg:items-center gap-3 p-3">
                    <CollapsibleTrigger className="flex-1 min-w-0 text-left group flex items-start gap-2">
                      <ChevronDown className="h-4 w-4 mt-1 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                      <div className="min-w-0">
                        <p className="font-medium">{c.paciente.nombres} {c.paciente.apellidos}</p>
                        <p className="text-xs text-muted-foreground flex flex-wrap gap-x-3">
                          <span>{c.paciente.tipo_documento} {c.paciente.numero_documento}</span>
                          {c.paciente.telefono && <span>{c.paciente.telefono}</span>}
                          {c.paciente.empresa && <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{c.paciente.empresa}</span>}
                        </p>
                        <p className="text-xs mt-1">
                          {c.compras.length} {c.compras.length === 1 ? 'compra' : 'compras'} · {formatoCOP(c.totalComprado)}
                          {' · '}entregado {fecha(c.ultimaEntrega)} <span className="text-muted-foreground">(hace {c.diasDesdeEntrega} d)</span>
                          {' · '}control {fecha(c.proximoControl)}
                        </p>
                      </div>
                    </CollapsibleTrigger>
                    <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
                      {c.pendientes.length === 0
                        ? <Badge variant="outline" className="bg-success/10 text-success border-success/30">Al día</Badge>
                        : c.pendientes.map((p) => (
                          <Badge key={p} variant="outline" className={COLOR_PENDIENTE[p]}>
                            {p === 'saldo' ? <><Wallet className="h-3 w-3 mr-1" />{formatoCOP(c.saldo)}</> : PENDIENTE_LABEL[p]}
                          </Badge>
                        ))}
                      {tel && <Button asChild variant="outline" size="sm"><a href={`tel:${c.paciente.telefono}`} title="Llamar"><Phone className="h-4 w-4" /></a></Button>}
                      {tel && <Button variant="outline" size="sm" onClick={() => abrirWhatsApp(c, motivoSugerido(c))} title="WhatsApp con mensaje sugerido"><MessageCircle className="h-4 w-4" /></Button>}
                      {puedeRegistrar && (
                        <Button size="sm" onClick={() => setRegistrando({ cliente: c, motivo: motivoSugerido(c), tipo: 'llamada' })}>
                          <NotebookPen className="h-4 w-4 mr-1" />Registrar contacto
                        </Button>
                      )}
                    </div>
                  </div>
                  <CollapsibleContent className="border-t px-3 pb-3 pt-2 grid md:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Compras entregadas</p>
                      {c.compras.map((o) => (
                        <div key={o.orden_id} className="rounded-md border p-2">
                          <p className="font-medium flex justify-between gap-2">
                            <span>ORD-{String(o.numero_orden ?? '').padStart(5, '0')}</span>
                            <span>{formatoCOP(o.total)}</span>
                          </p>
                          <p className="text-xs text-muted-foreground">Comprado {fecha(o.fecha_compra)} · entregado {fecha(o.fecha_entrega)}{o.saldo > 0 ? ` · saldo ${formatoCOP(o.saldo)}` : ''}</p>
                          <ul className="mt-1 text-xs space-y-0.5">
                            {o.productos.map((p) => (
                              <li key={p.id}>• {p.descripcion}{p.montura ? ` · ${p.montura}` : ''}{p.laboratorio ? <span className="text-muted-foreground"> · {p.laboratorio}</span> : null}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Seguimiento ({c.seguimientos.length})</p>
                      {c.seguimientos.length === 0
                        ? <p className="text-xs text-muted-foreground rounded-md border border-dashed p-3 text-center">Sin contactos registrados.</p>
                        : c.seguimientos.map((s) => (
                          <div key={s.id} className="rounded-md bg-muted/40 p-2">
                            <p className="text-xs"><b>{fecha(s.created_at)}</b> · {TIPO_CONTACTO[s.tipo]} · {MOTIVO_CONTACTO[s.motivo]} · <span className="font-medium">{RESULTADO_CONTACTO[s.resultado]}</span></p>
                            {s.nota && <p className="text-xs mt-0.5">{s.nota}</p>}
                            <p className="text-[11px] text-muted-foreground">
                              {nombreUsuario(s.usuario_id)}{s.proximo_contacto ? ` · volver a contactar ${fecha(s.proximo_contacto)}` : ''}
                            </p>
                          </div>
                        ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}

      <RegistrarContactoDialog datos={registrando} onClose={() => setRegistrando(null)} />
    </AppLayout>
  );
}

function RegistrarContactoDialog({ datos, onClose }: {
  datos: { cliente: ClienteCrm; motivo: MotivoContacto; tipo: TipoContacto } | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [tipo, setTipo] = useState<TipoContacto>('llamada');
  const [motivo, setMotivo] = useState<MotivoContacto>('satisfaccion');
  const [resultado, setResultado] = useState<ResultadoContacto>('contactado');
  const [nota, setNota] = useState('');
  const [proximo, setProximo] = useState('');
  const [abiertoPara, setAbiertoPara] = useState<string | null>(null);

  // Reinicia el formulario cada vez que se abre para otro paciente o motivo.
  const clave = datos ? `${datos.cliente.paciente.id}-${datos.motivo}-${datos.tipo}` : null;
  if (clave !== abiertoPara) {
    setAbiertoPara(clave);
    if (datos) { setTipo(datos.tipo); setMotivo(datos.motivo); setResultado('contactado'); setNota(''); setProximo(''); }
  }

  const guardar = useMutation({
    mutationFn: async () => {
      if (!datos) return;
      const { error } = await (supabase as any).from('crm_seguimientos').insert({
        paciente_id: datos.cliente.paciente.id, orden_id: datos.cliente.compras[0]?.orden_id ?? null,
        tipo, motivo, resultado, nota: nota.trim() || null, proximo_contacto: proximo || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['crm-seguimientos'] });
      toast.success('Contacto registrado');
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const opciones = <T extends string>(m: Record<T, string>) =>
    (Object.entries(m) as [T, string][]).map(([v, t]) => <SelectItem key={v} value={v}>{t}</SelectItem>);

  return (
    <Dialog open={!!datos} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar contacto</DialogTitle>
          <DialogDescription>{datos ? `${datos.cliente.paciente.nombres} ${datos.cliente.paciente.apellidos}` : ''}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>Medio</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoContacto)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{opciones(TIPO_CONTACTO)}</SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label>Motivo</Label>
            <Select value={motivo} onValueChange={(v) => setMotivo(v as MotivoContacto)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{opciones(MOTIVO_CONTACTO)}</SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label>Resultado</Label>
            <Select value={resultado} onValueChange={(v) => setResultado(v as ResultadoContacto)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{opciones(RESULTADO_CONTACTO)}</SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label>Volver a contactar</Label>
            <Input type="date" value={proximo} onChange={(e) => setProximo(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5"><Label>Nota</Label>
          <Textarea rows={3} placeholder="Ej: Le quedaron bien, pidió ajuste de plaquetas" value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => guardar.mutate()} disabled={guardar.isPending}>{guardar.isPending ? 'Guardando…' : 'Guardar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
