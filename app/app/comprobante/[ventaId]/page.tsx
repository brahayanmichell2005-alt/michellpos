import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerContexto } from "@/lib/pos";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { colorEstado, formatoFecha } from "@/lib/utilidades";
import BotonImprimir from "@/components/boton-imprimir";
import { enviarSunatAction } from "@/app/acciones-sunat";
import type { EstadoSuscripcion } from "@/lib/tipos";

export const dynamic = "force-dynamic";

const METODOS: Record<string, string> = {
  efectivo: "Efectivo",
  yape: "Yape",
  plin: "Plin",
  tarjeta: "Tarjeta",
};

export default async function Comprobante({
  params,
  searchParams,
}: {
  params: Promise<{ ventaId: string }>;
  searchParams: Promise<{ sunat?: string }>;
}) {
  const ctx = await obtenerContexto();
  if (!ctx.usuario) redirect("/login");

  const { ventaId } = await params;
  const { sunat: avisoSunat } = await searchParams;
  const supabase = await crearClienteServidor();

  // RLS: solo la venta del propio negocio (o superadmin).
  const { data: ventaRaw } = await supabase
    .from("ventas")
    .select("*")
    .eq("id", ventaId)
    .maybeSingle();
  const venta = ventaRaw as unknown as null | {
    id: string; negocio_id: string; serie: string; numero: number;
    subtotal: number; descuento: number; total: number;
    metodo_pago: string; monto_recibido: number | null; estado: string; creado_en: string;
    user_id: string; cliente_id: string | null;
  };

  if (!venta) {
    return (
      <div className="mx-auto max-w-md px-6 py-10 text-center text-sm text-slate-600">
        Venta no encontrada o no te pertenece.
      </div>
    );
  }

  const { data: negocioRaw } = await supabase
    .from("negocios")
    .select("nombre, ruc, direccion, logo_url, serie_boleta")
    .eq("id", venta.negocio_id)
    .maybeSingle();
  const negocio = negocioRaw as unknown as null | {
    nombre: string; ruc: string | null; direccion: string | null; logo_url: string | null;
  };

  const { data: detalleRaw } = await supabase
    .from("detalle_venta")
    .select("nombre, cantidad, precio_unitario")
    .eq("venta_id", venta.id);
  const items = (detalleRaw ?? []) as unknown as {
    nombre: string; cantidad: number; precio_unitario: number;
  }[];

  const [{ data: cajeroRaw }, { data: clienteRaw }] = await Promise.all([
    supabase.from("perfiles").select("nombre").eq("user_id", venta.user_id).eq("negocio_id", venta.negocio_id).maybeSingle(),
    venta.cliente_id
      ? supabase.from("clientes_finales").select("tipo_doc, documento, nombre").eq("id", venta.cliente_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const cajero = (cajeroRaw as unknown as { nombre: string } | null)?.nombre ?? "";
  const cliente = clienteRaw as unknown as null | { tipo_doc: string; documento: string; nombre: string };

  const recibido = Number(venta.monto_recibido ?? 0);
  const vuelto = venta.metodo_pago === "efectivo" ? Math.max(recibido - Number(venta.total), 0) : null;

  const enLinea = (
    <div className="mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-2">
      <div>
        <Link href="/app" className="text-sm text-indigo-600 hover:underline">← Volver</Link>
        {venta.estado === "anulada" && (
          <span className="ml-3 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
            VENTA ANULADA
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <BotonImprimir className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700" />
        <form action={enviarSunatAction}>
          <input type="hidden" name="ventaId" value={venta.id} />
          <button className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">🧾 Enviar a SUNAT</button>
        </form>
      </div>
    </div>
  );

  // Estado SUNAT de esta boleta (con aviso del envío)
  const { data: compRaw } = await supabase
    .from("comprobantes_sunat")
    .select("estado, mensaje, ticket, actualizado_en")
    .eq("serie", venta.serie)
    .eq("numero", venta.numero)
    .eq("tipo_doc", "03")
    .maybeSingle();
  const comp = compRaw as unknown as null | { estado: string; mensaje: string | null; ticket: string | null };

  const color: Record<string, string> = {
    aceptado: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    enviado: "bg-blue-50 text-blue-700 ring-blue-200",
    rechazado: "bg-rose-50 text-rose-700 ring-rose-200",
    error: "bg-amber-50 text-amber-700 ring-amber-200",
    pendiente: "bg-slate-100 text-slate-600 ring-slate-200",
  };

  return (
    <div>
      {enLinea}

      {(avisoSunat || comp) && (
        <div className="mx-auto mb-4 max-w-3xl rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
          {avisoSunat && <p className="font-medium">🧾 {avisoSunat}</p>}
          {comp && (
            <p className="mt-1 flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${color[comp.estado] ?? color.pendiente}`}>
                SUNAT: {comp.estado}
              </span>
              {comp.ticket && <span className="text-xs text-slate-500">ticket {comp.ticket}</span>}
              {comp.mensaje && <span className="text-xs text-slate-500">{comp.mensaje}</span>}
            </p>
          )}
        </div>
      )}

      {/* ===== TICKET 80mm (esto es lo que se imprime) ===== */}
      <div id="ticket" className="ticket mx-auto bg-white p-[6mm] text-slate-900" style={{ width: "80mm", fontFamily: "'Courier New', monospace", fontSize: "11px", lineHeight: 1.35 }}>
        {/* Logo + cabecera */}
        <div style={{ textAlign: "center" }}>
          {negocio?.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={negocio.logo_url} alt="logo" style={{ maxWidth: "30mm", maxHeight: "18mm", objectFit: "contain", margin: "0 auto 3px" }} />
          )}
          <div style={{ fontWeight: 700, fontSize: "13px" }}>{negocio?.nombre ?? "Mi negocio"}</div>
          {negocio?.ruc && <div>RUC: {negocio.ruc}</div>}
          {negocio?.direccion && <div>{negocio.direccion}</div>}
          <div style={{ marginTop: "2px" }}>BOLETA DE VENTA</div>
          <div style={{ fontWeight: 700 }}>
            {venta.serie}-{String(venta.numero).padStart(5, "0")}
          </div>
          <div style={{ color: "#444" }}>
            {new Date(venta.creado_en).toLocaleString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>

        {/* Cliente */}
        {cliente && (
          <div style={{ margin: "4px 0", borderTop: "1px dashed #999", borderBottom: "1px dashed #999", padding: "3px 0" }}>
            <div>
              {cliente.tipo_doc}: {cliente.documento}
            </div>
            <div>{cliente.nombre}</div>
          </div>
        )}

        {/* Items */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "3px" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #999" }}>
              <th style={{ textAlign: "left" }}>Cant</th>
              <th style={{ textAlign: "left" }}>Descripción</th>
              <th style={{ textAlign: "right" }}>Imp.</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td style={{ verticalAlign: "top", whiteSpace: "nowrap" }}>x{Number(it.cantidad)}</td>
                <td style={{ wordBreak: "break-word" }}>{it.nombre}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  {Number(Number(it.cantidad) * Number(it.precio_unitario)).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totales */}
        <div style={{ borderTop: "1px solid #999", marginTop: "4px", paddingTop: "3px" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Subtotal</span><span>S/ {Number(venta.subtotal).toFixed(2)}</span>
          </div>
          {Number(venta.descuento) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Descuento</span><span>-S/ {Number(venta.descuento).toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "13px" }}>
            <span>TOTAL</span><span>S/ {Number(venta.total).toFixed(2)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Pago ({METODOS[venta.metodo_pago] ?? venta.metodo_pago})</span>
            <span>{venta.metodo_pago === "efectivo" ? `S/ ${recibido.toFixed(2)}` : ""}</span>
          </div>
          {vuelto !== null && (
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Vuelto</span><span>S/ {vuelto.toFixed(2)}</span>
            </div>
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: "6px", color: "#333" }}>
          <div>¡Gracias por su compra!</div>
          {cajero && <div style={{ fontSize: "10px" }}>Atendido por: {cajero}</div>}
          <div style={{ fontSize: "9px", marginTop: "3px" }}>
            Sys: michellpos · {venta.serie}-{String(venta.numero).padStart(5, "0")}
          </div>
        </div>
      </div>

      {/* CSS de impresión */}
      <style>{`
        @media print {
          @page { size: 80mm auto; margin: 0; }
          body { margin: 0; padding: 0; }
          body * { visibility: hidden; }
          #ticket, #ticket * { visibility: visible; }
          #ticket { position: absolute; left: 0; top: 0; width: 80mm; }
        }
        @media screen { body { background: #f1f5f9; } }
      `}</style>
    </div>
  );
}
