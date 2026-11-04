import "server-only";
import { crearClienteAdmin } from "@/lib/supabase/admin";

/* ==========================================================
   Correos automáticos vía Resend (API REST, sin dependencia).
   Configurar en Vercel:
     RESEND_API_KEY  → clave de resend.com (plan gratis)
     RESEND_FROM     → "michellpos <onboarding@resend.dev>"
   Sin RESEND_API_KEY: los avisos quedan registrados en
   registro_sistema y no se envían (no rompe nada).
   ========================================================== */

const DESDE = process.env.RESEND_FROM ?? "michellpos <onboarding@resend.dev>";

export interface DatosAviso {
  para: string;
  paraNombre: string;
  negocioNombre: string;
  asunto: string;
  cuerpo: string[];
}

async function enviarEmail(d: DatosAviso): Promise<boolean> {
  const clave = process.env.RESEND_API_KEY;
  if (!clave) {
    const admin = crearClienteAdmin();
    await admin.from("registro_sistema").insert({
      evento: "email_sin_api_key",
      detalle: `para ${d.para}: ${d.asunto}`,
    });
    return false;
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: DESDE,
        to: [d.para],
        subject: d.asunto,
        html: plantilla(d),
      }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}`);
    return true;
  } catch {
    return false;
  }
}

function plantilla(d: DatosAviso) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <div style="background:#4f46e5;border-radius:16px 16px 0 0;padding:18px 24px;color:#fff">
      <span style="font-weight:800;font-size:18px">michellpos</span>
      <span style="opacity:.8"> · tu POS en la nube</span>
    </div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:24px;border:1px solid #e2e8f0;border-top:0">
      <p style="margin:0 0 12px;font-weight:700">Hola ${d.paraNombre},</p>
      <p style="margin:0 0 16px;color:#334155;line-height:1.5">${d.negocioNombre} — ${d.cuerpo[0] ?? ""}</p>
      ${d.cuerpo
        .slice(1)
        .map((l) => `<p style="margin:0 0 10px;color:#475569;line-height:1.5">${l}</p>`)
        .join("")}
      <p style="margin:20px 0 0;padding-top:14px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8">
        Escribe al dueño de michellpos si tienes dudas. Este es un aviso automático del sistema.
      </p>
    </div>
  </div></body></html>`;
}

/* ================= Avisos concretos ================= */

export async function avisarBienvenida(correo: string, nombre: string, negocio: string, finPrueba: string | null) {
  return enviarEmail({
    para: correo,
    paraNombre: nombre,
    negocioNombre: negocio,
    asunto: `¡Bienvenido a michellpos, ${nombre}! 🎉`,
    cuerpo: [
      "tu negocio quedó registrado con <strong>15 días de prueba gratis</strong>.",
      finPrueba ? `Tu prueba termina el <strong>${finPrueba}</strong>.` : "",
      "Ya puedes cargar productos, abrir tu caja y vender desde " +
        '<a href="https://michellpos.vercel.app" style="color:#4f46e5">https://michellpos.vercel.app</a>.',
    ].filter(Boolean),
  });
}

export async function avisarPruebaPorVencer(correo: string, nombre: string, negocio: string, finPrueba: string) {
  return enviarEmail({
    para: correo,
    paraNombre: nombre,
    negocioNombre: negocio,
    asunto: "Tu prueba gratis termina pronto ⏳",
    cuerpo: [
      `tu <strong>prueba gratis termina el ${finPrueba}</strong>.`,
      "Para no dejar de vender, paga tu plan y declara el pago en la pestaña 💳 Suscripción de tu POS.",
      "En cuanto se confirme el pago tu cuenta pasa a Activa automáticamente.",
    ],
  });
}

export async function avisarVencido(correo: string, nombre: string, negocio: string) {
  return enviarEmail({
    para: correo,
    paraNombre: nombre,
    negocioNombre: negocio,
    asunto: "Tu plan michellpos está vencido ⚠️",
    cuerpo: [
      "tu plan está <strong>vencido</strong>: puedes consultar tu información pero no registrar nuevas ventas.",
      "Tienes <strong>3 días de gracia</strong> antes de la suspensión del servicio.",
      "Paga tu plan y declara el pago en 💳 Suscripción para reactivar al instante.",
    ],
  });
}

export async function avisarSuspendido(correo: string, nombre: string, negocio: string) {
  return enviarEmail({
    para: correo,
    paraNombre: nombre,
    negocioNombre: negocio,
    asunto: "⛔ Cuenta suspendida — reactiva tu plan",
    cuerpo: [
      "tu cuenta quedó <strong>suspendida</strong> tras el vencimiento + gracia.",
      "Puedes ver tu información y exportarla, pero no vender.",
      "Contacta al dueño de michellpos, paga tu plan y se reactiva de inmediato.",
    ],
  });
}

export async function avisarPagoAprobado(
  correo: string,
  nombre: string,
  negocio: string,
  monto: string,
  nuevoVencimiento: string
) {
  return enviarEmail({
    para: correo,
    paraNombre: nombre,
    negocioNombre: negocio,
    asunto: "✅ Pago confirmado — plan activo",
    cuerpo: [
      `confirmamos tu pago de <strong>S/ ${monto}</strong>. ¡Gracias!`,
      `Tu plan está <strong>Activo</strong> hasta el <strong>${nuevoVencimiento}</strong>.`,
      "Nos vemos en el mostrador 🛒",
    ],
  });
}
