// backend/src/lib/allegro-client.ts
// Low-level Allegro API client with automatic token refresh
// Uses Prisma AllegroToken model for persistence

import { prisma } from "./prisma.js";
import { allegroConfig } from "../config/allegro.config.js";
import { randomUUID } from "crypto";

const CONTENT_TYPE = "application/vnd.allegro.public.v1+json";

// ============================================
// TOKEN MANAGEMENT
// ============================================

async function getLatestToken() {
  return prisma.allegroToken.findFirst({
    orderBy: { createdAt: "desc" },
  });
}

async function saveToken(data: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}) {
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  await prisma.allegroToken.create({
    data: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
    },
  });

  console.log(`✅ Allegro token saved, expires: ${expiresAt.toISOString()}`);
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const credentials = Buffer.from(
    `${allegroConfig.clientId}:${allegroConfig.clientSecret}`,
  ).toString("base64");

  const res = await fetch(`${allegroConfig.authUrl}/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("❌ Allegro token refresh failed:", err);
    throw new Error(`Token refresh failed: ${res.status}`);
  }

  const data = await res.json();
  await saveToken(data);
  return data.access_token;
}

/**
 * Exchange authorization code for tokens (OAuth callback)
 */
export async function exchangeAuthCode(code: string): Promise<void> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: allegroConfig.redirectUri,
  });

  const credentials = Buffer.from(
    `${allegroConfig.clientId}:${allegroConfig.clientSecret}`,
  ).toString("base64");

  const res = await fetch(`${allegroConfig.authUrl}/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Auth code exchange failed: ${res.status} - ${err}`);
  }

  const data = await res.json();
  await saveToken(data);
}

/**
 * Get valid access token (auto-refresh if expired)
 */
export async function getAccessToken(): Promise<string> {
  const token = await getLatestToken();

  if (!token) {
    throw new Error("NO_ALLEGRO_TOKEN");
  }

  // Refresh 5 min before expiry
  const now = new Date();
  const expiresWithMargin = new Date(token.expiresAt);
  expiresWithMargin.setMinutes(expiresWithMargin.getMinutes() - 5);

  if (now >= expiresWithMargin) {
    console.log("🔄 Allegro token expired, refreshing...");
    return refreshAccessToken(token.refreshToken);
  }

  return token.accessToken;
}

/**
 * Check if we have a valid (or refreshable) Allegro connection
 */
export async function isAllegroConnected(): Promise<boolean> {
  try {
    const token = await getLatestToken();
    if (!token) return false;

    // If expired, try refresh
    if (new Date() >= token.expiresAt) {
      await refreshAccessToken(token.refreshToken);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Get OAuth authorization URL for initial connection
 */
export function getAuthUrl(): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: allegroConfig.clientId,
    redirect_uri: allegroConfig.redirectUri,
  });
  return `${allegroConfig.authUrl}/authorize?${params}`;
}

// ============================================
// API METHODS
// ============================================

interface AllegroRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: any;
  retries?: number;
}

/**
 * Generic Allegro API request with retry and token management
 */
export async function allegroFetch<T = any>(
  path: string,
  options: AllegroRequestOptions = {},
): Promise<T> {
  const { method = "GET", body, retries = 3 } = options;

  for (let attempt = 0; attempt < retries; attempt++) {
    const token = await getAccessToken();

    const res = await fetch(`${allegroConfig.apiUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": CONTENT_TYPE,
        Accept: CONTENT_TYPE,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    // 503 = service temporarily unavailable — retry with backoff
    if (res.status === 503 && attempt < retries - 1) {
      const delay = Math.pow(2, attempt) * 1000;
      console.log(
        `⏱️ Allegro 503, retry ${attempt + 1}/${retries} in ${delay}ms`,
      );
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    // 401 = token invalid — try refresh once
    if (res.status === 401 && attempt === 0) {
      const latestToken = await getLatestToken();
      if (latestToken) {
        await refreshAccessToken(latestToken.refreshToken);
        continue;
      }
    }

    if (!res.ok) {
      const errorText = await res.text();
      console.error(
        `❌ Allegro API ${method} ${path}: ${res.status}`,
        errorText,
      );
      throw new Error(`Allegro API error ${res.status}: ${errorText}`);
    }

    // Some endpoints return empty body (204, etc.)
    const text = await res.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }

  throw new Error(`Allegro API failed after ${retries} retries`);
}

// ============================================
// CONVENIENCE METHODS
// ============================================

/** Get single offer details */
export async function getOffer(offerId: string) {
  return allegroFetch(`/sale/product-offers/${offerId}`);
}

/** Update offer (PATCH) — stock, price, name, etc. */
export async function patchOffer(offerId: string, data: any) {
  return allegroFetch(`/sale/product-offers/${offerId}`, {
    method: "PATCH",
    body: data,
  });
}

/** Create new product-offer */
export async function createProductOffer(data: any) {
  return allegroFetch("/sale/product-offers", {
    method: "POST",
    body: data,
  });
}

/** Get seller's offers (paginated) */
export async function getSellerOffers(offset = 0, limit = 20) {
  return allegroFetch<{
    offers: any[];
    count: number;
    totalCount: number;
  }>(`/sale/offers?offset=${offset}&limit=${limit}`);
}

/** Get offer events (stock changes, price changes, etc.) */
export async function getOfferEvents(params: {
  from?: string;
  limit?: number;
  type?: string[];
}) {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.limit) query.set("limit", String(params.limit));
  if (params.type) params.type.forEach((t) => query.append("type", t));

  const qs = query.toString();
  return allegroFetch(`/sale/offer-events${qs ? "?" + qs : ""}`);
}

/**
 * End (deactivate) an offer.
 * Uses PUT /sale/offer-publication-commands/{commandId}
 * (PATCH /sale/product-offers does NOT support publication.status)
 */
export async function endOffer(offerId: string) {
  const commandId = randomUUID();
  return allegroFetch(`/sale/offer-publication-commands/${commandId}`, {
    method: "PUT",
    body: {
      offerCriteria: [
        {
          offers: [{ id: offerId }],
          type: "CONTAINS_OFFERS",
        },
      ],
      publication: {
        action: "END",
      },
    },
  });
}

/**
 * Activate an offer.
 * Uses PUT /sale/offer-publication-commands/{commandId}
 */
export async function activateOffer(offerId: string) {
  const commandId = randomUUID();
  return allegroFetch(`/sale/offer-publication-commands/${commandId}`, {
    method: "PUT",
    body: {
      offerCriteria: [
        {
          offers: [{ id: offerId }],
          type: "CONTAINS_OFFERS",
        },
      ],
      publication: {
        action: "ACTIVATE",
      },
    },
  });
}
