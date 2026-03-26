// backend/src/lib/bir-client.ts
// GUS BIR1.1 SOAP API client — NIP lookup for company auto-fill
// Docs: https://api.stat.gov.pl/Home/RegonApi
// Free, unlimited, no rate limits (reasonable usage)

const BIR_URL =
  process.env.BIR_URL ||
  "https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc";
const BIR_KEY = process.env.BIR_API_KEY || "";

// Session cache — BIR sessions last ~60min, we refresh every 45min
let cachedSession: { sid: string; expiresAt: number } | null = null;

// ============================================
// SOAP Envelope helpers
// ============================================
function soapEnvelope(body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
               xmlns:ns="http://CIS/BIR/PUBL/2014/07"
               xmlns:dat="http://CIS/BIR/PUBL/2014/07/DataContract">
  <soap:Header xmlns:wsa="http://www.w3.org/2005/08/addressing">
    <wsa:To>${BIR_URL}</wsa:To>
    <wsa:Action>${getAction(body)}</wsa:Action>
  </soap:Header>
  <soap:Body>${body}</soap:Body>
</soap:Envelope>`;
}

function getAction(body: string): string {
  if (body.includes("Zaloguj"))
    return "http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/Zaloguj";
  if (body.includes("DaneSzukajPodmioty"))
    return "http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/DaneSzukajPodmioty";
  if (body.includes("DanePobierzPelnyRaport"))
    return "http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/DanePobierzPelnyRaport";
  if (body.includes("DanePobierzRaportZbiorczy"))
    return "http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/DanePobierzRaportZbiorczy";
  if (body.includes("GetValue"))
    return "http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/GetValue";
  if (body.includes("Wyloguj"))
    return "http://CIS/BIR/PUBL/2014/07/IUslugaBIRzewnPubl/Wyloguj";
  return "";
}

async function soapCall(body: string, sid?: string): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/soap+xml; charset=utf-8",
  };
  if (sid) {
    headers["sid"] = sid;
  }

  const res = await fetch(BIR_URL, {
    method: "POST",
    headers,
    body: soapEnvelope(body),
  });

  if (!res.ok) {
    throw new Error(`BIR SOAP error: ${res.status} ${res.statusText}`);
  }

  let text = await res.text();

  // BIR returns MTOM/XOP multipart — strip MIME envelope to get raw XML
  if (text.includes("--uuid:") || text.includes("Content-Type:")) {
    const xmlStart = text.indexOf("<s:Envelope");
    if (xmlStart === -1) {
      // Try alternate envelope tag
      const altStart = text.indexOf("<soap:Envelope");
      if (altStart !== -1) text = text.substring(altStart);
    } else {
      text = text.substring(xmlStart);
    }
    // Strip trailing MIME boundary
    const boundaryIdx = text.lastIndexOf("\n--uuid:");
    if (boundaryIdx !== -1) {
      text = text.substring(0, boundaryIdx);
    }
  }

  return text;
}

// ============================================
// XML parsing helpers (no deps needed)
// ============================================
function extractTag(xml: string, tag: string): string {
  const patterns = [
    // <tag>val</tag> or <tag xmlns="...">val</tag>
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`),
    // <ns:tag>val</ns:tag> (any prefix)
    new RegExp(`<[a-zA-Z0-9]+:${tag}[^>]*>([\\s\\S]*?)</[a-zA-Z0-9]+:${tag}>`),
    // Namespace-qualified without prefix: xmlns default
    new RegExp(`<${tag}\\s+xmlns="[^"]*"[^>]*>([\\s\\S]*?)</${tag}>`),
  ];
  for (const re of patterns) {
    const m = xml.match(re);
    if (m) return m[1].trim();
  }
  return "";
}

function extractAllTags(xml: string, tags: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const tag of tags) {
    result[tag] = extractTag(xml, tag);
  }
  return result;
}

// ============================================
// API Methods
// ============================================

/** Login — get session ID */
async function login(): Promise<string> {
  if (!BIR_KEY) {
    throw new Error("BIR_API_KEY not configured");
  }

  // Return cached session if still valid
  if (cachedSession && Date.now() < cachedSession.expiresAt) {
    return cachedSession.sid;
  }

  const body = `<ns:Zaloguj><ns:pKluczUzytkownika>${BIR_KEY}</ns:pKluczUzytkownika></ns:Zaloguj>`;
  const xml = await soapCall(body);
  const sid = extractTag(xml, "ZalogujResult");

  if (!sid) {
    throw new Error("BIR login failed — empty session ID");
  }

  // Cache for 45 minutes (sessions last ~60min)
  cachedSession = {
    sid,
    expiresAt: Date.now() + 45 * 60 * 1000,
  };

  console.log("✅ BIR1 session established");
  return sid;
}

/** Call GetValue diagnostic method */
async function getValue(param: string): Promise<string> {
  const sid = await login();
  const body = `<ns:GetValue><ns:pNazwaParametru>${param}</ns:pNazwaParametru></ns:GetValue>`;
  const xml = await soapCall(body, sid);
  return extractTag(xml, "GetValueResult");
}

/** Search company by NIP */
async function searchByNip(
  nip: string,
): Promise<Record<string, string> | null> {
  const sid = await login();

  const body = `<ns:DaneSzukajPodmioty>
    <ns:pParametryWyszukiwania>
      <dat:Nip>${nip}</dat:Nip>
    </ns:pParametryWyszukiwania>
  </ns:DaneSzukajPodmioty>`;

  const xml = await soapCall(body, sid);

  const resultXml = extractTag(xml, "DaneSzukajPodmiotyResult");

  if (!resultXml || resultXml.includes("ErrorCode")) {
    // ── Diagnostic: why empty? ──
    const kod = await getValue("KomunikatKod");
    const tresc = await getValue("KomunikatTresc");
    const statusSesji = await getValue("StatusSesji");
    console.log(
      `🔍 [BIR] Empty result — KomunikatKod: ${kod}, Treść: ${tresc}, StatusSesji: ${statusSesji}`,
    );

    // Code 7 = session expired/invalid → retry with fresh session
    if (kod === "7") {
      console.log("🔄 [BIR] Session invalid, forcing re-login...");
      cachedSession = null;
      const newSid = await login();
      const retryXml = await soapCall(body, newSid);
      const retryResult = extractTag(retryXml, "DaneSzukajPodmiotyResult");
      if (retryResult && !retryResult.includes("ErrorCode")) {
        const decoded = retryResult
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&")
          .replace(/&quot;/g, '"');
        return extractAllTags(decoded, [
          "Regon",
          "Nip",
          "Nazwa",
          "Wojewodztwo",
          "Powiat",
          "Gmina",
          "Miejscowosc",
          "KodPocztowy",
          "Ulica",
          "NrNieruchomosci",
          "NrLokalu",
          "Typ",
          "SilosID",
        ]);
      }
    }

    return null;
  }

  const decoded = resultXml
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');

  return extractAllTags(decoded, [
    "Regon",
    "Nip",
    "Nazwa",
    "Wojewodztwo",
    "Powiat",
    "Gmina",
    "Miejscowosc",
    "KodPocztowy",
    "Ulica",
    "NrNieruchomosci",
    "NrLokalu",
    "Typ",
    "SilosID",
  ]);
}

// ============================================
// Public API
// ============================================
export interface NipLookupResult {
  found: boolean;
  nip: string;
  regon: string;
  name: string;
  street: string;
  buildingNumber: string;
  apartmentNumber: string;
  postalCode: string;
  city: string;
  province: string; // województwo
  county: string; // powiat
  commune: string; // gmina
  type: string; // F = osoba fizyczna, P = prawna, LP = lokalna prawna
}

/**
 * Lookup company data by NIP number.
 * Returns null if not found or API unavailable.
 */
export async function lookupNip(nip: string): Promise<NipLookupResult | null> {
  // Validate NIP format
  const cleanNip = nip.replace(/[\s-]/g, "");
  if (!/^\d{10}$/.test(cleanNip)) {
    return null;
  }

  try {
    const data = await searchByNip(cleanNip);
    if (!data || !data.Nazwa) {
      return null;
    }

    // Build street address
    let street = data.Ulica || "";
    if (data.NrNieruchomosci) {
      street += street ? ` ${data.NrNieruchomosci}` : data.NrNieruchomosci;
    }
    if (data.NrLokalu) {
      street += `/${data.NrLokalu}`;
    }

    // Format postal code (BIR returns without dash)
    let postalCode = data.KodPocztowy || "";
    if (postalCode.length === 5 && !postalCode.includes("-")) {
      postalCode = `${postalCode.slice(0, 2)}-${postalCode.slice(2)}`;
    }

    return {
      found: true,
      nip: cleanNip,
      regon: data.Regon || "",
      name: data.Nazwa || "",
      street,
      buildingNumber: data.NrNieruchomosci || "",
      apartmentNumber: data.NrLokalu || "",
      postalCode,
      city: data.Miejscowosc || "",
      province: data.Wojewodztwo || "",
      county: data.Powiat || "",
      commune: data.Gmina || "",
      type: data.Typ || "",
    };
  } catch (err) {
    console.error("❌ BIR NIP lookup error:", err);
    // Invalidate session on error (might be expired)
    cachedSession = null;
    return null;
  }
}

/**
 * Check if BIR API is configured and accessible
 */
export async function isBirConfigured(): Promise<boolean> {
  return !!BIR_KEY;
}
