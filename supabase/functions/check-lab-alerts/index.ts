import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Reglas de tiempo máximo en producción (laboratorio):
 * - Progresivos, tallas, sol con fórmula → 3 días
 * - Lentes terminados → 1 día
 * - Monturas 3 piezas / lentes terminados → 2 días
 */
function getMaxDays(
  tipoProducto: string,
  lenteTipo: string | null,
  tipoLenteTiempo: string | null,
  descripcion: string
): { maxDays: number; categoria: string } {
  const desc = (descripcion || "").toLowerCase();
  const tipo = (lenteTipo || "").toLowerCase();
  const tiempo = (tipoLenteTiempo || "").toLowerCase();
  const prod = (tipoProducto || "").toLowerCase();

  if (prod === "montura" || desc.includes("3 piezas") || desc.includes("tres piezas")) {
    if (desc.includes("terminado") || tiempo.includes("terminado")) {
      return { maxDays: 2, categoria: "Montura 3 piezas / Terminado" };
    }
  }

  if (tipo.includes("terminado") || tiempo.includes("terminado") || desc.includes("terminado")) {
    return { maxDays: 1, categoria: "Lente Terminado" };
  }

  if (
    tipo.includes("progresivo") || desc.includes("progresivo") ||
    tipo.includes("talla") || desc.includes("talla") ||
    tipo.includes("sol") || desc.includes("sol con f") || desc.includes("sol formula")
  ) {
    return { maxDays: 3, categoria: "Progresivo / Talla / Sol Fórmula" };
  }

  return { maxDays: 3, categoria: tipoProducto || "Otro" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const labStates = ["enviado_laboratorio", "recibido_laboratorio", "en_produccion", "producido"];

    const { data: productos, error: prodError } = await supabase
      .from("orden_productos")
      .select("id, orden_id, descripcion, tipo_producto, lente_tipo, tipo_lente_tiempo, estado_actual, fecha_envio_lab, created_at, laboratorios(nombre), ordenes(pacientes(nombres, apellidos))")
      .in("estado_actual", labStates);

    if (prodError) throw prodError;

    const now = new Date();
    let inserted = 0;

    for (const p of productos || []) {
      const fechaRef = p.fecha_envio_lab || p.created_at;
      const dias = Math.floor((now.getTime() - new Date(fechaRef).getTime()) / 86400000);
      const { maxDays, categoria } = getMaxDays(p.tipo_producto, p.lente_tipo, p.tipo_lente_tiempo, p.descripcion);

      if (dias >= maxDays) {
        // Check if we already notified for this product today
        const today = now.toISOString().split("T")[0];
        const { data: existing } = await supabase
          .from("notificaciones")
          .select("id")
          .eq("orden_producto_id", p.id)
          .gte("created_at", today + "T00:00:00")
          .limit(1);

        if (existing && existing.length > 0) continue;

        const paciente = `${p.ordenes?.pacientes?.nombres || ""} ${p.ordenes?.pacientes?.apellidos || ""}`.trim();
        const lab = p.laboratorios?.nombre || "Sin lab";

        await supabase.from("notificaciones").insert({
          tipo: "alerta_produccion",
          titulo: `⚠️ ${categoria} retrasado — ${paciente}`,
          detalle: `${p.descripcion} lleva ${dias} días en ${p.estado_actual.replace(/_/g, " ")} (máx: ${maxDays}d). Lab: ${lab}`,
          orden_producto_id: p.id,
        });
        inserted++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, alertas_creadas: inserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
