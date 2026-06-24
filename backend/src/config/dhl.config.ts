// backend/src/config/dhl.config.ts

// DHL24 WebAPI configuration
// SOAP API for DHL eCommerce Poland

export const DHL_USERNAME = process.env.DHL_USERNAME || "gmailcom_r8g";
export const DHL_PASSWORD = process.env.DHL_PASSWORD || "";
export const DHL_SAP = process.env.DHL_SAP || "2315626";

// Production
export const DHL_WSDL_URL =
  process.env.DHL_WSDL_URL ||
  "https://dhl24.com.pl/webapi2/provider/service.html?ws=1";

// Sandbox: https://sandbox.dhl24.com.pl/webapi2/provider/service.html?ws=1

// Shipper address (same as FedEx — Stojan S.C.)
export const DHL_SHIPPER = {
  name: process.env.DHL_SHIPPER_NAME || "Stojan S.C.",
  postalCode: process.env.DHL_SHIPPER_POSTAL || "87152",
  city: process.env.DHL_SHIPPER_CITY || "Pigża",
  street: process.env.DHL_SHIPPER_STREET || "Wojewódzka",
  houseNumber: process.env.DHL_SHIPPER_HOUSE || "2",
  apartmentNumber: "",
  contactPerson: process.env.DHL_SHIPPER_CONTACT || "Stojan S.C.",
  contactPhone: process.env.DHL_SHIPPER_PHONE || "500385112",
  contactEmail:
    process.env.DHL_SHIPPER_EMAIL || "stojan@silniki-elektryczne.com.pl",
};

// DHL product type: AH = standard domestic parcel
export const DHL_PRODUCT = process.env.DHL_PRODUCT || "AH";

// Default piece dimensions (cm). DHL requires width/height/length whenever a
// piece is non-standard; omitting them triggers "Brak podanych wymaganych
// wymiarów paczki — ze względu na rozmiary paczki opcja niestandard niemożliwa".
export const DHL_PACKAGE_DIMS = {
  width: parseInt(process.env.DHL_PACKAGE_WIDTH_CM || "60"),
  height: parseInt(process.env.DHL_PACKAGE_HEIGHT_CM || "60"),
  length: parseInt(process.env.DHL_PACKAGE_LENGTH_CM || "80"),
};
export const DHL_PALLET_DIMS = {
  width: parseInt(process.env.DHL_PALLET_WIDTH_CM || "80"),
  height: parseInt(process.env.DHL_PALLET_HEIGHT_CM || "100"),
  length: parseInt(process.env.DHL_PALLET_LENGTH_CM || "120"),
};

// Above this weight a DHL piece goes as a pallet instead of a package.
export const DHL_PALLET_MIN_WEIGHT_KG = parseFloat(
  process.env.DHL_PALLET_MIN_WEIGHT_KG || "50",
);

// DHL tracking URL
export const DHL_TRACKING_URL =
  "https://www.dhl.com/pl-pl/home/sledzenie.html?tracking-id=";
