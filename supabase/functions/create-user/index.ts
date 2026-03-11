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
  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace('Bearer ', '');
  const { data: claims, error: claimsErr } = await supabaseUser.auth.getClaims(token);
  if (claimsErr || !claims?.claims) {
    return new Response(JSON.stringify({ error: 'Token inválido' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const userId = claims.claims.sub as string;
  const { data: isAdmin } = await supabaseAdmin.rpc('has_role', { _user_id: userId, _role: 'admin' });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'Solo administradores pueden crear usuarios' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const { email, password, nombre, rol, sedes_asignadas } = await req.json();

    if (!email || !password || !nombre || !rol) {
      return new Response(JSON.stringify({ error: 'Faltan campos requeridos: email, password, nombre, rol' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Create auth user
    const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre },
    });
    if (createErr) throw createErr;

    // Assign role
    const { error: roleErr } = await supabaseAdmin.from('user_roles').insert({
      user_id: newUser.user.id,
      role: rol,
    });
    if (roleErr) throw roleErr;

    // Update profile with sedes
    if (sedes_asignadas?.length) {
      await supabaseAdmin.from('profiles').update({ sedes_asignadas }).eq('user_id', newUser.user.id);
    }

    return new Response(JSON.stringify({ success: true, user_id: newUser.user.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
