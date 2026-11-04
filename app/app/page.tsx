import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerContexto, inicioDeHoy } from "@/lib/pos";
import { formatoSoles } from "@/lib/utilidades";

export const dynamic = "force-dynamic";

export default async function InicioPOS() {
  const ctx = await obtenerContexto();
  if (!ctx.usuario) redirect("/login");
  if (!ctx.perfil || !ctx.negocioId) redirect("/admin");

  const { supabase } = ctx;

  const [{ data: ventasHoyRaw }, { data: cajaRaw }, { data: stockBajoRaw }, { count: totalProds }] =
    await Promise.all([
      supabase
        .from("ventas")
        .select("total, estado")
        .eq("negocio_id", ctx.negocioId)
        .gte("creado_en", inicioDeHoy()),
      supabase
        .from("caja_sesiones")
        .select("id, monto_apertura")
        .eq("negocio_id", ctx.negocioId)
        .eq("user_id", ctx.usuario.id)
        .eq("estado", "abierta")
        .maybeSingle(),
      supabase
        .from("productos")
        .select("id, nombre, stock, alerta_stock")
        .eq("negocio_id", ctx.negocioId)
        .eq("activo", true)
        .lte("stock", 999999)
        .order("stock", { ascending: true })
        .limit(5),
      supabase
        .from("productos")
        .select("id", { count: "exact" })
        .eq("negocio_id", ctx.negocioId)
        .eq("activo", true),
    ]);

  const ventasHoy = (ventasHoyRaw ?? []) as unknown as { total: number; estado: string }[];
  const hoyOk = ventasHoy.filter((v) => v.estado === "completada");
  const totalHoy = hoyOk.reduce((s, v) => s + Number(v.total), 0);
  const caja = cajaRaw as null | { id: string; monto_apertura: number };

  const stockBajo = ((stockBajoRaw ?? []) as unknown as { id: string; nombre: string; stock: number; alerta_stock: number }[])
    .filter((p) => p.stock <= p.alerta_stock);

  const rol = ctx.perfil!.rol;
  const esAdmin = ctx.esAdminNegocio;

  const tarjetas = [
    { titulo: "Ventas de hoy", valor: formatoSoles(totalHoy), detalle: `${hoyOk.length} operaciones` },
    {
      titulo: "Tu caja",
      valor: caja ? "Abierta" : "Cerrada",
      detalle: caja ? `apertura ${formatoSoles(Number(caja.monto_apertura))}` : "ábrela antes de vender",
    },
    { titulo: "Productos", valor: String(totalProds ?? 0), detalle: "en tu catálogo" },
    { titulo: "Stock bajo", valor: String(stockBajo.length), detalle: "alertas por revisar" },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      {ctx.suscripcion?.estado === "en_prueba" && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
          🎁 Prueba gratis: registra todo lo que quieras para conocer el sistema.
        </div>
      )}
      {ctx.suscripcion?.estado === "vencido" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          ⚠️ Periodo de gracia: tu plan venció. Paga para evitar la suspensión.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">
          ¡Hola! 👋 {ctx.perfil?.nombre}
        </h2>
        {rol === "cajero" || true ? (
          <Link
            href="/app/venta"
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-indigo-500"
          >
            🛒 Nueva venta
          </Link>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tarjetas.map((t) => (
          <article key={t.titulo} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-600">{t.titulo}</p>
            <p className="mt-1 text-2xl font-bold">{t.valor}</p>
            <p className="text-xs text-slate-500">{t.detalle}</p>
          </article>
        ))}
      </div>

      {stockBajo.length > 0 && esAdmin && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-bold text-amber-800">⚠️ Productos con stock bajo</h3>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {stockBajo.map((p) => (
              <li key={p.id}>
                {p.nombre} — quedan <strong>{Number(p.stock)}</strong> (alerta ≤ {Number(p.alerta_stock)})
              </li>
            ))}
          </ul>
          <Link href="/app/productos" className="mt-2 inline-block text-xs font-semibold text-amber-800 underline">
            Ir a productos →
          </Link>
        </section>
      )}

      {rol === "cajero" && (
        <p className="text-sm text-slate-500">
          Como cajero puedes <Link href="/app/venta" className="font-semibold text-indigo-600">vender</Link> y manejar{" "}
          <Link href="/app/caja" className="font-semibold text-indigo-600">tu caja</Link>.
        </p>
      )}
    </div>
  );
}
