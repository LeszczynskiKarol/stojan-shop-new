// backend/src/config/wysylajnami.config.ts

export const WN_API_URL =
  process.env.WN_API_URL || "https://api.wysylajnami.pl";
export const WN_API_KEY = process.env.WN_API_KEY || "";
export const WN_EMAIL = process.env.WN_EMAIL || "";
export const WN_PASSWORD = process.env.WN_PASSWORD || "";

// Default courier: 5 = DHL through Wysylajnami
export const WN_COURIER_ID = parseInt(process.env.WN_COURIER_ID || "5");

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
