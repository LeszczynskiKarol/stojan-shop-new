// backend/src/lib/fedex-client.ts
// FedEx REST API client — OAuth2 + Ship API
// Pattern: analogiczny do allegro-client.ts (in-memory token cache)

import {
  fedexConfig,
  FEDEX_DEFAULT_SERVICE,
  FEDEX_LABEL_CONFIG,
  FEDEX_MAX_WEIGHT_KG,
} from "../config/fedex.config.js";

const { apiUrl, clientId, clientSecret, accountNumber, shipper } = fedexConfig;

// ============================================
// TYPES
// ============================================

export interface FedExShipmentResult {
  trackingNumber: string;
  masterTrackingNumber: string;
  labelBase64: string; // PDF base64
  labelUrl?: string;
  serviceType: string;
  shipDate: string;
}

export interface FedExRecipient {
  personName: string;
  companyName?: string;
  phoneNumber: string;
  email?: string;
  street: string;
  city: string;
  postalCode: string;
  countryCode: string; // ISO2, e.g. "PL"
  stateOrProvinceCode?: string;
  residential?: boolean;
}

export interface FedExPackage {
  weightKg: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
}

// ============================================
// TOKEN CACHE (in-memory, ~55 min TTL)
// ============================================

let _cachedToken: string | null = null;
let _tokenExpiresAt = 0;

/**
 * OAuth2 Bearer token z FedEx. Cache'owany ~55 min (token żyje 60 min).
 */
export async function getFedExToken(): Promise<string> {
  const now = Date.now();
  if (_cachedToken && now < _tokenExpiresAt) {
    return _cachedToken;
  }

  if (!clientId || !clientSecret) {
    throw new Error(
      "FedEx credentials not configured (FEDEX_CLIENT_ID / FEDEX_CLIENT_SECRET)",
    );
  }

  const res = await fetch(`${apiUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FedEx OAuth failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  _cachedToken = data.access_token;
  _tokenExpiresAt = now + (data.expires_in - 300) * 1000; // refresh 5 min early

  console.log("✅ FedEx OAuth token obtained");
  return _cachedToken;
}

/**
 * Helper: authenticated FedEx API call
 */
export async function fedexFetch(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<any> {
  const token = await getFedExToken();

  const res = await fetch(`${apiUrl}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-locale": "en_US",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error(
      `❌ FedEx API ${endpoint} FULL RESPONSE:`,
      JSON.stringify(data, null, 2),
    );
    const errMsg =
      data?.errors?.[0]?.message || data?.message || JSON.stringify(data);
    throw new Error(`FedEx API ${endpoint} (${res.status}): ${errMsg}`);
  }

  return data;
}

/**
 * Helper: authenticated FedEx PUT call (cancel etc.)
 */
async function fedexPut(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<any> {
  const token = await getFedExToken();

  const res = await fetch(`${apiUrl}${endpoint}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-locale": "en_US",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error(
      `❌ FedEx API ${endpoint} FULL RESPONSE:`,
      JSON.stringify(data, null, 2),
    );
    const errMsg =
      data?.errors?.[0]?.message || data?.message || JSON.stringify(data);
    throw new Error(`FedEx API ${endpoint} (${res.status}): ${errMsg}`);
  }

  return data;
}

// ============================================
// CHECK ELIGIBILITY
// ============================================

/**
 * Sprawdza czy zamówienie kwalifikuje się do wysyłki FedEx (waga ≤ 36.5 kg).
 */
export function isFedExEligible(totalWeightKg: number): boolean {
  return totalWeightKg > 0 && totalWeightKg <= FEDEX_MAX_WEIGHT_KG;
}

// ============================================
// CREATE SHIPMENT → label + tracking number
// ============================================

/**
 * Tworzy przesyłkę FedEx i zwraca tracking number + etykietę (PDF base64).
 *
 * Endpoint: POST /ship/v1/shipments
 */
export async function createFedExShipment(
  recipient: FedExRecipient,
  pkg: FedExPackage,
  orderNumber: string,
  orderValue?: number,
  shipDate?: string,
): Promise<FedExShipmentResult> {
  // Validate weight
  if (!isFedExEligible(pkg.weightKg)) {
    throw new Error(
      `Waga ${pkg.weightKg} kg przekracza limit FedEx (${FEDEX_MAX_WEIGHT_KG} kg)`,
    );
  }

  // Ship date = next business day (skip Sat/Sun — Saturday surcharge)
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 6=Sat
  if (day === 6) now.setDate(now.getDate() + 2); // Sat → Mon
  if (day === 0) now.setDate(now.getDate() + 1); // Sun → Mon
  const today = shipDate || now.toISOString().split("T")[0];

  const requestBody: Record<string, unknown> = {
    labelResponseOptions: "LABEL", // base64 encoded label
    accountNumber: {
      value: accountNumber,
    },
    requestedShipment: {
      shipDatestamp: today,
      pickupType: "USE_SCHEDULED_PICKUP",
      serviceType: FEDEX_DEFAULT_SERVICE,
      packagingType: "YOUR_PACKAGING",
      totalWeight: pkg.weightKg,
      shipper: {
        address: {
          streetLines: [shipper.street],
          city: shipper.city,
          postalCode: shipper.postalCode,
          countryCode: shipper.countryCode,
          stateOrProvinceCode: shipper.stateOrProvinceCode || undefined,
          residential: false,
        },
        contact: {
          personName: shipper.personName,
          companyName: shipper.companyName,
          phoneNumber: shipper.phoneNumber,
          emailAddress: shipper.email,
        },
      },
      recipients: [
        {
          address: {
            streetLines: [recipient.street],
            city: recipient.city,
            postalCode: recipient.postalCode,
            countryCode: recipient.countryCode,
            stateOrProvinceCode: recipient.stateOrProvinceCode || undefined,
            residential: recipient.residential ?? true,
          },
          contact: {
            personName: recipient.personName,
            companyName: recipient.companyName || undefined,
            phoneNumber: recipient.phoneNumber,
            emailAddress: recipient.email || undefined,
          },
        },
      ],
      shippingChargesPayment: {
        paymentType: "SENDER",
      },
      labelSpecification: {
        labelFormatType: FEDEX_LABEL_CONFIG.labelFormatType,
        imageType: FEDEX_LABEL_CONFIG.imageType,
        labelStockType: FEDEX_LABEL_CONFIG.labelStockType,
      },

      customerReferences: [
        {
          customerReferenceType: "CUSTOMER_REFERENCE",
          value: orderNumber,
        },
      ],
      requestedPackageLineItems: [
        {
          weight: {
            units: "KG",
            value: pkg.weightKg,
          },
          ...(orderValue
            ? {
                declaredValue: {
                  amount: orderValue,
                  currency: "PLN",
                },
              }
            : {}),
          ...(pkg.lengthCm && pkg.widthCm && pkg.heightCm
            ? {
                dimensions: {
                  length: Math.round(pkg.lengthCm),
                  width: Math.round(pkg.widthCm),
                  height: Math.round(pkg.heightCm),
                  units: "CM",
                },
              }
            : {}),
        },
      ],
    },
  };

  const data = await fedexFetch("/ship/v1/shipments", requestBody);

  // Parse response
  const shipment = data?.output?.transactionShipments?.[0];
  if (!shipment) {
    throw new Error(
      "FedEx createShipment: brak transactionShipments w odpowiedzi",
    );
  }

  const pieceResponse = shipment.pieceResponses?.[0];
  const trackingNumber =
    pieceResponse?.trackingNumber || shipment.masterTrackingNumber || "";

  // Label — encoded base64 PDF
  let labelBase64 = "";
  let labelUrl = "";

  // Check package documents first (per-piece label)
  const pkgDocs = pieceResponse?.packageDocuments;
  if (pkgDocs?.[0]?.encodedLabel) {
    labelBase64 = pkgDocs[0].encodedLabel;
  } else if (pkgDocs?.[0]?.url) {
    labelUrl = pkgDocs[0].url;
  }

  // Fallback to shipment-level documents
  if (!labelBase64 && !labelUrl) {
    const shipDocs = shipment.shipmentDocuments;
    if (shipDocs?.[0]?.encodedLabel) {
      labelBase64 = shipDocs[0].encodedLabel;
    } else if (shipDocs?.[0]?.url) {
      labelUrl = shipDocs[0].url;
    }
  }

  console.log(
    `✅ FedEx shipment created: tracking=${trackingNumber}, order=${orderNumber}`,
  );

  return {
    trackingNumber,
    masterTrackingNumber: shipment.masterTrackingNumber || trackingNumber,
    labelBase64,
    labelUrl,
    serviceType: shipment.serviceType || FEDEX_DEFAULT_SERVICE,
    shipDate: shipment.shipDatestamp || today,
  };
}

// ============================================
// CANCEL SHIPMENT
// ============================================

/**
 * Anuluje przesyłkę FedEx (przed przekazaniem do kuriera).
 *
 * Endpoint: PUT /ship/v1/shipments/cancel
 */
export async function cancelFedExShipment(
  trackingNumber: string,
): Promise<boolean> {
  try {
    const data = await fedexPut("/ship/v1/shipments/cancel", {
      accountNumber: {
        value: accountNumber,
      },
      trackingNumber,
      senderCountryCode: shipper.countryCode,
      deletionControl: "DELETE_ALL_PACKAGES",
    });

    const cancelled = data?.output?.cancelledShipment === true;
    console.log(
      `${cancelled ? "✅" : "⚠️"} FedEx cancel ${trackingNumber}: ${data?.output?.message || "unknown"}`,
    );
    return cancelled;
  } catch (err: any) {
    console.error(`❌ FedEx cancel failed for ${trackingNumber}:`, err.message);
    return false;
  }
}

// ============================================
// GET RATES (optional — for dynamic pricing)
// ============================================

export interface FedExRate {
  serviceType: string;
  serviceName: string;
  totalCharge: number;
  currency: string;
  transitDays?: string;
}

/**
 * Pobiera stawki FedEx dla danej trasy i wagi.
 *
 * Endpoint: POST /rate/v1/rates/quotes
 */
export async function getFedExRates(
  recipient: FedExRecipient,
  weightKg: number,
): Promise<FedExRate[]> {
  if (!isFedExEligible(weightKg)) return [];

  const data = await fedexFetch("/rate/v1/rates/quotes", {
    accountNumber: { value: accountNumber },
    requestedShipment: {
      shipper: {
        address: {
          postalCode: shipper.postalCode,
          countryCode: shipper.countryCode,
        },
      },
      recipient: {
        address: {
          postalCode: recipient.postalCode,
          countryCode: recipient.countryCode,
          residential: recipient.residential ?? true,
        },
      },
      pickupType: "USE_SCHEDULED_PICKUP",
      //serviceType: FEDEX_DEFAULT_SERVICE,
      packagingType: "YOUR_PACKAGING",
      rateRequestType: ["ACCOUNT", "LIST"],
      requestedPackageLineItems: [
        {
          weight: { units: "KG", value: weightKg },
        },
      ],
    },
  });

  const rateDetails = data?.output?.rateReplyDetails || [];
  console.log(
    "📊 FedEx Rate response:",
    JSON.stringify(
      rateDetails.map((rd: any) => ({
        service: rd.serviceType,
        details: rd.ratedShipmentDetails?.map((d: any) => ({
          rateType: d.rateType,
          totalNet: d.totalNetCharge,
          totalNetFedEx: d.totalNetFedExCharge,
          currency: d.currency,
        })),
      })),
      null,
      2,
    ),
  );
  return rateDetails.map((rd: any) => {
    const rated =
      rd.ratedShipmentDetails?.find(
        (d: any) => d.rateType === "PAYOR_ACCOUNT_SHIPMENT",
      ) ||
      rd.ratedShipmentDetails?.find(
        (d: any) => d.rateType === "PAYOR_ACCOUNT_PACKAGE",
      ) ||
      rd.ratedShipmentDetails?.[0];

    return {
      serviceType: rd.serviceType || "",
      serviceName: rd.serviceName || rd.serviceType || "",
      totalCharge: rated?.totalNetCharge ?? rated?.totalNetFedExCharge ?? 0,
      currency: rated?.currency || "PLN",
      transitDays: rd.commit?.transitDays?.toString() || undefined,
    };
  });
}

// ============================================
// PICKUP — zamów podjazd kuriera
// ============================================

export interface FedExPickupResult {
  pickupConfirmationCode: string;
  pickupDate: string;
  location: string;
}

/**
 * Zamawia podjazd kuriera FedEx.
 * Endpoint: POST /pickup/v1/pickups
 */
export async function createFedExPickup(
  readyTime: string, // np. "2026-04-01T14:00:00+02:00"
  closeTime: string, // np. "2026-04-01T17:00:00+02:00"
  packageCount: number,
  totalWeightKg: number,
): Promise<FedExPickupResult> {
  const data = await fedexFetch("/pickup/v1/pickups", {
    associatedAccountNumber: { value: accountNumber },
    originDetail: {
      pickupAddressDetail: {
        address: {
          streetLines: [shipper.street],
          city: shipper.city,
          postalCode: shipper.postalCode,
          countryCode: shipper.countryCode,
          residential: false,
        },
        contact: {
          personName: shipper.personName,
          companyName: shipper.companyName,
          phoneNumber: shipper.phoneNumber,
        },
      },
      readyDateTimestamp: readyTime,
      customerCloseTime: closeTime,
      pickupDateType: "SAME_DAY",
    },
    totalWeight: { units: "KG", value: totalWeightKg },
    packageCount,
    carrierCode: "FDXE",
  });

  const output = data?.output;
  return {
    pickupConfirmationCode: output?.pickupConfirmationCode || "",
    pickupDate: readyTime.split("T")[0],
    location: output?.location || "",
  };
}

/**
 * Anuluje podjazd kuriera.
 * Endpoint: PUT /pickup/v1/pickups/cancel
 */
export async function cancelFedExPickup(
  confirmationCode: string,
  pickupDate: string,
  location: string,
): Promise<boolean> {
  try {
    await fedexPut("/pickup/v1/pickups/cancel", {
      associatedAccountNumber: { value: accountNumber },
      pickupConfirmationCode: confirmationCode,
      scheduledDate: pickupDate,
      location,
      carrierCode: "FDXE",
    });
    console.log(`✅ FedEx pickup cancelled: ${confirmationCode}`);
    return true;
  } catch (err: any) {
    console.error(`❌ FedEx pickup cancel failed: ${err.message}`);
    return false;
  }
}

// ============================================
// HEALTH CHECK
// ============================================

/**
 * Sprawdza czy FedEx API jest dostępne (próbuje pobrać token).
 */
export async function isFedExConnected(): Promise<boolean> {
  try {
    if (!clientId || !clientSecret) return false;
    await getFedExToken();
    return true;
  } catch {
    return false;
  }
}
