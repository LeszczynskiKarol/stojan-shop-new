// backend/src/services/dhl-service.ts

// DHL24 business logic — creates shipments from orders

import { prisma } from "../lib/prisma.js";
import { uploadInvoiceToS3 } from "../lib/s3.js";
import {
  createDHLShipment,
  getDHLLabel,
  deleteDHLShipment,
  type DHLRecipient,
  type DHLPackage,
} from "../lib/dhl-client.js";
import { DHL_TRACKING_URL } from "../config/dhl.config.js";

export async function createDHLShipmentFromOrder(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { success: false, error: "Zamówienie nie znalezione" };

  const pd = (order.paymentDetails as any) || {};
  if (pd.dhl?.trackingNumber) {
    return { success: false, error: "Przesyłka DHL już istnieje" };
  }

  const shipping = order.shipping as any;
  const useShipping = shipping.differentShippingAddress;

  // Parse street + house number
  const fullStreet = useShipping
    ? shipping.shippingStreet || shipping.street
    : shipping.street;
  const streetParts = fullStreet.match(/^(.+?)\s+(\d+.*)$/);
  const street = streetParts ? streetParts[1] : fullStreet;
  const houseNumber = streetParts ? streetParts[2] : "1";

  // Check for apartment (e.g. "m. 5" or "/5")
  const aptMatch = houseNumber.match(/^(\d+\w?)\s*[m/.]\s*(.+)$/i);
  const house = aptMatch ? aptMatch[1] : houseNumber;
  const apartment = aptMatch ? aptMatch[2] : "";

  const recipient: DHLRecipient = {
    name: `${shipping.firstName} ${shipping.lastName}`,
    postalCode: (useShipping
      ? shipping.shippingPostalCode || shipping.postalCode
      : shipping.postalCode
    ).replace(/-/g, ""),
    city: useShipping ? shipping.shippingCity || shipping.city : shipping.city,
    street,
    houseNumber: house,
    apartmentNumber: apartment,
    contactPerson: `${shipping.firstName} ${shipping.lastName}`,
    contactPhone: shipping.phone,
    contactEmail: shipping.email,
  };

  const totalWeight = Number(order.totalWeight) || 50;

  const pkg: DHLPackage = {
    type: totalWeight > 50 ? "PALLET" : "PACKAGE",
    weight: totalWeight,
    quantity: 1,
    nonStandard: totalWeight > 31.5,
  };

  try {
    const result = await createDHLShipment(
      recipient,
      pkg,
      order.orderNumber || order.id.slice(0, 8),
      Number(order.total),
    );

    // Upload label to S3
    let labelUrl = "";
    if (result.labelBase64) {
      const labelBuffer = Buffer.from(result.labelBase64, "base64");
      labelUrl = await uploadInvoiceToS3(
        labelBuffer,
        `dhl-label-${result.trackingNumber}.pdf`,
        "application/pdf",
      );
    }

    // Save to paymentDetails
    await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentDetails: {
          ...pd,
          dhl: {
            shipmentId: result.shipmentId,
            trackingNumber: result.trackingNumber,
            dispatchNumber: result.dispatchNumber,
            labelUrl,
            trackingUrl: `${DHL_TRACKING_URL}${result.trackingNumber}`,
            shipDate: new Date().toISOString().split("T")[0],
            createdAt: new Date().toISOString(),
          },
        },
      },
    });

    return {
      success: true,
      trackingNumber: result.trackingNumber,
      labelUrl,
      trackingUrl: `${DHL_TRACKING_URL}${result.trackingNumber}`,
    };
  } catch (err: any) {
    console.error("DHL createShipment error:", err.message);
    return { success: false, error: err.message };
  }
}

export async function cancelDHLShipmentForOrder(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { success: false, error: "Zamówienie nie znalezione" };

  const pd = (order.paymentDetails as any) || {};
  const dhl = pd.dhl;
  if (!dhl?.shipmentId) {
    return { success: false, error: "Brak przesyłki DHL" };
  }

  // Cancel courier first if booked
  if (dhl.pickup?.orderIds?.length) {
    const { cancelDHLCourier } = await import("../lib/dhl-client.js");
    await cancelDHLCourier(dhl.pickup.orderIds);
  }

  const deleted = await deleteDHLShipment(dhl.shipmentId);
  if (!deleted) {
    return { success: false, error: "Nie udało się usunąć przesyłki DHL" };
  }

  // Remove DHL data from order
  const { dhl: _, ...restPd } = pd;
  await prisma.order.update({
    where: { id: orderId },
    data: { paymentDetails: restPd },
  });

  return { success: true };
}
