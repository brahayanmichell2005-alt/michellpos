import { redirect } from "next/navigation";
import { obtenerContexto } from "@/lib/pos";
import { guardarSunatAction } from "@/app/acciones-sunat";

export const dynamic = "force-dynamic";

export default async function Sunat({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await obtenerContexto();
  if (!ctx.usuario) redirect("/login");
  if (!ctx.negocioId || ctx.perfil?.rol !== "dueño") redirect("/app");

  const { error } = await searchParams;
  const negocio = ctx.negocio as unknown as null | {
    ruc: string | null; nombre: string;
    sunat_estado: string; sunat_auto: boolean; sunat_sol_usuario: string | null;
  };
  if (!negocio) redirect("/app");

  const guardado = negocio.sunat_estado !== "desactivado";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <h2 className="text-xl font-bold">🧾 SUNAT — Comprobantes electrónicos</h2>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm shadow-sm">
        <p>Se emiten <strong>boletas electrónicas (B001-00001…)</strong> con tu RUC y tu certificado digital, y se envían a SUNAT. Cada venta guarda su estado de envío.</p>
        <ul className="mt-2 ml-4 list-disc space-y-1 text-xs text-slate-500">
          <li><strong>Entorno beta</strong> (pruebas): SUNAT no valida RUC real; sirve para probar sin riesgo.</li>
          <li><strong>Producción</strong>: boletas legales. Requiere RUC activo y clave SOL correcta.</li>
          <li>Las credenciales se guardan <strong>cifradas</strong> (AES-256) en la base de datos.</li>
        </ul>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">⚠️ {error}</div>
      )}
      {guardado && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          ✅ SUNAT está configurado en modo <strong>{negocio.sunat_estado}</strong>.
        </div>
      )}

      <form action={guardarSunatAction} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-slate-500">Entorno de emisión</label>
            <select name="entorno" defaultValue={negocio.sunat_estado} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="desactivado">Desactivado (solo ticket interno)</option>
              <option value="beta">Beta de SUNAT (pruebas)</option>
              <option value="produccion">Producción (boletas legales)</option>
            </select>
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="auto" defaultChecked={negocio.sunat_auto} />
              Enviar automáticamente cada venta a SUNAT
            </label>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Usuario SOL (RUC + userData, ej. 20123456789MODDATOS)</label>
            <input name="solUsuario" defaultValue={negocio.sunat_sol_usuario ?? ""} placeholder="20123456789MODDATOS"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Contraseña SOL (dejar vacío para mantener)</label>
            <input name="solClave" type="password" placeholder={guardado ? "•••••• (guardada)" : ""}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Client secret (se crea al registrar la app del cliente en el portal SUNAT · se guarda cifrado)</label>
            <input name="clientSecret" type="password" placeholder={guardado ? "•••••• (guardado)" : ""}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Razón social para la boleta (si difiere del nombre)</label>
            <input name="razon" defaultValue={negocio.nombre} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-slate-500">Certificado digital (.p12 / .pfx) — reemplaza el anterior</label>
            <input name="certificado" type="file" accept=".p12,.pfx"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <p className="mt-1 text-xs text-slate-400">Se usa para firmar el XML. Nosotros nunca enviamos este archivo fuera del servidor.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-500">Contraseña del certificado</label>
            <input name="certClave" type="password" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
        </div>
        <button className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
          Guardar configuración SUNAT
        </button>
      </form>

      <p className="text-xs text-slate-400">
        Tu RUC del negocio: <strong>{negocio.ruc ?? "sin RUC — ponlo en Configuración"}</strong>
      </p>
    </div>
  );
}
