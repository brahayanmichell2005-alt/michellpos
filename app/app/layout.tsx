import Link from "next/link";
import { cerrarSesion } from "@/app/acciones";
import { obtenerContexto, moduloPermitido } from "@/lib/pos";
import { colorEstado, textoEstado } from "@/lib/utilidades";
import type { EstadoSuscripcion } from "@/lib/tipos";

export const dynamic = "force-dynamic";

const MODULOS = [
  { href: "/app", titulo: "Inicio", mod: "inicio", icono: "🏠" },
  { href: "/app/venta", titulo: "Vender", mod: "venta", icono: "🛒" },
  { href: "/app/productos", titulo: "Productos", mod: "productos", icono: "📦" },
  { href: "/app/caja", titulo: "Caja", mod: "caja", icono: "💰" },
  { href: "/app/clientes", titulo: "Clientes", mod: "clientes", icono: "👥" },
  { href: "/app/reportes", titulo: "Reportes", mod: "reportes", icono: "📊" },
  { href: "/app/usuarios", titulo: "Usuarios", mod: "usuarios", icono: "🧑‍💻" },
  { href: "/app/pagos", titulo: "Suscripción", mod: "pagos", icono: "💳" },
  { href: "/app/sunat", titulo: "SUNAT", mod: "sunat", icono: "🧾" },
  { href: "/app/config", titulo: "Configuración", mod: "config", icono: "⚙️" },
];

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const ctx = await obtenerContexto();

  if (!ctx.usuario) return children;
  if (!ctx.perfil) {
    return (
      <main className="min-h-screen">
        <header className="border-b border-slate-200 bg-white px-6 py-4">
          <p className="text-sm text-slate-600">Cuenta de superadmin — sin módulos del POS.</p>
        </header>
        {children}
      </main>
    );
  }

  const rol = ctx.perfil.rol;
  const estado = ctx.suscripcion?.estado ?? "en_prueba";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-600 text-xs font-bold text-white">m</span>
            <h1 className="truncate text-base font-bold">{ctx.negocio?.nombre ?? "mi POS"}</h1>
            <span className={`hidden rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 sm:inline-block ${colorEstado[estado as EstadoSuscripcion]}`}>
              {textoEstado[estado as EstadoSuscripcion]}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">{rol}</span>
            <form action={cerrarSesion}>
              <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 sm:px-5">
          {MODULOS.filter((m) => moduloPermitido(rol, m.mod)).map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              <span aria-hidden>{m.icono}</span> {m.titulo}
            </Link>
          ))}
        </nav>
      </header>

      {ctx.suspendido && (
        <div className="bg-rose-600 px-4 py-2 text-center text-sm font-semibold text-white">
          ⛔ Cuenta suspendida: puedes ver tu información pero no registrar operaciones.
          Contacta al dueño de michellpos para reactivar.
        </div>
      )}

      <div className="flex-1 flex-col pb-10 px-4 py-5 sm:px-6">{children}</div>
    </div>
  );
}
