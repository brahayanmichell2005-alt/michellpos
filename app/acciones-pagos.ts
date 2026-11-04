"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { obtenerContexto } from "@/lib/pos";
import { avisarPagoAprobado } from "@/lib/avisos";

/* ============== Cliente reporta su pago ============== */

export async function declararPagoAction(formData: FormData) {
  const ctx = await obtenerContexto();
  if (!ctx.usuario) redirect("/login");
  if (!ctx.negocioId || !ctx.esAdminNegocio) redirect("/app");
  if (ctx.suspendido) redirect("/app/pagos");

  const planId = String(formData.get("planId") ?? "");
  const monto = Number(formData.get("monto") ?? 0);
  const metodo = String(formData.get("metodo") ?? "");
  const referencia = String(formData.get("referencia") ?? "").trim();
  const fecha = String(formData.get("fecha") ?? "").trim();

  if (!planId || monto <= 0 || !fecha) redirect("/app/pagos");
  if (!["efectivo", "yape", "plin", "transferencia"].includes(metodo)) redirect("/app/pagos");

  // Verificar que el plan le pertenece a la lista activa
  const { data: plan } = await ctx.supabase
    .from("planes")
    .select("precio_mensual")
    .eq("id", planId)
    .eq("activo", true)
    .maybeSingle();
  if (!plan) redirect("/app/pagos");

  await ctx.supabase.from("pagos").insert({
    negocio_id: ctx.negocioId,
    plan_id: planId,
    monto,
    metodo,
    referencia: referencia || null,
    fecha,
    estado: "pendiente",
  });

  revalidatePath("/app/pagos");
  redirect("/app/pagos");
}

/* ============== Superadmin revisa pagos ============== */

async function requerirSuperadmin() {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getUser();
  const usuario = data.user;
  if (!usuario) redirect("/login");
  const { data: es } = await supabase
    .from("superadmins")
    .select("user_id")
    .eq("user_id", usuario.id)
    .maybeSingle();
  if (!es) redirect("/app");
  return { supabase, usuarioId: usuario.id };
}

const isoHoyLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

function sumarDias(fechaISO: string, dias: number) {
  const base = new Date(fechaISO + "T12:00:00");
  return new Date(base.getTime() + dias * 86_400_000).toISOString().slice(0, 10);
}

/** Aprueba un pago informado: activa la suscripción +30 días desde el vencimiento vigente. */
export async function aprobarPagoAction(formData: FormData) {
  const { supabase, usuarioId } = await requerirSuperadmin();
  const pagoId = String(formData.get("pagoId") ?? "");
  const negocioId = String(formData.get("negocioId") ?? "");
  if (!pagoId || !negocioId) redirect("/admin");

  const { data: pago } = await supabase
    .from("pagos")
    .select("id, estado, monto")
    .eq("id", pagoId)
    .eq("negocio_id", negocioId)
    .maybeSingle();
  if (!pago || pago.estado !== "pendiente") redirect(`/admin/cliente/${negocioId}`);

  // 1) aprobar el pago
  await supabase
    .from("pagos")
    .update({
      estado: "aprobado",
      confirmado_por: usuarioId,
      revisado_en: new Date().toISOString(),
    })
    .eq("id", pagoId);

  // 2) extender la suscripción vigente +30 días (desde hoy si ya venció)
  const { data: subs } = await supabase
    .from("suscripciones")
    .select("id, estado, fecha_vencimiento")
    .eq("negocio_id", negocioId)
    .order("creado_en", { ascending: false })
    .limit(1);
  const sub = subs?.[0];
  let nueva: string | null = null;
  if (sub) {
    const hoy = isoHoyLocal();
    const base =
      sub.fecha_vencimiento && sub.fecha_vencimiento > hoy ? sub.fecha_vencimiento : hoy;
    nueva = sumarDias(base, 30);
    await supabase
      .from("suscripciones")
      .update({ estado: "activo", fecha_vencimiento: nueva })
      .eq("id", sub.id);
  }

  // 3) auditoría + aviso al cliente
  await supabase.from("auditoria_admin").insert({
    superadmin_id: usuarioId,
    negocio_id: negocioId,
    accion: `pago_aprobado (${pagoId})`,
  });
  try {
    const admin = crearClienteAdmin();
    const { data: dueño } = await admin
      .from("perfiles")
      .select("user_id")
      .eq("negocio_id", negocioId)
      .eq("rol", "dueño")
      .limit(1);
    const userIdDueño = (dueño?.[0] as { user_id: string } | undefined)?.user_id;
    let correoDueño: string | null = null;
    let nombreDueño = "dueño";
    if (userIdDueño) {
      const { data: u } = await admin.auth.admin.getUserById(userIdDueño);
      correoDueño = u?.user?.email ?? null;
      nombreDueño = (u?.user?.user_metadata?.nombre as string) || nombreDueño;
    }
    const { data: negocioRaw } = await admin.from("negocios").select("nombre").eq("id", negocioId).maybeSingle();
    if (correoDueño) {
      await avisarPagoAprobado(
        correoDueño,
        nombreDueño,
        (negocioRaw as unknown as { nombre: string }).nombre,
        String(Number((pago as unknown as { monto: number }).monto)),
        nueva ?? "hoy"
      );
    }
  } catch {
    // el aviso por correo no debe bloquear la aprobación
  }

  revalidatePath("/admin");
  revalidatePath(`/admin/cliente/${negocioId}`);
  redirect(`/admin/cliente/${negocioId}`);
}

/** Rechaza un pago informado (con motivo opcional que ve el cliente). */
export async function rechazarPagoAction(formData: FormData) {
  const { supabase, usuarioId } = await requerirSuperadmin();
  const pagoId = String(formData.get("pagoId") ?? "");
  const negocioId = String(formData.get("negocioId") ?? "");
  const notas = String(formData.get("notas") ?? "").trim();
  if (!pagoId || !negocioId) redirect("/admin");

  const { data: pago } = await supabase
    .from("pagos")
    .select("estado")
    .eq("id", pagoId)
    .eq("negocio_id", negocioId)
    .maybeSingle();
  if (!pago || pago.estado !== "pendiente") redirect(`/admin/cliente/${negocioId}`);

  await supabase
    .from("pagos")
    .update({
      estado: "rechazado",
      notas_admin: notas || null,
      confirmado_por: usuarioId,
      revisado_en: new Date().toISOString(),
    })
    .eq("id", pagoId);

  await supabase.from("auditoria_admin").insert({
    superadmin_id: usuarioId,
    negocio_id: negocioId,
    accion: `pago_rechazado (${pagoId})`,
  });

  revalidatePath("/admin");
  revalidatePath(`/admin/cliente/${negocioId}`);
  redirect(`/admin/cliente/${negocioId}`);
}
