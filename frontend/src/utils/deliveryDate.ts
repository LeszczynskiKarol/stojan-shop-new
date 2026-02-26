// frontend/src/utils/deliveryDate.ts
// Server-side delivery date calculation — mirrors frontend logic exactly

interface DeliveryDates {
  shippingDate: Date;
  deliveryDateStart: Date;
  deliveryDateEnd: Date | null;
}

function moveToNextBusinessDay(date: Date): Date {
  const d = new Date(date);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

export function calculateDeliveryDates(weight: number): DeliveryDates {
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDay();
  const w = Number(weight) || 0;

  let shippingDate = new Date(now);
  let deliveryDateStart: Date;
  let deliveryDateEnd: Date | null = null;

  if (w <= 36.5) {
    if (currentDay === 6 || currentDay === 0) {
      shippingDate = moveToNextBusinessDay(shippingDate);
    } else if (currentHour >= 12) {
      shippingDate.setDate(shippingDate.getDate() + 1);
      shippingDate = moveToNextBusinessDay(shippingDate);
    }
    deliveryDateStart = new Date(shippingDate);
    deliveryDateStart.setDate(deliveryDateStart.getDate() + 1);
    deliveryDateStart = moveToNextBusinessDay(deliveryDateStart);
  } else {
    if (currentDay === 6 || currentDay === 0) {
      shippingDate = moveToNextBusinessDay(shippingDate);
    } else if (currentHour >= 10) {
      shippingDate.setDate(shippingDate.getDate() + 1);
      shippingDate = moveToNextBusinessDay(shippingDate);
    }
    deliveryDateStart = new Date(shippingDate);
    deliveryDateStart.setDate(deliveryDateStart.getDate() + 1);
    deliveryDateStart = moveToNextBusinessDay(deliveryDateStart);

    deliveryDateEnd = new Date(shippingDate);
    deliveryDateEnd.setDate(deliveryDateEnd.getDate() + 2);
    deliveryDateEnd = moveToNextBusinessDay(deliveryDateEnd);
  }

  return { shippingDate, deliveryDateStart, deliveryDateEnd };
}

function fmtDate(date: Date): string {
  return date.toLocaleDateString("pl-PL", { day: "numeric", month: "long" });
}

export function formatShippingDate(weight: number): string {
  const { shippingDate } = calculateDeliveryDates(weight);
  return fmtDate(shippingDate);
}

export function formatDeliveryDate(weight: number): string {
  const { deliveryDateStart, deliveryDateEnd } = calculateDeliveryDates(weight);
  if (deliveryDateEnd) {
    const s = fmtDate(deliveryDateStart);
    const e = fmtDate(deliveryDateEnd);
    return s === e ? s : `${s} – ${e}`;
  }
  return fmtDate(deliveryDateStart);
}
