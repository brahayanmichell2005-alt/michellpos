import { crearClienteServidor } from "./supabase/servidor";
import type { User } from "@supabase/supabase-js";
import type { Negocio, Perfil, Rol, Suscripcion } from "./tipos";

export interface ContextoPOS {
  supabase: Awaited<ReturnType<typeof crearClienteServidor>>;
  usuario: User | null;
  perfil: Perfil | null;
  negocio: Negocio | null;
  suscripcion: Suscripcion | null;
  suspendido: boolean;
  /** Modo superadmin viendo otro negocio: /app?negocio=id */
  negocioId: string | null;
  esAdminNegocio: boolean; // dueño o administrador
}

export async function obtenerContexto(): Promise<ContextoPOS> {
  const supabase = await crearClienteServidor();
  const { data: ses } = await supabase.auth.getUser();
  const usuario = ses.user ?? null;

  if (!usuario) {
    return {
      supabase, usuario: null, perfil: null, negocio: null, suscripcion: null,
      suspendido: false, negocioId: null, esAdminNegocio: false,
    };
  }

  const { data: esSuperadmin } = await supabase
    .from("superadmins")
    .select("user_id")
    .eq("user_id", usuario.id)
    .maybeSingle();

  // El modo superadmin lo resuelve cada página con searchParams; aquí es null.
  let perfil: Perfil | null = null;
  const { data: perfilRaw } = await supabase
    .from("perfiles")
    .select("*")
    .eq("user_id", usuario.id)
    .maybeSingle();
  if (perfilRaw) perfil = perfilRaw as unknown as Perfil;

  let negocio: Negocio | null = null;
  let suscripcion: Suscripcion | null = null;

  if (perfil) {
    const [{ data: negocioRaw }, { data: subs }] = await Promise.all([
      supabase.from("negocios").select("*").eq("id", perfil.negocio_id).maybeSingle(),
      supabase
        .from("suscripciones")
        .select("*")
        .eq("negocio_id", perfil.negocio_id)
        .order("creado_en", { ascending: false })
        .limit(1),
    ]);
    if (negocioRaw) negocio = negocioRaw as unknown as Negocio;
    suscripcion = (subs?.[0] ?? null) as Suscripcion | null;
  }

  return {
    supabase,
    usuario,
    perfil,
    negocio,
    suscripcion,
    suspendido: suscripcion?.estado === "suspendido",
    negocioId: perfil?.negocio_id ?? null,
    esAdminNegocio: perfil?.rol === "dueño" || perfil?.rol === "administrador",
  };
}

/** Módulos visibles por rol. */
export function moduloPermitido(rol: Rol | null, mod: string): boolean {
  if (!rol) return false;
  if (rol === "dueño") return true;
  if (rol === "administrador") return mod !== "usuarios" && mod !== "config" && mod !== "pagos" && mod !== "sunat";
  // cajero: solo vender y caja
  return mod === "venta" || mod === "caja" || mod === "inicio" || (rol === "cajero" && mod === "clientes");
}

export const inicioDeHoy = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
};

export const inicioDeDia = (n: number) => {
  const d = new Date(Date.now() - n * 86_400_000);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
};
