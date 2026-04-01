// backend/src/services/fedex-service.ts
// Business logic: FedEx shipment creation from order data
// Handles: label → S3, tracking → DB, email notification

import { prisma } from "../lib/prisma.js";
import { uploadInvoiceToS3 } from "../lib/s3.js";
import {
  createFedExShipment,
  cancelFedExShipment,
  isFedExEligible,
  type FedExRecipient,
  type FedExPackage,
  type FedExShipmentResult,
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
// CREATE SHIPMENT FROM ORDER
// ============================================

/**
 * Tworzy przesyłkę FedEx na podstawie zamówienia:
 * 1. Waliduje wagę (≤ 36.5 kg)
 * 2. Buduje recipient z order.shipping JSON
 * 3. Wywołuje FedEx Ship API → tracking + label PDF
 * 4. Uploaduje etykietę na S3
 * 5. Zapisuje tracking + labelUrl w order.paymentDetails
 *
 * Wywoływana z admin panelu lub automatycznie przy zmianie statusu na "shipped".
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

  // Użyj adresu dostawy (jeśli inny) albo adresu głównego
  const useAltAddress = shipping.differentShippingAddress === true;

  const recipient: FedExRecipient = {
    personName: [shipping.firstName, shipping.lastName]
      .filter(Boolean)
      .join(" "),
    companyName: shipping.companyName || undefined,
    phoneNumber: shipping.phone || "",
    email: shipping.email || undefined,
    street: useAltAddress
      ? shipping.shippingStreet || shipping.street
      : shipping.street,
    city: useAltAddress
      ? shipping.shippingCity || shipping.city
      : shipping.city,
    postalCode: useAltAddress
      ? shipping.shippingPostalCode || shipping.postalCode
      : shipping.postalCode,
    countryCode: "PL", // domestic — adjust if you ship internationally
    residential: !shipping.companyName, // business = false, individual = true
  };

  const pkg: FedExPackage = {
    weightKg: totalWeight,
    // Dimensions optional — FedEx calculates dim weight if provided
    // Could be added from product attributes if needed
  };

  const orderNumber = order.orderNumber || order.id;

  // 5. Wywołaj FedEx API
  let result: FedExShipmentResult;
  try {
    result = await createFedExShipment(
      recipient,
      pkg,
      orderNumber,
      Number(order.total),
    );
  } catch (err: any) {
    console.error(
      `❌ FedEx shipment failed for order ${orderNumber}:`,
      err.message,
    );
    return { success: false, error: err.message };
  }

  // 6. Upload etykiety na S3 (jeśli mamy base64)
  let labelUrl = result.labelUrl || "";

  if (result.labelBase64 && !labelUrl) {
    try {
      const labelBuffer = Buffer.from(result.labelBase64, "base64");
      const filename = `fedex-label-${result.trackingNumber}.pdf`;
      labelUrl = await uploadInvoiceToS3(
        labelBuffer,
        filename,
        "application/pdf",
      );
      console.log(`✅ FedEx label uploaded to S3: ${labelUrl}`);
    } catch (s3Err: any) {
      console.error(`⚠️ S3 upload failed for FedEx label:`, s3Err.message);
      // Label jest w base64 — admin może pobrać z API
    }
  }

  // 7. Zapisz tracking + label URL w paymentDetails JSON
  const currentPaymentDetails = (order.paymentDetails as any) || {};
  const updatedPaymentDetails = {
    ...currentPaymentDetails,
    fedex: {
      trackingNumber: result.trackingNumber,
      masterTrackingNumber: result.masterTrackingNumber,
      labelUrl,
      serviceType: result.serviceType,
      shipDate: result.shipDate,
      createdAt: new Date().toISOString(),
    },
  };

  await prisma.order.update({
    where: { id: orderId },
    data: {
      paymentDetails: updatedPaymentDetails,
    },
  });

  console.log(
    `✅ FedEx shipment saved: order=${orderNumber}, tracking=${result.trackingNumber}`,
  );

  return {
    success: true,
    trackingNumber: result.trackingNumber,
    labelUrl,
  };
}

// ============================================
// CANCEL SHIPMENT FOR ORDER
// ============================================

/**
 * Anuluje przesyłkę FedEx powiązaną z zamówieniem.
 * Usuwa dane FedEx z paymentDetails.
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

  const cancelled = await cancelFedExShipment(trackingNumber);

  if (cancelled) {
    // Usuń dane FedEx z paymentDetails
    const { fedex, ...rest } = details;
    await prisma.order.update({
      where: { id: orderId },
      data: { paymentDetails: rest },
    });
  }

  return {
    success: cancelled,
    error: cancelled ? undefined : "FedEx nie pozwolił anulować przesyłki",
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
  serviceType?: string;
  shipDate?: string;
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
    serviceType: fedex.serviceType,
    shipDate: fedex.shipDate,
    trackingUrl: `https://www.fedex.com/fedextrack/?trknbr=${fedex.trackingNumber}`,
  };
}
