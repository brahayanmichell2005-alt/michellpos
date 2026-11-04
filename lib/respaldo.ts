import "server-only";
import { crearClienteAdmin } from "@/lib/supabase/admin";

/* ==========================================================
   Respaldo plano diario → Supabase Storage (bucket privado)
   Tablas clave: negocios, perfiles, suscripciones, planes,
   pagos, auditoria_admin, categorias, productos,
   clientes_finales, caja_* y ventas/detalle.
   Nota: NO incluye credenciales sensibles (SUNAT cifrado).
   ========================================================== */

const TABLAS = [
  "negocios",
  "perfiles",
  "suscripciones",
  "planes",
  "pagos",
  "auditoria_admin",
  "categorias",
  "productos",
  "clientes_finales",
  "caja_sesiones",
  "caja_movimientos",
  "ventas",
  "detalle_venta",
  "comprobantes_sunat",
  "registro_sistema",
] as const;

export interface ResultadoRespaldo {
  ok: boolean;
  archivo?: string;
  filas?: Record<string, number>;
  error?: string;
}

export async function generarRespaldo(): Promise<ResultadoRespaldo> {
  const admin = crearClienteAdmin();
  const ahora = new Date();
  const nombre = `backup-${ahora.toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;

  const filas: Record<string, unknown[]> = {};
  for (const t of TABLAS) {
    const { data, error } = await admin.from(t).select("*");
    if (error) return { ok: false, error: `falló ${t}: ${error.message}` };
    filas[t] = data ?? [];
  }

  const conteos: Record<string, number> = {};
  for (const t of TABLAS) conteos[t] = (filas[t] as unknown[]).length;

  const contenido = JSON.stringify(
    {
      generado_en: ahora.toISOString(),
      proyecto: "michellpos",
      tablas: filas,
    },
    null,
    1
  );

  const url = `https://qkkoidpwtvrhpfdfexsv.supabase.co/storage/v1/object/backups/${nombre}`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      "x-upsert": "true",
    },
    body: contenido,
  });
  if (!r.ok) {
    const txt = await r.text();
    return { ok: false, error: `subida falló (${r.status}): ${txt.slice(0, 200)}` };
  }

  await admin.from("registro_sistema").insert({
    evento: "backup",
    detalle: `${nombre} · ${Object.values(conteos).reduce((s, n) => s + n, 0)} filas`,
  });

  return { ok: true, archivo: nombre, filas: conteos };
}

/** URL firmada (1 h) para descarga del respaldo con rol de servicio. */
export async function urlFirmadaRespaldo(archivo: string): Promise<string | null> {
  const r = await fetch(
    `https://qkkoidpwtvrhpfdfexsv.supabase.co/storage/v1/object/sign/backups/${archivo}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: 3600 }),
    }
  );
  if (!r.ok) return null;
  const j = (await r.json()) as { signedURL?: string };
  if (!j.signedURL) return null;
  return `https://qkkoidpwtvrhpfdfexsv.supabase.co/storage/v1${j.signedURL}`;
}
