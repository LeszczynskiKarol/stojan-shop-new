/**
 * One-shot: uzupełnij Category.description (body HTML, 400-550 słów) dla kategorii,
 * które miały pustą treść — w ślad za update-motoreduktory-content.ts.
 *
 * Powód (audyt SEO 2026-06-15):
 *   - Tylko motoreduktory / trojfazowe / jednofazowe miały rozbudowany opis kategorii.
 *     Pozostałe realne kategorie produktowe renderowały fallback 1-zdaniowy w
 *     [categorySlug]/index.astro (linia ~488), przez co konkurują o swoje query z
 *     pozycji 2. strony SERP.
 *   - Treść jest strukturalna (H2/H3 + listy) i zawiera anchor-linki wewnętrzne
 *     (m.in. do /motoreduktory) — realizuje też rekomendację wzmocnienia linkowania.
 *
 * Zakres: kategorie z realną liczbą produktów. Pomijamy:
 *   - pierscieniowe (1 produkt), skup-silnikow (0 — ma dedykowaną stronę /skup-silnikow.astro),
 *   - power-pages (silniki-elektryczne-X-kw) — generują własny fallback z liczbą sztuk.
 *
 * Renderuje się już przez <ExpandableDescription> — brakowało tylko treści, nie kodu.
 *
 * Uruchomienie:
 *   cd backend && npm run seo:categories-content
 *   (idempotentne — można puścić wielokrotnie; nadpisuje description podanych slugów)
 */
import { prisma } from '../src/lib/prisma.js';

const CONTENT: Record<string, string> = {
  // ── Silniki z hamulcem (40 produktów) ────────────────────────────────────
  'z-hamulcem': `<p>Silniki elektryczne z hamulcem to napędy z wbudowanym hamulcem elektromagnetycznym, który zatrzymuje wał w ułamku sekundy po odcięciu zasilania. W sklepie Stojan znajdziesz silniki hamulcowe trójfazowe i jednofazowe w szerokim zakresie mocy — sprawdzone po remoncie z gwarancją oraz nowe od producentów. Większość wysyłamy w 24 h.</p>

<h2>Jak działa hamulec w silniku elektrycznym?</h2>
<p>Standardowy hamulec to sprężynowy hamulec spoczynkowy (fail-safe). Gdy silnik jest pod napięciem, elektromagnes ściąga tarczę i zwalnia hamowanie — wał obraca się swobodnie. Po zaniku zasilania sprężyny dociskają okładziny do tarczy hamulcowej i <strong>natychmiast unieruchamiają wał</strong>. Dzięki temu napęd zatrzymuje obciążenie nawet przy awarii zasilania — to kluczowe dla bezpieczeństwa urządzeń podnoszących.</p>

<h2>Gdzie stosuje się silniki hamulcowe?</h2>
<ul>
  <li><strong>Wciągarki i dźwigi</strong> — hamulec utrzymuje ładunek w miejscu po zatrzymaniu i przy zaniku prądu.</li>
  <li><strong>Bramy i szlabany</strong> — precyzyjne zatrzymanie w pozycji końcowej.</li>
  <li><strong>Przenośniki i podajniki</strong> — natychmiastowy stop bez wybiegu taśmy, ważny przy dozowaniu i pozycjonowaniu.</li>
  <li><strong>Obrabiarki i maszyny pakujące</strong> — zatrzymanie cyklu w dokładnej pozycji.</li>
  <li><strong>Suwnice i podnośniki</strong> — bezpieczeństwo operatora i ładunku.</li>
</ul>

<h2>Jak dobrać silnik z hamulcem?</h2>
<p>Oprócz standardowych parametrów (moc w kW, obroty, zasilanie 230 V / 400 V, sposób mocowania B3/B5/B14) zwróć uwagę na <strong>moment hamujący</strong> — musi być dobrany do bezwładności napędzanej maszyny. Dla napędów podnoszących moment hamulca powinien z zapasem przewyższać moment obciążenia. Istotne są też: napięcie cewki hamulca, możliwość ręcznego zwalniania (dźwignia odblokowania) oraz stopień ochrony IP.</p>

<p>Potrzebujesz napędu, który łączy redukcję obrotów z hamulcem? Sprawdź nasze <a href="/motoreduktory">motoreduktory z hamulcem</a> — przekładnia ślimakowa dodatkowo działa samohamownie. Szukasz dwóch prędkości obrotowych? Zobacz <a href="/dwubiegowe">silniki dwubiegowe</a>. Nie wiesz, co wybrać — zadzwoń pod <a href="tel:+48500385112">500 385 112</a>, dobierzemy napęd do Twojej maszyny.</p>`,

  // ── Akcesoria (208 produktów) ─────────────────────────────────────────────
  akcesoria: `<p>Akcesoria do silników elektrycznych to wszystko, czego potrzebujesz, żeby uruchomić, zamontować i sterować napędem. W sklepie Stojan znajdziesz koła pasowe, sprzęgła, falowniki, kondensatory rozruchowe, łapy, kołnierze i części zamienne — ponad 200 pozycji dostępnych od ręki, z wysyłką w 24 h.</p>

<h2>Co znajdziesz w kategorii akcesoria?</h2>

<h3>Przeniesienie napędu — koła pasowe i sprzęgła</h3>
<p>Koła pasowe (taper lock, SPA/SPZ/SPB) i pasy klinowe przenoszą moment z wału silnika na maszynę roboczą, pozwalając jednocześnie dobrać przełożenie. Sprzęgła kłowe, elastyczne i tulejowe łączą wały współosiowo, kompensując drobne niewspółosiowości i tłumiąc drgania. Dobór zależy od mocy, obrotów i średnicy wału — chętnie pomożemy.</p>

<h3>Sterowanie — falowniki</h3>
<p>Falownik (przemiennik częstotliwości) pozwala płynnie regulować prędkość obrotową silnika trójfazowego, łagodnie go rozpędzać i hamować oraz zasilić silnik 3-fazowy z gniazdka 230 V. To podstawowe akcesorium do pomp, wentylatorów i przenośników, gdzie potrzebna jest regulacja wydajności.</p>

<h3>Rozruch silników jednofazowych — kondensatory</h3>
<p>Kondensatory rozruchowe i pracy są niezbędne w silnikach jednofazowych 230 V. Zużyty kondensator to najczęstsza przyczyna braku rozruchu — silnik „buczy", ale nie startuje. Dobieramy pojemność (µF) i napięcie do konkretnego modelu.</p>

<h3>Mocowanie — łapy, kołnierze, części</h3>
<p>Łapy (konwersja na wykonanie B3), kołnierze B5/B14, osłony wentylatora, wentylatory chłodzące, łożyska i uszczelnienia — wszystko, co potrzebne przy montażu i serwisie napędu.</p>

<h2>Pomożemy dobrać akcesorium</h2>
<p>Nie wiesz, jakie koło pasowe albo jaki falownik pasuje do Twojego silnika? Podaj parametry napędu (moc, obroty, średnicę wału, zasilanie), a my dobierzemy właściwą część. Akcesoria świetnie uzupełniają nasze <a href="/trojfazowe">silniki trójfazowe</a>, <a href="/jednofazowe">jednofazowe</a> i <a href="/motoreduktory">motoreduktory</a>. Zadzwoń pod <a href="tel:+48500385112">500 385 112</a> lub napisz na <a href="mailto:stojan@silniki-elektryczne.com.pl">stojan@silniki-elektryczne.com.pl</a>.</p>`,

  // ── Pompy (37 produktów) ──────────────────────────────────────────────────
  pompy: `<p>Pompy elektryczne do wody, oleju i mediów przemysłowych — w sklepie Stojan znajdziesz pompy sprawdzone po remoncie oraz nowe, gotowe do pracy. Dobierzemy pompę pod konkretne parametry: wydajność, wysokość podnoszenia i rodzaj tłoczonego medium. Wysyłka w 24 h kurierem z całej Polski.</p>

<h2>Rodzaje pomp elektrycznych</h2>

<h3>Pompy odśrodkowe (wirowe)</h3>
<p>Najpopularniejszy typ — wirnik nadaje cieczy prędkość, która zamienia się na ciśnienie. Sprawdzają się przy dużych wydajnościach i czystych lub lekko zanieczyszczonych mediach: woda, kondensat, ciecze chłodzące. Proste w eksploatacji i niezawodne.</p>

<h3>Pompy do cieczy gęstych i olejów</h3>
<p>Pompy zębate i śrubowe tłoczą media o wysokiej lepkości — oleje, smary, emulsje. Charakteryzują się stałą, równomierną wydajnością niezależną od ciśnienia, dlatego stosuje się je w układach smarowania i hydraulice.</p>

<h3>Pompy przemysłowe</h3>
<p>Do układów technologicznych, chłodzenia maszyn, instalacji wodnych w zakładach i rolnictwie. Wykonania z różnych materiałów (żeliwo, stal nierdzewna) dobierane do agresywności medium.</p>

<h2>Jak dobrać pompę?</h2>
<p>O doborze decydują cztery parametry:</p>
<ol>
  <li><strong>Wydajność (m³/h lub l/min)</strong> — ile cieczy pompa ma przetłoczyć w jednostce czasu.</li>
  <li><strong>Wysokość podnoszenia (m H₂O)</strong> — różnica poziomów plus opory instalacji.</li>
  <li><strong>Rodzaj medium</strong> — woda czysta, brudna, olej, chemia; decyduje o materiale i typie pompy.</li>
  <li><strong>Zasilanie</strong> — 230 V jednofazowe (mniejsze pompy domowe) lub 400 V trójfazowe (przemysł, większe wydajności).</li>
</ol>

<p>Wiele pomp napędzanych jest silnikami kołnierzowymi B5 — w razie potrzeby wymiany napędu sprawdź nasze <a href="/trojfazowe">silniki trójfazowe</a>. Do regulacji wydajności przyda się falownik z kategorii <a href="/akcesoria">akcesoria</a>. Nie masz pewności co do doboru? Zadzwoń pod <a href="tel:+48500385112">500 385 112</a> — pomożemy.</p>`,

  // ── Wentylatory przemysłowe (35 produktów) ────────────────────────────────
  'wentylatory-przemyslowe': `<p>Wentylatory przemysłowe do wentylacji hal, odpylania, chłodzenia urządzeń i transportu pneumatycznego. W sklepie Stojan znajdziesz wentylatory osiowe, promieniowe i dmuchawy — różne wydajności i średnice, sprawdzone i gotowe do pracy. Wysyłka w 24 h.</p>

<h2>Typy wentylatorów przemysłowych</h2>

<h3>Wentylatory osiowe</h3>
<p>Powietrze przepływa równolegle do osi wirnika. Cechują się <strong>dużą wydajnością przy niskim sprężu</strong> — idealne do przewietrzania hal, garaży, obór i chłodzenia urządzeń, gdzie trzeba przetłoczyć dużo powietrza bez pokonywania dużych oporów.</p>

<h3>Wentylatory promieniowe (odśrodkowe)</h3>
<p>Powietrze wchodzi osiowo, a wychodzi prostopadle do osi. Generują <strong>wysokie ciśnienie</strong>, dlatego sprawdzają się w instalacjach kanałowych, odpylaniu, odciągach trocin i transporcie pneumatycznym, gdzie trzeba pokonać duże opory przepływu.</p>

<h3>Dmuchawy</h3>
<p>Wentylatory wysokociśnieniowe do napowietrzania, transportu materiałów sypkich i zastosowań technologicznych wymagających silnego, skoncentrowanego strumienia powietrza.</p>

<h2>Jak dobrać wentylator?</h2>
<ol>
  <li><strong>Wydajność (m³/h)</strong> — objętość powietrza do przetłoczenia; dla wentylacji liczona z kubatury i wymaganej krotności wymian.</li>
  <li><strong>Spręż (Pa)</strong> — ciśnienie potrzebne do pokonania oporów kanałów i filtrów. Niski → osiowy, wysoki → promieniowy.</li>
  <li><strong>Średnica i mocowanie</strong> — dopasowanie do istniejącego kanału lub otworu.</li>
  <li><strong>Zasilanie</strong> — 230 V lub 400 V; przy regulacji wydajności warto dodać falownik.</li>
</ol>

<p>Wentylatory napędzane są typowo silnikami trójfazowymi — w razie wymiany napędu zobacz <a href="/trojfazowe">silniki trójfazowe</a>, a do płynnej regulacji obrotów falownik z kategorii <a href="/akcesoria">akcesoria</a>. Pomożemy dobrać wentylator do Twojej instalacji — <a href="tel:+48500385112">500 385 112</a>.</p>`,

  // ── Silniki dwubiegowe (11 produktów) ─────────────────────────────────────
  dwubiegowe: `<p>Silniki dwubiegowe to napędy z przełączalną prędkością obrotową — jeden silnik pracuje na dwóch obrotach. W sklepie Stojan znajdziesz silniki dwubiegowe trójfazowe sprawdzone po remoncie oraz nowe, w różnych mocach i kombinacjach prędkości. Wysyłka w 24 h.</p>

<h2>Jak działa silnik dwubiegowy?</h2>
<p>Zmianę prędkości uzyskuje się przez zmianę liczby par biegunów uzwojenia. Stosuje się dwa rozwiązania: <strong>uzwojenie Dahlandera</strong> (jedno uzwojenie przełączane w stosunku biegunów 2:1, np. 1450/2900 obr/min) lub <strong>dwa osobne uzwojenia</strong> (dowolny stosunek prędkości, np. 750/1000 obr/min). Przełączenie odbywa się stycznikami w szafie sterowniczej.</p>

<h2>Gdzie stosuje się silniki dwubiegowe?</h2>
<ul>
  <li><strong>Wentylatory</strong> — dwa wydatki powietrza (np. tryb cichy / wydajny) bez falownika.</li>
  <li><strong>Pompy</strong> — przełączanie wydajności w zależności od zapotrzebowania.</li>
  <li><strong>Obrabiarki i maszyny</strong> — bieg szybki do pracy i wolny do ustawiania.</li>
  <li><strong>Schody ruchome, mieszadła, podajniki</strong> — dwa reżimy pracy z jednego napędu.</li>
</ul>

<h2>Dwubiegowy silnik czy falownik?</h2>
<p>Silnik dwubiegowy daje <strong>dwie stałe, sztywne prędkości</strong> tanim kosztem i bez elektroniki — to rozwiązanie sprawdzone i odporne. Falownik daje płynną regulację w całym zakresie, ale jest droższy i wymaga konfiguracji. Jeśli aplikacja potrzebuje dokładnie dwóch prędkości — dwubiegowy jest prostszy i tańszy w eksploatacji.</p>

<p>Potrzebujesz płynnej regulacji zamiast dwóch biegów? Połącz <a href="/trojfazowe">silnik trójfazowy</a> z falownikiem z kategorii <a href="/akcesoria">akcesoria</a>. Szukasz napędu o niskich obrotach i wysokim momencie? Zobacz <a href="/motoreduktory">motoreduktory</a>. Doradzimy w doborze — <a href="tel:+48500385112">500 385 112</a>.</p>`,
};

async function main() {
  console.log('🔧 Updating category body content (description)...\n');
  const slugs = Object.keys(CONTENT);
  const found = await prisma.category.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true, description: true },
  });

  const foundSlugs = new Set(found.map((c) => c.slug));
  const missing = slugs.filter((s) => !foundSlugs.has(s));
  if (missing.length) console.warn('⚠️  Slugi nie znalezione w DB (pominięte):', missing);

  const wc = (html: string) => html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

  let updated = 0;
  for (const cat of found) {
    const html = CONTENT[cat.slug];
    const before = cat.description ? wc(cat.description) : 0;
    await prisma.category.update({ where: { id: cat.id }, data: { description: html } });
    console.log(`✓ ${cat.slug.padEnd(26)} description: ${before} → ${wc(html)} słów`);
    updated++;
  }

  console.log(`\n✅ Zaktualizowano ${updated} kategorii.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ Błąd:', e);
  process.exit(1);
});
