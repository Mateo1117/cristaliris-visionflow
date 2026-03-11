import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Verify caller is admin
  const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''));
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: 'Token inválido' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const { data: isAdmin } = await supabaseAdmin.rpc('has_role', { _user_id: user.id, _role: 'admin' });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'Solo administradores pueden gestionar usuarios' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const body = await req.json();
    const { action = 'create' } = body;

    // CREATE USER
    if (action === 'create') {
      const { email, password, nombre, rol, sedes_asignadas } = body;
      if (!email || !password || !nombre || !rol) {
        return new Response(JSON.stringify({ error: 'Faltan campos requeridos' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { nombre },
      });
      if (createErr) throw createErr;

      await supabaseAdmin.from('user_roles').insert({ user_id: newUser.user.id, role: rol });
      if (sedes_asignadas?.length) {
        await supabaseAdmin.from('profiles').update({ sedes_asignadas }).eq('user_id', newUser.user.id);
      }
      return new Response(JSON.stringify({ success: true, user_id: newUser.user.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // CHANGE ROLE
    if (action === 'change_role') {
      const { target_user_id, new_role } = body;
      if (!target_user_id || !new_role) throw new Error('Faltan target_user_id o new_role');
      // Delete existing roles and insert new one
      await supabaseAdmin.from('user_roles').delete().eq('user_id', target_user_id);
      const { error } = await supabaseAdmin.from('user_roles').insert({ user_id: target_user_id, role: new_role });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // RESET PASSWORD
    if (action === 'reset_password') {
      const { target_user_id, new_password } = body;
      if (!target_user_id || !new_password) throw new Error('Faltan target_user_id o new_password');
      if (new_password.length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');
      const { error } = await supabaseAdmin.auth.admin.updateUserById(target_user_id, { password: new_password });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // TOGGLE ACTIVE
    if (action === 'toggle_active') {
      const { target_user_id, active } = body;
      if (!target_user_id) throw new Error('Falta target_user_id');
      // Update profile
      await supabaseAdmin.from('profiles').update({ estado_activo: active }).eq('user_id', target_user_id);
      // Ban/unban auth user
      const { error } = await supabaseAdmin.auth.admin.updateUserById(target_user_id, {
        ban_duration: active ? 'none' : '876000h',
      });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // UPDATE PROFILE
    if (action === 'update_profile') {
      const { target_user_id, nombre, telefono, sedes_asignadas } = body;
      if (!target_user_id) throw new Error('Falta target_user_id');
      const updates: Record<string, any> = {};
      if (nombre !== undefined) updates.nombre = nombre;
      if (telefono !== undefined) updates.telefono = telefono;
      if (sedes_asignadas !== undefined) updates.sedes_asignadas = sedes_asignadas;
      const { error } = await supabaseAdmin.from('profiles').update(updates).eq('user_id', target_user_id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Acción no válida' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
