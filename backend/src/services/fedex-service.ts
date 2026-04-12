// backend/src/services/fedex-service.ts
// Business logic: FedEx FDS WS shipment creation from order data
// Handles: create shipment → get label → upload to S3 → save tracking to DB
//
// FDS WS flow (2 steps, unlike global REST API which was 1):
// 1. zapiszListV2 → returns waybill (tracking number)
// 2. wydrukujEtykiete → returns label PDF (base64)

import { prisma } from "../lib/prisma.js";
import { uploadInvoiceToS3 } from "../lib/s3.js";
import {
  createFedExShipment,
  getFedExLabel,
  cancelFedExShipment,
  isFedExEligible,
  type FedExRecipient,
  type FedExPackage,
  type FedExCodOptions,
  type FedExInsuranceOptions,
} from "../lib/fedex-client.js";
import { FEDEX_MAX_WEIGHT_KG } from "../config/fedex.config.js";

// ============================================
// TYPES
// ============================================

export interface FedExShipResult {
  success: boolean;
  trackingNumber?: string;
  labelUrl?: string;
  error?: string;
}

// ============================================
// HELPERS
// ============================================

/**
 * Parse street string into street name + house number + apartment number.
 * Examples:
 *   "Wojewódzka 2" → { street: "Wojewódzka", homeNo: "2" }
 *   "ul. Kościuszki 10/2" → { street: "Kościuszki", homeNo: "10", localNo: "2" }
 *   "Piękna 3A/15" → { street: "Piękna", homeNo: "3A", localNo: "15" }
 */
function parseStreet(raw: string): {
  street: string;
  homeNo: string;
  localNo?: string;
} {
  // Remove "ul. " prefix
  let s = raw.replace(/^ul\.?\s*/i, "").trim();

  // Try to match: street name + number (possibly with letter) + optional /apartment
  const match = s.match(/^(.+?)\s+(\d+\w?)\s*(?:\/\s*(\d+\w?))?\s*$/);

  if (match) {
    return {
      street: match[1].trim(),
      homeNo: match[2],
      localNo: match[3] || undefined,
    };
  }

  // Fallback: use whole string as street, empty house number
  return { street: s, homeNo: "" };
}

// ============================================
// CREATE SHIPMENT FROM ORDER
// ============================================

/**
 * Tworzy przesyłkę FedEx FDS WS na podstawie zamówienia:
 * 1. Waliduje wagę
 * 2. Buduje recipient z order.shipping JSON
 * 3. zapiszListV2 → waybill (tracking number)
 * 4. wydrukujEtykiete → label PDF base64
 * 5. Upload etykiety na S3
 * 6. Zapis tracking + labelUrl w order.paymentDetails
 */
export async function createFedExShipmentFromOrder(
  orderId: string,
): Promise<FedExShipResult> {
  // 1. Pobierz zamówienie
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    return { success: false, error: "Zamówienie nie znalezione" };
  }

  if (order.status === "cancelled") {
    return { success: false, error: "Zamówienie jest anulowane" };
  }

  // 2. Sprawdź wagę
  const totalWeight = Number(order.totalWeight) || 0;
  if (!isFedExEligible(totalWeight)) {
    return {
      success: false,
      error: `Waga ${totalWeight} kg — FedEx obsługuje max ${FEDEX_MAX_WEIGHT_KG} kg`,
    };
  }

  // 3. Sprawdź czy już nadano
  const existing = order.paymentDetails as any;
  if (existing?.fedex?.trackingNumber) {
    return {
      success: false,
      error: `Przesyłka już nadana: ${existing.fedex.trackingNumber}`,
    };
  }

  // 4. Buduj dane odbiorcy z order.shipping JSON
  const shipping = order.shipping as any;
  if (!shipping) {
    return { success: false, error: "Brak danych shipping w zamówieniu" };
  }

  // Adres dostawy (inny lub główny)
  const useAltAddress = shipping.differentShippingAddress === true;
  const rawStreet = useAltAddress
    ? shipping.shippingStreet || shipping.street
    : shipping.street;
  const { street, homeNo, localNo } = parseStreet(rawStreet);

  const recipient: FedExRecipient = {
    personName: shipping.firstName || "",
    surname: shipping.lastName || "",
    companyName: shipping.companyName || undefined,
    nip: shipping.nip || undefined,
    phoneNumber: shipping.phone || "",
    email: shipping.email || undefined,
    street,
    homeNo: homeNo || "1",
    localNo,
    city: useAltAddress
      ? shipping.shippingCity || shipping.city
      : shipping.city,
    postalCode: useAltAddress
      ? shipping.shippingPostalCode || shipping.postalCode
      : shipping.postalCode,
    countryCode: "PL",
    isCompany: !!shipping.companyName || !!shipping.nip,
  };

  const pkg: FedExPackage = {
    weightKg: totalWeight,
  };

  const orderNumber = order.orderNumber || order.id;

  // 5. COD — jeśli zamówienie jest za pobraniem
  let cod: FedExCodOptions | undefined;
  if (order.paymentMethod === "cod") {
    cod = {
      codValue: Number(order.total),
      bankAccountNumber: process.env.FEDEX_COD_BANK_ACCOUNT || "",
      codType: "P", // P = przelew na konto
    };
  }

  // 6. Ubezpieczenie — opcjonalne, od wartości zamówienia
  let insurance: FedExInsuranceOptions | undefined;
  const orderTotal = Number(order.total);
  if (orderTotal > 500) {
    // Ubezpieczaj automatycznie zamówienia > 500 zł
    insurance = {
      insuranceValue: orderTotal,
      contentDescription: `Zamówienie ${orderNumber}`,
    };
  }

  // 7. KROK 1: Utwórz przesyłkę (zapiszListV2 → waybill)
  let waybill: string;
  try {
    const result = await createFedExShipment(
      recipient,
      pkg,
      orderNumber,
      orderTotal,
      cod,
      insurance,
    );
    waybill = result.waybill;
  } catch (err: any) {
    console.error(
      `❌ FDS WS shipment failed for order ${orderNumber}:`,
      err.message,
    );
    return { success: false, error: err.message };
  }

  // 8. KROK 2: Pobierz etykietę (wydrukujEtykiete → PDF base64)
  let labelBase64 = "";
  try {
    labelBase64 = await getFedExLabel(waybill);
  } catch (labelErr: any) {
    console.warn(`⚠️ FDS WS label failed for ${waybill}: ${labelErr.message}`);
    // Shipment created, label failed — still save tracking number
  }

  // 9. Upload etykiety na S3
  let labelUrl = "";
  if (labelBase64) {
    try {
      const labelBuffer = Buffer.from(labelBase64, "base64");
      const filename = `fedex-label-${waybill}.pdf`;
      labelUrl = await uploadInvoiceToS3(
        labelBuffer,
        filename,
        "application/pdf",
      );
      console.log(`✅ FDS WS label uploaded to S3: ${labelUrl}`);
    } catch (s3Err: any) {
      console.error(`⚠️ S3 upload failed for FedEx label:`, s3Err.message);
    }
  }

  // 10. Zapisz tracking + label URL w paymentDetails JSON
  const currentPaymentDetails = (order.paymentDetails as any) || {};
  const updatedPaymentDetails = {
    ...currentPaymentDetails,
    fedex: {
      trackingNumber: waybill,
      labelUrl,
      createdAt: new Date().toISOString(),
      system: "FDS_WS", // mark as FDS WS (not FSM)
    },
  };

  await prisma.order.update({
    where: { id: orderId },
    data: {
      paymentDetails: updatedPaymentDetails,
    },
  });

  console.log(
    `✅ FDS WS shipment saved: order=${orderNumber}, tracking=${waybill}`,
  );

  return {
    success: true,
    trackingNumber: waybill,
    labelUrl,
  };
}

// ============================================
// CANCEL SHIPMENT FOR ORDER
// ============================================

/**
 * FDS WS nie obsługuje anulowania przesyłek przez API.
 * Czyści dane z paymentDetails, ale przesyłka wymaga kontaktu z FedEx.
 */
export async function cancelFedExShipmentForOrder(
  orderId: string,
): Promise<{ success: boolean; error?: string }> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    return { success: false, error: "Zamówienie nie znalezione" };
  }

  const details = order.paymentDetails as any;
  const trackingNumber = details?.fedex?.trackingNumber;

  if (!trackingNumber) {
    return { success: false, error: "Brak przesyłki FedEx do anulowania" };
  }

  // FDS WS can't cancel — just try (will return false) and clean up DB
  const cancelled = await cancelFedExShipment(trackingNumber);

  // Always clean up DB — user acknowledged they need to call FedEx
  const { fedex, ...rest } = details;
  await prisma.order.update({
    where: { id: orderId },
    data: { paymentDetails: rest },
  });

  return {
    success: true,
    error: cancelled
      ? undefined
      : `Dane usunięte z systemu. Przesyłka ${trackingNumber} wymaga anulowania przez infolinię FedEx: 800 400 800`,
  };
}

// ============================================
// GET FEDEX INFO FOR ORDER
// ============================================

/**
 * Zwraca dane FedEx dla zamówienia (tracking, label URL, etc.)
 */
export async function getFedExInfoForOrder(orderId: string): Promise<{
  hasFedEx: boolean;
  eligible: boolean;
  trackingNumber?: string;
  labelUrl?: string;
  trackingUrl?: string;
}> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    return { hasFedEx: false, eligible: false };
  }

  const totalWeight = Number(order.totalWeight) || 0;
  const eligible = isFedExEligible(totalWeight);

  const details = order.paymentDetails as any;
  const fedex = details?.fedex;

  if (!fedex?.trackingNumber) {
    return { hasFedEx: false, eligible };
  }

  return {
    hasFedEx: true,
    eligible,
    trackingNumber: fedex.trackingNumber,
    labelUrl: fedex.labelUrl,
    trackingUrl: `https://www.fedex.com/fedextrack/?trknbr=${fedex.trackingNumber}`,
  };
}
