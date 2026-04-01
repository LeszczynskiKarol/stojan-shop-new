// backend/src/lib/wysylajnami-client.ts

import {
  WN_API_URL,
  WN_API_KEY,
  WN_EMAIL,
  WN_PASSWORD,
  WN_COURIER_ID,
  WN_SHIPPER,
} from "../config/wysylajnami.config.js";

// ============================================
// Token cache
// ============================================
let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const res = await fetch(`${WN_API_URL}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": WN_API_KEY,
      Accept: "application/x.zk.v1+json",
    },
    body: JSON.stringify({ email: WN_EMAIL, password: WN_PASSWORD }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WN auth failed ${res.status}: ${text}`);
  }

  const data = await res.json();
  cachedToken = data.data?.token || data.token;
  if (!cachedToken) throw new Error("WN: no token in response");

  // Token valid 120 min, refresh at 100 min
  tokenExpiry = Date.now() + 100 * 60 * 1000;
  console.log("✅ Wysylajnami token obtained");
  return cachedToken;
}

// ============================================
// API fetch helper
// ============================================
async function wnFetch(
  path: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET",
  body?: any,
): Promise<any> {
  const token = await getToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Api-Key": WN_API_KEY,
    Accept: "application/x.zk.v1+json",
    Authorization: `Bearer ${token}`,
  };

  const res = await fetch(`${WN_API_URL}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`WN API error ${res.status}: ${text.substring(0, 500)}`);
  }

  if (!res.ok) {
    const errMsg =
      json.message || json.error || JSON.stringify(json.errors || json);
    throw new Error(`WN API ${res.status}: ${errMsg}`);
  }

  return json;
}

// ============================================
// Types
// ============================================
export interface WNOffer {
  courierId: number;
  courierName: string;
  price: number;
  currency: string;
  options: Array<{ name: string; price: number }>;
}

export interface WNShipmentResult {
  orderId: number;
  waybillNumber: string;
  price: number;
  courierId: number;
}

// ============================================
// Connection test
// ============================================
export async function isWNConnected(): Promise<boolean> {
  try {
    if (!WN_API_KEY || !WN_EMAIL || !WN_PASSWORD) return false;
    await getToken();
    return true;
  } catch {
    return false;
  }
}

// ============================================
// Get offers (pricing) for a shipment
// ============================================
export async function getWNOffers(
  weightKg: number,
  lengthCm?: number,
  widthCm?: number,
  heightCm?: number,
): Promise<WNOffer[]> {
  const data = await wnFetch("/user/orders/offers", "POST", {
    packages: [
      {
        product_id: weightKg > 50 ? 3 : 2, // 3=pallet, 2=parcel
        weight: weightKg,
        length: lengthCm || 80,
        width: widthCm || 60,
        height: heightCm || 60,
        non_standard: weightKg > 31.5,
        insurance_value: 0,
        description: "Silnik elektryczny",
      },
    ],
  });

  const offers: WNOffer[] = (data.data?.offers || []).map((o: any) => ({
    courierId: o.courier_id,
    courierName: getCourierName(o.courier_id),
    price: Number(o.price),
    currency: o.currency || "PLN",
    options: (o.options || []).map((opt: any) => ({
      name: opt.name,
      price: Number(opt.price),
    })),
  }));

  return offers;
}

function getCourierName(id: number): string {
  const map: Record<number, string> = {
    1: "Geis (K-ex)",
    2: "GLS",
    3: "DPD",
    4: "InPost",
    5: "DHL",
    7: "Geis (ETL)",
    12: "FedEx",
    13: "GEODIS",
    14: "UPS",
    16: "Poczta Polska palety",
    18: "Rohlig SUUS",
    22: "Rhenus Logistics",
    26: "Hellmann",
  };
  return map[id] || `Kurier #${id}`;
}

// ============================================
// Create shipment
// ============================================
export async function createWNShipment(
  receiver: {
    name: string;
    surname: string;
    company?: string;
    street: string;
    houseNumber: string;
    doorNumber?: string;
    postCode: string;
    city: string;
    phone: string;
    email?: string;
  },
  weightKg: number,
  orderNumber: string,
  courierId?: number,
  insuranceValue?: number,
  codValue?: number,
): Promise<WNShipmentResult> {
  // Get next available pickup date
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  // Skip weekends
  if (tomorrow.getDay() === 0) tomorrow.setDate(tomorrow.getDate() + 1);
  if (tomorrow.getDay() === 6) tomorrow.setDate(tomorrow.getDate() + 2);
  const pickupDate = tomorrow.toISOString().split("T")[0];

  const courier = courierId || WN_COURIER_ID;

  const orderPayload: any = {
    packages: [
      {
        product_id: weightKg > 50 ? 3 : 2,
        weight: weightKg,
        length: 80,
        width: 60,
        height: 60,
        non_standard: weightKg > 31.5,
        description: "Silnik elektryczny",
        courier_id: courier,
        pickup_date: pickupDate,
        ...(insuranceValue ? { insurance_value: insuranceValue } : {}),
        ...(codValue
          ? {
              cod_type_id: 1,
              cod_value: codValue,
              insurance_value: Math.max(insuranceValue || 0, codValue),
            }
          : {}),
        sender: {
          name: WN_SHIPPER.name,
          surname: WN_SHIPPER.surname,
          company: WN_SHIPPER.company,
          street: WN_SHIPPER.street,
          house_number: WN_SHIPPER.houseNumber,
          post_code: WN_SHIPPER.postCode,
          city: WN_SHIPPER.city,
          country_id: WN_SHIPPER.countryId,
          phone: WN_SHIPPER.phone,
          email: WN_SHIPPER.email,
        },
        receiver: {
          name: receiver.name,
          surname: receiver.surname,
          ...(receiver.company ? { company: receiver.company } : {}),
          street: receiver.street,
          house_number: receiver.houseNumber,
          ...(receiver.doorNumber ? { door_number: receiver.doorNumber } : {}),
          post_code: receiver.postCode,
          city: receiver.city,
          country_id: 1,
          phone: receiver.phone,
          ...(receiver.email ? { email: receiver.email } : {}),
        },
      },
    ],
  };

  const data = await wnFetch("/user/orders", "POST", orderPayload);
  const order = data.data?.orders?.[0] || data.data;

  const orderId = order?.id || order?.order_id;
  const waybill = order?.waybill_number || "";
  const price = Number(order?.price) || 0;

  if (!orderId) {
    throw new Error(
      `WN createOrder failed: ${JSON.stringify(data).substring(0, 500)}`,
    );
  }

  console.log(`✅ Wysylajnami order created: #${orderId}, waybill: ${waybill}`);

  return {
    orderId,
    waybillNumber: waybill,
    price,
    courierId: courier,
  };
}

// ============================================
// Download waybill (label) PDF
// ============================================
export async function getWNWaybill(
  orderId: number,
): Promise<{ url?: string; base64?: string }> {
  const data = await wnFetch("/waybill/download", "POST", {
    order_ids: [orderId],
    wants_url: true,
  });

  return {
    url: data.data?.url || data.url,
    base64: data.data?.file || data.file,
  };
}

// ============================================
// Cancel order
// ============================================
export async function cancelWNOrder(orderId: number): Promise<boolean> {
  try {
    await wnFetch(`/user/orders/${orderId}/cancel`, "PATCH");
    console.log(`✅ Wysylajnami order cancelled: #${orderId}`);
    return true;
  } catch (err: any) {
    console.error(`❌ WN cancel failed: ${err.message}`);
    return false;
  }
}
