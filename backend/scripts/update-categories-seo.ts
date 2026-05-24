/**
 * One-shot: zaktualizuj Category.metadata (SEO title + description) dla głównych kategorii.
 *
 * Powód:
 *   - GSC pokazuje że kategorie konkurują o duże query ("silniki trójfazowe" 2168 imp,
 *     "motoreduktor" 5946 imp), a obecne title/description są albo puste (fallback do
 *     generycznego "{Name} - sklep, hurtownia, oferta, ceny, sprzedaż") albo błędne
 *     (trojfazowe: "Trójfazowy silniki elektryczny" — błąd gramatyczny).
 *
 * Co robi:
 *   - Dla każdego slug z mapy CATEGORY_SEO ustawia metadata.title i metadata.description.
 *   - Nie tyka innych pól metadata (merge przez { ...existing, title, description }).
 *   - NIE dotyka power-category records (silniki-elektryczne-X-kw) — te mają fallback
 *     z liczbą produktów i są generowane dynamicznie w [categorySlug]/index.astro.
 *
 * Uruchomienie:
 *   cd backend
 *   npx tsx scripts/update-categories-seo.ts
 *
 *   (lub: npm run seo:categories — patrz package.json)
 */
import { prisma } from '../src/lib/prisma.js';

interface SeoMeta {
  title: string;
  description: string;
}

const CATEGORY_SEO: Record<string, SeoMeta> = {
  trojfazowe: {
    title: 'Silniki trójfazowe — używane i nowe, od 0,09 do 315 kW | Stojan',
    description:
      'Silniki elektryczne trójfazowe sprawdzone i gotowe do pracy. Po remoncie z gwarancją, nowe od producentów (Tamel, MEZ, Siemens, ABB, Indukta, Cantoni). Wysyłka 24 h. Atrakcyjne ceny.',
  },
  jednofazowe: {
    title: 'Silniki jednofazowe 230V — sklep z napędami | Stojan',
    description:
      'Silniki elektryczne jednofazowe 230V do warsztatu, gospodarstwa, maszyn rolniczych i przemysłowych. Moce od 0,09 do 4 kW. Wysyłka 24 h, fachowe doradztwo.',
  },
  'z-hamulcem': {
    title: 'Silniki elektryczne z hamulcem — pełna oferta | Stojan',
    description:
      'Silniki z hamulcem elektromagnetycznym do dźwigów, wciągarek i maszyn wymagających natychmiastowego zatrzymania. Trójfazowe i jednofazowe, różne moce i obroty.',
  },
  motoreduktory: {
    title: 'Motoreduktory — przekładnie z silnikiem | Stojan',
    description:
      'Motoreduktory walcowe, ślimakowe i kątowe od NORD, SEW, Bauer, Lenze. Niskie obroty, wysoki moment obrotowy. Bezpłatny dobór do aplikacji. Dostawa 24 h.',
  },
  dwubiegowe: {
    title: 'Silniki dwubiegowe — dwie prędkości obrotowe | Stojan',
    description:
      'Silniki elektryczne dwubiegowe z przełączalnym uzwojeniem (Dahlandera). Do wentylatorów, pomp i maszyn wymagających dwóch prędkości obrotowych.',
  },
  pompy: {
    title: 'Pompy elektryczne — przemysłowe, wodne, olejowe | Stojan',
    description:
      'Pompy elektryczne do wody, oleju i mediów przemysłowych. Marki KSB, Grundfos, Lowara. Dobierzemy pompę pod parametry — wydajność, ciśnienie, lepkość medium.',
  },
  'wentylatory-przemyslowe': {
    title: 'Wentylatory przemysłowe — osiowe, promieniowe, dmuchawy | Stojan',
    description:
      'Wentylatory osiowe, promieniowe i dmuchawy przemysłowe. Różne moce, średnice i wydajności. Do wentylacji hal, odpylania i chłodzenia urządzeń.',
  },
  akcesoria: {
    title: 'Akcesoria do silników: koła pasowe, sprzęgła, falowniki | Stojan',
    description:
      'Akcesoria do silników elektrycznych — koła pasowe, sprzęgła kłowe, falowniki, kondensatory, łapy, kołnierze. Pełna oferta części zamiennych i mocujących.',
  },
  pierscieniowe: {
    title: 'Silniki pierścieniowe — z pierścieniami ślizgowymi | Stojan',
    description:
      'Silniki elektryczne pierścieniowe (slip-ring) o wysokomomentowym rozruchu. Do młynów, kruszarek i maszyn o ciężkim rozruchu. Doradzimy w doborze.',
  },
  'skup-silnikow': {
    title: 'Skup silników elektrycznych — sprawne i niesprawne, cała Polska | Stojan',
    description:
      'Skupujemy silniki elektryczne — sprawne, niesprawne, po remoncie. Od 0,5 kW wzwyż. Bezpłatna wycena, odbiór z całej Polski, płatność z góry.',
  },
};

async function main() {
  console.log('🔧 Updating SEO metadata for category records...\n');
  const slugs = Object.keys(CATEGORY_SEO);

  const found = await prisma.category.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true, name: true, metadata: true },
  });

  const foundSlugs = new Set(found.map((c) => c.slug));
  const missing = slugs.filter((s) => !foundSlugs.has(s));
  if (missing.length) console.warn('⚠️  Slugi nie znalezione w DB (pominięte):', missing);

  let updated = 0;
  for (const cat of found) {
    const seo = CATEGORY_SEO[cat.slug];
    const existingMeta =
      cat.metadata && typeof cat.metadata === 'object' && !Array.isArray(cat.metadata)
        ? (cat.metadata as Record<string, unknown>)
        : {};
    const newMeta = { ...existingMeta, title: seo.title, description: seo.description };

    await prisma.category.update({
      where: { id: cat.id },
      data: { metadata: newMeta },
    });

    const before = (existingMeta.title as string) || '(empty)';
    console.log(`✓ ${cat.slug.padEnd(25)} title: "${before}" → "${seo.title}"`);
    updated++;
  }

  console.log(`\n✅ Zaktualizowano ${updated} kategorii.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ Błąd:', e);
  process.exit(1);
});
