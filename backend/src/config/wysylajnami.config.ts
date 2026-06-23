// backend/src/config/wysylajnami.config.ts

export const WN_API_URL =
  process.env.WN_API_URL || "https://api.wysylajnami.pl";
export const WN_API_KEY = process.env.WN_API_KEY || "";
export const WN_EMAIL = process.env.WN_EMAIL || "";
export const WN_PASSWORD = process.env.WN_PASSWORD || "";

// Default courier: 5 = DHL through Wysylajnami
export const WN_COURIER_ID = parseInt(process.env.WN_COURIER_ID || "5");

// Shipment type threshold: at/above this weight the shipment is sent as a
// pallet (product_id = 3, half-pallet 80×60 footprint) instead of a package
// (product_id = 2). Below it a "package" exceeds courier weight limits and the
// API only returns the single expensive option (e.g. Ambro Express ~2224 zł).
export const WN_PALLET_MIN_WEIGHT_KG = parseFloat(
  process.env.WN_PALLET_MIN_WEIGHT_KG || "37",
);

// Half-pallet (półpaleta) footprint used for pallet shipments, in cm.
export const WN_PALLET_DIMS = {
  length: parseInt(process.env.WN_PALLET_LENGTH_CM || "80"),
  width: parseInt(process.env.WN_PALLET_WIDTH_CM || "60"),
  height: parseInt(process.env.WN_PALLET_HEIGHT_CM || "80"),
};

// Package dimensions fallback (used below the pallet threshold), in cm.
export const WN_PACKAGE_DIMS = {
  length: parseInt(process.env.WN_PACKAGE_LENGTH_CM || "80"),
  width: parseInt(process.env.WN_PACKAGE_WIDTH_CM || "60"),
  height: parseInt(process.env.WN_PACKAGE_HEIGHT_CM || "60"),
};

// product_id values in the wysylajnami API
export const WN_PRODUCT_PACKAGE = 2; // paczka
export const WN_PRODUCT_PALLET = 3; // paleta / półpaleta

// Shipper (same as FedEx/DHL)
export const WN_SHIPPER = {
  name: process.env.WN_SHIPPER_NAME || "Stojan",
  surname: process.env.WN_SHIPPER_SURNAME || "S.C.",
  company:
    process.env.WN_SHIPPER_COMPANY || "Stojan S.C. A.Król, W.Leszczyński",
  street: process.env.WN_SHIPPER_STREET || "Wojewódzka",
  houseNumber: process.env.WN_SHIPPER_HOUSE || "2",
  postCode: process.env.WN_SHIPPER_POSTAL || "87-152",
  city: process.env.WN_SHIPPER_CITY || "Pigża",
  countryId: 1, // Poland
  phone: process.env.WN_SHIPPER_PHONE || "500385112",
  email: process.env.WN_SHIPPER_EMAIL || "stojan@silniki-elektryczne.com.pl",
};
