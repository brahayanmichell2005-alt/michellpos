"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { crearVentaAction } from "@/app/acciones-pos";

interface ProductoUI {
  id: string;
  nombre: string;
  precio_venta: number;
  stock: number;
  alerta_stock: number;
  categorias: { nombre: string } | null;
}
interface ItemCarrito {
  id: string;
  nombre: string;
  precio: number;
  cantidad: number;
  stock: number;
}

const METODOS = [
  { id: "efectivo", titulo: "💵 Efectivo" },
  { id: "yape", titulo: "🟪 Yape" },
  { id: "plin", titulo: "🟩 Plin" },
  { id: "tarjeta", titulo: "💳 Tarjeta" },
] as const;

export default function PanelVenta({
  productos,
  categorias,
  negocioId,
  deshabilitada,
}: {
  productos: ProductoUI[];
  categorias: { id: string; nombre: string }[];
  negocioId: string;
  deshabilitada: boolean;
}) {
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [catFiltro, setCatFiltro] = useState("");
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [descuentoS, setDescuentoS] = useState("0");
  const [metodo, setMetodo] = useState<string>("efectivo");
  const [montoRecibidoS, setMontoRecibidoS] = useState("");
  const [pedidoCliente, setPedirCliente] = useState(false);
  const [tipoDoc, setTipoDoc] = useState<"DNI" | "RUC">("DNI");
  const [documento, setDocumento] = useState("");
  const [nombreCliente, setNombreCliente] = useState("");
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string; ventaId?: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos.filter(
      (p) =>
        (!q || p.nombre.toLowerCase().includes(q) || String(p.id).includes(q)) &&
        (!catFiltro || p.categorias?.nombre === catFiltro)
    );
  }, [productos, busqueda, catFiltro]);

  const subtotal = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
  const descuento = Math.min(Math.max(Number(descuentoS) || 0, 0), subtotal);
  const total = Math.max(subtotal - descuento, 0);
  const vuelto = metodo === "efectivo" ? Math.max((Number(montoRecibidoS) || 0) - total, 0) : null;

  const agregar = (p: ProductoUI) => {
    if (deshabilitada) return;
    setCarrito((prev) => {
      const existe = prev.find((i) => i.id === p.id);
      if (existe) {
        if (existe.cantidad + 1 > p.stock) return prev;
        return prev.map((i) => (i.id === p.id ? { ...i, cantidad: i.cantidad + 1 } : i));
      }
      if (p.stock <= 0) return prev;
      return [...prev, { id: p.id, nombre: p.nombre, precio: Number(p.precio_venta), cantidad: 1, stock: p.stock }];
    });
  };

  const cambiarCantidad = (id: string, delta: number) => {
    setCarrito((prev) =>
      prev
        .map((i) => {
          if (i.id !== id) return i;
          const n = Math.min(Math.max(i.cantidad + delta, 0), i.stock);
          return { ...i, cantidad: n };
        })
        .filter((i) => i.cantidad > 0)
    );
  };

  const cobrar = async () => {
    if (carrito.length === 0 || enviando) return;
    if (metodo === "efectivo" && Number(montoRecibidoS || 0) < total) {
      setMensaje({ ok: false, texto: "El monto recibido no cubre el total." });
      return;
    }
    setEnviando(true);
    setMensaje(null);
    const resultado = await crearVentaAction({
      negocioId,
      items: carrito.map((i) => ({ id: i.id, nombre: i.nombre, cantidad: i.cantidad, precio: i.precio })),
      subtotal,
      descuento,
      total,
      metodo: metodo as "efectivo" | "yape" | "plin" | "tarjeta",
      montoRecibido: Number(montoRecibidoS) || undefined,
      cliente:
        documento.trim() && pedidoCliente
          ? { tipoDoc, documento: documento.trim(), nombre: nombreCliente.trim() }
          : null,
    });
    setEnviando(false);
    if (resultado.ok) {
      const ventaId = (resultado as { ventaId?: string }).ventaId;
      setMensaje({
        ok: true,
        texto:
          `✓ Venta registrada por S/ ${total.toFixed(2)}` +
          (vuelto !== null ? ` — vuelto S/ ${vuelto.toFixed(2)}` : ""),
        ventaId,
      });
      setCarrito([]);
      setDescuentoS("0");
      setMontoRecibidoS("");
      setDocumento("");
      setNombreCliente("");
      router.refresh();
    } else {
      setMensaje({ ok: false, texto: resultado.mensaje });
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      {/* Catálogo */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar producto..."
          className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button
            onClick={() => setCatFiltro("")}
            className={`rounded-full px-3 py-1 text-xs font-medium ${!catFiltro ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            Todos
          </button>
          {categorias.map((c) => (
            <button
              key={c.id}
              onClick={() => setCatFiltro(c.nombre)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${catFiltro === c.nombre ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {c.nombre}
            </button>
          ))}
        </div>
        {filtrados.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">
            {productos.length === 0 ? "Sin productos: crea tu catálogo en la pestaña Productos." : "No se encontraron productos."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {filtrados.map((p) => {
              const agotado = p.stock <= 0;
              return (
                <button
                  key={p.id}
                  onClick={() => agregar(p)}
                  disabled={agotado || deshabilitada}
                  className={`rounded-xl border p-3 text-left transition ${
                    agotado
                      ? "cursor-not-allowed border-slate-100 bg-slate-50 opacity-50"
                      : "border-slate-200 hover:border-indigo-400 hover:bg-indigo-50"
                  }`}
                >
                  <p className="line-clamp-2 text-sm font-medium">{p.nombre}</p>
                  <p className="mt-1 font-bold text-indigo-600">S/ {Number(p.precio_venta).toFixed(2)}</p>
                  <p className={`text-xs ${p.stock <= p.alerta_stock ? "text-amber-600" : "text-slate-400"}`}>
                    {agotado ? "Sin stock" : `stock: ${p.stock}`}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Carrito */}
      <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-bold">🛒 Venta actual</h2>
        {carrito.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">Toca un producto para añadirlo.</p>
        ) : (
          <ul className="space-y-2">
            {carrito.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{i.nombre}</p>
                  <p className="text-xs text-slate-500">S/ {i.precio.toFixed(2)} · stock {i.stock}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => cambiarCantidad(i.id, -1)} className="h-7 w-7 rounded-lg bg-white text-sm font-bold ring-1 ring-slate-200">−</button>
                  <span className="w-6 text-center text-sm font-semibold">{i.cantidad}</span>
                  <button onClick={() => cambiarCantidad(i.id, 1)} className="h-7 w-7 rounded-lg bg-white text-sm font-bold ring-1 ring-slate-200">+</button>
                  <span className="w-16 text-right text-sm font-semibold">S/ {(i.precio * i.cantidad).toFixed(2)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span className="font-medium">S/ {subtotal.toFixed(2)}</span></div>
          <div className="flex items-center justify-between">
            <span>Descuento S/</span>
            <input
              type="number" step="0.01" min="0" value={descuentoS}
              onChange={(e) => setDescuentoS(e.target.value)}
              disabled={deshabilitada}
              className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm"
            />
          </div>
          <div className="flex justify-between text-base font-bold"><span>TOTAL</span><span>S/ {total.toFixed(2)}</span></div>
        </div>

        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-slate-500">Método de pago</p>
          <div className="grid grid-cols-2 gap-1.5">
            {METODOS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMetodo(m.id)}
                disabled={deshabilitada}
                className={`rounded-lg border px-2 py-1.5 text-sm ${metodo === m.id ? "border-indigo-500 bg-indigo-50 font-semibold text-indigo-700" : "border-slate-200 text-slate-600"}`}
              >
                {m.titulo}
              </button>
            ))}
          </div>
          {metodo === "efectivo" && (
            <div className="mt-2 flex items-center justify-between gap-2 text-sm">
              <span>Recibido S/</span>
              <input
                type="number" step="0.01" min="0" value={montoRecibidoS}
                onChange={(e) => setMontoRecibidoS(e.target.value)}
                placeholder="0.00"
                className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-right"
              />
            </div>
          )}
          {vuelto !== null && Number(montoRecibidoS) > 0 && (
            <p className="mt-1 text-right text-sm font-semibold text-emerald-700">Vuelto: S/ {vuelto.toFixed(2)}</p>
          )}
        </div>

        <div className="mt-3 rounded-lg border border-slate-200 p-2.5">
          <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <input type="checkbox" checked={pedidoCliente} onChange={(e) => setPedirCliente(e.target.checked)} /> Agregar cliente final
          </label>
          {pedidoCliente && (
            <div className="mt-2 space-y-1.5">
              <div className="flex gap-1.5">
                <select value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value as "DNI" | "RUC")} className="rounded-lg border border-slate-300 px-2 py-1 text-sm">
                  <option>DNI</option><option>RUC</option>
                </select>
                <input value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="Número"
                  className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm" />
              </div>
              <input value={nombreCliente} onChange={(e) => setNombreCliente(e.target.value)} placeholder="Nombre o razón social"
                className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm" />
            </div>
          )}
        </div>

        {mensaje && (
          <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${mensaje.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
            <p>{mensaje.texto}</p>
            {mensaje.ok && mensaje.ventaId && (
              <a
                href={`/app/comprobante/${mensaje.ventaId}`}
                target="_blank"
                className="mt-1 inline-block font-semibold underline"
              >
                🖨️ Ver / imprimir ticket
              </a>
            )}
          </div>
        )}

        <button
          onClick={cobrar}
          disabled={deshabilitada || carrito.length === 0 || enviando}
          className="mt-3 w-full rounded-xl bg-indigo-600 px-4 py-3 text-base font-bold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
        >
          {enviando ? "Registrando..." : `Cobrar S/ ${total.toFixed(2)}`}
        </button>
      </section>
    </div>
  );
}
