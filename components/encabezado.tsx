import { cerrarSesion } from "@/app/acciones";

interface Props {
  titulo: string;
  descripcion?: string;
  derecha?: React.ReactNode;
}

/** Barra superior con logo, título y botón "Cerrar sesión". */
export default function Encabezado({ titulo, descripcion, derecha }: Props) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-600 text-sm font-bold text-white">
          m
        </span>
        <div>
          <h1 className="text-lg font-semibold leading-tight">{titulo}</h1>
          {descripcion && (
            <p className="text-sm text-slate-500">{descripcion}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {derecha}
        <form action={cerrarSesion}>
          <button
            type="submit"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
          >
            Cerrar sesión
          </button>
        </form>
      </div>
    </header>
  );
}
