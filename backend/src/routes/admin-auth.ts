// backend/src/routes/admin-auth.ts
// Admin authentication - JWT in httpOnly cookie
// Simple single-admin setup (credentials from env vars)

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createHmac, timingSafeEqual, randomBytes } from "crypto";

// ============================================
// CONFIG
// ============================================
const JWT_SECRET =
  process.env.ADMIN_JWT_SECRET ||
  "CHANGE-THIS-IN-PRODUCTION-" + randomBytes(32).toString("hex");
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "admin123"; // ZMIEŃ W .env !!!
const COOKIE_NAME = "admin_token";
const TOKEN_EXPIRY = 24 * 60 * 60; // 24h in seconds

// Shared cookie options — setCookie and clearCookie MUST match these
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "none" as const,
  path: "/",
};

// ============================================
// SIMPLE JWT (no dependency needed)
// ============================================
function base64url(str: string): string {
  return Buffer.from(str).toString("base64url");
}

function createToken(payload: Record<string, any>): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(
    JSON.stringify({
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + TOKEN_EXPIRY,
    }),
  );
  const signature = createHmac("sha256", JWT_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

function verifyToken(token: string): Record<string, any> | null {
  try {
    const [header, body, signature] = token.split(".");
    if (!header || !body || !signature) return null;

    const expected = createHmac("sha256", JWT_SECRET)
      .update(`${header}.${body}`)
      .digest("base64url");

    // Timing-safe comparison
    if (expected.length !== signature.length) return null;
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (!timingSafeEqual(a, b)) return null;

    const payload = JSON.parse(Buffer.from(body, "base64url").toString());

    // Check expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

// ============================================
// AUTH MIDDLEWARE (export for use in other routes)
// ============================================
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const token =
    (request.cookies as any)?.[COOKIE_NAME] ||
    request.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    return reply
      .status(401)
      .send({ success: false, error: "Brak autoryzacji" });
  }

  const payload = verifyToken(token);
  if (!payload || payload.role !== "admin") {
    return reply
      .status(401)
      .send({ success: false, error: "Token wygasł lub jest nieprawidłowy" });
  }

  // Attach user info to request
  (request as any).admin = payload;
}

// ============================================
// ROUTES
// ============================================
export async function adminAuthRoutes(app: FastifyInstance) {
  // ------------------------------------------
  // POST /api/admin/auth/login
  // ------------------------------------------
  app.post<{ Body: { username: string; password: string } }>(
    "/login",
    async (request, reply) => {
      const { username, password } = request.body || {};

      if (!username || !password) {
        return reply
          .status(400)
          .send({ success: false, error: "Podaj login i hasło" });
      }

      // Simple constant-time comparison
      const userMatch = username === ADMIN_USER;
      const passMatch = password === ADMIN_PASS;

      if (!userMatch || !passMatch) {
        // Delay to prevent timing attacks
        await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));
        return reply
          .status(401)
          .send({ success: false, error: "Nieprawidłowy login lub hasło" });
      }

      const token = createToken({ sub: username, role: "admin" });

      // Set httpOnly cookie
      reply.setCookie(COOKIE_NAME, token, {
        ...COOKIE_OPTIONS,
        maxAge: TOKEN_EXPIRY,
      });

      return { success: true, data: { username, role: "admin" } };
    },
  );

  // ------------------------------------------
  // POST /api/admin/auth/logout
  // ------------------------------------------
  app.post("/logout", async (_request, reply) => {
    // FIX: clearCookie MUST use the same options as setCookie
    // (httpOnly, secure, sameSite, path) — otherwise the browser ignores it
    reply.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
    return { success: true, message: "Wylogowano" };
  });

  // ------------------------------------------
  // GET /api/admin/auth/verify — check if logged in
  // ------------------------------------------
  app.get("/verify", async (request, reply) => {
    const token =
      (request.cookies as any)?.[COOKIE_NAME] ||
      request.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      return reply.status(401).send({ success: false, error: "Niezalogowany" });
    }

    const payload = verifyToken(token);
    if (!payload || payload.role !== "admin") {
      // FIX: also clear stale cookie on failed verify
      reply.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
      return reply.status(401).send({ success: false, error: "Sesja wygasła" });
    }

    return {
      success: true,
      data: { username: payload.sub, role: payload.role },
    };
  });
}
