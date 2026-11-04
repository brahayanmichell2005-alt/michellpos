import Link from "next/link";
import { redirect } from "next/navigation";
import Encabezado from "@/components/encabezado";
import { obtenerSesion } from "@/lib/sesion";
import {
  colorEstado,
  diasSegunEstado,
  formatoFecha,
  formatoSoles,
  textoEstado,
} from "@/lib/utilidades";
import {
  cambiarEstadoSuscripcion,
  crearPlan,
  guardarPlan,
  ejecutarRevisionManual,
} from "@/app/acciones-admin";
import { respaldoManualAction, descargarRespaldoAction } from "@/app/acciones-admin";
import type { EstadoSuscripcion, Perfil, Plan, Suscripcion } from "@/lib/tipos";

export const dynamic = "force-dynamic";

type FilaCliente = {
  id: string;
  nombre: string;
  ruc: string | null;
  correo: string | null;
  telefono: string | null;
  creado_en: string;
  perfiles?: Pick<Perfil, "rol" | "nombre">[] | null;
  suscripciones?: (Suscripcion & { planes?: Pick<Plan, "nombre"> | null })[] | null;
};

function Tarjeta({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-600">{titulo}</p>
      <p className="mt-1 text-3xl font-bold">{valor}</p>
      <p className="mt-1 text-xs text-slate-500">{detalle}</p>
    </article>
  );
}

export default async function Admin() {
  const { supabase, usuario } = await obtenerSesion();
  if (!usuario) redirect("/login");

  // Solo superadmins
  const { data: esSuperadmin } = await supabase
    .from("superadmins")
    .select("user_id")
    .eq("user_id", usuario.id)
    .maybeSingle();
  if (!esSuperadmin) redirect("/app");

  const hoyISO = new Date().toISOString().slice(0, 10);
  const inicioMesISO = hoyISO.slice(0, 8) + "01";
  const en3DiasISO = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);

  const [{ data: clientesRaw }, { data: pagosMes }, { data: pagosPendientes }] = await Promise.all([
    supabase
      .from("negocios")
      .select(
        `
        *,
        perfiles ( rol, nombre ),
        suscripciones ( id, estado, inicio_prueba, fin_prueba, fecha_vencimiento, planes ( nombre ) )
      `
      )
      .order("creado_en", { ascending: false }),
    supabase.from("pagos").select("monto, estado").gte("fecha", inicioMesISO).lte("fecha", hoyISO),
    supabase.from("pagos").select("id, negocio_id").eq("estado", "pendiente"),
  ]);

  const clientes = (clientesRaw ?? []) as unknown as FilaCliente[];
  const ingresosMes = (pagosMes ?? [])
    .filter((p) => (p as { estado: string }).estado === "aprobado")
    .reduce((total, p) => total + Number((p as { monto: number }).monto), 0);
  const pendientes = (pagosPendientes ?? []) as unknown as { id: string; negocio_id: string }[];

  // Salud del sistema: últimos eventos automáticos
  const { data: registrosRaw } = await supabase
    .from("registro_sistema")
    .select("id, evento, detalle, creado_en")
    .order("creado_en", { ascending: false })
    .limit(30);
  const registros = (registrosRaw ?? []) as unknown as { id: string; evento: string; detalle: string | null; creado_en: string }[];
  const respaldos = registros
    .filter((r) => r.evento === "backup" || r.evento === "backup_manual")
    .slice(0, 5);
  const salud = {
    ultimoRespaldo:
      registros.find((r) => r.evento === "backup")
        ? new Date(registros.find((r) => r.evento === "backup")!.creado_en).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
        : null,
    ultimoCron:
      registros.find((r) => r.evento === "cron_revision_vencimientos")
        ? new Date(registros.find((r) => r.evento === "cron_revision_vencimientos")!.creado_en).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
        : null,
  };

  // Avisos de contacto directo
  type AvisoContacto = { negocio_id: string; nombre: string; correo: string | null; texto: string };
  const avisosContacto: AvisoContacto[] = [];
  for (const c of clientes) {
    const s = c.suscripciones?.[0];
    if (!s) continue;
    if (s.estado === "en_prueba" && s.fin_prueba && s.fin_prueba <= en3DiasISO)
      avisosContacto.push({ negocio_id: c.id, nombre: c.nombre, correo: c.correo, texto: `🎁 Su prueba gratis termina el ${formatoFecha(s.fin_prueba)} — contacta para cobrar el plan` });
    else if (s.estado === "vencido")
      avisosContacto.push({ negocio_id: c.id, nombre: c.nombre, correo: c.correo, texto: "⚠️ Su plan está vencido — tiene 3 días de gracia antes de la suspensión" });
    else if (s.estado === "suspendido")
      avisosContacto.push({ negocio_id: c.id, nombre: c.nombre, correo: c.correo, texto: "⛔ Suspendido — para reactivar debe pagar" });
  }

  const nuevosEsteMes = clientes.filter((c) => c.creado_en.slice(0, 10) >= inicioMesISO).length;
  const pruebasPorVencer = clientes.filter((c) => {
    const s = c.suscripciones?.[0];
    return !!s && s.estado === "en_prueba" && !!s.fin_prueba && s.fin_prueba <= en3DiasISO;
  }).length;
  const vencidos = clientes.filter((c) => {
    const e = c.suscripciones?.[0]?.estado;
    return e === "vencido" || e === "suspendido";
  }).length;

  const { data: planesRaw } = await supabase
    .from("planes")
    .select("*")
    .order("precio_mensual", { ascending: true });
  const planes = (planesRaw ?? []) as unknown as Plan[];

  return (
    <main className="pb-10 min-h-screen">
      <Encabezado titulo="Panel del dueño" descripcion="Control de todos los negocios clientes" />

      <div className="mx-auto mt-6 max-w-6xl space-y-8 px-6">
        {/* Tarjetas de resumen */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Tarjeta titulo="Clientes registrados" valor={String(clientes.length)} detalle={`${nuevosEsteMes} nuevos este mes`} />
          <Tarjeta titulo="Ingresos del mes" valor={formatoSoles(ingresosMes)} detalle="Pagos aprobados este mes" />
          <Tarjeta titulo="Pruebas por vencer (3 días)" valor={String(pruebasPorVencer)} detalle="Avisarles antes de que venzan" />
          <Tarjeta titulo="Vencidos o suspendidos" valor={String(vencidos)} detalle="Requieren pago o seguimiento" />
        </div>

        {pendientes.length > 0 && (
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
            <h2 className="text-sm font-bold text-amber-900">
              🔔 {pendientes.length === 1 ? "1 pago pendiente de revisión" : `${pendientes.length} pagos pendientes de revisión`}
            </h2>
            <ul className="mt-2 space-y-1 text-sm text-amber-900">
              {pendientes.map((p) => {
                const cli = clientes.find((c) => c.id === p.negocio_id);
                return (
                  <li key={p.id}>
                    <a href={`/admin/cliente/${p.negocio_id}`} className="font-semibold underline hover:no-underline">
                      {cli?.nombre ?? "Cliente"}
                    </a>{" "}
                    declaró un pago — revísalo y apruébalo o recházalo.
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Avisos de contacto directo (pruebas por terminar / vencidos) */}
        {avisosContacto.length > 0 && (
          <div className="rounded-2xl border-2 border-blue-300 bg-blue-50 p-4">
            <h2 className="text-sm font-bold text-blue-900">📮 Contactos recomendados ({avisosContacto.length})</h2>
            <ul className="mt-2 space-y-2 text-sm text-blue-900">
              {avisosContacto.map((a) => (
                <li key={a.negocio_id} className="flex flex-wrap items-center gap-2">
                  <a href={`/admin/cliente/${a.negocio_id}`} className="font-semibold underline hover:no-underline">
                    {a.nombre}
                  </a>
                  <span>{a.texto}</span>
                  {a.correo && (
                    <a href={`mailto:${a.correo}?subject=michellpos%20—%20${encodeURIComponent(a.texto)}`}
                      className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-500">
                      ✉️ escribir
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Salud del sistema */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-base font-bold">🩺 Salud del sistema</h2>
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">Último respaldo</p>
              <p className="font-semibold">{salud.ultimoRespaldo ?? "— nunca —"}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">Última revisión automática</p>
              <p className="font-semibold">{salud.ultimoCron ?? "— corre automático cada día —"}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-4 py-3">
              <p className="text-xs text-slate-500">Crones programados</p>
              <p className="font-semibold">2 (revisión 7:10 a.m. · respaldo 7:00 a.m. Perú)</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <form action={respaldoManualAction}>
              <button className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
                💾 Crear respaldo ahora
              </button>
            </form>
            <span className="text-xs text-slate-500">
              El respaldo guarda todo tu negocio en un archivo privado (JSON) del que solo tú puedes descargar.
            </span>
          </div>
          {respaldos.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="mb-2 text-xs font-semibold text-slate-600">Últimos respaldos (descarga con enlace temporal de 1 hora):</p>
              <ul className="space-y-1.5 text-sm">
                {respaldos.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-slate-600">
                      📄 {r.detalle} · {new Date(r.creado_en).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <form action={descargarRespaldoAction}>
                      <input type="hidden" name="archivo" value={r.detalle?.split(" · ")[0] ?? ""} />
                      <button className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">
                        ⬇️ descargar
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Acción manual de revisión */}
        <form action={ejecutarRevisionManual}>
          <button
            type="submit"
            className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
          >
            ⚙️ Ejecutar revisión de vencimientos ahora
          </button>
          <p className="mt-1 text-xs text-slate-500">
            El mismo proceso corre automático todos los días a las 7:10 a.m. (hora Perú): prueba vencida → vencido → (3 días de gracia) → suspendido.
          </p>
        </form>

        {/* Tabla de clientes */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-bold">Clientes</h2>
          </div>
          {clientes.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">Aún no hay clientes.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Negocio</th>
                    <th className="px-4 py-3 font-semibold">Dueño</th>
                    <th className="px-4 py-3 font-semibold">Plan</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                    <th className="px-4 py-3 font-semibold">Días restantes</th>
                    <th className="px-4 py-3 font-semibold">Vence</th>
                    <th className="px-4 py-3 font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {clientes.map((c) => {
                    const sub = c.suscripciones?.[0] ?? null;
                    const estado: EstadoSuscripcion = sub?.estado ?? "en_prueba";
                    const dias = diasSegunEstado(estado, sub?.inicio_prueba ?? null, sub?.fin_prueba ?? null, sub?.fecha_vencimiento ?? null);
                    const dueno = c.perfiles?.find((p) => p.rol === "dueño");
                    const fecha = sub?.fin_prueba ?? sub?.fecha_vencimiento ?? null;
                    const enPrueba = estado === "en_prueba";
                    return (
                      <tr key={c.id} className={estado === "suspendido" ? "opacity-60" : ""}>
                        <td className="px-4 py-3 font-medium">{c.nombre}</td>
                        <td className="px-4 py-3">{dueno?.nombre ?? "—"}</td>
                        <td className="px-4 py-3">{sub?.planes?.nombre ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${colorEstado[estado]}`}>
                            {textoEstado[estado]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {estado === "suspendido" ? "—" : dias === null ? "—" : `${dias} d`}
                        </td>
                        <td className="px-4 py-3">{formatoFecha(fecha)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Link
                              href={`/app?negocio=${c.id}`}
                              className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-500"
                              title="Entrar a la cuenta del cliente (queda registrado en auditoría)"
                            >
                              Entrar
                            </Link>
                            <Link
                              href={`/admin/cliente/${c.id}`}
                              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                            >
                              Detalle
                            </Link>
                            {sub && !enPrueba && (
                              <form action={cambiarEstadoSuscripcion}>
                                <input type="hidden" name="negocioId" value={c.id} />
                                <input type="hidden" name="accion" value={estado === "suspendido" ? "activar" : "suspender"} />
                                <button
                                  type="submit"
                                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold text-white ${
                                    estado === "suspendido" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-rose-600 hover:bg-rose-500"
                                  }`}
                                >
                                  {estado === "suspendido" ? "Activar" : "Suspender"}
                                </button>
                              </form>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Gestión de planes */}
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-bold">Planes</h2>
            <p className="text-sm text-slate-500">Edita precios y límites, desactiva o crea planes nuevos.</p>
          </div>
          <div className="space-y-3 px-5 py-4">
            {planes.map((plan) => (
              <form
                key={plan.id}
                action={guardarPlan}
                className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 p-3"
              >
                <input type="hidden" name="id" value={plan.id} />
                <div className="min-w-40">
                  <label className="block text-xs font-medium text-slate-500">Nombre</label>
                  <p className="mt-1 font-semibold">{plan.nombre}</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">Precio S/</label>
                  <input type="number" name="precio" step="0.01" min="0" defaultValue={plan.precio_mensual}
                    className="mt-1 w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">Máx. usuarios</label>
                  <input type="number" name="usuarios" min="1" defaultValue={plan.max_usuarios}
                    className="mt-1 w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500">Máx. sucursales</label>
                  <input type="number" name="sucursales" min="1" defaultValue={plan.max_sucursales}
                    className="mt-1 w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="activo" defaultChecked={plan.activo} /> Activo
                </label>
                <button type="submit" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500">
                  Guardar
                </button>
              </form>
            ))}

            {/* Crear plan nuevo */}
            <form action={crearPlan} className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50 p-3">
              <div>
                <label className="block text-xs font-medium text-slate-500">Nombre nuevo plan</label>
                <input name="nombre" required placeholder="Ej. Premium"
                  className="mt-1 w-32 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Precio S/</label>
                <input type="number" name="precio" step="0.01" min="0" required placeholder="129.90"
                  className="mt-1 w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Máx. usuarios</label>
                <input type="number" name="usuarios" min="1" defaultValue={3}
                  className="mt-1 w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">Máx. sucursales</label>
                <input type="number" name="sucursales" min="1" defaultValue={2}
                  className="mt-1 w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
              </div>
              <button type="submit" className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500">
                ➕ Crear plan
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
