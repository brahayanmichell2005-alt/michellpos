import { redirect } from "next/navigation";
import { obtenerContexto } from "@/lib/pos";
import {
  guardarProductoAction,
  guardarCategoriaAction,
  eliminarCategoriaAction,
  eliminarProductoAction,
} from "@/app/acciones-pos";
import { formatoSoles } from "@/lib/utilidades";

export const dynamic = "force-dynamic";

export default async function Productos({
  searchParams,
}: {
  searchParams: Promise<{ editar?: string; q?: string }>;
}) {
  const ctx = await obtenerContexto();
  if (!ctx.usuario) redirect("/login");
  if (!ctx.negocioId || !ctx.esAdminNegocio) redirect("/app");

  const { editar, q } = await searchParams;
  const { supabase } = ctx;

  const [{ data:jandro_cats }, { data: prodsRaw }, { data: editando }] = await Promise.all([
    supabase.from("categorias").select("*").eq("negocio_id", ctx.negocioId).order("nombre"),
    supabase
      .from("productos")
      .select("*, categorias ( nombre )")
      .eq("negocio_id", ctx.negocioId)
      .order("nombre"),
    editar
      ? supabase.from("productos").select("*").eq("id", editar).eq("negocio_id", ctx.negocioId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const categorias = (jandro_cats ?? []) as unknown as { id: string; nombre: string }[];
  const productos = (prodsRaw ?? []) as unknown as {
    id: string; nombre: string; precio_compra: number; precio_venta: number; stock: number;
    alerta_stock: number; codigo_barras: string | null; activo: boolean;
    categorias: { nombre: string } | null;
  }[];
  const filtro = (q ?? "").toLowerCase();
  const lista = productos.filter((p) => !filtro || p.nombre.toLowerCase().includes(filtro));

  const prodEditar = (editando?.data ?? null) as null | {
    id: string; nombre: string; categoria_id: string | null; precio_compra: number;
    precio_venta: number; stock: number; alerta_stock: number; codigo_barras: string | null;
  };

  const bajoStock = productos.filter((p) => p.stock <= p.alerta_stock);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">📦 Productos</h2>
        <p className="text-sm text-slate-500">{productos.length} productos · {bajoStock.length} con alerta de stock</p>
      </div>

      {(prodEditar ?? null) === null && (
        <div className="text-sm">
          <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" open={bajoStock.length > 0}>
            <summary className="font-semibold">Categorías ({categorias.length})</summary>
            <div className="mt-3 space-y-2">
              <form action={guardarCategoriaAction} className="flex gap-2">
                <input name="nombre" required placeholder="Nueva categoría: ejemplo, Gaseosas"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <button className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500">Añadir</button>
              </form>
              <ul className="flex flex-wrap gap-2">
                {categorias.map((c) => (
                  <li key={c.id} className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs">
                    {c.nombre}
                    <form action={eliminarCategoriaAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className="ml-1 text-slate-400 hover:text-rose-600" title="Eliminar categoría">✕</button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 font-semibold">{prodEditar ? `✏️ Editar producto` : "➕ Nuevo producto"}</h3>
        <form action={guardarProductoAction} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="id" value={prodEditar?.id ?? ""} />
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-slate-500">Nombre</label>
            <input name="nombre" required defaultValue={prodEditar?.nombre ?? ""}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Categoria</label>
            <select name="categoria" defaultValue={prodEditar?.categoria_id ?? ""}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">— Sin categoría —</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Código de barras</label>
            <input name="codigo" defaultValue={prodEditar?.codigo_barras ?? ""}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Precio de compra S/</label>
            <input type="number" step="0.01" min="0" name="precioCompra" defaultValue={prodEditar?.precio_compra ?? 0}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Precio de venta S/</label>
            <input type="number" step="0.01" min="0" name="precioVenta" required defaultValue={prodEditar?.precio_venta ?? ""}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Stock</label>
            <input type="number" step="0.01" min="0" name="stock" required defaultValue={prodEditar?.stock ?? ""}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Alerta si stock &#8804; </label>
            <input type="number" step="0.01" min="0" name="alerta" defaultValue={prodEditar?.alerta_stock ?? 5}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <button className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
              {prodEditar ? "Guardar cambios" : "Crear producto"}
            </button>
            {prodEditar && (
              <a href="/app/productos" className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-600">
                Cancelar
              </a>
            )}
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="font-semibold">Catálogo</h3>
          <form>
            <input name="q" defaultValue={q ?? ""} placeholder="Buscar product..."
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          </form>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-4 py-2 font-semibold">Producto</th>
                <th className="px-4 py-2 font-semibold">Categoría</th>
                <th className="px-4 py-2 font-semibold">Venta</th>
                <th className="px-4 py-2 font-semibold">Stock</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.map((p) => (
                <tr key={p.id} className={p.stock <= p.alerta_stock ? "bg-amber-50/60" : ""}>
                  <td className="px-4 py-2 font-medium">{p.nombre}</td>
                  <td className="px-4 py-2 text-slate-500">{p.categorias?.nombre ?? "—"}</td>
                  <td className="px-4 py-2">{formatoSoles(Number(p.precio_venta))}</td>
                  <td className={`px-4 py-2 font-medium ${p.stock <= p.alerta_stock ? "text-amber-700" : ""}`}>
                    {Number(p.stock)}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2 text-xs">
                      <a href={`/app/productos?editar=${p.id}`} className="text-indigo-600 hover:underline">editar</a>
                      <form action={eliminarProductoAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <button className="text-rose-600 hover:underline">borrar</button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {lista.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Sin productos todavía.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
