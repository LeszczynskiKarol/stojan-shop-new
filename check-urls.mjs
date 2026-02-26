// check-urls.mjs
// Użycie: node check-urls.mjs

const DOMAIN = "https://app-reactapp.ngrok.app";

const URLS = [
  "/silniki-elektryczne-009-kw",
  "/silniki-elektryczne-012-kw",
  "/silniki-elektryczne-018-kw",
  "/silniki-elektryczne-025-kw",
  "/silniki-elektryczne-037-kw",
  "/silniki-elektryczne-055-kw",
  "/silniki-elektryczne-075-kw",
  "/silniki-elektryczne-1-1-kw",
  "/silniki-elektryczne-1-5-kw",
  "/silniki-elektryczne-2-2-kw",
  "/silniki-elektryczne-3-kw",
  "/silniki-elektryczne-4-kw",
  "/silniki-elektryczne-5-5-kw",
  "/silniki-elektryczne-7-5-kw",
  "/silniki-elektryczne-11-kw",
  "/silniki-elektryczne-18-5-kw",
  "/silniki-elektryczne-22-kw",
  "/silniki-elektryczne-30-kw",
  "/silniki-elektryczne-55-kw",
  "/silniki-elektryczne-75-kw",
  "/silniki-elektryczne-110-kw",
  "/silniki-elektryczne-160-kw",
  "/silniki-elektryczne-200-kw",
  // 0.09 kW
  "/silniki-elektryczne-009-kw-700-obr",
  "/silniki-elektryczne-009-kw-900-obr",
  "/silniki-elektryczne-009-kw-1400-obr",
  "/silniki-elektryczne-009-kw-2900-obr",
  // 0.12 kW
  "/silniki-elektryczne-012-kw-700-obr",
  "/silniki-elektryczne-012-kw-900-obr",
  "/silniki-elektryczne-012-kw-1400-obr",
  "/silniki-elektryczne-012-kw-2900-obr",
  // 0.18 kW
  "/silniki-elektryczne-018-kw-700-obr",
  "/silniki-elektryczne-018-kw-900-obr",
  "/silniki-elektryczne-018-kw-1400-obr",
  "/silniki-elektryczne-018-kw-2900-obr",
  // 0.25 kW
  "/silniki-elektryczne-025-kw-700-obr",
  "/silniki-elektryczne-025-kw-900-obr",
  "/silniki-elektryczne-025-kw-1400-obr",
  "/silniki-elektryczne-025-kw-2900-obr",
  // 0.37 kW
  "/silniki-elektryczne-037-kw-700-obr",
  "/silniki-elektryczne-037-kw-900-obr",
  "/silniki-elektryczne-037-kw-1400-obr",
  "/silniki-elektryczne-037-kw-2900-obr",
  // 0.55 kW
  "/silniki-elektryczne-055-kw-700-obr",
  "/silniki-elektryczne-055-kw-900-obr",
  "/silniki-elektryczne-055-kw-1400-obr",
  "/silniki-elektryczne-055-kw-2900-obr",
  // 0.75 kW
  "/silniki-elektryczne-075-kw-700-obr",
  "/silniki-elektryczne-075-kw-900-obr",
  "/silniki-elektryczne-075-kw-1400-obr",
  "/silniki-elektryczne-075-kw-2900-obr",
  // 1.1 kW
  "/silniki-elektryczne-1-1-kw-700-obr",
  "/silniki-elektryczne-1-1-kw-900-obr",
  "/silniki-elektryczne-1-1-kw-1400-obr",
  "/silniki-elektryczne-1-1-kw-2900-obr",
  // 1.5 kW
  "/silniki-elektryczne-1-5-kw-700-obr",
  "/silniki-elektryczne-1-5-kw-900-obr",
  "/silniki-elektryczne-1-5-kw-1400-obr",
  "/silniki-elektryczne-1-5-kw-2900-obr",
  // 2.2 kW
  "/silniki-elektryczne-2-2-kw-700-obr",
  "/silniki-elektryczne-2-2-kw-900-obr",
  "/silniki-elektryczne-2-2-kw-1400-obr",
  "/silniki-elektryczne-2-2-kw-2900-obr",
  // 3 kW
  "/silniki-elektryczne-3-kw-700-obr",
  "/silniki-elektryczne-3-kw-900-obr",
  "/silniki-elektryczne-3-kw-1400-obr",
  "/silniki-elektryczne-3-kw-2900-obr",
  // 4 kW
  "/silniki-elektryczne-4-kw-700-obr",
  "/silniki-elektryczne-4-kw-900-obr",
  "/silniki-elektryczne-4-kw-1400-obr",
  "/silniki-elektryczne-4-kw-2900-obr",
  // 5.5 kW
  "/silniki-elektryczne-5-5-kw-700-obr",
  "/silniki-elektryczne-5-5-kw-900-obr",
  "/silniki-elektryczne-5-5-kw-1400-obr",
  "/silniki-elektryczne-5-5-kw-2900-obr",
  // 7.5 kW
  "/silniki-elektryczne-7-5-kw-700-obr",
  "/silniki-elektryczne-7-5-kw-900-obr",
  "/silniki-elektryczne-7-5-kw-1400-obr",
  "/silniki-elektryczne-7-5-kw-2900-obr",
  // 11 kW
  "/silniki-elektryczne-11-kw-700-obr",
  "/silniki-elektryczne-11-kw-900-obr",
  "/silniki-elektryczne-11-kw-1400-obr",
  "/silniki-elektryczne-11-kw-2900-obr",
  // 18.5 kW
  "/silniki-elektryczne-18-5-kw-700-obr",
  "/silniki-elektryczne-18-5-kw-900-obr",
  "/silniki-elektryczne-18-5-kw-1400-obr",
  "/silniki-elektryczne-18-5-kw-2900-obr",
  // Kategorie
  "/trojfazowe",
  "/jednofazowe",
  "/z-hamulcem",
  "/dwubiegowe",
  "/pierscieniowe",
  "/motoreduktory",
  "/akcesoria",
  "/pompy",
  "/wentylatory",
  // Statyczne
  "/szukaj",
  "/koszyk",
  "/qr",
  "/kontakt",
  "/o-nas",
  "/skup-silnikow",
  "/blog",
];

async function checkUrl(url) {
  try {
    const res = await fetch(`${DOMAIN}${url}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 StojanBot/1.0",
        "ngrok-skip-browser-warning": "true",
        Accept: "text/html",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    return { url, status: res.status };
  } catch (e) {
    return { url, status: 0, error: e.message };
  }
}

async function main() {
  console.log(`\n  Sprawdzam ${URLS.length} URL-i na ${DOMAIN}\n`);

  const ok = [];
  const fail = [];

  // Batch po 5 żeby nie zabić ngrok
  for (let i = 0; i < URLS.length; i += 5) {
    const batch = URLS.slice(i, i + 5);
    const results = await Promise.all(batch.map(checkUrl));

    for (const r of results) {
      if (r.status === 200) {
        ok.push(r);
        process.stdout.write(`  \x1b[32mOK\x1b[0m  ${r.status}  ${r.url}\n`);
      } else {
        fail.push(r);
        process.stdout.write(
          `  \x1b[31mFAIL\x1b[0m ${r.status}  ${r.url}${r.error ? "  " + r.error : ""}\n`,
        );
      }
    }

    // Mały delay między batchami
    if (i + 5 < URLS.length) await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\n  ========================================`);
  console.log(
    `  WYNIK: \x1b[32m${ok.length} OK\x1b[0m / \x1b[31m${fail.length} FAIL\x1b[0m / ${URLS.length} TOTAL`,
  );
  console.log(`  ========================================\n`);

  if (fail.length > 0) {
    console.log(`  NIEDZIAŁAJĄCE:`);
    for (const f of fail) {
      console.log(`    ${f.status}  ${f.url}`);
    }
    console.log();
  }
}

main();
