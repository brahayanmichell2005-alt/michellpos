import { crearClienteServidor } from "./supabase/servidor";
import type { User } from "@supabase/supabase-js";

/** Usuario autenticado actual (o null). */
export async function obtenerSesion(): Promise<{
  supabase: Awaited<ReturnType<typeof crearClienteServidor>>;
  usuario: User | null;
}> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.auth.getUser();
  return { supabase, usuario: data.user ?? null };
}
