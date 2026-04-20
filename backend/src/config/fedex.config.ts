// backend/src/config/fedex.config.ts
// FedEx FDS WS (Domestic Shipping Web Service) — SOAP API
// Endpoint: https://poland.fedex.com/fdsWs/IklServicePort
// Auth: accessCode (kod dostępu) — NOT OAuth2

export const fedexConfig = {
  // FDS WS access code from FedEx Poland sales rep
  accessCode: process.env.FEDEX_FDS_ACCESS_CODE || "",

  // FDS WS SOAP endpoint
  soapUrl:
    process.env.FEDEX_FDS_SOAP_URL ||
    "https://poland.fedex.com/fdsWs/IklServicePort",

  // Sender ID in FDS system (numer klienta / EAN)
  senderId: process.env.FEDEX_FDS_SENDER_ID || "",

  // Payer ID (usually same as sender for "nadawca płaci")
  payerId: process.env.FEDEX_FDS_PAYER_ID || "",

  // Shipper (sender) contact details
  shipper: {
    companyName: process.env.FEDEX_SHIPPER_COMPANY || "Stojan S.C.",
    personName: process.env.FEDEX_SHIPPER_PERSON || "Krzysztof Leszczyński",
    phoneNumber: process.env.FEDEX_SHIPPER_PHONE || "500385112",
    email:
      process.env.FEDEX_SHIPPER_EMAIL || "stojan@silniki-elektryczne.com.pl",
    street: process.env.FEDEX_SHIPPER_STREET || "Wojewódzka",
    homeNo: process.env.FEDEX_SHIPPER_HOME_NO || "2",
    city: process.env.FEDEX_SHIPPER_CITY || "Pigża",
    postalCode: process.env.FEDEX_SHIPPER_POSTAL || "87-152",
    countryCode: process.env.FEDEX_SHIPPER_COUNTRY || "PL",
  },
} as const;

// ============================================
// LIMITS
// ============================================

/** Max weight (kg) for FedEx domestic — above this use other carrier */
export const FEDEX_MAX_WEIGHT_KG =
  Number(process.env.FEDEX_MAX_WEIGHT_KG) || 36.5;

// ============================================
// SHIPMENT DEFAULTS
// ============================================

/** Default shipment type for domestic parcels */
export const FEDEX_DEFAULT_SHIPMENT_TYPE =
  process.env.FEDEX_FDS_SHIPMENT_TYPE || "K"; // K = krajowa (national)

/** Payment form: G = gotówka, P = przelew */
export const FEDEX_DEFAULT_PAYMENT_FORM =
  process.env.FEDEX_FDS_PAYMENT_FORM || "P";

/** Payer type: N = nadawca, O = odbiorca */
export const FEDEX_DEFAULT_PAYER_TYPE = process.env.FEDEX_FDS_PAYER_TYPE || "1"; // 1 = nadawca

/** Label format for wydrukujEtykiete: PDF or EPL */
export const FEDEX_LABEL_FORMAT = process.env.FEDEX_FDS_LABEL_FORMAT || "PDF";
