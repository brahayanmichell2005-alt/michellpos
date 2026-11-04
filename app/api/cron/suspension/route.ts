import { NextResponse } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { avisarVencido, avisarSuspendido } from "@/lib/avisos";

const ISO = (d: Date) => d.toISOString().slice(0, 10);

/** Resuelve el correo y nombre del dueño de un negocio (service role). */
async function datosDueño(admin: ReturnType<typeof crearClienteAdmin>, negocioId: string) {
  const { data: negocio } = await admin
    .from("negocios")
    .select("nombre")
    .eq("id", negocioId)
    .maybeSingle();
  const correo = (negocio as { correo?: string } | null)?.correo ?? null;
  const nombre = (negocio as { nombre?: string } | null)?.nombre ?? "cliente";
  return { correo, nombre };
}

/**
 * Cron diario de Vercel — suspensión automática:
 *  1) en_prueba con fin_prueba vencido → vencido (+ correo)
 *  2) activo con fecha_vencimiento vencida → vencido (+ correo)
 *  3) vencido con fecha_vencimiento +3 días → suspendido (+ correo)
 */
export async function GET(request: Request) {
  const clave = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!clave || authorization !== `Bearer ${clave}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const admin = crearClienteAdmin();
  const hoy = new Date();
  const hoyISO = ISO(hoy);
  const graciaISO = ISO(new Date(hoy.getTime() - 3 * 86_400_000));
  const emails: string[] = [];

  // 1) pruebas vencidas
  const { data: pruebas } = await admin
    .from("suscripciones")
    .select("id, negocio_id, fin_prueba")
    .eq("estado", "en_prueba")
    .lt("fin_prueba", hoyISO);
  for (const s of pruebas ?? []) {
    const fila = s as unknown as { id: string; negocio_id: string; fin_prueba: string };
    await admin
      .from("suscripciones")
      .update({ estado: "vencido", fecha_vencimiento: fila.fin_prueba })
      .eq("id", fila.id);
    const { correo, nombre } = await datosDueño(admin, fila.negocio_id);
    if (correo) {
      await avisarVencido(correo, nombre, nombre);
      emails.push(`${nombre}: vencido`);
    }
  }

  // 2) activos vencidos
  const { data: activos } = await admin
    .from("suscripciones")
    .select("id, negocio_id")
    .eq("estado", "activo")
    .lt("fecha_vencimiento", hoyISO);
  for (const s of activos ?? []) {
    const fila = s as unknown as { id: string; negocio_id: string };
    await admin.from("suscripciones").update({ estado: "vencido" }).eq("id", fila.id);
    const { correo, nombre } = await datosDueño(admin, fila.negocio_id);
    if (correo) {
      await avisarVencido(correo, nombre, nombre);
      emails.push(`${nombre}: vencido`);
    }
  }

  // 3) gracia agotada → suspendido
  const { data: vencidos } = await admin
    .from("suscripciones")
    .select("id, negocio_id")
    .eq("estado", "vencido")
    .lt("fecha_vencimiento", graciaISO);
  for (const s of vencidos ?? []) {
    const fila = s as unknown as { id: string; negocio_id: string };
    await admin.from("suscripciones").update({ estado: "suspendido" }).eq("id", fila.id);
    const { correo, nombre } = await datosDueño(admin, fila.negocio_id);
    if (correo) {
      await avisarSuspendido(correo, nombre, nombre);
      emails.push(`${nombre}: suspendido`);
    }
  }

  // registro del sistema para la salud (panel Admin)
  await admin.from("registro_sistema").insert({
    evento: "cron_revision_vencimientos",
    detalle: `pruebas vencidas: ${(pruebas ?? []).length} · activos→vencidos ${(activos ?? []).length} · suspendidos ${(vencidos ?? []).length} · correos: ${emails.length ? emails.join(", ") : "ninguno"}`,
  });

  return NextResponse.json({
    ok: true,
    fecha: hoyISO,
    pruebas_vencidas: (pruebas ?? []).length,
    activos_a_vencido: (activos ?? []).length,
    suspendidos: (vencidos ?? []).length,
    correos_enviados: emails,
  });
}
