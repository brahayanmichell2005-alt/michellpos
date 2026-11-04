import Link from "next/link";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { formatoSoles } from "@/lib/utilidades";
import type { Plan } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function Inicio() {
  const supabase = await crearClienteServidor();
  const { data: planes } = await supabase
    .from("planes")
    .select("*")
    .eq("activo", true)
    .order("precio_mensual");

  return (
    <main className="flex flex-col">
      {/* Hero */}
      <section className="bg-white px-6 py-20 text-center">
        <div className="mx-auto max-w-3xl">
          <span className="mb-4 inline-block rounded-full bg-indigo-50 px-4 py-1 text-sm font-medium text-indigo-700">
            Sistema de ventas en la nube
          </span>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Controla tu negocio desde{" "}
            <span className="text-indigo-600">cualquier lugar</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
            Punto de venta en la nube para cualquier rubro: productos,
            inventario, caja, reportes y más. Funciona en computadora y celular.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/registro"
              className="rounded-xl bg-indigo-600 px-6 py-3 text-base font-semibold text-white shadow transition hover:bg-indigo-500"
            >
              Probar 15 días gratis
            </Link>
            <Link
              href="/login"
              className="rounded-xl border border-slate-200 px-6 py-3 text-base font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Iniciar sesión
            </Link>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            Sin tarjeta. Tu cuenta queda lista en menos de un minuto.
          </p>
        </div>
      </section>

      {/* Beneficios */}
      <section className="px-6 py-16">
        <div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-3">
          {[
            {
              titulo: "Vende desde el celular",
              texto:
                "Una pantalla de venta rápida y clara, lista para cajeros con poco entrenamiento.",
            },
            {
              titulo: "Tus datos separados",
              texto:
                "Cada negocio tiene su información protegida; nadie más puede verla.",
            },
            {
              titulo: "Reportes al instante",
              texto:
                "Ventas del día, productos más vendidos y movimientos de caja en la nube.",
            },
          ].map((b) => (
            <article
              key={b.titulo}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h3 className="text-base font-semibold">{b.titulo}</h3>
              <p className="mt-2 text-sm text-slate-600">{b.texto}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Planes */}
      <section className="border-t border-slate-200 bg-white px-6 py-16" id="planes">
        <div className="mx-auto max-w-5xl text-center">
          <h2 className="text-3xl font-bold">Planes</h2>
          <p className="mx-auto mt-2 max-w-xl text-slate-600">
            Precio mensual por negocio, en soles. Prueba 15 días gratis y luego
            elige el plan que quieras.
          </p>
        </div>
        <div className="mx-auto mt-10 grid max-w-5xl gap-6 md:grid-cols-3">
          {(planes ?? []).map((plan: Plan, indice: number) => (
            <article
              key={plan.id}
              className={`flex flex-col rounded-2xl border p-6 shadow-sm ${
                indice === 1
                  ? "border-indigo-300 ring-2 ring-indigo-100"
                  : "border-slate-200"
              }`}
            >
              <h3 className="text-lg font-semibold">{plan.nombre}</h3>
              <p className="mt-3">
                <span className="text-3xl font-bold text-indigo-600">
                  {formatoSoles(plan.precio_mensual)}
                </span>
                <span className="text-sm text-slate-500"> / mes</span>
              </p>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-600">
                <li>✓ Hasta {plan.max_usuarios} usuarios</li>
                <li>✓ Hasta {plan.max_sucursales} sucursales</li>
                <li>✓ Todos los módulos del POS</li>
                <li>✓ Copias de seguridad automáticas</li>
              </ul>
              <Link
                href="/registro"
                className="mt-6 rounded-xl bg-indigo-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                Empezar gratis
              </Link>
            </article>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white px-6 py-8 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} michellpos — Point of Sale en la nube
      </footer>
    </main>
  );
}
