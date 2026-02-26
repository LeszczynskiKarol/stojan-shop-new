// backend/src/lib/s3.ts
// Shared S3 client — single instance used by all routes
import { randomUUID } from "crypto";
import path from "path";

let s3Client: any = null;

const S3_BUCKET = (process.env.AWS_S3_BUCKET || "piszemy.com.pl").trim();
const S3_REGION = (process.env.AWS_REGION || "eu-north-1").trim();

// Path-style URL: https://s3.eu-north-1.amazonaws.com/piszemy.com.pl/key
// (required when bucket name contains dots)
const S3_BASE_URL = `https://s3.${S3_REGION}.amazonaws.com/${S3_BUCKET}`;

async function getS3() {
  if (!s3Client) {
    const { S3Client } = await import("@aws-sdk/client-s3");
    const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || "").trim();
    const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || "").trim();

    console.log(
      `🔧 S3 init: region=${S3_REGION}, bucket=${S3_BUCKET}, keyId=${accessKeyId.substring(0, 8)}...`,
    );

    s3Client = new S3Client({
      region: S3_REGION,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: true, // REQUIRED for bucket names with dots (piszemy.com.pl)
    });
  }
  return s3Client;
}

export async function uploadToS3(
  buffer: Buffer,
  key: string,
  contentType: string,
): Promise<string> {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = await getS3();
  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000",
    }),
  );
  return `${S3_BASE_URL}/${key}`;
}

/** Upload invoice PDF to S3 under invoices/ prefix */
export async function uploadInvoiceToS3(
  buffer: Buffer,
  filename: string,
  mimetype: string = "application/octet-stream",
): Promise<string> {
  const ext = path.extname(filename || ".pdf") || ".pdf";
  const key = `invoices/${randomUUID()}${ext}`;
  return uploadToS3(buffer, key, mimetype);
}

export { S3_BUCKET, S3_REGION, S3_BASE_URL };
