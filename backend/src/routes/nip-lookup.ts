// backend/src/routes/nip-lookup.ts
// Public NIP lookup endpoint for checkout auto-fill
// Register: app.register(nipLookupRoutes, { prefix: '/api/nip' })

import { FastifyInstance } from "fastify";
import { lookupNip } from "../lib/bir-client.js";

// Simple in-memory cache to avoid hammering BIR for same NIP
const nipCache = new Map<string, { data: any; expiresAt: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Rate limiting per IP — max 10 lookups per minute
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW = 60 * 1000; // 1 minute

export async function nipLookupRoutes(app: FastifyInstance) {
  // GET /api/nip/:nip — lookup company by NIP
  app.get<{ Params: { nip: string } }>("/:nip", async (request, reply) => {
    const { nip } = request.params;
    const cleanNip = nip.replace(/[\s-]/g, "");

    // Validate
    if (!/^\d{10}$/.test(cleanNip)) {
      return reply.status(400).send({
        success: false,
        error: "NIP musi mieć 10 cyfr",
      });
    }

    // Rate limit
    const clientIp = request.ip;
    const now = Date.now();
    const rl = rateLimits.get(clientIp);
    if (rl && now < rl.resetAt) {
      if (rl.count >= RATE_LIMIT) {
        return reply.status(429).send({
          success: false,
          error: "Zbyt wiele zapytań — spróbuj za chwilę",
        });
      }
      rl.count++;
    } else {
      rateLimits.set(clientIp, { count: 1, resetAt: now + RATE_WINDOW });
    }

    // Check cache
    const cached = nipCache.get(cleanNip);
    if (cached && now < cached.expiresAt) {
      return reply.send(cached.data);
    }

    try {
      const result = await lookupNip(cleanNip);

      if (!result) {
        const notFound = {
          success: true,
          data: { found: false, nip: cleanNip },
        };
        nipCache.set(cleanNip, { data: notFound, expiresAt: now + CACHE_TTL });
        return reply.send(notFound);
      }

      const response = { success: true, data: result };
      nipCache.set(cleanNip, { data: response, expiresAt: now + CACHE_TTL });

      return reply.send(response);
    } catch (err: any) {
      app.log.error(`NIP lookup error for ${cleanNip}: ${err.message}`);
      return reply.status(502).send({
        success: false,
        error: "Usługa GUS niedostępna — wpisz dane ręcznie",
      });
    }
  });
  app.get("/test-bir", async (request, reply) => {
    const TEST_URL =
      "https://wyszukiwarkaregontest.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc";
    const TEST_KEY = "abcde12345abcde12345";
    const TEST_NIP = "5261040828";

    try {
      // 1. Login
      const loginEnv = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:ns="http://CIS/BIR/PUBL/2014/07">
  <soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">
    <wsa:To>${TEST_URL}</wsa:To>
    <wsa:Action>http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/Zaloguj</wsa:Action>
  </soap:Header>
  <soap:Body><ns:Zaloguj><ns:pKluczUzytkownika>${TEST_KEY}</ns:pKluczUzytkownika></ns:Zaloguj></soap:Body>
</soap:Envelope>`;

      const loginRes = await fetch(TEST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/soap+xml; charset=utf-8" },
        body: loginEnv,
      });
      let loginXml = await loginRes.text();
      const envStart = loginXml.indexOf("<s:Envelope");
      if (envStart > 0) loginXml = loginXml.substring(envStart);
      const bIdx = loginXml.lastIndexOf("\n--uuid:");
      if (bIdx > 0) loginXml = loginXml.substring(0, bIdx);

      const sidMatch = loginXml.match(
        /<ZalogujResult[^>]*>(.*?)<\/ZalogujResult>/,
      );
      const sid = sidMatch?.[1] || "";

      if (!sid) return reply.send({ error: "Empty SID" });

      // 2. Search — ★ z poprawnym DataContract namespace ★
      const searchEnv = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
               xmlns:ns="http://CIS/BIR/PUBL/2014/07"
               xmlns:dat="http://CIS/BIR/PUBL/2014/07/DataContract">
  <soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">
    <wsa:To>${TEST_URL}</wsa:To>
    <wsa:Action>http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/DaneSzukajPodmioty</wsa:Action>
  </soap:Header>
  <soap:Body>
    <ns:DaneSzukajPodmioty>
      <ns:pParametryWyszukiwania>
        <dat:Nip>${TEST_NIP}</dat:Nip>
      </ns:pParametryWyszukiwania>
    </ns:DaneSzukajPodmioty>
  </soap:Body>
</soap:Envelope>`;

      const searchRes = await fetch(TEST_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/soap+xml; charset=utf-8",
          sid: sid,
        },
        body: searchEnv,
      });

      let searchXml = await searchRes.text();
      const sEnv = searchXml.indexOf("<s:Envelope");
      if (sEnv > 0) searchXml = searchXml.substring(sEnv);
      const sB = searchXml.lastIndexOf("\n--uuid:");
      if (sB > 0) searchXml = searchXml.substring(0, sB);

      const hasData =
        searchXml.includes("&lt;Nazwa&gt;") || searchXml.includes("<Nazwa>");

      return reply.send({
        sid: "OK",
        hasData,
        xml: searchXml.substring(0, 800),
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });
}
