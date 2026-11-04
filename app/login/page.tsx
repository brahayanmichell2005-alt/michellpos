import Link from "next/link";
import { iniciarSesion } from "@/app/acciones";

interface Props {
  searchParams: Promise<{ error?: string }>;
}

export default async function Login({ searchParams }: Props) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-indigo-600 text-base font-bold text-white">
            m
          </span>
          <h1 className="text-2xl font-bold">Iniciar sesión</h1>
          <p className="mt-1 text-sm text-slate-600">
            Clientes y administrador del sistema.
          </p>
        </div>

        {error && (
          <p className="mb-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        )}

        <form action={iniciarSesion} className="space-y-4">
          <div>
            <label htmlFor="correo" className="mb-1 block text-sm font-medium">
              Correo
            </label>
            <input
              id="correo"
              name="correo"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div>
            <label htmlFor="contrasena" className="mb-1 block text-sm font-medium">
              Contraseña
            </label>
            <input
              id="contrasena"
              name="contrasena"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            Entrar
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          ¿Aún no tienes cuenta?{" "}
          <Link href="/registro" className="font-semibold text-indigo-600 hover:underline">
            Prueba 15 días gratis
          </Link>
        </p>
      </div>
    </main>
  );
}
