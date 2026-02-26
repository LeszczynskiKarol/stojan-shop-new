// backend/src/services/emailService.ts
// Professional email system using AWS SES (us-east-1)
// Emails: 1) Order confirmation  2) Shipment notification  3) Admin notifications

import {
  SESClient,
  SendEmailCommand,
  SendRawEmailCommand,
} from "@aws-sdk/client-ses";
import {
  formatShippingDate,
  formatDeliveryDate,
} from "../utils/deliveryDate.js";

// ============================================================
// CONFIG
// ============================================================
const ses = new SESClient({
  region: process.env.AWS_SES_REGION || "us-east-1",
});

const FROM_EMAIL =
  process.env.SES_FROM_EMAIL || "zamowienia@silniki-elektryczne.com.pl";
const FROM_NAME = process.env.SES_FROM_NAME || "Stojan – Silniki Elektryczne";
const SHOP_URL =
  process.env.SHOP_URL || "https://www.silniki-elektryczne.com.pl";
const LOGO_URL = `${SHOP_URL}/logo_dark.png`;
const PHONE = "+48 500 385 112";
const ADDRESS = "Wojewódzka 2, 87-152 Pigża";

// Admin emails (comma-separated or two separate env vars)
const ADMIN_EMAILS: string[] = [
  process.env.ADMIN_EMAIL_1 || "",
  process.env.ADMIN_EMAIL_2 || "",
].filter((e) => e.trim().length > 0);

// ============================================================
// TYPES
// ============================================================
export interface OrderEmailData {
  orderNumber: string;
  orderId: string;
  customerEmail: string;
  customerName: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    image?: string;
    weight?: number;
    slug?: string;
    categorySlug?: string;
  }>;
  subtotal: number;
  shippingCost: number;
  total: number;
  totalWeight: number;
  paymentMethod: "prepaid" | "cod";
  shipping: {
    firstName?: string;
    lastName?: string;
    companyName?: string;
    nip?: string;
    email?: string;
    street: string;
    postalCode: string;
    city: string;
    phone: string;
    differentShippingAddress?: boolean;
    shippingStreet?: string;
    shippingPostalCode?: string;
    shippingCity?: string;
    notes?: string;
  };
  invoiceUrls?: string[];
}

// ============================================================
// HELPERS
// ============================================================
function fmt(v: number): string {
  return v.toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function escapeHtml(str: string): string {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ============================================================
// SEND EMAIL VIA SES
// ============================================================
async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  try {
    await ses.send(
      new SendEmailCommand({
        Source: `${FROM_NAME} <${FROM_EMAIL}>`,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: html, Charset: "UTF-8" },
          },
        },
      }),
    );
    console.log(`[EMAIL] Sent to ${to}: "${subject}"`);
    return true;
  } catch (err) {
    console.error("[EMAIL] Failed to send:", err);
    return false;
  }
}

/** Send email to multiple recipients (each gets separate email) */
async function sendEmailToAll(
  recipients: string[],
  subject: string,
  html: string,
): Promise<boolean> {
  const results = await Promise.all(
    recipients.map((to) => sendEmail(to, subject, html)),
  );
  return results.some((r) => r);
}

// ============================================================
// S3 DOWNLOAD + RAW EMAIL WITH ATTACHMENTS
// ============================================================
interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

/** Download file from S3 by URL */
async function downloadFromS3(url: string): Promise<EmailAttachment | null> {
  try {
    const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
    const bucket = (process.env.AWS_S3_BUCKET || "piszemy.com.pl").trim();
    const region = (process.env.AWS_REGION || "eu-north-1").trim();

    // Extract key from URL (handles both path-style and virtual-hosted)
    let key = "";
    if (url.includes(`/${bucket}/`)) {
      key = url.split(`/${bucket}/`)[1];
    } else if (url.includes(`${bucket}.s3`)) {
      key = url.split(".com/")[1];
    } else {
      // fallback: last part after bucket name
      const parts = new URL(url).pathname.split("/").filter(Boolean);
      // remove bucket name if present
      const bucketIdx = parts.indexOf(bucket);
      key =
        bucketIdx >= 0 ? parts.slice(bucketIdx + 1).join("/") : parts.join("/");
    }

    if (!key) {
      console.error(`[S3 DOWNLOAD] Could not extract key from URL: ${url}`);
      return null;
    }

    const s3 = new S3Client({
      region,
      credentials: {
        accessKeyId: (process.env.AWS_ACCESS_KEY_ID || "").trim(),
        secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || "").trim(),
      },
      forcePathStyle: true,
    });

    const response = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const bodyBytes = await response.Body?.transformToByteArray();
    if (!bodyBytes) return null;

    const filename = key.split("/").pop() || "dokument.pdf";
    return {
      filename,
      content: Buffer.from(bodyBytes),
      contentType: response.ContentType || "application/octet-stream",
    };
  } catch (err: any) {
    console.error(`[S3 DOWNLOAD] Failed for ${url}: ${err.message}`);
    return null;
  }
}

/** Send email with file attachments via SES SendRawEmailCommand */
async function sendEmailWithAttachments(
  to: string,
  subject: string,
  html: string,
  attachments: EmailAttachment[],
): Promise<boolean> {
  try {
    const boundary = `----=_Part_${Date.now().toString(36)}`;

    let rawMessage = [
      `From: ${FROM_NAME} <${FROM_EMAIL}>`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      ``,
      Buffer.from(html)
        .toString("base64")
        .replace(/(.{76})/g, "$1\n"),
    ].join("\r\n");

    for (const att of attachments) {
      rawMessage += [
        ``,
        `--${boundary}`,
        `Content-Type: ${att.contentType}; name="${att.filename}"`,
        `Content-Disposition: attachment; filename="${att.filename}"`,
        `Content-Transfer-Encoding: base64`,
        ``,
        att.content.toString("base64").replace(/(.{76})/g, "$1\n"),
      ].join("\r\n");
    }

    rawMessage += `\r\n--${boundary}--`;

    await ses.send(
      new SendRawEmailCommand({
        RawMessage: { Data: Buffer.from(rawMessage) },
      }),
    );

    console.log(
      `[EMAIL] Sent with ${attachments.length} attachment(s) to ${to}: "${subject}"`,
    );
    return true;
  } catch (err) {
    console.error("[EMAIL] Failed to send with attachments:", err);
    return false;
  }
}

// ============================================================
// SHARED TEMPLATE PARTS
// ============================================================
function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Stojan – Silniki Elektryczne</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          
          <!-- HEADER -->
          <tr>
            <td style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:28px 32px;text-align:center;">
              <img src="${LOGO_URL}" alt="Stojan" width="160" height="auto" style="display:inline-block;max-width:160px;height:auto;" />
            </td>
          </tr>

          <!-- CONTENT -->
          <tr>
            <td style="padding:0;">
              ${content}
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="text-align:center;">
                    <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#1e293b;">Stojan S.C. – Silniki Elektryczne</p>
                    <p style="margin:0 0 4px;font-size:12px;color:#64748b;">${ADDRESS}</p>
                    <p style="margin:0 0 4px;font-size:12px;color:#64748b;">Tel: <a href="tel:${PHONE.replace(/\s/g, "")}" style="color:#2563eb;text-decoration:none;">${PHONE}</a></p>
                    <p style="margin:0 0 12px;font-size:12px;color:#64748b;">
                      <a href="${SHOP_URL}" style="color:#2563eb;text-decoration:none;">${SHOP_URL.replace("https://www.", "")}</a>
                    </p>
                    <p style="margin:0;font-size:11px;color:#94a3b8;">
                      Ta wiadomość została wygenerowana automatycznie. Nie odpowiadaj na nią.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildItemsTable(items: OrderEmailData["items"]): string {
  let rows = "";
  for (const item of items) {
    const itemUrl =
      item.categorySlug && item.slug
        ? `${SHOP_URL}/${item.categorySlug}/${item.slug}`
        : null;
    const nameHtml = itemUrl
      ? `<a href="${itemUrl}" style="color:#1e293b;text-decoration:none;font-weight:500;">${escapeHtml(item.name)}</a>`
      : `<span style="font-weight:500;color:#1e293b;">${escapeHtml(item.name)}</span>`;

    rows += `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;vertical-align:top;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              ${
                item.image
                  ? `<td width="56" style="vertical-align:top;padding-right:12px;">
                  <img src="${item.image}" alt="" width="56" height="56" style="width:56px;height:56px;object-fit:contain;border-radius:6px;background:#f8fafc;display:block;" />
                </td>`
                  : ""
              }
              <td style="vertical-align:top;">
                <p style="margin:0 0 2px;font-size:13px;line-height:1.4;">${nameHtml}</p>
                <p style="margin:0;font-size:12px;color:#64748b;">${item.quantity} szt. × ${fmt(item.price)} zł</p>
              </td>
              <td width="90" style="vertical-align:top;text-align:right;">
                <p style="margin:0;font-size:14px;font-weight:700;color:#1e293b;">${fmt(item.price * item.quantity)} zł</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
  }
  return rows;
}

function buildAddressBlock(data: OrderEmailData): string {
  const s = data.shipping;
  const name =
    s.companyName || `${s.firstName || ""} ${s.lastName || ""}`.trim();
  const nip = s.nip ? `<br/>NIP: ${s.nip}` : "";

  let addr = `
    <p style="margin:0 0 2px;font-size:13px;font-weight:600;color:#1e293b;">${escapeHtml(name)}</p>
    <p style="margin:0;font-size:13px;color:#475569;">${escapeHtml(s.street)}<br/>${s.postalCode} ${escapeHtml(s.city)}${nip}</p>
    <p style="margin:4px 0 0;font-size:12px;color:#64748b;">Tel: ${s.phone}</p>
  `;

  if (s.differentShippingAddress && s.shippingStreet) {
    addr += `
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid #e2e8f0;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;">Adres dostawy</p>
        <p style="margin:0;font-size:13px;color:#475569;">${escapeHtml(s.shippingStreet)}<br/>${s.shippingPostalCode} ${escapeHtml(s.shippingCity || "")}</p>
      </div>
    `;
  }

  return addr;
}

/** Build HTML block for invoice/document links */
function buildInvoiceBlock(invoiceUrls: string[]): string {
  if (!invoiceUrls?.length) return "";

  let links = "";
  for (const url of invoiceUrls) {
    const filename = url.split("/").pop() || "dokument";
    const shortName =
      filename.length > 30 ? filename.substring(0, 30) + "..." : filename;
    links += `
      <a href="${url}" target="_blank" style="display:inline-block;margin:0 8px 8px 0;padding:8px 14px;background-color:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;color:#2563eb;text-decoration:none;font-size:12px;font-weight:500;">
        📄 ${escapeHtml(shortName)}
      </a>`;
  }

  return `
    <tr>
      <td style="padding:0 32px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
          <tr>
            <td style="padding:14px 16px;">
              <p style="margin:0 0 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;">Dokumenty do zamówienia</p>
              <div>${links}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

// ============================================================
// EMAIL 1: ORDER CONFIRMATION (to customer)
// ============================================================
export async function sendOrderConfirmation(
  data: OrderEmailData,
): Promise<boolean> {
  const paymentLabel =
    data.paymentMethod === "cod" ? "Za pobraniem" : "Płatność online";
  const shippingDateStr = formatShippingDate(data.totalWeight);
  const deliveryDateStr = formatDeliveryDate(data.totalWeight);

  const content = `
    <!-- Hero section -->
    <td style="padding:32px 32px 24px;text-align:center;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td style="width:56px;height:56px;border-radius:50%;background-color:#dcfce7;text-align:center;vertical-align:middle;">
            <span style="font-size:28px;line-height:56px;">✓</span>
          </td>
        </tr>
      </table>
      <h1 style="margin:16px 0 4px;font-size:22px;font-weight:700;color:#1e293b;">Dziękujemy za zamówienie!</h1>
      <p style="margin:0 0 4px;font-size:15px;color:#475569;">
        Zamówienie <strong style="color:#1e293b;">#${escapeHtml(data.orderNumber)}</strong> zostało przyjęte.
      </p>
      <p style="margin:0;font-size:13px;color:#64748b;">
        ${data.paymentMethod === "prepaid" ? "Potwierdzamy otrzymanie płatności." : "Płatność: za pobraniem przy dostawie."}
      </p>
    </td>

    <!-- Delivery estimate -->
    <tr>
      <td style="padding:0 32px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#eff6ff 0%,#f0f9ff 100%);border-radius:10px;border:1px solid #bfdbfe;">
          <tr>
            <td style="padding:16px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="40" style="vertical-align:top;">
                    <span style="font-size:24px;">🚚</span>
                  </td>
                  <td style="vertical-align:top;">
                    <p style="margin:0 0 2px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#3b82f6;">Przewidywany termin</p>
                    <p style="margin:0 0 2px;font-size:14px;color:#1e293b;">
                      Wysyłka: <strong>${shippingDateStr}</strong>
                    </p>
                    <p style="margin:0;font-size:14px;color:#1e293b;">
                      Dostawa: <strong>${deliveryDateStr}</strong>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Info about next email -->
    <tr>
      <td style="padding:0 32px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
          <tr>
            <td style="padding:12px 16px;">
              <p style="margin:0;font-size:13px;color:#475569;">
                📧 Wyślemy kolejnego maila, gdy zamówienie zostanie <strong>przekazane kurierowi</strong>.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Products -->
    <tr>
      <td style="padding:0 32px 24px;">
        <p style="margin:0 0 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;">Zamówione produkty</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${buildItemsTable(data.items)}
        </table>

        <!-- Totals -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
          <tr>
            <td style="padding:6px 0;font-size:13px;color:#64748b;">Produkty</td>
            <td style="padding:6px 0;font-size:13px;text-align:right;color:#1e293b;">${fmt(data.subtotal)} zł</td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:13px;color:#64748b;">Dostawa (${paymentLabel})</td>
            <td style="padding:6px 0;font-size:13px;text-align:right;color:#1e293b;">${data.shippingCost > 0 ? `${fmt(data.shippingCost)} zł` : "—"}</td>
          </tr>
          <tr>
            <td colspan="2" style="padding:0;"><div style="border-top:2px solid #e2e8f0;margin:8px 0;"></div></td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:16px;font-weight:700;color:#1e293b;">Razem</td>
            <td style="padding:6px 0;font-size:18px;font-weight:800;text-align:right;color:#2563eb;">${fmt(data.total)} zł</td>
          </tr>
          <tr>
            <td colspan="2" style="padding:2px 0 0;font-size:11px;color:#94a3b8;">w tym 23% VAT</td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Address -->
    <tr>
      <td style="padding:0 32px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:16px;background-color:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
              <p style="margin:0 0 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;">Dane zamawiającego</p>
              ${buildAddressBlock(data)}
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- CTA -->
    <tr>
      <td style="padding:0 32px 32px;text-align:center;">
        <a href="${SHOP_URL}" style="display:inline-block;padding:12px 32px;background-color:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;border-radius:8px;">
          Wróć do sklepu
        </a>
      </td>
    </tr>
  `;

  const html = emailWrapper(content);
  const subject = `Potwierdzenie zamówienia #${data.orderNumber} — Stojan`;

  return sendEmail(data.customerEmail, subject, html);
}

// ============================================================
// EMAIL 2: SHIPMENT NOTIFICATION (to customer)
// Now includes invoice/document links
// ============================================================
export async function sendShipmentNotification(
  data: OrderEmailData,
  trackingNumber?: string,
  courierName?: string,
): Promise<boolean> {
  const deliveryDateStr = formatDeliveryDate(data.totalWeight);

  const trackingBlock = trackingNumber
    ? `
    <tr>
      <td style="padding:0 32px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
          <tr>
            <td style="padding:14px 16px;">
              <p style="margin:0 0 4px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;">Numer przesyłki</p>
              <p style="margin:0;font-size:15px;font-weight:700;color:#1e293b;font-family:monospace;letter-spacing:1px;">${escapeHtml(trackingNumber)}</p>
              ${courierName ? `<p style="margin:4px 0 0;font-size:12px;color:#64748b;">Kurier: ${escapeHtml(courierName)}</p>` : ""}
            </td>
          </tr>
        </table>
      </td>
    </tr>`
    : "";

  // Invoice/document links block
  const invoiceBlock = buildInvoiceBlock(data.invoiceUrls || []);

  const content = `
    <!-- Hero -->
    <td style="padding:32px 32px 24px;text-align:center;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td style="width:56px;height:56px;border-radius:50%;background-color:#dbeafe;text-align:center;vertical-align:middle;">
            <span style="font-size:28px;line-height:56px;">📦</span>
          </td>
        </tr>
      </table>
      <h1 style="margin:16px 0 4px;font-size:22px;font-weight:700;color:#1e293b;">Twoje zamówienie jest w drodze!</h1>
      <p style="margin:0 0 4px;font-size:15px;color:#475569;">
        Zamówienie <strong style="color:#1e293b;">#${escapeHtml(data.orderNumber)}</strong> zostało przekazane kurierowi.
      </p>
    </td>

    <!-- Delivery estimate -->
    <tr>
      <td style="padding:0 32px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#f0fdf4 0%,#ecfdf5 100%);border-radius:10px;border:1px solid #86efac;">
          <tr>
            <td style="padding:16px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="40" style="vertical-align:top;">
                    <span style="font-size:24px;">🚚</span>
                  </td>
                  <td style="vertical-align:top;">
                    <p style="margin:0 0 2px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#16a34a;">Przewidywana dostawa</p>
                    <p style="margin:0;font-size:16px;font-weight:700;color:#1e293b;">${deliveryDateStr}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    ${trackingBlock}

    <!-- Invoice/document links -->
    ${invoiceBlock}

    <!-- Products summary -->
    <tr>
      <td style="padding:0 32px 24px;">
        <p style="margin:0 0 12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;">Zawartość przesyłki</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${buildItemsTable(data.items)}
        </table>
      </td>
    </tr>

    <!-- Shipping address -->
    <tr>
      <td style="padding:0 32px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:16px;background-color:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
              <p style="margin:0 0 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;">Adres dostawy</p>
              ${buildAddressBlock(data)}
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Contact info -->
    <tr>
      <td style="padding:0 32px 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fffbeb;border-radius:8px;border:1px solid #fde68a;">
          <tr>
            <td style="padding:12px 16px;">
              <p style="margin:0;font-size:13px;color:#92400e;">
                ❓ Masz pytania dotyczące dostawy? Zadzwoń: <a href="tel:${PHONE.replace(/\s/g, "")}" style="color:#2563eb;text-decoration:none;font-weight:600;">${PHONE}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- CTA -->
    <tr>
      <td style="padding:0 32px 32px;text-align:center;">
        <a href="${SHOP_URL}" style="display:inline-block;padding:12px 32px;background-color:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;border-radius:8px;">
          Odwiedź nasz sklep
        </a>
      </td>
    </tr>
  `;

  const html = emailWrapper(content);
  const subject = `Zamówienie #${data.orderNumber} wysłane! — Stojan`;

  // Download invoices from S3 and attach to email
  const invoiceUrls = data.invoiceUrls || [];
  if (invoiceUrls.length > 0) {
    const attachments: EmailAttachment[] = [];
    for (const url of invoiceUrls) {
      const att = await downloadFromS3(url);
      if (att) attachments.push(att);
    }
    if (attachments.length > 0) {
      return sendEmailWithAttachments(
        data.customerEmail,
        subject,
        html,
        attachments,
      );
    }
  }

  // No attachments — send normal email
  return sendEmail(data.customerEmail, subject, html);
}

// ============================================================
// EMAIL 3: ADMIN — NEW ORDER NOTIFICATION
// ============================================================
export async function sendAdminNewOrderNotification(
  data: OrderEmailData,
): Promise<boolean> {
  if (!ADMIN_EMAILS.length) {
    console.warn(
      "[EMAIL] No ADMIN_EMAIL_1 / ADMIN_EMAIL_2 configured, skipping admin notification",
    );
    return false;
  }

  const s = data.shipping;
  const clientName =
    s.companyName || `${s.firstName || ""} ${s.lastName || ""}`.trim();
  const paymentLabel =
    data.paymentMethod === "cod" ? "🔴 POBRANIE" : "🟢 Online";

  const content = `
    <td style="padding:32px;">
      <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1e293b;">🛒 Nowe zamówienie #${escapeHtml(data.orderNumber)}</h1>
      <p style="margin:0 0 24px;font-size:14px;color:#64748b;">
        ${new Date().toLocaleString("pl-PL")}
      </p>

      <!-- Order summary -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:16px;">
        <tr>
          <td style="padding:16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:13px;color:#64748b;padding:4px 0;">Klient:</td>
                <td style="font-size:13px;font-weight:600;color:#1e293b;padding:4px 0;text-align:right;">${escapeHtml(clientName)}</td>
              </tr>
              ${s.nip ? `<tr><td style="font-size:13px;color:#64748b;padding:4px 0;">NIP:</td><td style="font-size:13px;font-weight:600;color:#dc2626;padding:4px 0;text-align:right;">${s.nip}</td></tr>` : ""}
              <tr>
                <td style="font-size:13px;color:#64748b;padding:4px 0;">Email:</td>
                <td style="font-size:13px;color:#1e293b;padding:4px 0;text-align:right;">${s.email || data.customerEmail}</td>
              </tr>
              <tr>
                <td style="font-size:13px;color:#64748b;padding:4px 0;">Telefon:</td>
                <td style="font-size:13px;color:#1e293b;padding:4px 0;text-align:right;">${s.phone}</td>
              </tr>
              <tr>
                <td style="font-size:13px;color:#64748b;padding:4px 0;">Płatność:</td>
                <td style="font-size:13px;font-weight:600;padding:4px 0;text-align:right;">${paymentLabel}</td>
              </tr>
              <tr>
                <td style="font-size:13px;color:#64748b;padding:4px 0;">Adres:</td>
                <td style="font-size:13px;color:#1e293b;padding:4px 0;text-align:right;">${escapeHtml(s.street)}, ${s.postalCode} ${escapeHtml(s.city)}</td>
              </tr>
              <tr>
                <td style="font-size:13px;color:#64748b;padding:4px 0;">Waga:</td>
                <td style="font-size:13px;color:#1e293b;padding:4px 0;text-align:right;">${data.totalWeight} kg</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <!-- Products -->
      <p style="margin:0 0 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;">Produkty</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${buildItemsTable(data.items)}
      </table>

      <!-- Total -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;">
        <tr>
          <td style="padding:16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:13px;color:#64748b;">Produkty:</td>
                <td style="font-size:13px;text-align:right;">${fmt(data.subtotal)} zł</td>
              </tr>
              <tr>
                <td style="font-size:13px;color:#64748b;">Dostawa:</td>
                <td style="font-size:13px;text-align:right;">${fmt(data.shippingCost)} zł</td>
              </tr>
              <tr>
                <td colspan="2"><div style="border-top:1px solid #bfdbfe;margin:8px 0;"></div></td>
              </tr>
              <tr>
                <td style="font-size:18px;font-weight:700;color:#1e293b;">RAZEM:</td>
                <td style="font-size:20px;font-weight:800;text-align:right;color:#2563eb;">${fmt(data.total)} zł</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      ${s.notes ? `<div style="margin-top:16px;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;"><p style="margin:0;font-size:13px;color:#92400e;"><strong>💬 Uwagi:</strong> ${escapeHtml(s.notes)}</p></div>` : ""}
    </td>
  `;

  const html = emailWrapper(content);
  const subject = `🛒 Nowe zamówienie #${data.orderNumber} — ${fmt(data.total)} zł — ${paymentLabel}`;

  return sendEmailToAll(ADMIN_EMAILS, subject, html);
}

// ============================================================
// EMAIL 4: ADMIN — SHIPMENT SENT NOTIFICATION
// ============================================================
export async function sendAdminShipmentNotification(
  data: OrderEmailData,
): Promise<boolean> {
  if (!ADMIN_EMAILS.length) return false;

  const s = data.shipping;
  const clientName =
    s.companyName || `${s.firstName || ""} ${s.lastName || ""}`.trim();

  const content = `
    <td style="padding:32px;">
      <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1e293b;">📦 Zamówienie #${escapeHtml(data.orderNumber)} wysłane</h1>
      <p style="margin:0 0 16px;font-size:14px;color:#64748b;">
        ${new Date().toLocaleString("pl-PL")} — Email wysyłkowy wysłany do klienta
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;">
        <tr>
          <td style="padding:16px;font-size:13px;">
            <div><strong>Klient:</strong> ${escapeHtml(clientName)}</div>
            <div><strong>Email:</strong> ${data.customerEmail}</div>
            <div><strong>Wartość:</strong> ${fmt(data.total)} zł</div>
            <div><strong>Dokumenty:</strong> ${data.invoiceUrls?.length || 0} załączonych</div>
            ${(data.invoiceUrls || []).map((url: string) => `<div style="margin-top:4px;"><a href="${url}" target="_blank" style="color:#2563eb;font-size:12px;">📄 ${(url.split("/").pop() || "dokument").substring(0, 30)}</a></div>`).join("")}
          </td>
        </tr>
      </table>
    </td>
  `;

  const html = emailWrapper(content);
  const subject = `📦 Wysłano #${data.orderNumber} — ${escapeHtml(clientName)}`;

  return sendEmailToAll(ADMIN_EMAILS, subject, html);
}

// ============================================================
// HELPER: Build email data from DB order object
// ============================================================
export function buildEmailDataFromOrder(order: any): OrderEmailData {
  const shipping =
    typeof order.shipping === "string"
      ? JSON.parse(order.shipping)
      : order.shipping || {};
  const items =
    typeof order.items === "string"
      ? JSON.parse(order.items)
      : order.items || [];
  const invoiceUrls =
    typeof order.invoiceUrls === "string"
      ? JSON.parse(order.invoiceUrls)
      : order.invoiceUrls || [];

  return {
    orderNumber: order.orderNumber || order.id?.slice(0, 8).toUpperCase(),
    orderId: order.id,
    customerEmail: shipping.email || order.email || "",
    customerName:
      shipping.companyName ||
      `${shipping.firstName || ""} ${shipping.lastName || ""}`.trim() ||
      "Klient",
    items: items.map((i: any) => ({
      name: i.name,
      quantity: i.quantity,
      price: Number(i.price),
      image: i.image,
      weight: Number(i.weight) || 0,
      slug: i.slug || i.productSlug,
      categorySlug: i.categorySlug,
    })),
    subtotal: Number(order.subtotal) || 0,
    shippingCost: Number(order.shippingCost) || 0,
    total: Number(order.total) || 0,
    totalWeight: Number(order.totalWeight) || 0,
    paymentMethod: order.paymentMethod === "cod" ? "cod" : "prepaid",
    shipping,
    invoiceUrls,
  };
}
