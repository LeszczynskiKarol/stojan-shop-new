// backend/src/routes/admin-auth.ts
// Admin authentication - JWT in httpOnly cookie
// With brute-force protection: rate limiting + account lockout

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
const TOKEN_EXPIRY = 365 * 24 * 60 * 60; // 1 rok

// Shared cookie options — setCookie and clearCookie MUST match these
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "none" as const,
  path: "/",
};

// ============================================
// BRUTE-FORCE PROTECTION
// ============================================
const LOGIN_ATTEMPTS = new Map<
  string,
  { count: number; firstAttempt: number; lockedUntil: number | null }
>();

const LOCKOUT_CONFIG = {
  maxAttempts: 10,
  lockoutDuration: 30 * 60 * 1000,
  windowMs: 60 * 60 * 1000,
};

setInterval(
  () => {
    const now = Date.now();
    for (const [ip, data] of LOGIN_ATTEMPTS.entries()) {
      const lockoutExpired = !data.lockedUntil || data.lockedUntil < now;
      const windowExpired = now - data.firstAttempt > LOCKOUT_CONFIG.windowMs;
      if (lockoutExpired && windowExpired) {
        LOGIN_ATTEMPTS.delete(ip);
      }
    }
  },
  10 * 60 * 1000,
);

function getClientIp(request: FastifyRequest): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  if (Array.isArray(forwarded)) return forwarded[0].trim();
  return request.ip;
}

function checkLockout(ip: string): {
  locked: boolean;
  remainingMs?: number;
  attempts?: number;
} {
  const data = LOGIN_ATTEMPTS.get(ip);
  if (!data) return { locked: false };

  const now = Date.now();

  if (data.lockedUntil && data.lockedUntil > now) {
    return {
      locked: true,
      remainingMs: data.lockedUntil - now,
      attempts: data.count,
    };
  }

  if (now - data.firstAttempt > LOCKOUT_CONFIG.windowMs) {
    LOGIN_ATTEMPTS.delete(ip);
    return { locked: false };
  }

  return { locked: false, attempts: data.count };
}

function recordFailedAttempt(ip: string): {
  locked: boolean;
  remainingMs?: number;
} {
  const now = Date.now();
  const data = LOGIN_ATTEMPTS.get(ip);

  if (!data || now - data.firstAttempt > LOCKOUT_CONFIG.windowMs) {
    LOGIN_ATTEMPTS.set(ip, {
      count: 1,
      firstAttempt: now,
      lockedUntil: null,
    });
    return { locked: false };
  }

  data.count++;

  if (data.count >= LOCKOUT_CONFIG.maxAttempts) {
    data.lockedUntil = now + LOCKOUT_CONFIG.lockoutDuration;
    console.warn(
      `🔒 IP ${ip} zablokowane na ${LOCKOUT_CONFIG.lockoutDuration / 60000} min po ${data.count} nieudanych próbach logowania`,
    );
    return { locked: true, remainingMs: LOCKOUT_CONFIG.lockoutDuration };
  }

  return { locked: false };
}

function clearFailedAttempts(ip: string): void {
  LOGIN_ATTEMPTS.delete(ip);
}

// ============================================
// SIMPLE JWT
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

    if (expected.length !== signature.length) return null;
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (!timingSafeEqual(a, b)) return null;

    const payload = JSON.parse(Buffer.from(body, "base64url").toString());

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

// ============================================
// AUTH MIDDLEWARE
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

  (request as any).admin = payload;
}

// ============================================
// ROUTES
// ============================================
export async function adminAuthRoutes(app: FastifyInstance) {
  // ------------------------------------------
  // Rate limit TYLKO na POST /login
  // Używamy osobnego sub-pluginu żeby nie dotykać verify/logout
  // ------------------------------------------
  app.register(async function loginRoute(loginApp) {
    const rateLimit = (await import("@fastify/rate-limit")).default;
    await loginApp.register(rateLimit, {
      max: 10,
      timeWindow: 15 * 60 * 1000, // 10 prób / 15 min
      keyGenerator: (request: FastifyRequest) => getClientIp(request),
      errorResponseBuilder: (_request: FastifyRequest, context: any) => ({
        success: false,
        error: `Zbyt wiele prób logowania. Spróbuj ponownie za ${Math.ceil(context.ttl / 60000)} min.`,
        retryAfter: Math.ceil(context.ttl / 1000),
      }),
    });

    loginApp.post<{ Body: { username: string; password: string } }>(
      "/login",
      async (request, reply) => {
        const ip = getClientIp(request);

        // 1) Sprawdź lockout
        const lockout = checkLockout(ip);
        if (lockout.locked) {
          const remainingMin = Math.ceil((lockout.remainingMs || 0) / 60000);
          return reply.status(429).send({
            success: false,
            error: `Konto tymczasowo zablokowane. Spróbuj za ${remainingMin} min.`,
            retryAfter: Math.ceil((lockout.remainingMs || 0) / 1000),
          });
        }

        const { username, password } = request.body || {};

        if (!username || !password) {
          return reply
            .status(400)
            .send({ success: false, error: "Podaj login i hasło" });
        }

        // 2) Sprawdź dane
        const userMatch = username === ADMIN_USER;
        const passMatch = password === ADMIN_PASS;

        if (!userMatch || !passMatch) {
          const result = recordFailedAttempt(ip);

          await new Promise((r) => setTimeout(r, 500 + Math.random() * 500));

          if (result.locked) {
            const remainingMin = Math.ceil((result.remainingMs || 0) / 60000);
            return reply.status(429).send({
              success: false,
              error: `Zbyt wiele nieudanych prób. Konto zablokowane na ${remainingMin} min.`,
              retryAfter: Math.ceil((result.remainingMs || 0) / 1000),
            });
          }

          const attemptsData = LOGIN_ATTEMPTS.get(ip);
          const remaining =
            LOCKOUT_CONFIG.maxAttempts - (attemptsData?.count || 0);

          return reply.status(401).send({
            success: false,
            error: `Nieprawidłowy login lub hasło. Pozostało prób: ${remaining}`,
          });
        }

        // 3) Sukces
        clearFailedAttempts(ip);

        const token = createToken({ sub: username, role: "admin" });

        reply.setCookie(COOKIE_NAME, token, {
          ...COOKIE_OPTIONS,
          maxAge: TOKEN_EXPIRY,
        });

        reply.setCookie("admin_session", "1", {
          httpOnly: false,
          secure: true,
          sameSite: "none" as const,
          path: "/",
          maxAge: TOKEN_EXPIRY,
        });

        console.log(`✅ Admin login z IP: ${ip}`);

        return { success: true, data: { username, role: "admin" } };
      },
    );
  });

  // ------------------------------------------
  // POST /api/admin/auth/logout (BEZ rate limit)
  // ------------------------------------------
  app.post("/logout", async (_request, reply) => {
    reply.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
    reply.clearCookie("admin_session", {
      secure: true,
      sameSite: "none" as const,
      path: "/",
    });

    return { success: true, message: "Wylogowano" };
  });

  // ------------------------------------------
  // GET /api/admin/auth/verify (BEZ rate limit)
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
      reply.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
      return reply.status(401).send({ success: false, error: "Sesja wygasła" });
    }

    return {
      success: true,
      data: { username: payload.sub, role: payload.role },
    };
  });
}
