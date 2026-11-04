"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { generarRespaldo, urlFirmadaRespaldo } from "@/lib/respaldo";

const isoHoyLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

function sumarDias(fechaISO: string | Date, dias: number) {
  const base = typeof fechaISO === "string" ? new Date(fechaISO + "T12:00:00") : fechaISO;
  return new Date(base.getTime() + dias * 86_400_000).toISOString().slice(0, 10);
}

/** Verifica sesión y que sea superadmin; si no, lo echa a su lado. */
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

/**
 * Cambia el estado de la suscripción de un negocio.
 * accion: "activar" | "suspender" | "renovar"
 * "activar": pone estado activo y vence a 30 días <= si venció, renueva desde hoy.
 * "renovar": suma 30 días a la fecha de vencimiento vigente (o desde hoy si ya venció).
 * "suspender": corta el servicio a mano.
 */
export async function cambiarEstadoSuscripcion(formData: FormData) {
  const { supabase, usuarioId } = await requerirSuperadmin();
  const negocioId = String(formData.get("negocioId") ?? "");
  const accion = String(formData.get("accion") ?? "");
  if (!negocioId || !["activar", "suspender", "renovar"].includes(accion)) redirect("/admin");

  const { data: subs } = await supabase
    .from("suscripciones")
    .select("id, estado, fecha_vencimiento, fin_prueba")
    .eq("negocio_id", negocioId)
    .order("creado_en", { ascending: false })
    .limit(1);
  const sub = subs?.[0];
  if (!sub) redirect("/admin");

  const hoy = isoHoyLocal();
  let notaAuditoria = accion;

  if (accion === "suspender") {
    await supabase.from("suscripciones").update({ estado: "suspendido" }).eq("id", sub.id);
  } else {
    // activar o renovar: extienden 30 días
    const base =
      sub.fecha_vencimiento && sub.fecha_vencimiento > hoy ? sub.fecha_vencimiento : hoy;
    const nuevaVencimiento = sumarDias(base, 30);
    await supabase
      .from("suscripciones")
      .update({ estado: "activo", fecha_vencimiento: nuevaVencimiento })
      .eq("id", sub.id);
    if (accion === "activar") notaAuditoria = "activar_manual (+30 días)";
    else notaAuditoria = `renovar_manual (vence ${nuevaVencimiento})`;
  }

  await supabase.from("auditoria_admin").insert({
    superadmin_id: usuarioId,
    negocio_id: negocioId,
    accion: notaAuditoria,
  });

  revalidatePath("/admin");
  revalidatePath(`/admin/cliente/${negocioId}`);
  redirect(`/admin/cliente/${negocioId}`);
}

/** Crea un respaldo inmediato y agrega el evento al registro del sistema. */
export async function respaldoManualAction() {
  const { supabase } = await requerirSuperadmin();

  const resultado = await generarRespaldo();
  if (!resultado.ok) {
    await supabase.from("registro_sistema").insert({ evento: "backup_manual_error", detalle: resultado.error ?? "" });
  } else {
    await supabase.from("registro_sistema").insert({
      evento: "backup_manual",
      detalle: `${resultado.archivo} · ${Object.values(resultado.filas ?? {}).reduce((s, n) => s + n, 0)} filas`,
    });
  }
  revalidatePath("/admin");
  redirect("/admin");
}

/** Descarga (URL firmada 1 hora) de un respaldo guardado. */
export async function descargarRespaldoAction(formData: FormData) {
  await requerirSuperadmin();
  const url = await urlFirmadaRespaldo(String(formData.get("archivo") ?? ""));
  if (url) redirect(url);
  redirect("/admin");
}

/** Crear un plan nuevo. */
export async function crearPlan(formData: FormData) {
  const { supabase } = await requerirSuperadmin();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const precio = Number(formData.get("precio") ?? 0);
  const usuarios = Number(formData.get("usuarios") ?? 1);
  const sucursales = Number(formData.get("sucursales") ?? 1);
  if (!nombre || precio < 0 || usuarios < 1 || sucursales < 1) redirect("/admin");

  const { error } = await supabase
    .from("planes")
    .insert({ nombre, precio_mensual: precio, max_usuarios: usuarios, max_sucursales: sucursales, activo: true })
    ;
  if (!error) revalidatePath("/admin");
  redirect("/admin");
}

/** Guardar cambios sobre un plan existente. */
export async function guardarPlan(formData: FormData) {
  const { supabase } = await requerirSuperadmin();
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin");
  const precio = Number(formData.get("precio") ?? 0);
  const usuarios = Number(formData.get("usuarios") ?? 1);
  const sucursales = Number(formData.get("sucursales") ?? 1);
  const activo = String(formData.get("activo") ?? "") === "on";

  await supabase
    .from("planes")
    .update({ precio_mensual: precio, max_usuarios: usuarios, max_sucursales: sucursales, activo })
    .eq("id", id);
  revalidatePath("/admin");
  redirect("/admin");
}

/**
 * Revisión manual de vencimientos (igual al cron diario):
 * - en_prueba con fin_prueba vencido  → vencido
 * - activo con fecha vencida         → vencido
 * - vencido con +3 días de gracia    → suspendido
 */
export async function ejecutarRevisionManual() {
  const admin = crearClienteAdmin();
  const ISO = (d: Date) => d.toISOString().slice(0, 10);
  const hoy = new Date();
  const hoyISO = ISO(hoy);
  const hace3 = new Date(hoy.getTime() - 3 * 86_400_000);

  // 1) en_prueba vencida → vencido
  const { data: pruebasVencidas } = await admin
    .from("suscripciones")
    .select("id, fin_prueba")
    .eq("estado", "en_prueba")
    .lt("fin_prueba", hoyISO);
  for (const s of pruebasVencidas ?? []) {
    await admin
      .from("suscripciones")
      .update({ estado: "vencido", fecha_vencimiento: s.fin_prueba })
      .eq("id", s.id);
  }

  // 2) activo con fecha de vencimiento pasada → vencido
  const { data: activosVencidos } = await admin
    .from("suscripciones")
    .select("id")
    .eq("estado", "activo")
    .lt("fecha_vencimiento", hoyISO);
  for (const s of activosVencidos ?? []) {
    await admin.from("suscripciones").update({ estado: "vencido" }).eq("id", s.id);
  }

  // 3) vencidos con gracia agotada → suspendidos
  const { data: aSuspender } = await admin
    .from("suscripciones")
    .select("id")
    .eq("estado", "vencido")
    .lt("fecha_vencimiento", ISO(hace3));
  for (const s of aSuspender ?? []) {
    await admin.from("suscripciones").update({ estado: "suspendido" }).eq("id", s.id);
  }

  revalidatePath("/admin");
  redirect("/admin");
}
