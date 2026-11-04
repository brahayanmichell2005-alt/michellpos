import { redirect } from "next/navigation";
import { obtenerContexto } from "@/lib/pos";
import { guardarConfigAction } from "@/app/acciones-pos";

export const dynamic = "force-dynamic";

export default async function Config() {
  const ctx = await obtenerContexto();
  if (!ctx.usuario) redirect("/login");
  if (!ctx.negocioId || ctx.perfil?.rol !== "dueño") redirect("/app");

  const negocio = ctx.negocio as unknown as {
    nombre: string; ruc: string | null; correo: string | null; telefono: string | null;
    direccion: string | null; logo_url: string | null; serie_boleta: string;
  };

  const campo = (label: string, name: string, value: string, props = "") => (
    <div>
      <label className="mb-1 block text-xs text-slate-500">{label}</label>
      <input name={name} defaultValue={value} className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm ${props}`} />
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <h2 className="text-xl font-bold">⚙️ Configuración del negocio</h2>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <form action={guardarConfigAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {campo("Nombre del negocio", "nombre", negocio.nombre)}
            {campo("RUC", "ruc", negocio.ruc ?? "")}
            {campo("Correo", "correo", negocio.correo ?? "")}
            {campo("Teléfono", "telefono", negocio.telefono ?? "")}
            <div className="sm:col-span-2">
              {campo("Dirección", "direccion", negocio.direccion ?? "")}
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Logo (URL de imagen)</label>
              <input name="logoUrl" defaultValue={negocio.logo_url ?? ""} placeholder="https://..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              {negocio.logo_url && (
                <img src={negocio.logo_url} alt="logo" className="mt-2 h-16 w-16 rounded-lg object-cover ring-1 ring-slate-200" />
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Serie de boletas</label>
              <input name="serie" defaultValue={negocio.serie_boleta} placeholder="B001" maxLength={10}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <p className="mt-1 text-xs text-slate-400">
                Cada venta sale con esta serie + correlativo automático. (Factura electrónica: Fase 5.)
              </p>
            </div>
          </div>
          <button className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
            Guardar configuración
          </button>
        </form>
      </section>
    </div>
  );
}
