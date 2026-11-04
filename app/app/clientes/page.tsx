import { redirect } from "next/navigation";
import { obtenerContexto } from "@/lib/pos";
import { guardarClienteAction, eliminarClienteAction } from "@/app/acciones-pos";

export const dynamic = "force-dynamic";

export default async function Clientes({
  searchParams,
}: {
  searchParams: Promise<{ editar?: string }>;
}) {
  const ctx = await obtenerContexto();
  if (!ctx.usuario) redirect("/login");
  if (!ctx.negocioId) redirect("/app");

  const { editar } = await searchParams;
  const { supabase } = ctx;

  const [{ data: raw }, { data: editando }] = await Promise.all([
    supabase.from("clientes_finales").select("*").eq("negocio_id", ctx.negocioId).order("nombre"),
    editar
      ? supabase.from("clientes_finales").select("*").eq("id", editar).eq("negocio_id", ctx.negocioId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const clientes = (raw ?? []) as unknown as {
    id: string; tipo_doc: string; documento: string; nombre: string; creado_en: string;
  }[];
  const clienteEditar = (editando?.data ?? null) as null | {
    id: string; tipo_doc: string; documento: string; nombre: string;
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <h2 className="text-xl font-bold">👥 Clientes finales</h2>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 font-semibold">
          {clienteEditar ? "✏️ Editar cliente" : "➕ Nuevo cliente"}
        </h3>
        <form action={guardarClienteAction} className="grid gap-3 sm:grid-cols-4">
          <input type="hidden" name="id" value={clienteEditar?.id ?? ""} />
          <select name="tipoDoc" defaultValue={clienteEditar?.tipo_doc ?? "DNI"}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="DNI">DNI</option>
            <option value="RUC">RUC</option>
          </select>
          <input name="documento" required placeholder="Número de documento"
            defaultValue={clienteEditar?.documento ?? ""}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input name="nombre" required placeholder="Nombre o razón social"
            defaultValue={clienteEditar?.nombre ?? ""}
            className="sm:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <div className="flex items-end gap-2 sm:col-span-4">
            <button className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
              {clienteEditar ? "Guardar" : "Agregar"}
            </button>
            {clienteEditar && (
              <a href="/app/clientes" className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600">Cancelar</a>
            )}
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h3 className="border-b border-slate-100 px-5 py-3 font-semibold">{clientes.length} clientes</h3>
        {clientes.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">Aún no tienes clientes finales.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-5 py-2 font-semibold">Documento</th>
                <th className="px-5 py-2 font-semibold">Nombre</th>
                <th className="px-5 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {clientes.map((c) => (
                <tr key={c.id}>
                  <td className="px-5 py-2">
                    <span className="mr-1 text-xs text-slate-400">{c.tipo_doc}</span>
                    {c.documento}
                  </td>
                  <td className="px-5 py-2 font-medium">{c.nombre}</td>
                  <td className="px-5 py-2">
                    <div className="flex items-center gap-2 text-xs">
                      <a href={`/app/clientes?editar=${c.id}`} className="text-indigo-600 hover:underline">editar</a>
                      {ctx.esAdminNegocio && (
                        <form action={eliminarClienteAction}>
                          <input type="hidden" name="id" value={c.id} />
                          <button className="text-rose-600 hover:underline">borrar</button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
