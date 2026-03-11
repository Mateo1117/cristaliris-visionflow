import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const url = new URL(req.url);
  const action = url.pathname.split('/').pop();

  try {
    // GET /api-agenda/disponibilidad?fecha=2026-03-15&sede_id=xxx&medico_id=xxx
    if (req.method === 'GET' && action === 'disponibilidad') {
      const fecha = url.searchParams.get('fecha');
      const sedeId = url.searchParams.get('sede_id');
      const medicoId = url.searchParams.get('medico_id');

      if (!fecha) {
        return new Response(JSON.stringify({ error: 'Parámetro fecha requerido (YYYY-MM-DD)' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const dateObj = new Date(fecha + 'T00:00:00');
      const diaSemana = dateObj.getDay();

      // Get doctor schedules for this day
      let horariosQuery = supabase.from('horarios_medicos')
        .select('*, profiles!inner(nombre, user_id)')
        .eq('dia_semana', diaSemana)
        .eq('activo', true);

      if (sedeId) horariosQuery = horariosQuery.eq('sede_id', sedeId);
      if (medicoId) horariosQuery = horariosQuery.eq('medico_id', medicoId);

      const { data: horarios, error: hErr } = await horariosQuery;
      if (hErr) throw hErr;

      // Get existing appointments for this date
      const { data: citasExistentes, error: cErr } = await supabase.from('citas')
        .select('hora_inicio, hora_fin, optometra_id')
        .eq('fecha', fecha)
        .in('estado', ['agendada', 'confirmada']);
      if (cErr) throw cErr;

      // Generate available slots
      const slots: any[] = [];
      for (const h of (horarios || [])) {
        const [startH, startM] = h.hora_inicio.split(':').map(Number);
        const [endH, endM] = h.hora_fin.split(':').map(Number);
        const startMin = startH * 60 + startM;
        const endMin = endH * 60 + endM;

        for (let t = startMin; t + h.duracion_cita <= endMin; t += h.duracion_cita) {
          const slotStart = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
          const slotEnd = `${String(Math.floor((t + h.duracion_cita) / 60)).padStart(2, '0')}:${String((t + h.duracion_cita) % 60).padStart(2, '0')}`;

          const occupied = (citasExistentes || []).some(c =>
            c.optometra_id === h.medico_id && c.hora_inicio === slotStart
          );

          if (!occupied) {
            slots.push({
              medico_id: h.medico_id,
              medico_nombre: (h as any).profiles?.nombre || 'N/A',
              sede_id: h.sede_id,
              hora_inicio: slotStart,
              hora_fin: slotEnd,
              duracion: h.duracion_cita,
            });
          }
        }
      }

      return new Response(JSON.stringify({ fecha, dia_semana: diaSemana, slots_disponibles: slots }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /api-agenda/agendar
    if (req.method === 'POST' && action === 'agendar') {
      const body = await req.json();
      const { paciente_documento, fecha, hora_inicio, hora_fin, medico_id, sede_id, origen } = body;

      if (!paciente_documento || !fecha || !hora_inicio || !hora_fin || !medico_id) {
        return new Response(JSON.stringify({ error: 'Campos requeridos: paciente_documento, fecha, hora_inicio, hora_fin, medico_id' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Find patient by document
      const { data: paciente, error: pErr } = await supabase.from('pacientes')
        .select('id')
        .eq('numero_documento', paciente_documento)
        .single();

      if (pErr || !paciente) {
        return new Response(JSON.stringify({ error: 'Paciente no encontrado con ese documento' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check slot availability
      const { data: conflict } = await supabase.from('citas')
        .select('id')
        .eq('fecha', fecha)
        .eq('optometra_id', medico_id)
        .eq('hora_inicio', hora_inicio)
        .in('estado', ['agendada', 'confirmada'])
        .maybeSingle();

      if (conflict) {
        return new Response(JSON.stringify({ error: 'Este horario ya está ocupado' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create appointment
      const { data: cita, error: citaErr } = await supabase.from('citas').insert({
        paciente_id: paciente.id,
        optometra_id: medico_id,
        fecha,
        hora_inicio,
        hora_fin,
        sede_id: sede_id || null,
        origen: origen || 'bot',
        estado: 'agendada',
      }).select('id, fecha, hora_inicio, hora_fin, estado').single();

      if (citaErr) throw citaErr;

      return new Response(JSON.stringify({ success: true, cita }), {
        status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /api-agenda/cita?id=xxx
    if (req.method === 'GET' && action === 'cita') {
      const citaId = url.searchParams.get('id');
      if (!citaId) {
        return new Response(JSON.stringify({ error: 'Parámetro id requerido' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabase.from('citas')
        .select('*, pacientes(nombres, apellidos, numero_documento, telefono)')
        .eq('id', citaId)
        .single();

      if (error) throw error;
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /api-agenda/medicos
    if (req.method === 'GET' && action === 'medicos') {
      const { data: roles } = await supabase.from('user_roles')
        .select('user_id')
        .eq('role', 'optometra');

      if (!roles?.length) {
        return new Response(JSON.stringify({ medicos: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const userIds = roles.map(r => r.user_id);
      const { data: profiles } = await supabase.from('profiles')
        .select('user_id, nombre, email, sedes_asignadas')
        .in('user_id', userIds)
        .eq('estado_activo', true);

      return new Response(JSON.stringify({ medicos: profiles || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Endpoint no encontrado. Usa: /disponibilidad, /agendar, /cita, /medicos' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
