"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { obtenerContexto } from "@/lib/pos";

/* ============== Helpers ============== */

async function contextoSesion() {
  const ctx = await obtenerContexto();
  if (!ctx.usuario) redirect("/login");
  return ctx;
}

function res(err: boolean, mensaje: string) {
  return { ok: !err, mensaje };
}

/* ============== Venta ============== */

interface ItemVenta {
  id: string;
  nombre: string;
  cantidad: number;
  precio: number;
}

export interface EntradaVenta {
  negocioId: string;
  items: ItemVenta[];
  subtotal: number;
  descuento: number;
  total: number;
  metodo: "efectivo" | "yape" | "plin" | "tarjeta";
  montoRecibido?: number;
  cliente?: { tipoDoc: "DNI" | "RUC"; documento: string; nombre: string } | null;
}

/** Registra una venta (RPC atómica: correlativo + items + stock). */
export async function crearVentaAction(datos: EntradaVenta) {
  const ctx = await contextoSesion();
  if (!ctx.usuario) return res(true, "Sesión expirada");
  if (datos.items.length === 0) return res(true, "El carrito está vacío");
  if (datos.total < 0) return res(true, "Montos inválidos");

  // el superadmin puede vender en modo admin; el resto vende su negocio
  const negocioId = datos.negocioId ?? ctx.negocioId;
  if (!negocioId) return res(true, "Negocio no indicado");

  // requiere caja abierta (el superadmin vendiendo otra cuenta no necesita)
  let cajaId: string | null = null;
  if (ctx.negocioId === negocioId) {
    const { data: caja } = await ctx.supabase
      .from("caja_sesiones")
      .select("id")
      .eq("negocio_id", negocioId)
      .eq("user_id", ctx.usuario.id)
      .eq("estado", "abierta")
      .maybeSingle();
    if (!caja) return res(true, "Debes abrir tu caja antes de vender.");

    // cliente final opcional
    let clienteId: string | null = null;
    if (datos.cliente && datos.cliente.documento) {
      const { data: existente } = await ctx.supabase
        .from("clientes_finales")
        .select("id")
        .eq("negocio_id", negocioId)
        .eq("documento", datos.cliente.documento)
        .maybeSingle();
      if (existente) clienteId = (existente as { id: string }).id;
      else {
        const { data: nuevo } = await ctx.supabase
          .from("clientes_finales")
          .insert({
            negocio_id: negocioId,
            tipo_doc: datos.cliente.tipoDoc,
            documento: datos.cliente.documento,
            nombre: datos.cliente.nombre || datos.cliente.documento,
          })
          .select("id")
          .single();
        if (nuevo) clienteId = (nuevo as { id: string }).id;
      }
    }

    cajaId = (caja as { id: string }).id;

    const { data: resultado, error } = await ctx.supabase.rpc("crear_venta", {
      p_negocio: negocioId,
      p_user: ctx.usuario.id,
      p_cliente: clienteId,
      p_subtotal: datos.subtotal,
      p_descuento: datos.descuento,
      p_total: datos.total,
      p_metodo: datos.metodo,
      p_monto_recibido: datos.metodo === "efectivo" ? (datos.montoRecibido ?? datos.total) : null,
      p_caja: cajaId,
      p_items: datos.items,
    });

    if (error) return res(true, "No se pudo registrar la venta: " + error.message);
    revalidatePath("/app");
    revalidatePath("/app/caja");
    const r = (resultado ?? []) as unknown as { id: string; serie: string; numero: number }[];
    return { ...res(false, "Vendida"), ventaId: r[0]?.id ?? null };
  }
  return res(true, "No autorizado");
}

/* ============== Caja ============== */

export async function abrirCajaAction(formData: FormData) {
  const ctx = await contextoSesion();
  if (!ctx.usuario || !ctx.negocioId) redirect("/login");
  const monto = Number(formData.get("monto") ?? 0);
  if (monto < 0) redirect("/app/caja");

  const { data: abierta } = await ctx.supabase
    .from("caja_sesiones")
    .select("id")
    .eq("negocio_id", ctx.negocioId)
    .eq("user_id", ctx.usuario.id)
    .eq("estado", "abierta")
    .maybeSingle();
  if (abierta) redirect("/app/caja");

  await ctx.supabase.from("caja_sesiones").insert({
    negocio_id: ctx.negocioId,
    user_id: ctx.usuario.id,
    monto_apertura: monto,
    estado: "abierta",
  });
  revalidatePath("/app/caja");
  redirect("/app/caja");
}

export async function registrarMovimientoAction(formData: FormData) {
  const ctx = await contextoSesion();
  if (!ctx.usuario || !ctx.negocioId) redirect("/login");
  const tipo = String(formData.get("tipo") ?? "");
  const concepto = String(formData.get("concepto") ?? "").trim();
  const monto = Number(formData.get("monto") ?? 0);
  if (!concepto || monto <= 0 || !["ingreso", "egreso"].includes(tipo)) redirect("/app/caja");

  const { data: caja } = await ctx.supabase
    .from("caja_sesiones")
    .select("id")
    .eq("negocio_id", ctx.negocioId)
    .eq("user_id", ctx.usuario.id)
    .eq("estado", "abierta")
    .maybeSingle();
  if (!caja) redirect("/app/caja");

  await ctx.supabase.from("caja_movimientos").insert({
    negocio_id: ctx.negocioId,
    caja_id: (caja as { id: string }).id,
    tipo,
    concepto,
    monto,
    user_id: ctx.usuario.id,
  });
  revalidatePath("/app/caja");
  redirect("/app/caja");
}

export async function cerrarCajaAction(formData: FormData) {
  const ctx = await contextoSesion();
  if (!ctx.usuario || !ctx.negocioId) redirect("/login");
  const montoCierre = Number(formData.get("monto") ?? 0);
  if (montoCierre < 0) redirect("/app/caja");

  const { data: caja } = await ctx.supabase
    .from("caja_sesiones")
    .select("id")
    .eq("negocio_id", ctx.negocioId)
    .eq("user_id", ctx.usuario.id)
    .eq("estado", "abierta")
    .maybeSingle();
  if (!caja) redirect("/app/caja");

  await ctx.supabase
    .from("caja_sesiones")
    .update({ estado: "cerrada", monto_cierre: montoCierre, cerrado_en: new Date().toISOString() })
    .eq("id", (caja as { id: string }).id);
  revalidatePath("/app/caja");
  redirect("/app/caja");
}

/* ============== Anular venta ============== */

export async function anularVentaAction(formData: FormData) {
  const ctx = await contextoSesion();
  if (!ctx.usuario) redirect("/login");
  const ventaId = String(formData.get("ventaId") ?? "");
  if (!ventaId) redirect("/app");

  const { error } = await ctx.supabase.rpc("anular_venta", {
    p_venta: ventaId,
    p_user: ctx.usuario.id,
  });
  revalidatePath("/app/reportes");
  revalidatePath("/app/caja");
  if (error) redirect("/app/reportes");
  redirect("/app/reportes");
}

/* ============== Productos y categorías ============== */

export async function guardarCategoriaAction(formData: FormData) {
  const ctx = await contextoSesion();
  if (!ctx.usuario || !ctx.negocioId) redirect("/login");
  if (!ctx.esAdminNegocio) redirect("/app");
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) redirect("/app/productos");
  await ctx.supabase.from("categorias").insert({ negocio_id: ctx.negocioId, nombre });
  revalidatePath("/app/productos");
  redirect("/app/productos");
}

export async function eliminarCategoriaAction(formData: FormData) {
  const ctx = await contextoSesion();
  if (!ctx.usuario || !ctx.negocioId || !ctx.esAdminNegocio) redirect("/app");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/app/productos");
  await ctx.supabase.from("categorias").delete().eq("id", id).eq("negocio_id", ctx.negocioId);
  revalidatePath("/app/productos");
  redirect("/app/productos");
}

export async function guardarProductoAction(formData: FormData) {
  const ctx = await contextoSesion();
  if (!ctx.usuario || !ctx.negocioId) redirect("/login");
  if (!ctx.esAdminNegocio) redirect("/app");

  const id = String(formData.get("id") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  const categoria = String(formData.get("categoria") ?? "");
  const precioCompra = Number(formData.get("precioCompra") ?? 0);
  const precioVenta = Number(formData.get("precioVenta") ?? 0);
  const stock = Number(formData.get("stock") ?? 0);
  const alerta = Number(formData.get("alerta") ?? 5);
  const codigo = String(formData.get("codigo") ?? "").trim();

  if (!nombre || precioVenta < 0 || stock < 0) redirect("/app/productos");

  const fila = {
    nombre,
    categoria_id: categoria || null,
    precio_compra: precioCompra,
    precio_venta: precioVenta,
    stock,
    alerta_stock: alerta,
    codigo_barras: codigo || null,
  };

  if (id) {
    await ctx.supabase.from("productos").update(fila).eq("id", id).eq("negocio_id", ctx.negocioId);
  } else {
    await ctx.supabase.from("productos").insert({ ...fila, negocio_id: ctx.negocioId });
  }
  revalidatePath("/app/productos");
  redirect("/app/productos");
}

export async function eliminarProductoAction(formData: FormData) {
  const ctx = await contextoSesion();
  if (!ctx.usuario || !ctx.negocioId || !ctx.esAdminNegocio) redirect("/app");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/app/productos");
  await ctx.supabase.from("productos").delete().eq("id", id).eq("negocio_id", ctx.negocioId);
  revalidatePath("/app/productos");
  redirect("/app/productos");
}

/* ============== Clientes finales ============== */

export async function guardarClienteAction(formData: FormData) {
  const ctx = await contextoSesion();
  if (!ctx.usuario || !ctx.negocioId) redirect("/login");
  const id = String(formData.get("id") ?? "");
  const tipoDoc = String(formData.get("tipoDoc") ?? "DNI");
  const documento = String(formData.get("documento") ?? "").trim();
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!documento || !nombre) redirect("/app/clientes");

  if (id) {
    await ctx.supabase
      .from("clientes_finales")
      .update({ tipo_doc: tipoDoc, documento, nombre })
      .eq("id", id)
      .eq("negocio_id", ctx.negocioId);
  } else {
    await ctx.supabase
      .from("clientes_finales")
      .insert({ negocio_id: ctx.negocioId, tipo_doc: tipoDoc, documento, nombre });
  }
  revalidatePath("/app/clientes");
  redirect("/app/clientes");
}

export async function eliminarClienteAction(formData: FormData) {
  const ctx = await contextoSesion();
  if (!ctx.usuario || !ctx.negocioId || !ctx.esAdminNegocio) redirect("/app");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/app/clientes");
  await ctx.supabase.from("clientes_finales").delete().eq("id", id).eq("negocio_id", ctx.negocioId);
  revalidatePath("/app/clientes");
  redirect("/app/clientes");
}

/* ============== Configuración ============== */

export async function guardarConfigAction(formData: FormData) {
  const ctx = await contextoSesion();
  if (!ctx.usuario || !ctx.negocioId) redirect("/login");
  if (ctx.perfil?.rol !== "dueño") redirect("/app");

  await ctx.supabase
    .from("negocios")
    .update({
      nombre: String(formData.get("nombre") ?? "").trim() || ctx.negocio!.nombre,
      ruc: String(formData.get("ruc") ?? "").trim() || null,
      correo: String(formData.get("correo") ?? "").trim() || null,
      telefono: String(formData.get("telefono") ?? "").trim() || null,
      direccion: String(formData.get("direccion") ?? "").trim() || null,
      logo_url: String(formData.get("logoUrl") ?? "").trim() || null,
      serie_boleta: String(formData.get("serie") ?? "").trim() || "B001",
    })
    .eq("id", ctx.negocioId);
  revalidatePath("/app/config");
  redirect("/app/config");
}

/* ============== Usuarios del negocio ============== */

export async function crearUsuarioAction(formData: FormData) {
  const ctx = await contextoSesion();
  if (!ctx.usuario || !ctx.negocioId || ctx.perfil?.rol !== "dueño") redirect("/app");

  const nombre = String(formData.get("nombre") ?? "").trim();
  const correo = String(formData.get("correo") ?? "").trim().toLowerCase();
  const contrasena = String(formData.get("contrasena") ?? "");
  const rol = String(formData.get("rol") ?? "cajero");
  if (!nombre || !correo || contrasena.length < 6) redirect("/app/usuarios");
  if (!["administrador", "cajero"].includes(rol)) redirect("/app/usuarios");

  // Límite del plan
  const { count } = await ctx.supabase
    .from("perfiles")
    .select("user_id", { count: "exact" })
    .eq("negocio_id", ctx.negocioId);

  const maxUsuarios = ctx.suscripcion?.plan_id
    ? (await ctx.supabase.from("planes").select("max_usuarios").eq("id", ctx.suscripcion.plan_id).maybeSingle()).data?.max_usuarios ?? 5
    : 5;

  if ((count ?? 0) >= maxUsuarios) redirect("/app/usuarios");

  const admin = crearClienteAdmin();
  const { data: creado, error } = await admin.auth.admin.createUser({
    email: correo,
    password: contrasena,
    email_confirm: true,
    user_metadata: { nombre },
  });
  if (error || !creado.user) redirect("/app/usuarios");

  await admin.from("perfiles").insert({
    user_id: creado.user.id,
    negocio_id: ctx.negocioId,
    rol,
    nombre,
  });
  revalidatePath("/app/usuarios");
  redirect("/app/usuarios");
}

export async function eliminarUsuarioAction(formData: FormData) {
  const ctx = await contextoSesion();
  if (!ctx.usuario || !ctx.negocioId || ctx.perfil?.rol !== "dueño") redirect("/app");
  const userId = String(formData.get("userId") ?? "");
  if (!userId || userId === ctx.usuario.id) redirect("/app/usuarios");

  const admin = crearClienteAdmin();
  await admin.auth.admin.deleteUser(userId); // borra el perfil por cascada
  revalidatePath("/app/usuarios");
  redirect("/app/usuarios");
}
