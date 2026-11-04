"use server";

import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { crearClienteAdmin } from "@/lib/supabase/admin";

const DIAS_PRUEBA = 15;

/** "2026-11-19" → "19 de noviembre de 2026" */
function formatoLargo(iso: string) {
  const f = new Date(`${iso}T12:00:00`);
  return f.toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" });
}

function error(ruta: string, mensaje: string): never {
  redirect(`${ruta}?error=${encodeURIComponent(mensaje)}`);
}

const correoValido = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/** Registro: crea usuario + negocio + perfil (dueño) + suscripción en prueba. */
export async function registrarse(formData: FormData) {
  const nombreNegocio = String(formData.get("nombreNegocio") ?? "").trim();
  const ruc = String(formData.get("ruc") ?? "").trim();
  const telefono = String(formData.get("telefono") ?? "").trim();
  const nombre = String(formData.get("nombre") ?? "").trim();
  const correo = String(formData.get("correo") ?? "").trim().toLowerCase();
  const contrasena = String(formData.get("contrasena") ?? "");

  if (!nombreNegocio || !nombre || !correo || !contrasena) {
    error("/registro", "Completa todos los campos obligatorios.");
  }
  if (!correoValido(correo)) {
    error("/registro", "Ingresa un correo electrónico válido.");
  }
  if (contrasena.length < 6) {
    error("/registro", "La contraseña debe tener al menos 6 caracteres.");
  }

  // La clave service_role vive SOLO en el servidor.
  const admin = crearClienteAdmin();

  // 1) Crear el usuario en Supabase Auth (verificado para que pueda entrar ya).
  const { data: creado, error: errorAlCrear } = await admin.auth.admin.createUser({
    email: correo,
    password: contrasena,
    email_confirm: true,
    user_metadata: { nombre },
  });
  if (errorAlCrear || !creado.user) {
    const m = errorAlCrear?.message ?? "";
    const mensaje = /already been registered|already registered/i.test(m)
      ? "Ese correo ya tiene una cuenta creada. Entra con 'Iniciar sesión'."
      : "No se pudo crear la cuenta: " + m;
    error("/registro", mensaje);
  }
  const idUsuario = creado.user.id;

  // 2) Crear el negocio.
  const { data: negocio, error: errorNegocio } = await admin
    .from("negocios")
    .insert({
      nombre: nombreNegocio,
      ruc: ruc || null,
      correo,
      telefono: telefono || null,
    })
    .select("id")
    .single();
  if (errorNegocio || !negocio) {
    error("/registro", "No se pudo crear el negocio, contacta con soporte.");
  }

  // 3) Plan por defecto: Básico.
  const { data: plan } = await admin
    .from("planes")
    .select("id")
    .eq("nombre", "Básico")
    .eq("activo", true)
    .maybeSingle();

  // 4) Perfil con rol dueño.
  const { error: errorPerfil } = await admin.from("perfiles").insert({
    user_id: idUsuario,
    negocio_id: negocio.id,
    rol: "dueño",
    nombre,
  });
  if (errorPerfil) {
    error("/registro", "No se pudo crear el perfil, contacta con soporte.");
  }

  // 5) Suscripción en prueba por 15 días.
  const hoy = new Date();
  const finPrueba = new Date(hoy.getTime() + DIAS_PRUEBA * 86_400_000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const { error: errorSuscripcion } = await admin.from("suscripciones").insert({
    negocio_id: negocio.id,
    plan_id: plan?.id ?? null,
    estado: "en_prueba",
    inicio_prueba: iso(hoy),
    fin_prueba: iso(finPrueba),
  });
  if (errorSuscripcion) {
    error("/registro", "No se pudo crear la suscripción, contacta con soporte.");
  }

  // 5b) Correo de bienvenida (si RESEND_API_KEY está configurada).
  try {
    const { avisarBienvenida } = await import("@/lib/avisos");
    await avisarBienvenida(
      correo,
      nombre,
      nombreNegocio,
      formatoLargo(iso(finPrueba))
    );
  } catch {
    // el correo de bienvenida no debe bloquear el registro
  }

  // 6) Iniciar sesión automáticamente y entrar al POS.
  const supabase = await crearClienteServidor();
  await supabase.auth.signInWithPassword({ email: correo, password: contrasena });
  redirect("/app");
}

/** Login: sesión según rol (superadmin → /admin, cliente → /app). */
export async function iniciarSesion(formData: FormData) {
  const correo = String(formData.get("correo") ?? "").trim().toLowerCase();
  const contrasena = String(formData.get("contrasena") ?? "");

  if (!correo || !contrasena) {
    error("/login", "Completa el correo y la contraseña.");
  }

  const supabase = await crearClienteServidor();
  const { error: errorLogin } = await supabase.auth.signInWithPassword({
    email: correo,
    password: contrasena,
  });
  if (errorLogin) {
    error("/login", "Correo o contraseña incorrectos.");
  }

  const { data } = await supabase.auth.getUser();
  const usuario = data.user;
  if (usuario) {
    const { data: superadmin } = await supabase
      .from("superadmins")
      .select("user_id")
      .eq("user_id", usuario.id)
      .maybeSingle();
    if (superadmin) redirect("/admin");
  }
  redirect("/app");
}

/** Cierro sesión y voy al login. */
export async function cerrarSesion() {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  redirect("/login");
}
