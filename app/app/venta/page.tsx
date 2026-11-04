import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerContexto, inicioDeHoy } from "@/lib/pos";
import PanelVenta from "@/components/panel-venta";

export const dynamic = "force-dynamic";

export default async function Vender() {
  const ctx = await obtenerContexto();
  if (!ctx.usuario) redirect("/login");
  if (ctx.usuario && !ctx.perfil && !ctx.negocioId) redirect("/admin");
  if (!ctx.negocioId) redirect("/app");

  const { supabase } = ctx;

  // ¿Caja abierta para mí?
  const { data: cajaAbierta } = await supabase
    .from("caja_sesiones")
    .select("id")
    .eq("negocio_id", ctx.negocioId)
    .eq("user_id", ctx.usuario.id)
    .eq("estado", "abierta")
    .maybeSingle();

  const [{ data: productosRaw }, { data: categoriasRaw }] = await Promise.all([
    supabase
      .from("productos")
      .select("id, nombre, precio_venta, stock, alerta_stock, categorias ( nombre )")
      .eq("negocio_id", ctx.negocioId)
      .eq("activo", true)
      .order("nombre", { ascending: true }),
    supabase.from("categorias").select("id, nombre").eq("negocio_id", ctx.negocioId).order("nombre"),
  ]);

  const productos = (productosRaw ?? []) as unknown as {
    id: string; nombre: string; precio_venta: number; stock: number; alerta_stock: number;
    categorias: { nombre: string } | null;
  }[];
  const categorias = categoriasRaw ?? [];

  const sinCaja = !cajaAbierta;
  const bloqueadaPorEstado = ctx.suscripcion?.estado === "suspendido" || ctx.suscripcion?.estado === "vencido";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      {bloqueadaPorEstado && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          No puedes vender: tu plan está {ctx.suscripcion?.estado}. Reactiva tu suscripción para volver a vender.
        </div>
      )}
      {sinCaja && !bloqueadaPorEstado && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>Debes abrir tu caja antes de vender.</span>
          <Link href="/app/caja" className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500">
            Abrir caja
          </Link>
        </div>
      )}
      <PanelVenta productos={productos} categorias={categorias} negocioId={ctx.negocioId} deshabilitada={!!sinCaja || !!bloqueadaPorEstado} />
    </div>
  );
}
