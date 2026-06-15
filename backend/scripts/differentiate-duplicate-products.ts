/**
 * One-shot: zróżnicuj SEO <title> dwóch RÓŻNYCH egzemplarzy o identycznej nazwie/parametrach,
 * żeby przestały kanibalizować się w SERP — BEZ zmiany nazwy produktu (H1 zostaje identyczne).
 *
 * Kontekst (audyt SEO 2026-06-15):
 *   - /motoreduktory/...-3fazowy-sew  (984 zł) oraz  ...-3fazowy-sew-2  (860 zł)
 *     to dwa odrębne, używane egzemplarze tego samego modelu (0,55 kW, 70 obr/min, SEW).
 *     Parametry i nazwa są identyczne i POPRAWNE — to nie błąd, lecz dwie sztuki w magazynie.
 *   - Problem SEO: identyczny <title> ("...SEW - zamów teraz!") → keyword cannibalization.
 *   - meta description już się różni (seo.description puste → fallback z [productSlug].astro
 *     wstrzykuje żywą cenę 984 vs 860). Różnicujemy więc tylko <title>.
 *
 * Co robi:
 *   - Ustawia distinct marketplaces.ownStore.seo.title z ceną jako różnicownikiem.
 *     product.name (H1) i parametry pozostają nietknięte.
 *   - Cena jest brana z bieżącego marketplaces.ownStore.price / product.price — przy zmianie
 *     ceny wystarczy puścić skrypt ponownie (idempotentny).
 *
 * Uruchomienie:
 *   cd backend && npm run seo:differentiate-dupes
 */
import { prisma } from '../src/lib/prisma.js';

const PAIR_IDS = [
  '6d4d87c8-7a59-4cda-8c78-017722149373', // ...-3fazowy-sew     (984 zł)
  '6bd0037b-26e0-42cb-a4b9-e778a5c77d3a', // ...-3fazowy-sew-2   (860 zł)
];

const capFirst = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

async function main() {
  console.log('🔧 Różnicowanie <title> duplikatów (bez zmiany nazwy)...\n');
  const products = await prisma.product.findMany({
    where: { id: { in: PAIR_IDS } },
    select: { id: true, name: true, price: true, condition: true, marketplaces: true },
  });

  if (products.length !== 2) {
    console.warn(`⚠️  Oczekiwano 2 produktów, znaleziono ${products.length}. Sprawdź ID.`);
  }

  for (const p of products) {
    const ms = (p.marketplaces && typeof p.marketplaces === 'object' ? p.marketplaces : {}) as any;
    const own = (ms.ownStore && typeof ms.ownStore === 'object' ? ms.ownStore : {}) as any;
    const seo = (own.seo && typeof own.seo === 'object' ? own.seo : {}) as any;

    const priceVal = Number(own.price ?? p.price ?? 0);
    const priceStr = priceVal.toLocaleString('pl-PL'); // np. "860"

    // Różnicownik = cena (krótka, widoczna w SERP). Stan jest już w meta description.
    // Nazwa (H1) pozostaje = product.name. capFirst, bo w bazie name bywa z małej litery.
    const newTitle = `${capFirst(p.name)} – ${priceStr} zł`;

    const newSeo = { ...seo, title: newTitle };
    const newOwn = { ...own, seo: newSeo };
    const newMs = { ...ms, ownStore: newOwn };

    await prisma.product.update({ where: { id: p.id }, data: { marketplaces: newMs } });
    console.log(`✓ ${own.slug}\n    title: "${seo.title || '(empty)'}"\n         → "${newTitle}" (${newTitle.length} zn.)`);
  }

  console.log('\n✅ Zróżnicowano. H1/nazwa bez zmian — różni się tylko <title> i (już) meta description.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ Błąd:', e);
  process.exit(1);
});
