import { redirect } from "next/navigation";
import { obtenerContexto } from "@/lib/pos";
import { crearUsuarioAction, eliminarUsuarioAction } from "@/app/acciones-pos";
import { formatoFecha } from "@/lib/utilidades";

export const dynamic = "force-dynamic";

export default async function Usuarios() {
  const ctx = await obtenerContexto();
  if (!ctx.usuario) redirect("/login");
  if (!ctx.negocioId || ctx.perfil?.rol !== "dueño") redirect("/app");
  const { supabase } = ctx;

  const { data: perfilesRaw } = await supabase
    .from("perfiles")
    .select("user_id, rol, nombre, creado_en")
    .eq("negocio_id", ctx.negocioId)
    .order("creado_en", { ascending: true });
  const usuarios = (perfilesRaw ?? []) as unknown as {
    user_id: string; rol: string; nombre: string; creado_en: string;
  }[];

  let maxUsuarios = 5;
  if (ctx.suscripcion?.plan_id) {
    const { data: plan } = await supabase
      .from("planes")
      .select("max_usuarios")
      .eq("id", ctx.suscripcion.plan_id)
      .maybeSingle();
    if (plan) maxUsuarios = Number((plan as { max_usuarios: number }).max_usuarios);
  }
  const cupoCompleto = usuarios.length >= maxUsuarios;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <h2 className="text-xl font-bold">🧑‍💻 Usuarios del negocio</h2>
      <p className="text-sm text-slate-600">
        Tu plan permite hasta {maxUsuarios} usuarios y llevas ocupados {usuarios.length}.
        {cupoCompleto && <span className="ml-1 font-semibold text-amber-600">¡Cupo lleno! Mejora tu plan para añadir más.</span>}
      </p>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-5 py-2 font-semibold">Nombre</th>
              <th className="px-5 py-2 font-semibold">Rol</th>
              <th className="px-5 py-2 font-semibold">Desde</th>
              <th className="px-5 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {usuarios.map((u) => (
              <tr key={u.user_id}>
                <td className="px-5 py-2 font-medium">
                  {u.nombre} {u.user_id === ctx.usuario!.id && <span className="text-xs text-slate-400">(tú)</span>}
                </td>
                <td className="px-5 py-2">{u.rol}</td>
                <td className="px-5 py-2 text-slate-500">{formatoFecha(u.creado_en.slice(0, 10))}</td>
                <td className="px-5 py-2">
                  {u.user_id !== ctx.usuario!.id && (
                    <form action={eliminarUsuarioAction}>
                      <input type="hidden" name="userId" value={u.user_id} />
                      <button className="text-xs text-rose-600 hover:underline">quitar</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 font-semibold">➕ Nuevo usuario</h3>
        {cupoCompleto ? (
          <p className="text-sm text-slate-500">
            Alcanzaste el límite de tu plan ({maxUsuarios} usuarios). Sube de plan en el panel del dueño para añadir más usuarios.
          </p>
        ) : (
          <form action={crearUsuarioAction} className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-slate-500">Nombre</label>
              <input name="nombre" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Rol</label>
              <select name="rol" defaultValue="cajero" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="cajero">Cajero — vende y maneja su caja</option>
                <option value="administrador">Administrador — productos, inventario, reportes</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Correo</label>
              <input name="correo" type="email" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Contraseña (mínimo 6)</label>
              <input name="contrasena" type="password" minLength={6} required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <button className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
                Crear usuario
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
