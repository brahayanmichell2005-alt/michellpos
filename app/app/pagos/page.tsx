import { redirect } from "next/navigation";
import { obtenerContexto } from "@/lib/pos";
import { declararPagoAction } from "@/app/acciones-pagos";
import { colorEstado, formatoFecha, formatoSoles, textoEstado } from "@/lib/utilidades";
import type { EstadoSuscripcion, Plan } from "@/lib/tipos";

export const dynamic = "force-dynamic";

const NOMBRES_METODO: Record<string, string> = {
  efectivo: "💵 Efectivo",
  yape: "🟪 Yape",
  plin: "🟩 Plin",
  transferencia: "🏦 Transferencia",
};

const ESTILO_ESTADO: Record<string, string> = {
  pendiente: "bg-amber-50 text-amber-700 ring-amber-200",
  aprobado: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  rechazado: "bg-rose-50 text-rose-700 ring-rose-200",
};

export default async function Pagos() {
  const ctx = await obtenerContexto();
  if (!ctx.usuario) redirect("/login");
  if (!ctx.negocioId) redirect("/app");
  if (ctx.perfil?.rol !== "dueño") redirect("/app");

  const { supabase } = ctx;

  const [{ data: planesRaw }, { data: pagosRaw }] = await Promise.all([
    supabase.from("planes").select("*").eq("activo", true).order("precio_mensual"),
    supabase
      .from("pagos")
      .select("id, plan_id, monto, metodo, referencia, fecha, estado, notas_admin, revisado_en")
      .eq("negocio_id", ctx.negocioId)
      .order("creado_en", { ascending: false })
      .limit(50),
  ]);

  const planes = (planesRaw ?? []) as unknown as Plan[];
  const pagos = (pagosRaw ?? []) as unknown as {
    id: string; plan_id: string | null; monto: number; metodo: string;
    referencia: string | null; fecha: string; estado: string; notas_admin: string | null;
  }[];

  const nombrePlan = (id: string | null) => planes.find((p) => p.id === id)?.nombre ?? "—";
  const planActual = planes.find((p) => p.id === ctx.suscripcion?.plan_id);
  const hayPendiente = pagos.some((p) => p.estado === "pendiente");

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <h2 className="text-xl font-bold">💳 Mi suscripción</h2>

      <section className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-600">Plan actual</p>
          <p className="mt-1 text-2xl font-bold">{nombrePlan(ctx.suscripcion?.plan_id ?? null)}</p>
          {planActual && (
            <p className="text-xs text-slate-500">{formatoSoles(Number(planActual.precio_mensual))} al mes</p>
          )}
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-600">Estado</p>
          <p className="mt-1">
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ring-1 ${colorEstado[(ctx.suscripcion?.estado ?? "en_prueba") as EstadoSuscripcion]}`}>
              {textoEstado[(ctx.suscripcion?.estado ?? "en_prueba") as EstadoSuscripcion]}
            </span>
          </p>
        </article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-600">Vence / fin de prueba</p>
          <p className="mt-1 text-2xl font-bold">
            {formatoFecha(ctx.suscripcion?.fecha_vencimiento ?? ctx.suscripcion?.fin_prueba ?? null)}
          </p>
        </article>
      </section>

      {ctx.suscripcion?.estado === "vencido" && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠️ Tu plan está <strong>vencido</strong>. Declara tu pago a continuación y en cuanto se confirme vuelve a estar activo (tienes 3 días de gracia antes de la suspensión).
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 font-semibold">
          1. Paga por Yape, Plin, transferencia o efectivo al dueño de michellpos
        </h3>
        <p className="mb-4 text-sm text-slate-600">
          Manda el pago a los contactos que te dio el dueño de michellpos y <strong>guarda el número de operación</strong>. Luego declara el pago aquí:
        </p>

        {hayPendiente ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            ⏳ Ya tienes un pago declarado <strong>pendiente de revisión</strong>. Espera la confirmación del dueño; si le pasaste mal el número de operación, avísale para que lo rechace y lo declares de nuevo.
          </div>
        ) : (
          <form action={declararPagoAction} className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-slate-500">Plan que pagas</label>
              <select name="planId" required defaultValue={ctx.suscripcion?.plan_id ?? ""}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {planes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} — S/ {Number(p.precio_mensual).toFixed(2)}/mes
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Método</label>
              <select name="metodo" required defaultValue="yape"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="yape">Yape</option>
                <option value="plin">Plin</option>
                <option value="transferencia">Transferencia bancaria</option>
                <option value="efectivo">Efectivo (te lo recogió el dueño)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Monto S/</label>
              <input type="number" name="monto" step="0.01" min="0.01" required
                defaultValue={planActual ? Number(planActual.precio_mensual) : ""}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Nº de operación / referencia (opcional)</label>
              <input name="referencia" placeholder="ej. 00012345"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Fecha del pago</label>
              <input type="date" name="fecha" required defaultValue={new Date().toISOString().slice(0, 10)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div className="flex items-end">
              <button className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
                Declarar pago
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h3 className="border-b border-slate-100 px-5 py-3 font-semibold">
          2. Historial de pagos ({pagos.length})
        </h3>
        {pagos.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">
            Sin pagos declarados todavía. Estás en período de prueba gratis.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-5 py-2 font-semibold">Fecha</th>
                <th className="px-5 py-2 font-semibold">Plan</th>
                <th className="px-5 py-2 font-semibold">Monto</th>
                <th className="px-5 py-2 font-semibold">Método</th>
                <th className="px-5 py-2 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagos.map((p) => (
                <tr key={p.id}>
                  <td className="px-5 py-2">{formatoFecha(p.fecha)}</td>
                  <td className="px-5 py-2">{nombrePlan(p.plan_id)}</td>
                  <td className="px-5 py-2 font-medium">{formatoSoles(Number(p.monto))}</td>
                  <td className="px-5 py-2">{NOMBRES_METODO[p.metodo] ?? p.metodo}</td>
                  <td className="px-5 py-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${ESTILO_ESTADO[p.estado]}`}>
                      {p.estado === "aprobado" ? "✓ " : p.estado === "rechazado" ? "✕ " : "⏳ "}
                      {p.estado}
                    </span>
                    {p.estado === "rechazado" && p.notas_admin && (
                      <p className="mt-1 text-xs text-slate-500">Motivo: {p.notas_admin}</p>
                    )}
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
