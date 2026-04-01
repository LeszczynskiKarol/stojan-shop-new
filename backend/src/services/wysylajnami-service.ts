// backend/src/services/wysylajnami-service.ts

import { prisma } from "../lib/prisma.js";
import { uploadInvoiceToS3 } from "../lib/s3.js";
import {
  createWNShipment,
  getWNWaybill,
  cancelWNOrder,
} from "../lib/wysylajnami-client.js";

export async function createWNShipmentFromOrder(
  orderId: string,
  courierId?: number,
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { success: false, error: "Zamówienie nie znalezione" };

  const pd = (order.paymentDetails as any) || {};
  if (pd.wysylajnami?.orderId) {
    return { success: false, error: "Przesyłka Wysylajnami już istnieje" };
  }

  const shipping = order.shipping as any;
  const useShipping = shipping.differentShippingAddress;

  const fullStreet = useShipping
    ? shipping.shippingStreet || shipping.street
    : shipping.street;
  const streetParts = fullStreet.match(/^(.+?)\s+(\d+.*)$/);
  const street = streetParts ? streetParts[1] : fullStreet;
  const houseNumber = streetParts ? streetParts[2] : "1";

  const aptMatch = houseNumber.match(/^(\d+\w?)\s*[m/.]\s*(.+)$/i);
  const house = aptMatch ? aptMatch[1] : houseNumber;
  const door = aptMatch ? aptMatch[2] : "";

  const totalWeight = Number(order.totalWeight) || 50;
  const isCod = order.paymentMethod === "cod";

  try {
    const result = await createWNShipment(
      {
        name: shipping.firstName || "",
        surname: shipping.lastName || "",
        company: shipping.companyName,
        street,
        houseNumber: house,
        doorNumber: door,
        postCode: useShipping
          ? shipping.shippingPostalCode || shipping.postalCode
          : shipping.postalCode,
        city: useShipping
          ? shipping.shippingCity || shipping.city
          : shipping.city,
        phone: shipping.phone,
        email: shipping.email,
      },
      totalWeight,
      order.orderNumber || order.id.slice(0, 8),
      courierId,
      Number(order.total), // insurance
      isCod ? Number(order.total) : undefined, // COD
    );

    // Download waybill and upload to S3
    let labelUrl = "";
    try {
      const waybill = await getWNWaybill(result.orderId);
      if (waybill.base64) {
        const buf = Buffer.from(waybill.base64, "base64");
        labelUrl = await uploadInvoiceToS3(
          buf,
          `wn-label-${result.waybillNumber || result.orderId}.pdf`,
          "application/pdf",
        );
      } else if (waybill.url) {
        labelUrl = waybill.url;
      }
    } catch (labelErr: any) {
      console.warn(`⚠️ WN label download failed: ${labelErr.message}`);
    }

    await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentDetails: {
          ...pd,
          wysylajnami: {
            orderId: result.orderId,
            waybillNumber: result.waybillNumber,
            courierId: result.courierId,
            price: result.price,
            labelUrl,
            trackingUrl: result.waybillNumber
              ? `https://wysylajnami.pl/sledzenie/${result.waybillNumber}`
              : "",
            createdAt: new Date().toISOString(),
          },
        },
      },
    });

    return {
      success: true,
      orderId: result.orderId,
      waybillNumber: result.waybillNumber,
      price: result.price,
      labelUrl,
    };
  } catch (err: any) {
    console.error("WN createShipment error:", err.message);
    return { success: false, error: err.message };
  }
}

export async function cancelWNShipmentForOrder(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return { success: false, error: "Zamówienie nie znalezione" };

  const pd = (order.paymentDetails as any) || {};
  const wn = pd.wysylajnami;
  if (!wn?.orderId)
    return { success: false, error: "Brak przesyłki Wysylajnami" };

  const cancelled = await cancelWNOrder(wn.orderId);
  if (!cancelled) return { success: false, error: "Nie udało się anulować" };

  const { wysylajnami: _, ...restPd } = pd;
  await prisma.order.update({
    where: { id: orderId },
    data: { paymentDetails: restPd },
  });

  return { success: true };
}
