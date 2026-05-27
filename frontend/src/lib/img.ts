// frontend/src/lib/img.ts
// Helper do przepisywania URL-i obrazów z S3 (piszemy.com.pl/products/) na warianty
// generowane przez Lambdę piszemy-image-optimizer:
//   foo.JPG → foo.webp (transcode), foo-600w.webp, foo-1200w.webp.
// Wszystkie 3 warianty są generowane idempotentnie dla każdego uploadu (withoutEnlargement
// — jeśli source < 1200px, plik istnieje w mniejszym rozmiarze).
// Dla URL-i spoza bucketa zwraca oryginał.

const S3_PRODUCTS_PREFIX = 's3.eu-north-1.amazonaws.com/piszemy.com.pl/products/';
const EXT_RE = /\.(jpe?g|png|webp)$/i;

function isOptimizable(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes(S3_PRODUCTS_PREFIX) && EXT_RE.test(url);
}

/** Zwraca wariant .webp (transcode oryginalnego rozmiaru). */
export function s3Webp(url: string | null | undefined): string {
  if (!url) return '';
  if (!isOptimizable(url)) return url;
  return url.replace(EXT_RE, '.webp');
}

/** Zwraca wariant -600w.webp (do kart produktów 300×300, retina). */
export function s3Webp600(url: string | null | undefined): string {
  if (!url) return '';
  if (!isOptimizable(url)) return url;
  return url.replace(EXT_RE, '-600w.webp');
}

/** Zwraca wariant -1200w.webp (dla większych viewportów / retina desktop). */
export function s3Webp1200(url: string | null | undefined): string {
  if (!url) return '';
  if (!isOptimizable(url)) return url;
  return url.replace(EXT_RE, '-1200w.webp');
}

/**
 * Zwraca srcset 600w + 1200w. Browser wybiera wariant na podstawie sizes + DPR.
 * Jeśli URL nie jest w buckecie products/, zwraca pusty string (caller użyje czystego src).
 */
export function s3Srcset(url: string | null | undefined): string {
  if (!url || !isOptimizable(url)) return '';
  const w600 = url.replace(EXT_RE, '-600w.webp');
  const w1200 = url.replace(EXT_RE, '-1200w.webp');
  return `${w600} 600w, ${w1200} 1200w`;
}
