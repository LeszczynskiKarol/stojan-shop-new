// backend/src/config/fedex.config.ts
// FedEx REST API configuration
// Requires: FEDEX_CLIENT_ID, FEDEX_CLIENT_SECRET, FEDEX_ACCOUNT_NUMBER in .env

export const fedexConfig = {
  clientId: process.env.FEDEX_CLIENT_ID || "",
  clientSecret: process.env.FEDEX_CLIENT_SECRET || "",
  accountNumber: process.env.FEDEX_ACCOUNT_NUMBER || "", // 9-digit FedEx account
  apiUrl: process.env.FEDEX_API_URL || "https://apis-sandbox.fedex.com", // sandbox default; production: https://apis.fedex.com

  // Shipper (sender) — Stojan address
  shipper: {
    companyName: process.env.FEDEX_SHIPPER_COMPANY || "Stojan S.C.",
    personName: process.env.FEDEX_SHIPPER_PERSON || "Stojan S.C.",
    phoneNumber: process.env.FEDEX_SHIPPER_PHONE || "500385112",
    email:
      process.env.FEDEX_SHIPPER_EMAIL ||
      "zamowienia@silniki-elektryczne.com.pl",
    street: process.env.FEDEX_SHIPPER_STREET || "Wojewódzka 2",
    city: process.env.FEDEX_SHIPPER_CITY || "Pigża",
    postalCode: process.env.FEDEX_SHIPPER_POSTAL || "87-152",
    countryCode: process.env.FEDEX_SHIPPER_COUNTRY || "PL",
    stateOrProvinceCode: process.env.FEDEX_SHIPPER_STATE || "",
  },
} as const;

// ============================================
// LIMITS
// ============================================

/** Max weight (kg) for FedEx — above this use other carrier (paleta etc.) */
export const FEDEX_MAX_WEIGHT_KG =
  Number(process.env.FEDEX_MAX_WEIGHT_KG) || 36.5;

// ============================================
// SERVICE & LABEL
// ============================================

/** Default service type for intra-EU from Poland */
export const FEDEX_DEFAULT_SERVICE =
  process.env.FEDEX_SERVICE_TYPE || "FEDEX_REGIONAL_ECONOMY";

/** Label preferences */
export const FEDEX_LABEL_CONFIG = {
  imageType: "PDF" as const, // PDF or PNG
  labelStockType: "PAPER_4X6" as const,
  labelFormatType: "COMMON2D" as const,
} as const;
