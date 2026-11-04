import { NextResponse } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { generarRespaldo } from "@/lib/respaldo";
import { avisarPruebaPorVencer } from "@/lib/avisos";

/** "2026-11-18" → "18 de noviembre de 2026" */
function formatoLargo(iso: string) {
  const f = new Date(`${iso}T12:00:00`);
  return f.toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Cron diario de Vercel — mantenimiento general:
 *  1) Respaldo plano de la base de datos al bucket privado `backups`
 *  2) Aviso en registro_sistema si hay pruebas que vencen en ≤ 3 días
 *     (el dueño ve el aviso en su panel Admin)
 */
export async function GET(request: Request) {
  const clave = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!clave || authorization !== `Bearer ${clave}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const admin = crearClienteAdmin();
  const hoyISO = new Date().toISOString().slice(0, 10);
  const en3 = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
  const resultados: Record<string, unknown> = { fecha: hoyISO };

  // 1) respaldo
  const backup = await generarRespaldo().catch((e) => ({ ok: false, error: String(e) }));
  resultados.backup = backup;

  // 2) prueba por vencer (aviso para el dueño)
  const { data: porVencer } = await admin
    .from("suscripciones")
    .select("negocio_id, fin_prueba, negocios ( nombre )")
    .eq("estado", "en_prueba")
    .gte("fin_prueba", hoyISO)
    .lte("fin_prueba", en3);
  const avisados = [];
  for (const s of porVencer ?? []) {
    const fila = s as unknown as { negocio_id: string; fin_prueba: string; negocios: { nombre: string } | null };
    const nombre = fila.negocios?.nombre ?? "cliente";
    await admin.from("registro_sistema").insert({
      evento: "aviso_prueba_por_vencer",
      detalle: `${nombre} termina su prueba el ${fila.fin_prueba}`,
    });
    // correo al dueño del negocio
    const { data: negocioRaw } = await admin
      .from("negocios")
      .select("correo")
      .eq("id", fila.negocio_id)
      .maybeSingle();
    const correo = (negocioRaw as { correo?: string } | null)?.correo;
    if (correo) {
      await avisarPruebaPorVencer(correo, nombre, nombre, formatoLargo(fila.fin_prueba));
    }
    avisados.push(nombre);
  }
  resultados.pruebas_por_vencer = avisados;

  return NextResponse.json({ ok: true, ...resultados });
}
