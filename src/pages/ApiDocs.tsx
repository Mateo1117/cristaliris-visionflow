import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Globe, Copy, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { toast } from 'sonner';

const BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-agenda`;

function CodeBlock({ code, language = 'json' }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Copiado al portapapeles');
  };

  return (
    <div className="relative group">
      <Button size="icon" variant="ghost" className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity" onClick={copy}>
        {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
      <pre className="bg-muted/50 border rounded-lg p-4 text-xs overflow-x-auto font-mono leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function EndpointCard({
  method, path, description, params, body, response, example,
}: {
  method: 'GET' | 'POST';
  path: string;
  description: string;
  params?: { name: string; type: string; required: boolean; desc: string }[];
  body?: { name: string; type: string; required: boolean; desc: string }[];
  response: string;
  example: string;
}) {
  return (
    <Card className="border-l-4" style={{ borderLeftColor: method === 'GET' ? 'hsl(var(--primary))' : 'hsl(var(--success))' }}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <Badge variant={method === 'GET' ? 'default' : 'secondary'} className="font-mono text-xs px-3">
            {method}
          </Badge>
          <code className="text-sm font-mono font-medium">{path}</code>
        </div>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {params && params.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Parámetros Query</h4>
            <div className="space-y-1">
              {params.map(p => (
                <div key={p.name} className="flex items-start gap-2 text-sm">
                  <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{p.name}</code>
                  <Badge variant="outline" className="text-[10px] h-5">{p.type}</Badge>
                  {p.required && <Badge variant="destructive" className="text-[10px] h-5">requerido</Badge>}
                  <span className="text-muted-foreground text-xs">{p.desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {body && body.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Body (JSON)</h4>
            <div className="space-y-1">
              {body.map(p => (
                <div key={p.name} className="flex items-start gap-2 text-sm">
                  <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{p.name}</code>
                  <Badge variant="outline" className="text-[10px] h-5">{p.type}</Badge>
                  {p.required && <Badge variant="destructive" className="text-[10px] h-5">requerido</Badge>}
                  <span className="text-muted-foreground text-xs">{p.desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div>
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Ejemplo</h4>
          <CodeBlock code={example} language="bash" />
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Respuesta</h4>
          <CodeBlock code={response} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function ApiDocs() {
  return (
    <AppLayout>
      <PageHeader title="Documentación API" description="Referencia de endpoints para integración con WhatsApp Bot y sistemas externos">
        <Badge variant="outline" className="gap-1"><Globe className="h-3 w-3" />REST API</Badge>
      </PageHeader>

      <Card className="mb-6">
        <CardContent className="p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold mb-1">URL Base</h3>
            <CodeBlock code={BASE_URL} />
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-1">Autenticación</h3>
            <p className="text-sm text-muted-foreground">
              Todos los endpoints son públicos (acceso anon). Incluye el header <code className="bg-muted px-1 rounded text-xs">apikey</code> con tu clave pública.
            </p>
            <CodeBlock code={`curl -H "apikey: TU_ANON_KEY" \\
  "${BASE_URL}/medicos"`} />
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-1">Códigos de Estado</h3>
            <div className="flex flex-wrap gap-3 text-sm">
              <span><Badge variant="default" className="mr-1">200</Badge> Éxito</span>
              <span><Badge variant="default" className="mr-1">201</Badge> Creado</span>
              <span><Badge variant="secondary" className="mr-1">400</Badge> Solicitud inválida</span>
              <span><Badge variant="secondary" className="mr-1">404</Badge> No encontrado</span>
              <span><Badge variant="destructive" className="mr-1">409</Badge> Conflicto (horario ocupado)</span>
              <span><Badge variant="destructive" className="mr-1">500</Badge> Error del servidor</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="disponibilidad" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="disponibilidad">Disponibilidad</TabsTrigger>
          <TabsTrigger value="agendar">Agendar Cita</TabsTrigger>
          <TabsTrigger value="cita">Consultar Cita</TabsTrigger>
          <TabsTrigger value="medicos">Listar Médicos</TabsTrigger>
        </TabsList>

        <TabsContent value="disponibilidad">
          <EndpointCard
            method="GET"
            path="/disponibilidad"
            description="Obtiene los horarios disponibles para un día específico. Retorna los slots libres de cada médico según sus horarios configurados, excluyendo las citas ya reservadas."
            params={[
              { name: 'fecha', type: 'string (YYYY-MM-DD)', required: true, desc: 'Fecha a consultar' },
              { name: 'sede_id', type: 'uuid', required: false, desc: 'Filtrar por sede específica' },
              { name: 'medico_id', type: 'uuid', required: false, desc: 'Filtrar por médico específico' },
            ]}
            example={`GET ${BASE_URL}/disponibilidad?fecha=2026-03-15

# Con filtros opcionales:
GET ${BASE_URL}/disponibilidad?fecha=2026-03-15&sede_id=abc-123&medico_id=def-456`}
            response={`{
  "fecha": "2026-03-15",
  "dia_semana": 0,
  "slots_disponibles": [
    {
      "medico_id": "uuid-del-medico",
      "medico_nombre": "Dra. María García",
      "sede_id": "uuid-de-sede",
      "hora_inicio": "08:00",
      "hora_fin": "08:30",
      "duracion": 30
    },
    {
      "medico_id": "uuid-del-medico",
      "medico_nombre": "Dra. María García",
      "sede_id": "uuid-de-sede",
      "hora_inicio": "08:30",
      "hora_fin": "09:00",
      "duracion": 30
    }
  ]
}`}
          />
        </TabsContent>

        <TabsContent value="agendar">
          <EndpointCard
            method="POST"
            path="/agendar"
            description="Crea una nueva cita. Valida que el paciente exista y que el horario esté disponible. Si el slot ya está ocupado retorna error 409."
            body={[
              { name: 'paciente_documento', type: 'string', required: true, desc: 'Número de documento del paciente' },
              { name: 'fecha', type: 'string (YYYY-MM-DD)', required: true, desc: 'Fecha de la cita' },
              { name: 'hora_inicio', type: 'string (HH:MM)', required: true, desc: 'Hora de inicio' },
              { name: 'hora_fin', type: 'string (HH:MM)', required: true, desc: 'Hora de fin' },
              { name: 'medico_id', type: 'uuid', required: true, desc: 'ID del médico/optómetra' },
              { name: 'sede_id', type: 'uuid', required: false, desc: 'ID de la sede' },
              { name: 'origen', type: 'string', required: false, desc: 'Origen de la cita: "bot", "manual", "crm" (default: "bot")' },
            ]}
            example={`POST ${BASE_URL}/agendar
Content-Type: application/json

{
  "paciente_documento": "1234567890",
  "fecha": "2026-03-15",
  "hora_inicio": "08:00",
  "hora_fin": "08:30",
  "medico_id": "uuid-del-medico",
  "sede_id": "uuid-de-sede",
  "origen": "bot"
}`}
            response={`// Éxito (201):
{
  "success": true,
  "cita": {
    "id": "uuid-de-cita",
    "fecha": "2026-03-15",
    "hora_inicio": "08:00",
    "hora_fin": "08:30",
    "estado": "agendada"
  }
}

// Error - Paciente no encontrado (404):
{ "error": "Paciente no encontrado con ese documento" }

// Error - Horario ocupado (409):
{ "error": "Este horario ya está ocupado" }`}
          />
        </TabsContent>

        <TabsContent value="cita">
          <EndpointCard
            method="GET"
            path="/cita"
            description="Consulta los detalles completos de una cita existente, incluyendo información del paciente."
            params={[
              { name: 'id', type: 'uuid', required: true, desc: 'ID de la cita a consultar' },
            ]}
            example={`GET ${BASE_URL}/cita?id=uuid-de-cita`}
            response={`{
  "id": "uuid-de-cita",
  "fecha": "2026-03-15",
  "hora_inicio": "08:00",
  "hora_fin": "08:30",
  "estado": "agendada",
  "origen": "bot",
  "observaciones": null,
  "pacientes": {
    "nombres": "Juan",
    "apellidos": "Pérez",
    "numero_documento": "1234567890",
    "telefono": "3001234567"
  }
}`}
          />
        </TabsContent>

        <TabsContent value="medicos">
          <EndpointCard
            method="GET"
            path="/medicos"
            description="Lista todos los médicos/optómetras activos del sistema con sus sedes asignadas."
            example={`GET ${BASE_URL}/medicos`}
            response={`{
  "medicos": [
    {
      "user_id": "uuid-del-medico",
      "nombre": "Dra. María García",
      "email": "maria@cristaliris.com",
      "sedes_asignadas": ["uuid-sede-norte", "uuid-sede-sur"]
    }
  ]
}`}
          />
        </TabsContent>
      </Tabs>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-sm">Flujo de Integración WhatsApp Bot</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { step: 1, title: 'Listar Médicos', desc: 'GET /medicos → Mostrar opciones al usuario' },
              { step: 2, title: 'Consultar Disponibilidad', desc: 'GET /disponibilidad → Mostrar slots libres' },
              { step: 3, title: 'Agendar Cita', desc: 'POST /agendar → Confirmar reserva' },
              { step: 4, title: 'Confirmar al Paciente', desc: 'GET /cita → Enviar detalles por WhatsApp' },
            ].map(s => (
              <div key={s.step} className="flex gap-3 items-start">
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-primary-foreground">{s.step}</span>
                </div>
                <div>
                  <p className="text-sm font-medium">{s.title}</p>
                  <p className="text-xs text-muted-foreground">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
