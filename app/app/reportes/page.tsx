import { redirect } from "next/navigation";
import { obtenerContexto, inicioDeDia } from "@/lib/pos";
import { anularVentaAction } from "@/app/acciones-pos";
import { formatoFecha, formatoSoles } from "@/lib/utilidades";

export const dynamic = "force-dynamic";

export default async function Reportes() {
  const ctx = await obtenerContexto();
  if (!ctx.usuario) redirect("/login");
  if (!ctx.negocioId || !ctx.esAdminNegocio) redirect("/app");
  const { supabase } = ctx;

  const hace29ISO = inicioDeDia(29);

  const [{ data: ventasRaw }, { data: detalleRaw }, { data: perfilesRaw }] = await Promise.all([
    supabase
      .from("ventas")
      .select("id, user_id, serie, numero, total, metodo_pago, estado, creado_en")
      .eq("negocio_id", ctx.negocioId)
      .gte("creado_en", hace29ISO)
      .order("creado_en", { ascending: false })
      .limit(500),
    supabase
      .from("detalle_venta")
      .select("nombre, cantidad, precio_unitario, ventas!inner ( estado, creado_en )")
      .eq("negocio_id", ctx.negocioId)
      .gte("creado_en", hace29ISO)
      .limit(1000),
    supabase.from("perfiles").select("user_id, nombre").eq("negocio_id", ctx.negocioId),
  ]);

  type VentaUI = {
    id: string; user_id: string; serie: string; numero: number; total: number;
    metodo_pago: string; estado: string; creado_en: string;
  };
  const ventas = (ventasRaw ?? []) as unknown as VentaUI[];
  const dventas = (detalleRaw ?? []) as unknown as {
    nombre: string; cantidad: number; precio_unitario: number;
    ventas: { estado: string };
  }[];
  const perfiles = (perfilesRaw ?? []) as unknown as { user_id: string; nombre: string }[];

  // ---- ventas del día (hora de Perú, -05:00)
  const hoyPeru = new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
  const hoy = ventas.filter((v) => v.creado_en.slice(0, 10) >= hoyPeru && v.estado === "completada");
  const ventasHoyTotal = hoy.reduce((s, v) => s + Number(v.total), 0);

  // ---- por día (últimos 14)
  const porDia = new Map<string, { total: number; n: number }>();
  for (const v of ventas) {
    if (v.estado !== "completada") continue;
    const dia = v.creado_en.slice(0, 10);
    const cur = porDia.get(dia) ?? { total: 0, n: 0 };
    porDia.set(dia, { total: cur.total + Number(v.total), n: cur.n + 1 });
  }
  const diasLista = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    return { dia: d, ...(porDia.get(d) ?? { total: 0, n: 0 }) };
  });

  // ---- top productos
  const porProducto = new Map<string, { cantidad: number; total: number }>();
  for (const d of dventas) {
    if (d.ventas?.estado !== "completada") continue;
    const cur = porProducto.get(d.nombre) ?? { cantidad: 0, total: 0 };
    porProducto.set(d.nombre, {
      cantidad: cur.cantidad + Number(d.cantidad),
      total: cur.total + Number(d.cantidad) * Number(d.precio_unitario),
    });
  }
  const topProductos = [...porProducto.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 8);

  // ---- por cajero
  const nombreDe = (userId: string) => perfiles.find((p) => p.user_id === userId)?.nombre ?? "Usuario";
  const porCajero = new Map<string, { nombre: string; total: number; n: number }>();
  for (const v of ventas) {
    if (v.estado !== "completada") continue;
    const cur = porCajero.get(v.user_id) ?? { nombre: nombreDe(v.user_id), total: 0, n: 0 };
    porCajero.set(v.user_id, { ...cur, total: cur.total + Number(v.total), n: cur.n + 1 });
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <h2 className="text-xl font-bold">📊 Reportes</h2>

      <section className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-600">Ventas de hoy</p>
          <p className="mt-1 text-2xl font-bold">{formatoSoles(ventasHoyTotal)}</p>
          <p className="text-xs text-slate-500">{hoy.length} operaciones</p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-600">Ventas 30 días</p>
          <p className="mt-1 text-2xl font-bold">
            {formatoSoles(ventas.filter((v) => v.estado === "completada").reduce((s, v) => s + Number(v.total), 0))}
          </p>
          <p className="text-xs text-slate-500">
            {ventas.filter((v) => v.estado === "completada").length} completadas · {ventas.filter((v) => v.estado === "anulada").length} anuladas
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-600">Yape / Plin / Tarjeta (30d)</p>
          <p className="mt-1 text-2xl font-bold">
            {formatoSoles(
              ventas
                .filter((v) => v.estado === "completada" && ["yape", "plin", "tarjeta"].includes(v.metodo_pago))
                .reduce((s, v) => s + Number(v.total), 0)
            )}
          </p>
          <p className="text-xs text-slate-500">Efectivo: {formatoSoles(ventas.filter((v) => v.estado === "completada" && v.metodo_pago === "efectivo").reduce((s, v) => s + Number(v.total), 0))}</p>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h3 className="border-b border-slate-100 px-5 py-3 font-semibold">Ventas por día (últimos 14 días)</h3>
        {(() => {
          const maxTotal = Math.max(...diasLista.map((d) => d.total), 0);
          return (
            <div className="space-y-2 px-5 py-4">
              {diasLista.map((d) => (
                <div key={d.dia} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0 text-xs text-slate-500">{formatoFecha(d.dia)}</span>
                  <div className="h-5 min-w-0 flex-1 overflow-hidden rounded-md bg-slate-100">
                    <div
                      className="flex h-full items-center justify-end rounded-md bg-indigo-500 px-1.5 text-[11px] font-semibold text-white transition-all"
                      style={{ width: maxTotal > 0 ? `${Math.max((d.total / maxTotal) * 100, d.total > 0 ? 8 : 0)}%` : "0%" }}
                    >
                      {d.total > 0 ? formatoSoles(d.total) : ""}
                    </div>
                  </div>
                  <span className="w-16 shrink-0 text-right text-xs text-slate-500">{d.n} venta{d.n === 1 ? "" : "s"}</span>
                </div>
              ))}
            </div>
          );
        })()}
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr><th className="px-5 py-2 font-semibold">Día</th><th className="px-5 py-2 font-semibold">Ventas</th><th className="px-5 py-2 font-semibold">Total</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {diasLista.map((d) => (
              <tr key={d.dia}>
                <td className="px-5 py-2">{formatoFecha(d.dia)}</td>
                <td className="px-5 py-2">{d.n}</td>
                <td className="px-5 py-2 font-medium">{formatoSoles(d.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h3 className="border-b border-slate-100 px-5 py-3 font-semibold">Productos más vendidos (30 días)</h3>
        {topProductos.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">Sin ventas todavía — añade productos y registra ventas.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr><th className="px-5 py-2 font-semibold">Producto</th><th className="px-5 py-2 font-semibold">Cantidad</th><th className="px-5 py-2 font-semibold">Total</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topProductos.map(([nombre, d]) => (
                <tr key={nombre}>
                  <td className="px-5 py-2 font-medium">{nombre}</td>
                  <td className="px-5 py-2">{Number(d.cantidad)}</td>
                  <td className="px-5 py-2 font-medium">{formatoSoles(d.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h3 className="border-b border-slate-100 px-5 py-3 font-semibold">Por cajero (30 días)</h3>
        {porCajero.size === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">Sin ventas todavía, no se puede asignar ventas a cajero.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr><th className="px-5 py-2 font-semibold">Cajero</th><th className="px-5 py-2 font-semibold">Ventas</th><th className="px-5 py-2 font-semibold">Total</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...porCajero.values()].sort((a, b) => b.total - a.total).map((c, i) => (
                <tr key={i}>
                  <td className="px-5 py-2 font-medium">{c.nombre}</td>
                  <td className="px-5 py-2">{c.n}</td>
                  <td className="px-5 py-2 font-medium">{formatoSoles(c.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h3 className="border-b border-slate-100 px-5 py-3 font-semibold">Últimas ventas</h3>
        {ventas.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">Sin ventas registradas aún.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-5 py-2 font-semibold">Boleta</th>
                  <th className="px-5 py-2 font-semibold">Fecha</th>
                  <th className="px-5 py-2 font-semibold">Total</th>
                  <th className="px-5 py-2 font-semibold">Método</th>
                  <th className="px-5 py-2 font-semibold">Cajero</th>
                  <th className="px-5 py-2 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ventas.slice(0, 30).map((v) => (
                  <tr key={v.id} className={v.estado === "anulada" ? "opacity-50" : ""}>
                    <td className="px-5 py-2"><a href={`/app/comprobante/${v.id}`} className="text-indigo-600 hover:underline" target="_blank">🖨️ {v.serie}-{String(v.numero).padStart(5, "0")}</a></td>
                    <td className="px-5 py-2">
                      {new Date(v.creado_en).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-5 py-2 font-medium">{formatoSoles(Number(v.total))}</td>
                    <td className="px-5 py-2">{v.metodo_pago}</td>
                    <td className="px-5 py-2">{nombreDe(v.user_id)}</td>
                    <td className="px-5 py-2">
                      {v.estado === "completada" ? (
                        <form action={anularVentaAction}>
                          <input type="hidden" name="ventaId" value={v.id} />
                          <button className="text-xs font-semibold text-rose-600 hover:underline">anular</button>
                        </form>
                      ) : (
                        <span className="text-xs">❌ anulada</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
