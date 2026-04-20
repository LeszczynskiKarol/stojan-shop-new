// backend/src/lib/fedex-client.ts
// FedEx FDS WS (Domestic Shipping Web Service) — SOAP client
// Endpoint: https://poland.fedex.com/fdsWs/IklServicePort
// WSDL: https://poland.fedex.com/fdsWs/IklServicePort?wsdl
//
// Replaces the global REST API (apis.fedex.com) integration.
// FDS WS uses simple accessCode auth (no OAuth2) and has:
// - Negotiated/contract rates (not list prices)
// - Built-in COD (pobranie) support
// - Built-in insurance (ubezpieczenie) with flat tiers
// - No >25kg surcharge like FSM

import {
  fedexConfig,
  FEDEX_MAX_WEIGHT_KG,
  FEDEX_DEFAULT_SHIPMENT_TYPE,
  FEDEX_DEFAULT_PAYMENT_FORM,
  FEDEX_DEFAULT_PAYER_TYPE,
  FEDEX_LABEL_FORMAT,
} from "../config/fedex.config.js";

const { accessCode, soapUrl, senderId, payerId, shipper } = fedexConfig;

// ============================================
// SOAP NAMESPACE
// ============================================

const NS = "http://ws.alfaprojekt.com/";

// ============================================
// TYPES
// ============================================

export interface FedExShipmentResult {
  waybill: string; // numer listu przewozowego (tracking number)
  nrExt: string; // numer zewnętrzny (order number)
}

export interface FedExRecipient {
  personName: string; // imię
  surname: string; // nazwisko
  companyName?: string;
  nip?: string;
  phoneNumber: string;
  email?: string;
  street: string; // ulica (bez numeru domu)
  homeNo: string; // numer domu
  localNo?: string; // numer lokalu
  city: string;
  postalCode: string;
  countryCode: string; // ISO2, e.g. "PL"
  isCompany?: boolean;
}

export interface FedExPackage {
  weightKg: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  type?: string; // typ paczki
}

export interface FedExCodOptions {
  codType?: string; // typ pobrania
  codValue: number; // kwota pobrania
  bankAccountNumber: string; // nr konta
}

export interface FedExInsuranceOptions {
  insuranceValue: number; // kwota ubezpieczenia
  contentDescription?: string; // opis zawartości
}

// ============================================
// SOAP HELPERS
// ============================================

/** Truncate to max len for FDS WS fields */
function maxLen(s: string, max: number): string {
  return s.substring(0, max);
}

/**
 * Wraps a SOAP body in a full envelope
 */
function soapEnvelope(operationXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="${NS}">
  <soapenv:Header/>
  <soapenv:Body>
    ${operationXml}
  </soapenv:Body>
</soapenv:Envelope>`;
}

/**
 * Makes a SOAP call to FDS WS and returns parsed response body.
 * Throws on SOAP faults or HTTP errors.
 */
async function soapCall(
  operationName: string,
  bodyXml: string,
): Promise<string> {
  const envelope = soapEnvelope(bodyXml);

  const res = await fetch(soapUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "",
    },
    body: envelope,
  });

  const responseText = await res.text();

  if (!res.ok) {
    // Try to extract SOAP fault
    const faultMatch = responseText.match(
      /<faultstring[^>]*>([\s\S]*?)<\/faultstring>/,
    );
    const errorMatch = responseText.match(/<opis[^>]*>([\s\S]*?)<\/opis>/);
    const msg =
      faultMatch?.[1] ||
      errorMatch?.[1] ||
      `HTTP ${res.status}: ${responseText.substring(0, 500)}`;
    throw new Error(`FDS WS ${operationName}: ${msg}`);
  }

  // Check for SOAP Fault in 200 response
  if (
    responseText.includes("<soap:Fault>") ||
    responseText.includes("<S:Fault>")
  ) {
    const faultMatch = responseText.match(
      /<faultstring[^>]*>([\s\S]*?)<\/faultstring>/,
    );
    const opisMatch = responseText.match(/<opis[^>]*>([\s\S]*?)<\/opis>/g);
    const errors = opisMatch
      ? opisMatch.map((m) => m.replace(/<\/?opis[^>]*>/g, "")).join("; ")
      : "";
    const msg = faultMatch?.[1] || errors || "Unknown SOAP Fault";
    throw new Error(`FDS WS ${operationName}: ${msg}`);
  }

  return responseText;
}

/**
 * Extract text content of a given XML tag from response.
 * Simple regex-based — sufficient for FDS WS flat responses.
 */
function extractTag(xml: string, tagName: string): string | null {
  // Match both ns2:tagName and tagName (with or without namespace prefix)
  const regex = new RegExp(
    `<(?:[\\w]+:)?${tagName}[^>]*>([\\s\\S]*?)<\\/(?:[\\w]+:)?${tagName}>`,
  );
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

/**
 * Extract base64 binary content (for labels/documents)
 */
function extractBase64Tag(xml: string, tagName: string): string | null {
  return extractTag(xml, tagName);
}

/**
 * Escape XML special characters
 */
function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Optional XML element — only include if value is truthy
 */
function optEl(tag: string, value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === "") return "";
  return `<${tag}>${escXml(String(value))}</${tag}>`;
}

// ============================================
// CHECK ELIGIBILITY
// ============================================

/**
 * Sprawdza czy zamówienie kwalifikuje się do wysyłki FedEx (waga ≤ limit).
 */
export function isFedExEligible(totalWeightKg: number): boolean {
  return totalWeightKg > 0 && totalWeightKg <= FEDEX_MAX_WEIGHT_KG;
}

// ============================================
// CREATE SHIPMENT — zapiszListV2
// ============================================

/**
 * Tworzy przesyłkę w FDS WS.
 * Operacja: zapiszListV2
 * Zwraca: waybill (numer listu / tracking number)
 *
 * Etykieta jest pobierana OSOBNO przez getLabel().
 */
export async function createFedExShipment(
  recipient: FedExRecipient,
  pkg: FedExPackage,
  orderNumber: string,
  orderValue?: number,
  cod?: FedExCodOptions,
  insurance?: FedExInsuranceOptions,
): Promise<FedExShipmentResult> {
  if (!isFedExEligible(pkg.weightKg)) {
    throw new Error(
      `Waga ${pkg.weightKg} kg przekracza limit FedEx (${FEDEX_MAX_WEIGHT_KG} kg)`,
    );
  }

  // Build COD section
  let codXml = "";
  if (cod) {
    codXml = `
        <cod>
          ${optEl("codType", cod.codType || "P")}
          <codValue>${cod.codValue}</codValue>
          <bankAccountNumber>${escXml(cod.bankAccountNumber)}</bankAccountNumber>
        </cod>`;
  }

  // Build insurance section
  let insuranceXml = "";
  if (insurance) {
    insuranceXml = `
        <insurance>
          <insuranceValue>${insurance.insuranceValue}</insuranceValue>
          ${optEl("contentDescription", insurance.contentDescription)}
        </insurance>`;
  }

  // Build dimensions if provided
  let dimsXml = "";
  if (pkg.lengthCm && pkg.widthCm && pkg.heightCm) {
    dimsXml = `
            <dim1>${Math.round(pkg.lengthCm)}</dim1>
            <dim2>${Math.round(pkg.widthCm)}</dim2>
            <dim3>${Math.round(pkg.heightCm)}</dim3>`;
  }

  const body = `
    <ws:zapiszListV2>
      <accessCode>${escXml(accessCode)}</accessCode>
      <shipmentV2>
        <nrExt>${escXml(orderNumber)}</nrExt>
        <paymentForm>${escXml(FEDEX_DEFAULT_PAYMENT_FORM)}</paymentForm>
        <shipmentType>${escXml(FEDEX_DEFAULT_SHIPMENT_TYPE)}</shipmentType>
        <payerType>${escXml(FEDEX_DEFAULT_PAYER_TYPE)}</payerType>
        <sender>
          <senderId>${escXml(senderId)}</senderId>
          <contactDetails>
            <name>${escXml(maxLen(shipper.personName.split(" ")[0] || "Krzysztof", 30))}</name>
            <surname>${escXml(maxLen(shipper.personName.split(" ").slice(1).join(" ") || "Leszczyński", 50))}</surname>
            <phoneNo>${escXml(shipper.phoneNumber)}</phoneNo>
            ${optEl("email", shipper.email)}
          </contactDetails>
        </sender>
        <receiver>
          <addressDetails>
            <isCompany>${recipient.isCompany || !!recipient.companyName ? "1" : "0"}</isCompany>
            ${optEl("companyName", recipient.companyName)}
            ${optEl("vatNo", recipient.nip)}
            <name>${escXml(maxLen(recipient.personName, 30))}</name>
            <surname>${escXml(maxLen(recipient.surname, 50))}</surname>
            <city>${escXml(recipient.city)}</city>
            <postalCode>${escXml(recipient.postalCode)}</postalCode>
            <countryCode>${escXml(recipient.countryCode)}</countryCode>
            <street>${escXml(recipient.street)}</street>
            <homeNo>${escXml(recipient.homeNo)}</homeNo>
            ${optEl("localNo", recipient.localNo)}
          </addressDetails>
          <contactDetails>
            <name>${escXml(recipient.personName)}</name>
            <surname>${escXml(recipient.surname)}</surname>
            <phoneNo>${escXml(recipient.phoneNumber)}</phoneNo>
            ${optEl("email", recipient.email)}
          </contactDetails>
        </receiver>
        <payer>
          <payerId>${escXml(payerId || senderId)}</payerId>
          <contactDetails>
            <name>${escXml(maxLen(shipper.personName.split(" ")[0] || "Krzysztof", 30))}</name>
            <surname>${escXml(maxLen(shipper.personName.split(" ").slice(1).join(" ") || "Leszczyński", 50))}</surname>
            <phoneNo>${escXml(shipper.phoneNumber)}</phoneNo>
          </contactDetails>
        </payer>${codXml}${insuranceXml}
        <proofOfDispatch>
          <senderSignature>${escXml(maxLen(shipper.personName || "Krzysztof Leszczynski", 50))}</senderSignature>
          <courierId>000000</courierId>
          <sendDate>${new Date().toISOString().slice(0, 10)} ${new Date().toTimeString().slice(0, 5)}</sendDate>
        </proofOfDispatch>
        <parcels>
          <parcel>
            <weight>${pkg.weightKg}</weight>${dimsXml}
            <type>PC</type>
            <shape>0</shape>
            ${optEl("nrExtPp", orderNumber)}
          </parcel>
        </parcels>
        ${optEl("remarks", `Zamówienie ${orderNumber}`)}
      </shipmentV2>
    </ws:zapiszListV2>`;
  console.log("🔍 FDS WS zapiszListV2 REQUEST BODY:\n", body);
  const responseXml = await soapCall("zapiszListV2", body);

  // Parse response — listZapisanyV2 contains waybill
  const waybill = extractTag(responseXml, "waybill");
  if (!waybill) {
    console.error(
      "❌ FDS WS zapiszListV2: brak waybill w odpowiedzi:",
      responseXml.substring(0, 1000),
    );
    throw new Error("FDS WS zapiszListV2: brak numeru listu w odpowiedzi");
  }

  console.log(
    `✅ FDS WS shipment created: waybill=${waybill}, order=${orderNumber}`,
  );

  return {
    waybill,
    nrExt: orderNumber,
  };
}

// ============================================
// GET LABEL — wydrukujEtykiete
// ============================================

/**
 * Pobiera etykietę przesyłki (PDF base64).
 * Operacja: wydrukujEtykiete
 *
 * MUSI być wywołana PO zapiszListV2 — potrzebuje numeru listu (waybill).
 */
export async function getFedExLabel(
  waybill: string,
  format?: string,
): Promise<string> {
  const body = `
    <ws:wydrukujEtykiete>
      <kodDostepu>${escXml(accessCode)}</kodDostepu>
      <numerPrzesylki>${escXml(waybill)}</numerPrzesylki>
      <format>${escXml(format || FEDEX_LABEL_FORMAT)}</format>
    </ws:wydrukujEtykiete>`;

  const responseXml = await soapCall("wydrukujEtykiete", body);

  const labelBase64 = extractBase64Tag(responseXml, "etykietaBajty");
  if (!labelBase64) {
    throw new Error(`FDS WS wydrukujEtykiete: brak etykiety dla ${waybill}`);
  }

  console.log(`✅ FDS WS label retrieved: waybill=${waybill}`);
  return labelBase64;
}

/**
 * Pobiera etykietę pojedynczej paczki.
 * Operacja: wydrukujEtykietePaczki
 */
export async function getFedExParcelLabel(
  parcelNumber: string,
  format?: string,
): Promise<string> {
  const body = `
    <ws:wydrukujEtykietePaczki>
      <kodDostepu>${escXml(accessCode)}</kodDostepu>
      <numerPaczki>${escXml(parcelNumber)}</numerPaczki>
      <format>${escXml(format || FEDEX_LABEL_FORMAT)}</format>
    </ws:wydrukujEtykietePaczki>`;

  const responseXml = await soapCall("wydrukujEtykietePaczki", body);

  const labelBase64 = extractBase64Tag(responseXml, "etykietaBajty");
  if (!labelBase64) {
    throw new Error(
      `FDS WS wydrukujEtykietePaczki: brak etykiety dla ${parcelNumber}`,
    );
  }

  return labelBase64;
}

// ============================================
// CANCEL SHIPMENT — NOT AVAILABLE IN FDS WS
// ============================================

/**
 * FDS WS NIE MA operacji anulowania przesyłki.
 * Jedyna opcja to kontakt z infolinią FedEx.
 *
 * Zachowujemy interfejs dla kompatybilności z fedex-service.ts.
 */
export async function cancelFedExShipment(
  _trackingNumber: string,
): Promise<boolean> {
  console.warn(
    `⚠️ FDS WS nie obsługuje anulowania przesyłek przez API. ` +
      `Przesyłka ${_trackingNumber} — skontaktuj się z FedEx: 800 400 800`,
  );
  return false;
}

// ============================================
// GET AVAILABLE SERVICES — pobierzDostepneUslugi
// ============================================

/**
 * Sprawdza dostępne usługi dla danego kodu pocztowego.
 * Operacja: pobierzDostepneUslugi
 *
 * UWAGA: NIE zwraca cen — tylko listę kodów usług.
 * Ceny są wg cennika umownego (contract rates).
 */
export async function getAvailableServices(
  postalCode: string,
): Promise<string[]> {
  const body = `
    <ws:pobierzDostepneUslugi>
      <accessCode>${escXml(accessCode)}</accessCode>
      <postalCode>${escXml(postalCode)}</postalCode>
    </ws:pobierzDostepneUslugi>`;

  const responseXml = await soapCall("pobierzDostepneUslugi", body);

  // Extract all availableService entries
  const services: string[] = [];
  const regex =
    /<(?:[\w]+:)?availableService[^>]*>([\s\S]*?)<\/(?:[\w]+:)?availableService>/g;
  let match;
  while ((match = regex.exec(responseXml)) !== null) {
    services.push(match[1].trim());
  }

  return services;
}

// ============================================
// GET RATES — compatibility wrapper
// ============================================

export interface FedExRate {
  serviceType: string;
  serviceName: string;
  totalCharge: number;
  currency: string;
  transitDays?: string;
}

/**
 * FDS WS nie ma endpointu rate quotes.
 * Zwracamy dostępne usługi bez cen (ceny wg cennika umownego).
 * Zachowujemy interfejs dla kompatybilności z admin-fedex.ts.
 */
export async function getFedExRates(
  recipient: FedExRecipient,
  weightKg: number,
): Promise<FedExRate[]> {
  if (!isFedExEligible(weightKg)) return [];

  try {
    const services = await getAvailableServices(recipient.postalCode);
    return services.map((svc) => ({
      serviceType: svc,
      serviceName: svc,
      totalCharge: 0, // FDS WS nie zwraca cen — cena wg umowy
      currency: "PLN",
      transitDays: undefined,
    }));
  } catch (err) {
    console.warn("⚠️ pobierzDostepneUslugi failed:", err);
    return [];
  }
}

// ============================================
// TRACKING — pobierzStatusyPrzesylki
// ============================================

export interface FedExTrackingStatus {
  date: string;
  shortStatus: string;
  description: string;
  department: string;
  recipientSignature?: string;
}

/**
 * Pobiera statusy przesyłki.
 * Operacja: pobierzStatusyPrzesylki
 */
export async function getShipmentStatuses(
  waybill: string,
  lastOnly?: boolean,
): Promise<FedExTrackingStatus[]> {
  const body = `
    <ws:pobierzStatusyPrzesylki>
      <kodDostepu>${escXml(accessCode)}</kodDostepu>
      <numerPrzesylki>${escXml(waybill)}</numerPrzesylki>
      <czyOstatni>${lastOnly ? 1 : 0}</czyOstatni>
    </ws:pobierzStatusyPrzesylki>`;

  const responseXml = await soapCall("pobierzStatusyPrzesylki", body);

  const statuses: FedExTrackingStatus[] = [];
  const statusRegex =
    /<(?:[\w]+:)?statusyPrzesylki[^>]*>([\s\S]*?)<\/(?:[\w]+:)?statusyPrzesylki>/g;
  let match;
  while ((match = statusRegex.exec(responseXml)) !== null) {
    const chunk = match[1];
    statuses.push({
      date: extractTag(chunk, "dataS") || "",
      shortStatus: extractTag(chunk, "skrot") || "",
      description: extractTag(chunk, "opis") || "",
      department: extractTag(chunk, "oddSymbol") || "",
      recipientSignature: extractTag(chunk, "podpisOdbiorcy") || undefined,
    });
  }

  return statuses;
}

// ============================================
// PICKUP — dodajZlecenieV2
// ============================================

export interface FedExPickupResult {
  pickupConfirmationCode: string;
  pickupDate: string;
  location: string;
}

/**
 * Zamawia podjazd kuriera FedEx.
 * Operacja: dodajZlecenieV2
 */
export async function createFedExPickup(
  readyTime: string, // ISO datetime or "YYYY-MM-DD"
  closeTime: string, // ISO datetime (not used in FDS WS — only hour extracted)
  packageCount: number,
  totalWeightKg: number,
): Promise<FedExPickupResult> {
  // Extract date and hour
  const pickupDate = readyTime.split("T")[0]; // "2026-04-12"
  const pickupHour = readyTime.includes("T")
    ? readyTime.split("T")[1]?.substring(0, 5) || "14:00"
    : "14:00";

  const body = `
    <ws:dodajZlecenieV2>
      <accessCode>${escXml(accessCode)}</accessCode>
      <pickupOrder>
        <paymentForm>${escXml(FEDEX_DEFAULT_PAYMENT_FORM)}</paymentForm>
        <shipmentType>${escXml(FEDEX_DEFAULT_SHIPMENT_TYPE)}</shipmentType>
        <payerType>${escXml(FEDEX_DEFAULT_PAYER_TYPE)}</payerType>
        <pickupDate>${escXml(pickupDate)}</pickupDate>
        <pickupHour>${escXml(pickupHour)}</pickupHour>
        <sender>
          <senderId>${escXml(senderId)}</senderId>
          <addressDetails>
            <isCompany>1</isCompany>
            <companyName>${escXml(shipper.companyName)}</companyName>
            <name>${escXml(shipper.personName.split(" ")[0] || "Krzysztof")}</name>
            <surname>${escXml(shipper.personName.split(" ").slice(1).join(" ") || "Leszczyński")}</surname>
            <city>${escXml(shipper.city)}</city>
            <postalCode>${escXml(shipper.postalCode)}</postalCode>
            <countryCode>${escXml(shipper.countryCode)}</countryCode>
            <street>${escXml(shipper.street)}</street>
            <homeNo>${escXml(shipper.homeNo)}</homeNo>
          </addressDetails>
          <contactDetails>
            <name>${escXml(shipper.personName.split(" ")[0] || "Krzysztof")}</name>
            <surname>${escXml(shipper.personName.split(" ").slice(1).join(" ") || "Leszczyński")}</surname>
            <phoneNo>${escXml(shipper.phoneNumber)}</phoneNo>
            <email>${escXml(shipper.email)}</email>
          </contactDetails>
        </sender>
        <payer>
          <payerId>${escXml(payerId || senderId)}</payerId>
          <contactDetails>
            <name>${escXml(shipper.personName.split(" ")[0] || "Krzysztof")}</name>
            <surname>${escXml(shipper.personName.split(" ").slice(1).join(" ") || "Leszczyński")}</surname>
            <phoneNo>${escXml(shipper.phoneNumber)}</phoneNo>
          </contactDetails>
        </payer>
        <shipmentWeight>${totalWeightKg}</shipmentWeight>
        <shipmentAmount>${packageCount}</shipmentAmount>
      </pickupOrder>
    </ws:dodajZlecenieV2>`;

  const responseXml = await soapCall("dodajZlecenieV2", body);

  const pickupId = extractTag(responseXml, "pickupId") || "";
  const pickupNumber = extractTag(responseXml, "pickupNumber") || "";
  const respDate = extractTag(responseXml, "pickupDate") || pickupDate;

  console.log(
    `✅ FDS WS pickup created: id=${pickupId}, number=${pickupNumber}, date=${respDate}`,
  );

  return {
    pickupConfirmationCode: pickupNumber || pickupId,
    pickupDate: respDate,
    location: "", // FDS WS doesn't return location code
  };
}

/**
 * Anuluje podjazd kuriera.
 * Operacja: anulujZlecenie
 */
export async function cancelFedExPickup(
  confirmationCode: string,
  pickupDate: string,
  _location?: string, // not used in FDS WS
): Promise<boolean> {
  try {
    const body = `
      <ws:anulujZlecenie>
        <accessCode>${escXml(accessCode)}</accessCode>
        <pickupNumber>${escXml(confirmationCode)}</pickupNumber>
        <pickupDate>${escXml(pickupDate)}</pickupDate>
      </ws:anulujZlecenie>`;

    const responseXml = await soapCall("anulujZlecenie", body);

    const result = extractTag(responseXml, "anulujZlecenieResponse") || "";
    console.log(
      `✅ FDS WS pickup cancelled: ${confirmationCode}, result: ${result}`,
    );
    return true;
  } catch (err: any) {
    console.error(`❌ FDS WS pickup cancel failed: ${err.message}`);
    return false;
  }
}

// ============================================
// HEALTH CHECK — pobierzWersje
// ============================================

/**
 * Sprawdza czy FDS WS jest dostępne (pobiera wersję API).
 */
export async function isFedExConnected(): Promise<boolean> {
  try {
    if (!accessCode) return false;

    const services = await getAvailableServices("00-001");
    return services.length > 0;
  } catch {
    return false;
  }
}

// ============================================
// DISPATCH DOCUMENT — zapiszDokumentWydania
// ============================================

/**
 * Tworzy i pobiera dokument wydania (manifest) dla grupy przesyłek.
 * Operacja: zapiszDokumentWydania → PDF base64
 */
export async function getDispatchDocument(waybills: string[]): Promise<string> {
  const body = `
    <ws:zapiszDokumentWydania>
      <kodDostepu>${escXml(accessCode)}</kodDostepu>
      <numeryPrzesylki>${escXml(waybills.join(","))}</numeryPrzesylki>
      <separator>,</separator>
    </ws:zapiszDokumentWydania>`;

  const responseXml = await soapCall("zapiszDokumentWydania", body);
  const pdfBase64 = extractBase64Tag(responseXml, "dokumentWydaniaPdf");

  if (!pdfBase64) {
    throw new Error("FDS WS: brak dokumentu wydania w odpowiedzi");
  }

  return pdfBase64;
}
