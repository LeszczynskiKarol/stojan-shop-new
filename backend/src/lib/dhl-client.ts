// backend/src/lib/dhl-client.ts

// DHL24 WebAPI SOAP Client
// Raw XML over HTTP — no SOAP library needed

import {
  DHL_USERNAME,
  DHL_PASSWORD,
  DHL_SAP,
  DHL_WSDL_URL,
  DHL_SHIPPER,
  DHL_PRODUCT,
} from "../config/dhl.config.js";

const NS = "https://dhl24.com.pl/webapi2/provider/service.html?ws=1";

// ============================================
// SOAP envelope helper
// ============================================
function soapEnvelope(
  body: string,
  action: string,
): { xml: string; action: string } {
  return {
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="${NS}">
  <soapenv:Header/>
  <soapenv:Body>
    ${body}
  </soapenv:Body>
</soapenv:Envelope>`,
    action: `${NS}#${action}`,
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function authXml(): string {
  return `<authData>
    <username>${escapeXml(DHL_USERNAME)}</username>
    <password>${escapeXml(DHL_PASSWORD)}</password>
  </authData>`;
}

// ============================================
// Raw SOAP call
// ============================================
async function soapCall(body: string, action: string): Promise<string> {
  const envelope = soapEnvelope(body, action);
  console.log("DHL SOAP →", envelope.xml.substring(0, 500));

  const res = await fetch(DHL_WSDL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: envelope.action,
    },
    body: envelope.xml,
  });

  const text = await res.text();

  if (!res.ok) {
    // Try to extract fault message
    const faultMatch = text.match(/<faultstring>(.*?)<\/faultstring>/s);
    const detailMatch = text.match(/<detail>(.*?)<\/detail>/s);
    throw new Error(
      `DHL SOAP error ${res.status}: ${faultMatch?.[1] || detailMatch?.[1] || text.substring(0, 500)}`,
    );
  }

  // Check for SOAP Fault in 200 response
  if (
    text.includes("<SOAP-ENV:Fault>") ||
    text.includes("<soap:Fault>") ||
    text.includes("<faultstring>")
  ) {
    const faultMatch = text.match(/<faultstring>(.*?)<\/faultstring>/s);
    throw new Error(
      `DHL SOAP Fault: ${faultMatch?.[1] || text.substring(0, 500)}`,
    );
  }

  return text;
}

// ============================================
// XML parsing helpers
// ============================================
function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, "s");
  const m = xml.match(re);
  return m?.[1]?.trim() || "";
}

function extractTagAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, "gs");
  const results: string[] = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1].trim());
  }
  return results;
}

// ============================================
// Types
// ============================================
export interface DHLRecipient {
  name: string;
  postalCode: string; // without dash: "87152"
  city: string;
  street: string;
  houseNumber: string;
  apartmentNumber?: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
}

export interface DHLPackage {
  type: "PACKAGE" | "PALLET" | "ENVELOPE";
  weight: number; // kg (float)
  width?: number; // cm
  height?: number; // cm
  length?: number; // cm
  quantity: number;
  nonStandard?: boolean;
}

export interface DHLShipmentResult {
  shipmentId: string;
  trackingNumber: string;
  dispatchNumber: string;
  labelBase64: string; // PDF base64
  labelMimeType: string;
}

export interface DHLBookCourierResult {
  orderIds: string[];
}

// ============================================
// getVersion — connection test
// ============================================
export async function getDHLVersion(): Promise<string> {
  const body = `<ws:getVersion/>`;
  const xml = await soapCall(body, "getVersion");
  return extractTag(xml, "getVersionResult");
}

export async function isDHLConnected(): Promise<boolean> {
  try {
    const v = await getDHLVersion();
    return !!v;
  } catch {
    return false;
  }
}

// ============================================
// createShipment
// ============================================
export async function createDHLShipment(
  recipient: DHLRecipient,
  pkg: DHLPackage,
  orderNumber: string,
  orderValue?: number,
  shipDate?: string,
): Promise<DHLShipmentResult> {
  // Ship date: skip Sat/Sun
  const now = new Date();
  const day = now.getDay();
  if (day === 6) now.setDate(now.getDate() + 2);
  if (day === 0) now.setDate(now.getDate() + 1);
  const date = shipDate || now.toISOString().split("T")[0];

  // Postal code without dash
  const postalClean = recipient.postalCode.replace(/-/g, "");
  const shipperPostalClean = DHL_SHIPPER.postalCode.replace(/-/g, "");

  const body = `<ws:createShipment>
    ${authXml()}
    <shipment>
      <shipmentInfo>
        <dropOffType>REGULAR_PICKUP</dropOffType>
        <serviceType>${DHL_PRODUCT}</serviceType>
        <billing>
          <shippingPaymentType>SHIPPER</shippingPaymentType>
          <billingAccountNumber>${DHL_SAP}</billingAccountNumber>
          <paymentType>BANK_TRANSFER</paymentType>
        </billing>
        <specialServices>
          ${
            orderValue
              ? `<item>
                <serviceType>UBEZP</serviceType>
                <serviceValue>${orderValue}</serviceValue>
              </item>`
              : ""
          }
        </specialServices>
        <shipmentTime>
          <shipmentDate>${date}</shipmentDate>
          <shipmentStartHour>10:00</shipmentStartHour>
          <shipmentEndHour>18:00</shipmentEndHour>
        </shipmentTime>
        <labelType>BLP</labelType>
      </shipmentInfo>
      <content>Silnik elektryczny</content>
      <reference>${orderNumber}</reference>
      <ship>
        <shipper>
          <contact>
            <personName>${DHL_SHIPPER.contactPerson}</personName>
            <phoneNumber>${DHL_SHIPPER.contactPhone}</phoneNumber>
            <emailAddress>${DHL_SHIPPER.contactEmail}</emailAddress>
          </contact>
          <address>
            <name>${DHL_SHIPPER.name}</name>
            <postalCode>${shipperPostalClean}</postalCode>
            <city>${DHL_SHIPPER.city}</city>
            <street>${DHL_SHIPPER.street}</street>
            <houseNumber>${DHL_SHIPPER.houseNumber}</houseNumber>
          </address>
        </shipper>
        <receiver>
          <contact>
            <personName>${recipient.contactPerson}</personName>
            <phoneNumber>${recipient.contactPhone}</phoneNumber>
            <emailAddress>${recipient.contactEmail}</emailAddress>
          </contact>
          <address>
            <country>PL</country>
            <addressType>B</addressType>
            <name>${recipient.name}</name>
            <postalCode>${postalClean}</postalCode>
            <city>${recipient.city}</city>
            <street>${recipient.street}</street>
            <houseNumber>${recipient.houseNumber}</houseNumber>
            ${recipient.apartmentNumber ? `<apartmentNumber>${recipient.apartmentNumber}</apartmentNumber>` : ""}
          </address>
        </receiver>
      </ship>
      <pieceList>
        <item>
          <type>${pkg.type}</type>
          <weight>${pkg.weight}</weight>
          ${pkg.width ? `<width>${pkg.width}</width>` : ""}
          ${pkg.height ? `<height>${pkg.height}</height>` : ""}
          ${pkg.length ? `<length>${pkg.length}</length>` : ""}
          <quantity>${pkg.quantity}</quantity>
          ${pkg.nonStandard ? `<nonStandard>true</nonStandard>` : ""}
        </item>
      </pieceList>
    </shipment>
  </ws:createShipment>`;

  const xml = await soapCall(body, "createShipment");

  const shipmentId = extractTag(xml, "shipmentNotificationNumber");
  const trackingNumber = extractTag(xml, "shipmentTrackingNumber");
  const dispatchNumber = extractTag(xml, "dispatchNotificationNumber");

  // Label is inside <label> → <labelContent> (base64 PDF)
  const labelContent = extractTag(xml, "labelContent");
  const labelMimeType = extractTag(xml, "labelFormat") || "application/pdf";

  if (!trackingNumber) {
    throw new Error(
      `DHL createShipment failed — no tracking number. Response: ${xml.substring(0, 500)}`,
    );
  }

  console.log(`✅ DHL shipment created: ${trackingNumber} (ID: ${shipmentId})`);

  return {
    shipmentId,
    trackingNumber,
    dispatchNumber,
    labelBase64: labelContent,
    labelMimeType,
  };
}

// ============================================
// getLabels — download label PDF
// ============================================
export async function getDHLLabel(
  shipmentId: string,
  labelType: "BLP" | "ZBLP" | "LP" = "BLP",
): Promise<{ data: string; mimeType: string }> {
  const body = `<ws:getLabels>
    ${authXml()}
    <itemsToPrint>
      <item>
        <labelType>${labelType}</labelType>
        <shipmentId>${shipmentId}</shipmentId>
      </item>
    </itemsToPrint>
  </ws:getLabels>`;

  const xml = await soapCall(body, "getLabels");
  const data = extractTag(xml, "labelData");
  const mimeType = extractTag(xml, "labelMimeType") || "application/pdf";

  return { data, mimeType };
}

// ============================================
// bookCourier
// ============================================
export async function bookDHLCourier(
  shipmentIds: string[],
  pickupDate: string,
  pickupFrom: string,
  pickupTo: string,
  additionalInfo?: string,
): Promise<DHLBookCourierResult> {
  const itemsXml = shipmentIds.map((id) => `<item>${id}</item>`).join("\n");

  const body = `<ws:bookCourier>
    ${authXml()}
    <pickupDate>${pickupDate}</pickupDate>
    <pickupTimeFrom>${pickupFrom}</pickupTimeFrom>
    <pickupTimeTo>${pickupTo}</pickupTimeTo>
    ${additionalInfo ? `<additionalInfo>${additionalInfo}</additionalInfo>` : ""}
    <shipmentIdList>
      ${itemsXml}
    </shipmentIdList>
  </ws:bookCourier>`;

  const xml = await soapCall(body, "bookCourier");
  const orderIds = extractTagAll(xml, "item");

  console.log(`✅ DHL courier booked: ${orderIds.join(", ")}`);
  return { orderIds };
}

// ============================================
// cancelCourierBooking
// ============================================
export async function cancelDHLCourier(orderIds: string[]): Promise<boolean> {
  const itemsXml = orderIds.map((id) => `<item>${id}</item>`).join("\n");

  const body = `<ws:cancelCourierBooking>
    ${authXml()}
    <orders>
      ${itemsXml}
    </orders>
  </ws:cancelCourierBooking>`;

  try {
    await soapCall(body, "cancelCourierBooking");
    console.log(`✅ DHL courier cancelled: ${orderIds.join(", ")}`);
    return true;
  } catch (err: any) {
    console.error(`❌ DHL courier cancel failed: ${err.message}`);
    return false;
  }
}

// ============================================
// deleteShipment
// ============================================
export async function deleteDHLShipment(shipmentId: string): Promise<boolean> {
  const body = `<ws:deleteShipment>
    ${authXml()}
    <shipment>
      <shipmentIdentificationNumber>${shipmentId}</shipmentIdentificationNumber>
    </shipment>
  </ws:deleteShipment>`;

  try {
    const xml = await soapCall(body, "deleteShipment");
    const result = extractTag(xml, "result");
    console.log(`✅ DHL shipment deleted: ${shipmentId}, result: ${result}`);
    return result === "true";
  } catch (err: any) {
    console.error(`❌ DHL delete failed: ${err.message}`);
    return false;
  }
}

export async function getDHLPrice(
  weightKg: number,
  receiverPostalCode: string,
  receiverCity: string,
  insuranceValue?: number,
): Promise<{ price: number; fuelSurcharge: number } | null> {
  try {
    const shipperPostalClean = DHL_SHIPPER.postalCode.replace(/-/g, "");
    const receiverPostalClean = receiverPostalCode.replace(/-/g, "");

    const body = `<ws:getPrice>
      ${authXml()}
      <shipment>
        <payment>
          <payerType>SHIPPER</payerType>
          <accountNumber>${DHL_SAP}</accountNumber>
        </payment>
        <shipper>
          <country>PL</country>
          <postalCode>${shipperPostalClean}</postalCode>
          <city>${escapeXml(DHL_SHIPPER.city)}</city>
        </shipper>
        <receiver>
          <country>PL</country>
          <postalCode>${receiverPostalClean}</postalCode>
          <city>${escapeXml(receiverCity)}</city>
        </receiver>
        <service>
          <product>AH</product>
          ${insuranceValue ? `<insurance>true</insurance><insuranceValue>${insuranceValue}</insuranceValue>` : ""}
        </service>
        <pieceList>
          <item>
            <type>PACKAGE</type>
            <weight>${Math.round(weightKg)}</weight>
            <width>60</width>
            <height>60</height>
            <length>80</length>
            <quantity>1</quantity>
            <nonStandard>${weightKg > 31.5}</nonStandard>
          </item>
        </pieceList>
      </shipment>
    </ws:getPrice>`;

    const xml = await soapCall(body, "getPrice");
    const priceMatch = xml.match(/<price[^>]*>([\d.]+)<\/price>/);
    const fuelMatch = xml.match(
      /<fuelSurcharge[^>]*>([\d.]+)<\/fuelSurcharge>/,
    );

    if (!priceMatch) return null;

    return {
      price: parseFloat(priceMatch[1]),
      fuelSurcharge: fuelMatch ? parseFloat(fuelMatch[1]) : 0,
    };
  } catch (err: any) {
    console.error("DHL getPrice error:", err.message);
    return null;
  }
}
