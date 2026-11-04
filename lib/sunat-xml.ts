import "server-only";
import JSZip from "jszip";
import { SignedXml } from "xml-crypto";

const moneda = "PEN";
const dig2 = (n: number) => Number(n).toFixed(2);

export interface DatosComprobante {
  ruc: string;
  razonSocial: string;
  tipoDoc: "01" | "03"; // 01 factura · 03 boleta
  serie: string;
  correlativo: number;
  emisionISO: string; // YYYY-MM-DD
  cliente: { tipoDoc: "1" | "6"; documento: string; nombre: string } | null;
  items: { nombre: string; cantidad: number; precio: number }[];
  igvRate?: number; // default 18%
}

function montos(items: { cantidad: number; precio: number }[], igvRate: number) {
  const total = items.reduce((s, i) => s + i.cantidad * i.precio, 0);
  const base = total / (1 + igvRate);
  return { base, igv: total - base, total };
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function nombreArchivoZip(d: DatosComprobante) {
  return `${d.ruc}-${d.tipoDoc}-${d.serie}-${String(d.correlativo).padStart(8, "0")}`;
}

/** Devuelve XML UBL 2.1 de boleta/factura + firma digital del emisor. */
export async function generarXmlFirmado(d: DatosComprobante, certPem: string, clavePem: string): Promise<{ xmlFirmado: string; zipB64: string }> {
  const igvRate = d.igvRate ?? 0.18;
  const { base, igv, total } = montos(d.items, igvRate);
  const docCliente = d.cliente?.documento ?? "00000000";
  const tipoCliente = d.cliente?.tipoDoc ?? "1";
  const nombreCliente = esc(d.cliente?.nombre ?? "CLIENTE VARIOS");
  const razon = esc(d.razonSocial);

  const pre = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension><ext:ExtensionContent id="FIRMA"></ext:ExtensionContent></ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>2.0</cbc:CustomizationID>
  <cbc:ID>${d.serie}-${d.correlativo}</cbc:ID>
  <cbc:IssueDate>${d.emisionISO}</cbc:IssueDate>
  <cbc:IssueTime>12:00:00</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="TipoOperacion">0101</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${moneda}</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cbc:AdditionalAccountID>6</cbc:AdditionalAccountID>
    <cac:Party>
      <cac:PartyName><cbc:Name>${razon}</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>${razon}</cbc:RegistrationName>
        <cbc:CompanyID>${d.ruc}</cbc:CompanyID>
        <cbc:TaxLevelCode listName="SUNAT:EstadoDelContribuyente">01</cbc:TaxLevelCode>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID><cbc:Percent>18.00</cbc:Percent></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${razon}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cbc:AdditionalAccountID>${tipoCliente}</cbc:AdditionalAccountID>
    <cac:Party>
      <cac:PartyName><cbc:Name>${nombreCliente}</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>${nombreCliente}</cbc:RegistrationName>
        <cbc:CompanyID>${docCliente}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${nombreCliente}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${moneda}">${dig2(igv)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${moneda}">${dig2(base)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${moneda}">${dig2(igv)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>18.00</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID><cbc:Name>IGV</cbc:Name></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${moneda}">${dig2(base)}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="${moneda}">${dig2(total)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${moneda}">${dig2(total)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;

  const itemsXml = d.items
    .map((i, idx) => {
      const vUnit = i.precio / (1 + igvRate);
      const subv = vUnit * i.cantidad;
      const igvItem = subv * igvRate;
      return `
  <cac:InvoiceLine>
    <cbc:ID>${idx + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="NIU">${Number(i.cantidad).toFixed(2)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${moneda}">${dig2(subv)}</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${moneda}">${dig2(igvItem)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${moneda}">${dig2(subv)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${moneda}">${dig2(igvItem)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:ID>S</cbc:ID>
          <cbc:Percent>18.00</cbc:Percent>
          <cac:TaxScheme><cbc:ID>VAT</cbc:ID><cbc:Name>IGV</cbc:Name></cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Description>${esc(i.nombre)}</cbc:Description>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="${moneda}">${dig2(vUnit)}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>`;
    })
    .join("\n");

  const xmlSinFirmar = `${pre}${itemsXml}
</Invoice>`;

  // Firmar con xml-crypto: referencia a todo el doc (enveloped) y luego la
  // movemos dentro de <ext:ExtensionContent id="FIRMA">, como pide SUNAT.
  const sig = new SignedXml({
    privateKey: clavePem,
    publicCert: certPem,
    canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#",
    signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
  });
  sig.addReference({
    xpath: "/*",
    transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", "http://www.w3.org/2001/10/xml-exc-c14n#"],
  });
  sig.computeSignature(xmlSinFirmar);
  const firmado = sig.getSignedXml();

  // mover <ds:Signature> bajo la ExtensionContent
  const m =/<ds:Signature\b[\s\S]*?<\/ds:Signature>/.exec(firmado);
  if (!m) throw new Error("No se pudo generar la firma digital");
  const bloqueFirma = m[0];
  const xmlReubicado = firmado
    .replace(bloqueFirma, "")
    .replace('<ext:ExtensionContent id="FIRMA"></ext:ExtensionContent>', `<ext:ExtensionContent id="FIRMA">${bloqueFirma}</ext:ExtensionContent>`);

  // zip con el XML
  const zip = new JSZip();
  zip.file(`${nombreArchivoZip(d)}.xml`, xmlReubicado);
  const buffer = await zip.generateAsync({ type: "base64", compression: "DEFLATE" });

  return { xmlFirmado: xmlReubicado, zipB64: buffer };
}
