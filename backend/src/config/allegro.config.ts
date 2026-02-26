// backend/src/config/allegro.config.ts

export const allegroConfig = {
  clientId: process.env.ALLEGRO_CLIENT_ID || "",
  clientSecret: process.env.ALLEGRO_CLIENT_SECRET || "",
  sellerId: process.env.ALLEGRO_SELLER_ID || "",
  apiUrl: "https://api.allegro.pl",
  authUrl: "https://allegro.pl/auth/oauth",
  redirectUri: process.env.ALLEGRO_REDIRECT_URI || "",
} as const;

// Kategorie Allegro dla silników
export const ALLEGRO_CATEGORIES = {
  SILNIKI: "121456",
  MOTOREDUKTORY: "121452",
} as const;

// Mapowania parametrów Allegro per kategoria
export const ALLEGRO_PARAMS = {
  CONDITION: "11323",
  CONDITION_NEW: "11323_1",
  CONDITION_USED: "11323_2",

  SILNIKI: {
    MOC: "219137",
    OBROTY: "219153",
    NAPIECIE: "219165",
    WAGA: "214478",
    SREDNICA_WALU: "219149",
    MODEL: "237206",
    TYP_SILNIKA: "219145",
    PRODUCENT: "248929",
  },
  MOTOREDUKTORY: {
    MOC_ZNAMIONOWA: "11726",
    OBROTY: "221421",
    WAGA: "214694",
    SREDNICA_WALU: "219149",
    MODEL: "237206",
    RODZAJ: "18654",
    PRODUCENT: "248929",
  },
} as const;

// Cenniki wysyłkowe Smart! wg wagi
export const ALLEGRO_SHIPPING_RATES = [
  { maxWeight: 1, id: "6c97494e-b06e-463e-8cf5-d36750d2ca31", smart: true },
  { maxWeight: 4, id: "38161cbb-1386-4f17-96e3-4fae1f6de5ee", smart: true },
  { maxWeight: 5, id: "5720f29c-89d2-4b8a-8e5b-4bc05d03ced4", smart: true },
  { maxWeight: 9, id: "28c0b642-2c0c-4b12-8e07-8116fd33f716", smart: true },
  { maxWeight: 13, id: "4225471b-4ca3-4a41-8af0-08a8bd8d0622", smart: true },
  { maxWeight: 18, id: "8ac507c5-5868-4f17-91cc-b76addadb954", smart: true },
  { maxWeight: 22, id: "452b15db-1f8b-4f16-b7cc-c882b7d8f4af", smart: true },
  { maxWeight: 27.5, id: "f1570290-5db6-4614-bc16-0aeddbccd58f", smart: true },
  { maxWeight: 30, id: "592aba1b-5240-4589-8118-dd9d22306e66", smart: true },
  {
    maxWeight: Infinity,
    id: "aa79662f-56d6-4f98-89c5-c960482c2c5f",
    smart: false,
  },
] as const;

export function getShippingRateId(weightKg: number): string {
  const rate = ALLEGRO_SHIPPING_RATES.find((r) => weightKg <= r.maxWeight);
  return rate?.id || ALLEGRO_SHIPPING_RATES[0].id;
}
