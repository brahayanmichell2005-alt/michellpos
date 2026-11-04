import "server-only";
import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/**
 * Cliente de Supabase para el SERVIDOR, con la sesión del usuario actual.
 * Usa la clave pública (anon): respeta RLS para el usuario conectado.
 */
export async function crearClienteServidor() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clavePublica = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !clavePublica) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local"
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, clavePublica, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (lista: { name: string; value: string; options?: CookieOptions }[]) => {
        try {
          lista.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Se ignora: en Server Components no se pueden escribir cookies,
          // el middleware se encarga de refrescar la sesión.
        }
      },
    },
  });
}
