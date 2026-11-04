"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { obtenerContexto } from "@/lib/pos";
import {
  cifrar,
  cargarCredenciales,
  enviarComprobante,
  consultarTicket,
  p12APem,
} from "@/lib/sunat";
import { generarXmlFirmado } from "@/lib/sunat-xml";
import type { CredencialesSunat } from "@/lib/sunat";

/* ============== Guardar configuración SUNAT (dueño) ============== */

export async function guardarSunatAction(formData: FormData) {
  const ctx = await obtenerContexto();
  if (!ctx.usuario || !ctx.negocioId || ctx.perfil?.rol !== "dueño") redirect("/app");

  const entorno = String(formData.get("entorno") ?? "desactivado");
  const auto = String(formData.get("auto") ?? "") === "on";
  if (!["desactivado", "beta", "produccion"].includes(entorno)) redirect("/app/sunat");

  const patch: Record<string, unknown> = { sunat_estado: entorno, sunat_auto: auto };
  patch.sunat_sol_usuario = String(formData.get("solUsuario") ?? "").trim() || null;
  patch.sunat_direccion_sunat = String(formData.get("razon") ?? "").trim() || null;

  // se reenvían solo si no vienen vacíos (no borramos lo existente)
  const solClave = String(formData.get("solClave") ?? "").trim();
  const clientSecret = String(formData.get("clientSecret") ?? "").trim();
  if (solClave) patch.sunat_sol_clave_enc = cifrar(solClave);
  if (clientSecret) patch.sunat_client_secret_enc = cifrar(clientSecret);

  await ctx.supabase.from("negocios").update(patch).eq("id", ctx.negocioId);

  // Certificado .p12 opcional: se parsea y se guardan clave+cert cifrados
  const p12 = formData.get("certificado") as File | null;
  const certClave = String(formData.get("certClave") ?? "").trim();
  if (p12 && p12.size > 0) {
    const base64 = Buffer.from(await p12.arrayBuffer()).toString("base64");
    try {
      const { clavePem, certPem } = p12APem(base64, certClave);
      await ctx.supabase
        .from("negocios")
        .update({
          sunat_certificado_enc: cifrar(certPem),
          sunat_cert_clave_enc: cifrar(clavePem),
        })
        .eq("id", ctx.negocioId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "certificado inválido";
      redirect(`/app/sunat?error=${encodeURIComponent(msg)}`);
    }
  }

  if (entorno !== "desactivado") {
    const cred = await cargarCredenciales(ctx.negocioId);
    if (!cred) {
      redirect(
        `/app/sunat?error=${encodeURIComponent("Faltan datos: usuario SOL, contraseña, secreto o certificado .p12")}`
      );
    }
  }

  revalidatePath("/app/sunat");
  redirect("/app/sunat");
}

/* ============== Enviar una venta a SUNAT ============== */

async function contextoVenta(ventaId: string) {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return { supabase, usuarioId: data.user.id };
}

export async function enviarSunatAction(formData: FormData) {
  const ventaId = String(formData.get("ventaId") ?? "");
  if (!ventaId) redirect("/app");

  const supabase = await crearClienteServidor();
  const { data: ventaRaw } = await supabase
    .from("ventas")
    .select("id, negocio_id, serie, numero, subtotal, total, metodo_pago, estado, creado_en, cliente_id")
    .eq("id", ventaId)
    .maybeSingle();
  const venta = ventaRaw as unknown as null | {
    id: string; negocio_id: string; serie: string; numero: number; total: number;
    estado: string; creado_en: string; cliente_id: string | null;
  };
  if (!venta || venta.estado !== "completada") redirect("/app");

  const { data: negocioRaw } = await supabase
    .from("negocios")
    .select("nombre, ruc, sunat_estado")
    .eq("id", venta.negocio_id)
    .maybeSingle();
  const negocio = negocioRaw as unknown as null | { nombre: string; ruc: string | null; sunat_estado: string };
  if (!negocio?.ruc || negocio.sunat_estado === "desactivado") {
    redirect(`/app/comprobante/${ventaId}?sunat=${encodeURIComponent("Configura SUNAT primero en el módulo SUNAT")}`);
  }

  // Detalles de la venta
  const { data: detalleRaw } = await supabase
    .from("detalle_venta")
    .select("nombre, cantidad, precio_unitario")
    .eq("venta_id", venta.id);
  const items = (detalleRaw ?? []) as unknown as { nombre: string; cantidad: number; precio_unitario: number }[];

  // Cliente final si lo hubo
  let cliente: { tipoDoc: "1" | "6"; documento: string; nombre: string } | null = null;
  if (venta.cliente_id) {
    const { data: c } = await supabase
      .from("clientes_finales")
      .select("tipo_doc, documento, nombre")
      .eq("id", venta.cliente_id)
      .maybeSingle();
    const cf = c as unknown as { tipo_doc: string; documento: string; nombre: string } | null;
    if (cf) cliente = {
      tipoDoc: cf.tipo_doc === "RUC" ? "6" : "1",
      documento: cf.documento,
      nombre: cf.nombre,
    };
  }

  const cred = await cargarCredenciales(venta.negocio_id);
  if (!cred) {
    redirect(`/app/comprobante/${ventaId}?sunat=${encodeURIComponent("SUNAT no está configurado completo para este negocio")}`);
  }

  // registro de intento
  const { data: registroPrevio } = await supabase
    .from("comprobantes_sunat")
    .select("id, intentos")
    .eq("negocio_id", venta.negocio_id)
    .eq("serie", venta.serie)
    .eq("numero", venta.numero)
    .eq("tipo_doc", "03")
    .maybeSingle();
  let registroId: string;
  if (registroPrevio) {
    registroId = (registroPrevio as { id: string }).id;
    await supabase
      .from("comprobantes_sunat")
      .update({ intentos: (registroPrevio as { intentos: number }).intentos + 1, estado: "enviado", actualizado_en: new Date().toISOString() })
      .eq("id", registroId);
  } else {
    const { data: nuevo } = await supabase
      .from("comprobantes_sunat")
      .insert({
        negocio_id: venta.negocio_id,
        venta_id: venta.id,
        tipo_doc: "03",
        serie: venta.serie,
        numero: venta.numero,
        estado: "enviado",
      })
      .select("id")
      .single();
    registroId = (nuevo as { id: string }).id;
  }

  try {
    const tipoDocReq = "03" as const; // boleta (factura 01: FASE 6)
    const { zipB64 } = await generarXmlFirmado(
      {
        ruc: negocio.ruc,
        razonSocial: negocio.nombre,
        tipoDoc: tipoDocReq,
        serie: venta.serie,
        correlativo: venta.numero,
        emisionISO: venta.creado_en.slice(0, 10),
        cliente,
        items: items
          .filter((i) => i.nombre && i.nombre !== "")
          .map((i) => ({ nombre: i.nombre, cantidad: Number(i.cantidad), precio: Number(i.precio_unitario) })),
      },
      cred.certPem,
      cred.clavePem
    );

    const resp = await enviarComprobante(cred as CredencialesSunat, negocio.sunat_estado, zipB64, venta.serie, venta.numero);

    if (resp.ok && resp.ticket) {
      // consultar el estado ya mismo (SUNAT suele tardar 1s)
      const consulta = await consultarTicket(cred as CredencialesSunat, negocio.sunat_estado, resp.ticket);
      const estado = consulta.codigo === "0" ? "aceptado" : consulta.codigo === "98" ? "enviado" : "rechazado";
      await supabase
        .from("comprobantes_sunat")
        .update({ estado, ticket: resp.ticket, mensaje: consulta.mensaje ?? resp.mensaje ?? null, actualizado_en: new Date().toISOString() })
        .eq("id", registroId);
      redirect(`/app/comprobante/${ventaId}?sunat=${encodeURIComponent("Ticket " + resp.ticket + " — " + (consulta.mensaje ?? ""))}`);
    }
    await supabase
      .from("comprobantes_sunat")
      .update({ estado: "error", mensaje: resp.mensaje ?? "sin respuesta SUNAT", ticket: resp.ticket ?? null, actualizado_en: new Date().toISOString() })
      .eq("id", registroId);
    redirect(`/app/comprobante/${ventaId}?sunat=${encodeURIComponent(resp.mensaje ?? "Error SUNAT")}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido al enviar";
    await supabase
      .from("comprobantes_sunat")
      .update({ estado: "error", mensaje: msg.slice(0, 500), actualizado_en: new Date().toISOString() })
      .eq("id", registroId);
    redirect(`/app/comprobante/${ventaId}?sunat=${encodeURIComponent(msg)}`);
  }
}
