import "server-only";
import crypto from "crypto";
import forge from "node-forge";
import { crearClienteServidor } from "./supabase/servidor";

/* ==========================================================
   Cifrado local de credenciales SUNAT (AES-256-GCM).
   La clave vive SOLO en el servidor (env SUNAT_SECRET).
   ========================================================== */

const CLAVE = process.env.SUNAT_SECRET ?? "";
const KEY = CLAVE ? crypto.createHash("sha256").update(CLAVE).digest() : null;

export function cifrar(texto: string): string {
  if (!texto) return "";
  if (!KEY) throw new Error("Falta SUNAT_SECRET en el servidor");
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64");
}

export function descifrar(b64: string | null | undefined): string {
  if (!b64) return "";
  if (!KEY) return "";
  try {
    const buf = Buffer.from(b64, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const resto = buf.subarray(28);
    const d = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(resto), d.final()]).toString("utf8");
  } catch {
    return "";
  }
}

/* ==========================================================
   Certificado digital: convertir .p12/.pfx → PEM (clave + cert)
   ========================================================== */

export interface ParPem {
  clavePem: string;
  certPem: string;
}

export function p12APem(p12Base64: string, password: string): ParPem {
  const der = forge.util.decode64(p12Base64);
  const p12Asn = forge.asn1.fromDer(der);
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn, password);
  let clavePem = "";
  let certPem = "";
  for (const bolsa of p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []) {
    clavePem = forge.pki.privateKeyToPem(bolsa.key as forge.pki.PrivateKey);
  }
  if (!clavePem) {
    for (const bolsa of p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []) {
      clavePem = forge.pki.privateKeyToPem(bolsa.key as forge.pki.PrivateKey);
    }
  }
  for (const bolsa of p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []) {
    if (bolsa.cert) {
      certPem = forge.pki.certificateToPem(bolsa.cert);
      break;
    }
  }
  if (!clavePem || !certPem) throw new Error("El certificado .p12 no contiene clave y/o certificado, o la clave es incorrecta.");
  return { clavePem, certPem };
}

export function extraerRucDeCertificado(certPem: string): string | null {
  try {
    const cert = forge.pki.certificateFromPem(certPem);
    const attr = cert.subject.attributes.find((a) => a.shortName === "CN");
    if (!attr) return null;
    const m = /(\d{11})/.exec(String(attr.value));
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/* ==========================================================
   Cliente REST del Sistema de Emisión Electrónica (SPE) SUNAT
   - Entorno beta:  api-cpe-beta.sunat.gob.pe
   - Producción:    api-cpe.sunat.gob.pe
   Autenticación OAuth2 con client_id = RUC + "MODDATOS"
   ========================================================== */

export interface CredencialesSunat {
  ruc: string;
  usuarioSol: string; // RUC + usuario (ej. RUCMODDATOS)
  claveSol: string;
  clientSecret: string;
  certPem: string;
  clavePem: string;
}

export interface RespuestaSunat {
  ok: boolean;
  ticket?: string;
  codigo?: string;
  mensaje?: string;
  cdr?: string | null;
}

export interface ConfigSunat {
  sunat_estado: string; // desactivado | beta | produccion
  sunat_sol_usuario: string | null;
  sunat_sol_clave_enc: string | null;
  sunat_client_secret_enc: string | null;
  sunat_certificado_enc: string | null;
  sunat_cert_clave_enc: string | null;
}

export async function cargarCredenciales(negocioId: string): Promise<CredencialesSunat | null> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase
    .from("negocios")
    .select(
      "sunat_estado, sunat_sol_usuario, sunat_sol_clave_enc, sunat_client_secret_enc, sunat_certificado_enc, sunat_cert_clave_enc"
    )
    .eq("id", negocioId)
    .maybeSingle();
  const cfg = data as unknown as ConfigSunat | null;
  if (!cfg || !cfg.sunat_sol_clave_enc || !cfg.sunat_client_secret_enc || !cfg.sunat_certificado_enc) return null;

  const claveSol = descifrar(cfg.sunat_sol_clave_enc);
  const secret = descifrar(cfg.sunat_client_secret_enc);
  const certPem = descifrar(cfg.sunat_certificado_enc);
  const clavePem = descifrar(cfg.sunat_cert_clave_enc);
  if (!claveSol || !secret || !certPem || !clavePem) return null;

  const ruc = /^(\d{11})/.exec(cfg.sunat_sol_usuario ?? "")?.[1];
  if (!cfg.sunat_sol_usuario || !ruc) return null;

  return {
    ruc,
    usuarioSol: cfg.sunat_sol_usuario,
    claveSol,
    clientSecret: secret,
    certPem,
    clavePem,
  };
}

export async function pedirToken(c: CredencialesSunat): Promise<string> {
  const clientId = c.usuarioSol.includes("MODDATOS") ? c.usuarioSol : `${c.ruc}MODDATOS`;
  const r = await fetch("https://api-seguridad.sunat.gob.pe/v1/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: c.clientSecret,
      username: c.usuarioSol,
      password: c.claveSol,
    }).toString(),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; error_description?: string; error?: string };
  if (!r.ok || !j.access_token) {
    throw new Error(
      `No se pudo autenticar con SUNAT (${r.status}): ${j.error_description || j.error || "revisa RUC+usuario SOL, contraseña y secreto"}`
    );
  }
  return j.access_token;
}

const HOST = (entorno: string) =>
  entorno === "produccion" ? "https://api-cpe.sunat.gob.pe" : "https://api-cpe-beta.sunat.gob.pe";

/** Envía el zip base64 y devuelve el número de ticket. */
export async function enviarComprobante(c: CredencialesSunat, entorno: string, zipB64: string, serie: string, correlativo: number): Promise<RespuestaSunat> {
  const token = await pedirToken(c);
  const r = await fetch(`${HOST(entorno)}/v1/contribuyente/gem/comprobantes/envio`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      cabecera: {
        numserie: serie,
        correonumero: correlativo,
        fechaemision: new Date().toISOString().slice(0, 10),
        tipodocusuario: "6",
      },
      archivo: zipB64,
    }),
  });
  const j = (await r.json().catch(() => ({}))) as { numTicket?: string; codRespuesta?: string; message?: string; error?: object };
  if (!r.ok) {
    return { ok: false, codigo: String(r.status), mensaje: j.message || "Error al enviar a SUNAT (revisa entorno y credenciales)" };
  }
  if (!j.numTicket) {
    return { ok: false, mensaje: "SUNAT no devolvió ticket: " + JSON.stringify(j).slice(0, 200) };
  }
  return { ok: true, ticket: j.numTicket };
}

/** Consulta el CDR de un voucher ticket. 0 = aceptado, 98 = en proceso, resto = rechazado. */
export async function consultarTicket(c: CredencialesSunat, entorno: string, ticket: string): Promise<RespuestaSunat> {
  const token = await pedirToken(c);
  const r = await fetch(`${HOST(entorno)}/v1/contribuyente/gem/comprobantes/envios/${ticket}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = (await r.json().catch(() => ({}))) as {
    codRespuesta?: string;
    indicador?: string;
    mensaje?: string;
    archivo?: string | null;
  };
  const codigo = j.codRespuesta ?? j.indicador ?? "";
  if (codigo === "98") return { ok: true, codigo, mensaje: "En proceso" };
  if (codigo === "0") {
    return { ok: true, codigo, mensaje: "Aceptado por SUNAT", cdr: (j.archivo as string) ?? null };
  }
  return {
    ok: false,
    codigo: codigo || String(r.status),
    mensaje: j.mensaje || "SUNAT rechazó o no respondió sobre este ticket",
  };
}
