import "server-only";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const claveServicio = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Cliente con SERVICE_ROLE para tareas de servidor: ignora RLS.
 * SÓLO usar en código de servidor (Server Actions, Route Handlers).
 * NUNCA importar desde un componente cliente.
 */
export function crearClienteAdmin() {
  if (!url || !claveServicio) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY en .env.local (solo servidor, nunca en el navegador)"
    );
  }

  return createClient(url, claveServicio, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
