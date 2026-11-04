import { redirect } from "next/navigation";
import { obtenerContexto } from "@/lib/pos";
import {
  abrirCajaAction,
  cerrarCajaAction,
  registrarMovimientoAction,
} from "@/app/acciones-pos";
import { formatoSoles } from "@/lib/utilidades";

export const dynamic = "force-dynamic";

export default async function Caja() {
  const ctx = await obtenerContexto();
  if (!ctx.usuario) redirect("/login");
  if (!ctx.negocioId) redirect("/app");
  const { supabase } = ctx;

  const { data: cajaRaw } = await supabase
    .from("caja_sesiones")
    .select("*")
    .eq("negocio_id", ctx.negocioId)
    .eq("user_id", ctx.usuario.id)
    .eq("estado", "abierta")
    .maybeSingle();

  const caja = cajaRaw as null | { id: string; monto_apertura: number; creado_en: string };
  const hoyISO = new Date().toISOString().slice(0, 10);

  const [{ data: ventasHoy }, { data: movimientos }] = await Promise.all([
    caja
      ? supabase
          .from("ventas")
          .select("id, total, estado, metodo_pago, serie, numero, creado_en")
          .eq("caja_id", caja.id)
          .gte("creado_en", new Date(caja.creado_en).toISOString())
          .order("creado_en", { ascending: false })
      : Promise.resolve({ data: [] }),
    caja
      ? supabase
          .from("caja_movimientos")
          .select("*")
          .eq("caja_id", caja.id)
          .order("creado_en", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  type VentaFila = { id: string; total: number; estado: string; metodo_pago: string; serie: string; numero: number };
  const ventas = (ventasHoy ?? []) as unknown as VentaFila[];
  const movs = (movimientos ?? []) as unknown as { tipo: string; concepto: string; monto: number }[];

  const ventasOk = ventas.filter((v) => v.estado === "completada");
  const efectivoVentas = ventasOk.filter((v) => v.metodo_pago === "efectivo");
  const ingresosMov = movs.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + Number(m.monto), 0);
  const egresosMov = movs.filter((m) => m.tipo === "egreso").reduce((s, m) => s + Number(m.monto), 0);

  const apertura = Number(caja?.monto_apertura ?? 0);
  const esperado = apertura + efectivoVentas.reduce((s, v) => s + Number(v.total), 0) + ingresosMov - egresosMov;
  const totalVentasPeriodo = ventasOk.reduce((s, v) => s + Number(v.total), 0);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <h2 className="text-xl font-bold">💰 Caja</h2>

      {!caja ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold">Apertura de caja</h3>
          <p className="mb-3 text-sm text-slate-600">Inicia con el efectivo que pones en la gaveta.</p>
          <form action={abrirCajaAction} className="flex items-end gap-3">
            <div>
              <label className="block text-xs text-slate-500">Monto de apertura S/</label>
              <input type="number" name="monto" step="0.01" min="0" defaultValue={0}
                className="mt-1 w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <button className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
              Abrir caja
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2">
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-2 font-semibold">Caja abierta</h3>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500">Apertura</dt><dd>{formatoSoles(apertura)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Ventas totales</dt><dd>{formatoSoles(totalVentasPeriodo)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Ventas en efectivo</dt><dd>{formatoSoles(efectivoVentas.reduce((s, v) => s + Number(v.total), 0))}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Ingresos extra</dt><dd className="text-emerald-600">+{formatoSoles(ingresosMov)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Egresos</dt><dd className="text-rose-600">−{formatoSoles(egresosMov)}</dd></div>
                <div className="flex justify-between border-t border-slate-100 pt-1.5 font-bold"><dt>Esperado en gaveta</dt><dd>{formatoSoles(esperado)}</dd></div>
              </dl>
              <form action={cerrarCajaAction} className="mt-4 flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-slate-500">Cuenta cuando cierras S/</label>
                  <input type="number" name="monto" step="0.01" min="0" required
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <button className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
                  Cerrar caja
                </button>
              </form>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-2 font-semibold">Movimiento</h3>
              <form action={registrarMovimientoAction} className="space-y-2">
                <select name="tipo" defaultValue="ingreso" className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                  <option value="ingreso">Ingreso (entra dinero)</option>
                  <option value="egreso">Egreso (sale dinero)</option>
                </select>
                <input name="concepto" required placeholder="Concepto: ejemplo compra de bolsas"
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                <input type="number" name="monto" step="0.01" min="0.01" required placeholder="Monto S/"
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                <button className="w-full rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
                  Registrar movimiento
                </button>
              </form>
              {movs.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm">
                  {movs.map((m, i) => (
                    <li key={i} className="flex justify-between gap-2 text-xs">
                      <span>{m.tipo === "ingreso" ? "➕" : "➖"} {m.concepto}</span>
                      <span className={m.tipo === "ingreso" ? "text-emerald-600" : "text-rose-600"}>
                        {formatoSoles(Number(m.monto))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <h3 className="border-b border-slate-100 px-5 py-3 font-semibold">Ventas de esta sesión ({ventasOk.length})</h3>
            {ventas.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">Nada vendido todavía en esta sesión.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-5 py-2 font-semibold">Boleta</th>
                    <th className="px-5 py-2 font-semibold">Método</th>
                    <th className="px-5 py-2 font-semibold">Total</th>
                    <th className="px-5 py-2 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ventas.map((v, i) => (
                    <tr key={i}>
                      <td className="px-5 py-2"><a href={`/app/comprobante/${v.id}`} className="text-indigo-600 hover:underline" target="_blank">{v.serie}-{String(v.numero).padStart(5, "0")}</a></td>
                      <td className="px-5 py-2">{v.metodo_pago}</td>
                      <td className="px-5 py-2 font-medium">{formatoSoles(Number(v.total))}</td>
                      <td className="px-5 py-2 text-xs">{v.estado === "anulada" ? "❌ anulada" : "✅"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
