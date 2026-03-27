// backend/src/index.ts
// UPDATED — with Allegro integration
import "dotenv/config";
import Fastify from "fastify";
import { FastifyError } from "fastify";
import multipart from "@fastify/multipart";
import helmet from "@fastify/helmet";
import formbody from "@fastify/formbody";
import cookie from "@fastify/cookie";
import { prisma } from "./lib/prisma.js";

// Routes
import { orderStatsRoutes } from "./routes/order-stats.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { adminAnalyticsRoutes } from "./routes/admin-analytics.js";
import { productRoutes } from "./routes/products.js";
import { shopProductRoutes } from "./routes/shop-products.js";
import { categoryRoutes } from "./routes/categories.js";
import { adminShippingRoutes } from "./routes/admin-shipping.js";
import { adminAuthRoutes, requireAdmin } from "./routes/admin-auth.js";
import { nipLookupRoutes } from "./routes/nip-lookup.js";
import { adminProductRoutes } from "./routes/admin-products.js";
import { orderRoutes } from "./routes/orders.js";
import { userRoutes } from "./routes/users.js";
import { manufacturerRoutes } from "./routes/manufacturers.js";
import { blogRoutes } from "./routes/blog.js";
import { legalRoutes } from "./routes/legal.js";
import { sitemapRoutes } from "./routes/sitemap.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { allegroRoutes } from "./routes/allegro.js";

// ▶ NEW: Allegro scheduler
import {
  startAllegroScheduler,
  stopAllegroScheduler,
} from "./services/allegro-scheduler.js";

const app = Fastify({
  bodyLimit: 52_428_800, // 50MB
});

// ============================================
// PLUGINS
// ============================================

if (process.env.ENABLE_CORS !== "false") {
  const cors = await import("@fastify/cors");
  await app.register(cors.default, {
    origin: true,
    credentials: true,
  });
}

await app.register(helmet, {
  contentSecurityPolicy: false,
});

await app.register(formbody);
await app.register(cookie, {
  secret: process.env.COOKIE_SECRET || "super-secret-cookie-key",
});

// ============================================
// STRIPE WEBHOOK (raw body - musi być PRZED json parser)
// ============================================
await app.register(webhookRoutes, { prefix: "/api/webhooks" });

await app.register(multipart, {
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
});

// ============================================
// AUTH ROUTES (public - no middleware)
// ============================================
await app.register(adminAuthRoutes, { prefix: "/api/admin/auth" });

// ============================================
// ▶ ALLEGRO ROUTES
// OAuth callback MUST be public (Allegro redirects here without cookie)
// Other allegro routes are registered inside protected scope below
// ============================================
await app.register(
  async function allegroPublicRoutes(publicApp) {
    // OAuth callback — no auth required
    publicApp.get<{ Querystring: { code?: string; error?: string } }>(
      "/callback",
      async (request, reply) => {
        const { allegroRoutes: _ } = await import("./routes/allegro.js");
        // Inline handler for OAuth callback
        const { code, error } = request.query;
        const FRONTEND_URL =
          process.env.FRONTEND_URL || "http://localhost:4321";

        if (error || !code) {
          return reply.redirect(
            `${FRONTEND_URL}/admin/products?allegro_error=${encodeURIComponent(error || "no_code")}`,
          );
        }

        try {
          const { exchangeAuthCode } = await import("./lib/allegro-client.js");
          await exchangeAuthCode(code);
          console.log("✅ Allegro OAuth connected");
          return reply.redirect(
            `${FRONTEND_URL}/admin/products?allegro_connected=true`,
          );
        } catch (err: any) {
          return reply.redirect(
            `${FRONTEND_URL}/admin/products?allegro_error=${encodeURIComponent(err.message)}`,
          );
        }
      },
    );

    // Auth status — public (checked from frontend)
    publicApp.get("/auth/status", async () => {
      const { isAllegroConnected } = await import("./lib/allegro-client.js");
      const connected = await isAllegroConnected();
      return { success: true, data: { isAuthenticated: connected } };
    });
  },
  { prefix: "/api/allegro" },
);

// ============================================
// PROTECTED ADMIN ROUTES
// ============================================
app.register(async function protectedRoutes(protectedApp) {
  protectedApp.addHook("onRequest", requireAdmin);

  await protectedApp.register(adminProductRoutes, {
    prefix: "/api/admin/products",
  });

  // ▶ NEW: Protected Allegro admin routes (import, sync, etc.)
  await protectedApp.register(allegroRoutes, {
    prefix: "/api/allegro",
  });

  await protectedApp.register(adminAnalyticsRoutes, {
    prefix: "/api/admin/analytics",
  });

  await protectedApp.register(adminShippingRoutes, {
    prefix: "/api/admin/shipping",
  });
});

// ============================================
// PUBLIC API ROUTES
// ============================================
await app.register(productRoutes, { prefix: "/api/products" });
await app.register(categoryRoutes, { prefix: "/api/categories" });
await app.register(nipLookupRoutes, { prefix: "/api/nip" });
await app.register(manufacturerRoutes, { prefix: "/api/manufacturers" });
await app.register(orderRoutes, { prefix: "/api/orders" });
await app.register(userRoutes, { prefix: "/api/users" });
await app.register(blogRoutes, { prefix: "/api/blog" });
await app.register(legalRoutes, { prefix: "/api/legal" });
await app.register(shopProductRoutes, { prefix: "/api/shop" });
await app.register(analyticsRoutes, { prefix: "/api/analytics" });
await app.register(orderStatsRoutes, { prefix: "/api/orders/stats" });

await app.register(sitemapRoutes);

// ============================================
// HEALTH CHECK
// ============================================
app.get("/api/health", async () => {
  const dbOk = await prisma.$queryRaw`SELECT 1`
    .then(() => true)
    .catch(() => false);

  let allegroOk = false;
  try {
    const { isAllegroConnected } = await import("./lib/allegro-client.js");
    allegroOk = await isAllegroConnected();
  } catch {}

  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    database: dbOk ? "connected" : "disconnected",
    allegro: allegroOk ? "connected" : "disconnected",
  };
});

// ============================================
// ERROR HANDLER
// ============================================
app.setErrorHandler((error: FastifyError, request, reply) => {
  app.log.error({
    path: request.url,
    method: request.method,
    error: error.message,
    stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
  });

  reply.status(error.statusCode || 500).send({
    success: false,
    error:
      process.env.NODE_ENV === "production"
        ? "Wystąpił błąd. Spróbuj ponownie."
        : error.message,
  });
});

// ============================================
// START
// ============================================
const PORT = Number(process.env.PORT) || 4000;

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`🚀 Serwer wystartował na http://0.0.0.0:${PORT}`);
  console.log(`📍 Sitemap: http://0.0.0.0:${PORT}/sitemap_index.xml`);

  // ▶ NEW: Start Allegro background scheduler
  startAllegroScheduler();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

// Graceful shutdown
const shutdown = async () => {
  stopAllegroScheduler(); // ▶ NEW
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
