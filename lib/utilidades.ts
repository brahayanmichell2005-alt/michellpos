import type { EstadoSuscripcion } from "./tipos";

/** Días restantes según el estado; negativo significa "venció hace X días". */
export function diasSegunEstado(
  estado: EstadoSuscripcion,
  inicioPrueba: string | null,
  finPrueba: string | null,
  fechaVencimiento: string | null
): number | null {
  const fecha = estado === "en_prueba" ? finPrueba : fechaVencimiento;
  if (!fecha) return null;
  const fin = new Date(fecha + "T23:59:59").getTime();
  return Math.ceil((fin - Date.now()) / 86_400_000);
}

export const textoEstado: Record<EstadoSuscripcion, string> = {
  en_prueba: "En prueba",
  activo: "Activo",
  vencido: "Vencido",
  suspendido: "Suspendido",
};

export const colorEstado: Record<EstadoSuscripcion, string> = {
  en_prueba: "bg-blue-50 text-blue-700 ring-blue-600/20",
  activo: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  vencido: "bg-amber-50 text-amber-700 ring-amber-600/20",
  suspendido: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

export function formatoSoles(monto: number): string {
  return `S/ ${Number(monto).toFixed(2)}`;
}

export function formatoFecha(iso: string | null): string {
  if (!iso) return "—";
  // Acepta "YYYY-MM-DD" y también "YYYY-MM-DD HH:MM:SS+00" (timestamptz).
  const d = /[T\s]/.test(iso) ? new Date(iso) : new Date(iso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
