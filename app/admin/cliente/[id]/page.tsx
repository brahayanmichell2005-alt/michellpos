import { redirect } from "next/navigation";
import Link from "next/link";
import Encabezado from "@/components/encabezado";
import { obtenerSesion } from "@/lib/sesion";
import {
  colorEstado,
  diasSegunEstado,
  formatoFecha,
  formatoSoles,
  textoEstado,
} from "@/lib/utilidades";
import { cambiarEstadoSuscripcion } from "@/app/acciones-admin";
import { aprobarPagoAction, rechazarPagoAction } from "@/app/acciones-pagos";
import type { EstadoSuscripcion, Perfil, Plan, Suscripcion } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function DetalleCliente({ params }: { params: Promise<{ id: string }> }) {
  const { id: negocioId } = await params;
  const { supabase, usuario } = await obtenerSesion();
  if (!usuario) redirect("/login");

  const { data: esSuperadmin } = await supabase
    .from("superadmins")
    .select("user_id")
    .eq("user_id", usuario.id)
    .maybeSingle();
  if (!esSuperadmin) redirect("/app");

  const [{ data: negocio }, { data: perfiles }, { data: subs }, { data: pagos }, { data: auditoria }] =
    await Promise.all([
      supabase.from("negocios").select("*").eq("id", negocioId).maybeSingle(),
      supabase.from("perfiles").select("user_id, rol, nombre, creado_en").eq("negocio_id", negocioId),
      supabase
        .from("suscripciones")
        .select("*, planes ( nombre )")
        .eq("negocio_id", negocioId)
        .order("creado_en", { ascending: false }),
      supabase
        .from("pagos")
        .select("id, plan_id, monto, metodo, referencia, fecha, estado, notas_admin, planes ( nombre )")
        .eq("negocio_id", negocioId)
        .order("fecha", { ascending: false }),
      supabase
        .from("auditoria_admin")
        .select("accion, fecha")
        .eq("negocio_id", negocioId)
        .order("fecha", { ascending: false }),
    ]);

  const cliente = negocio as null | { id: string; nombre: string; ruc: string | null; correo: string | null; telefono: string | null; creado_en: string };
  if (!cliente) {
    return (
      <main className="min-h-screen">
        <Encabezado titulo="Cliente no encontrado" />
        <div className="mx-auto max-w-3xl px-6 py-10">
          <Link href="/admin" className="text-sm font-semibold text-indigo-600 hover:underline">
            ← Volver al panel
          </Link>
        </div>
      </main>
    );
  }

  const suscripciones = (subs ?? []) as unknown as (Suscripcion & { planes?: Pick<Plan, "nombre"> | null })[];
  const actual = suscripciones[0] ?? null;
  const estado: EstadoSuscripcion = actual?.estado ?? "en_prueba";
  const dias = diasSegunEstado(estado, actual?.inicio_prueba ?? null, actual?.fin_prueba ?? null, actual?.fecha_vencimiento ?? null);
  const usuarios = (perfiles ?? []) as unknown as Pick<Perfil, "user_id" | "rol" | "nombre" | "creado_en">[];
  const pagosLista = (pagos ?? []) as unknown as {
    id: string; plan_id: string | null; monto: number; metodo: string; referencia: string | null;
    fecha: string; estado: string; notas_admin: string | null;
    planes?: { nombre: string } | null;
  }[];
  const pagosPendientes = pagosLista.filter((p) => p.estado === "pendiente");

  return (
    <main className="min-h-screen pb-10">
      <Encabezado titulo={cliente.nombre} descripcion={`Detalle del cliente · registrado el ${formatoFecha(cliente.creado_en)}`} />

      <div className="mx-auto mt-6 max-w-4xl space-y-6 px-6">
        <Link href="/admin" className="inline-block text-sm font-semibold text-indigo-600 hover:underline">
          ← Volver al panel
        </Link>

        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${colorEstado[estado]}`}>
            {textoEstado[estado]}
          </span>
          <span className="text-sm text-slate-600">
            Plan actual: <strong>{actual?.planes?.nombre ?? "—"}</strong> ·{" "}
            {estado === "en_prueba" ? `prueba hasta ${formatoFecha(actual?.fin_prueba ?? null)}` : `vence el ${formatoFecha(actual?.fecha_vencimiento ?? null)}`}
          </span>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-base font-bold">Acciones</h2>
          <div className="flex flex-wrap gap-2">
            <form action={cambiarEstadoSuscripcion}>
              <input type="hidden" name="negocioId" value={cliente.id} />
              <input type="hidden" name="accion" value="activar" />
              <button className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
                ✅ Activar (+30 días)
              </button>
            </form>
            <form action={cambiarEstadoSuscripcion}>
              <input type="hidden" name="negocioId" value={cliente.id} />
              <input type="hidden" name="accion" value="renovar" />
              <button className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
                📅 Renovar +30 días
              </button>
            </form>
            {estado !== "suspendido" && (
              <form action={cambiarEstadoSuscripcion}>
                <input type="hidden" name="negocioId" value={cliente.id} />
                <input type="hidden" name="accion" value="suspender" />
                <button className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500">
                  ⛔ Suspender
                </button>
              </form>
            )}
            <Link
              href={`/app?negocio=${cliente.id}`}
              className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              👤 Entrar a su cuenta
            </Link>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-base font-bold">Datos del negocio</h2>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-slate-500">RUC</dt><dd>{cliente.ruc ?? "—"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Correo</dt><dd>{cliente.correo ?? "—"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Teléfono</dt><dd>{cliente.telefono ?? "—"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Días restantes</dt><dd>{dias === null ? "—" : `${dias} días`}</dd></div>
            </dl>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-base font-bold">Usuarios ({usuarios.length})</h2>
            <ul className="space-y-2 text-sm">
              {usuarios.map((u) => (
                <li key={u.user_id} className="flex items-center justify-between gap-4">
                  <span>
                    {u.nombre} <span className="text-slate-400">· {u.rol}</span>
                  </span>
                  <span className="text-xs text-slate-400">desde {formatoFecha(u.creado_en.slice(0, 10))}</span>
                </li>
              ))}
            </ul>
          </article>
        </section>

        {pagosPendientes.length > 0 && (
          <section className="rounded-2xl border border-amber-300 bg-amber-50 shadow-sm">
            <h2 className="border-b border-amber-200 px-5 py-4 text-base font-bold text-amber-900">
              🔔 Pagos pendientes de revisión ({pagosPendientes.length})
            </h2>
            <ul className="divide-y divide-amber-200">
              {pagosPendientes.map((p) => (
                <li key={p.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>
                      <strong>{formatoSoles(Number(p.monto))}</strong> · {p.planes?.nombre ?? "plan"} · {p.metodo}{" "}
                      {p.referencia && <span className="text-slate-500">· réf. {p.referencia}</span>} ·{" "}
                      {formatoFecha(p.fecha)}
                    </span>
                    <div className="flex flex-wrap items-end gap-2">
                      <form action={rechazarPagoAction} className="flex items-end gap-2">
                        <input type="hidden" name="pagoId" value={p.id} />
                        <input type="hidden" name="negocioId" value={negocioId} />
                        <input name="notas" placeholder="Motivo del rechazo (opcional)"
                          className="rounded-lg border border-amber-300 px-2 py-1.5 text-xs" />
                        <button className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500">
                          Rechazar
                        </button>
                      </form>
                      <form action={aprobarPagoAction}>
                        <input type="hidden" name="pagoId" value={p.id} />
                        <input type="hidden" name="negocioId" value={negocioId} />
                        <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500">
                          ✓ Aprobar y activar +30 días
                        </button>
                      </form>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <h2 className="border-b border-slate-100 px-5 py-4 text-base font-bold">
            Historial de pagos ({pagosLista.length}) · total{" "}
            {formatoSoles(pagosLista.filter((p) => p.estado === "aprobado").reduce((t, p) => t + Number(p.monto), 0))}{" "}
            aprobados
          </h2>
          {pagosLista.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">
              Sin pagos declarados todavía. Los pagos que el cliente declare desde su POS aparecerán aquí para que los apruebes.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr>
                  <th className="px-5 py-2 font-semibold">Fecha</th>
                  <th className="px-5 py-2 font-semibold">Plan</th>
                  <th className="px-5 py-2 font-semibold">Monto</th>
                  <th className="px-5 py-2 font-semibold">Método</th>
                  <th className="px-5 py-2 font-semibold">Referencia</th>
                  <th className="px-5 py-2 font-semibold">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pagosLista.map((p) => (
                  <tr key={p.id} className={p.estado === "rechazado" ? "opacity-60" : ""}>
                    <td className="px-5 py-2">{formatoFecha(p.fecha)}</td>
                    <td className="px-5 py-2">{p.planes?.nombre ?? "—"}</td>
                    <td className="px-5 py-2 font-medium">{formatoSoles(Number(p.monto))}</td>
                    <td className="px-5 py-2">{p.metodo}</td>
                    <td className="px-5 py-2 text-slate-500">{p.referencia ?? "—"}</td>
                    <td className="px-5 py-2">
                      {p.estado === "aprobado" && <span className="text-xs font-semibold text-emerald-600">✓ aprobado</span>}
                      {p.estado === "pendiente" && <span className="text-xs font-semibold text-amber-600">⏳ pendiente</span>}
                      {p.estado === "rechazado" && (
                        <span className="text-xs text-rose-600">
                          ✕ rechazado
                          {p.notas_admin && <span className="block text-slate-500">Motivo: {p.notas_admin}</span>}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <h2 className="border-b border-slate-100 px-5 py-4 text-base font-bold">Auditoría sobre este negocio</h2>
          {(auditoria ?? []).length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">
              Aún no hay registros de acciones del dueño sobre este cliente (se llenan al activar, renovar, suspender o entrar a su cuenta).
            </p>
          ) : (
            <ul className="space-y-2 px-5 py-4 text-sm">
              {((auditoria ?? []) as unknown as { accion: string; fecha: string }[]).map((a, i) => (
                <li key={i} className="flex justify-between gap-4">
                  <span>{a.accion}</span>
                  <span className="text-xs text-slate-400">
                    {new Date(a.fecha).toLocaleString("es-PE")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
