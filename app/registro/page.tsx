import Link from "next/link";
import { registrarse } from "@/app/acciones";

interface Props {
  searchParams: Promise<{ error?: string }>;
}

export default async function Registro({ searchParams }: Props) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-indigo-600 text-base font-bold text-white">
            m
          </span>
          <h1 className="text-2xl font-bold">Crea tu cuenta</h1>
          <p className="mt-1 text-sm text-slate-600">
            15 días gratis, sin tarjeta. Quedas dentro del plan Básico.
          </p>
        </div>

        {error && (
          <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        )}

        <form action={registrarse} className="space-y-4">
          <div>
            <label htmlFor="nombreNegocio" className="mb-1 block text-sm font-medium">
              Nombre del negocio <span className="text-rose-600">*</span>
            </label>
            <input
              id="nombreNegocio"
              name="nombreNegocio"
              required
              placeholder="Ej. Bodega La Esperanza"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="ruc" className="mb-1 block text-sm font-medium">
                RUC (opcional)
              </label>
              <input
                id="ruc"
                name="ruc"
                inputMode="numeric"
                placeholder="10 u 11 dígitos"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label htmlFor="telefono" className="mb-1 block text-sm font-medium">
                Teléfono (opcional)
              </label>
              <input
                id="telefono"
                name="telefono"
                placeholder="9XXXXXXXX"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>

          <div>
            <label htmlFor="nombre" className="mb-1 block text-sm font-medium">
              Tu nombre <span className="text-rose-600">*</span>
            </label>
            <input
              id="nombre"
              name="nombre"
              required
              placeholder="Ej. Michell"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div>
            <label htmlFor="correo" className="mb-1 block text-sm font-medium">
              Correo <span className="text-rose-600">*</span>
            </label>
            <input
              id="correo"
              name="correo"
              type="email"
              required
              placeholder="tucorreo@ejemplo.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div>
            <label htmlFor="contrasena" className="mb-1 block text-sm font-medium">
              Contraseña <span className="text-rose-600">*</span>
            </label>
            <input
              id="contrasena"
              name="contrasena"
              type="password"
              required
              minLength={6}
              placeholder="Mínimo 6 caracteres"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            Crear cuenta gratis
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-semibold text-indigo-600 hover:underline">
            Inicia sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
