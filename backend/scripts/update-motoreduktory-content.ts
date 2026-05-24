/**
 * One-shot: zaktualizuj Category.description dla /motoreduktory do pełnego SEO guide.
 *
 * Powód:
 *   - Query "motoreduktor" w GSC: 5946 wyświetleń, CTR 0,86%, pos 7.3 (90 dni)
 *   - Strona /motoreduktory: 79 kliknięć / 11 005 wyświetleń / pos 16.4
 *   - Obecna treść: 505 słów, 3 nagłówki — za mało żeby konkurować z konkurencją
 *   - Cel: 1500+ słów strukturalnie SEO (H2/H3, listy, anchor text na sub-zastosowania)
 *     żeby przejść z pos 16 → 5 na "motoreduktor", co da ~10x kliknięć
 *
 * Uruchomienie:
 *   cd backend && npm run seo:motoreduktory
 */
import { prisma } from '../src/lib/prisma.js';

const MOTOREDUKTORY_DESCRIPTION = `<p>Szukasz motoreduktora do konkretnej maszyny? W sklepie Stojan znajdziesz przekładnie z silnikiem do wszystkich typowych zastosowań — od maszynek do mięsa, przez wciągarki, bramy garażowe, taśmy przenośnikowe, aż po duże maszyny przemysłowe. Łącznie ponad 300 sprawdzonych napędów, większość wysyłana w ciągu 24 godzin.</p>

<h2>Co to jest motoreduktor?</h2>
<p>Motoreduktor (potocznie: <em>reduktor z silnikiem</em> lub <em>przekładnia z silnikiem</em>) to zintegrowany napęd składający się z silnika elektrycznego i przekładni mechanicznej zamkniętych w jednej obudowie. Silnik dostarcza prędkość obrotową, przekładnia ją obniża i jednocześnie zwiększa moment obrotowy. Dzięki temu z silnika o prędkości 1400 obr/min dostajemy na wyjściu np. 28 obr/min przy 50× większym momencie — idealnym do napędu maszyn wymagających siły, a nie prędkości.</p>
<p>W praktyce motoreduktor zastępuje trzy osobne komponenty: silnik, sprzęgło i przekładnię. Mniej części, mniej drgań, krótszy łańcuch montażowy, większa niezawodność. Dlatego konstruktorzy maszyn wybierają motoreduktory wszędzie tam, gdzie potrzebny jest niskoobrotowy napęd o wysokim momencie — od urządzeń kuchennych po wielkie kruszarki.</p>

<h2>Typy motoreduktorów — który wybrać?</h2>

<h3>Motoreduktory walcowe (czołowe)</h3>
<p>Najpopularniejszy typ. Przekładnia walcowa składa się z dwóch lub trzech par kół zębatych ustawionych równolegle. Charakteryzują się <strong>wysoką sprawnością 95–98%</strong>, długą żywotnością i niskim kosztem. Wał wyjściowy jest współosiowy lub równoległy do wału silnika. Stosowane wszędzie tam, gdzie nie ma wymagań co do kierunku wału — przenośniki, maszyny pakujące, mieszadła, podajniki śrubowe.</p>

<h3>Motoreduktory ślimakowe</h3>
<p>Przekładnia ślimakowa zmienia kierunek napędu o 90° (wał wyjściowy prostopadły do silnika). Cechują się <strong>dużymi przełożeniami w jednym stopniu (nawet 100:1)</strong> i samohamownością — przy odpowiednim kącie zazębienia napęd nie cofnie się pod obciążeniem. Sprawność niższa (60–90%), więc grzeją się bardziej i wymagają oleju EP. Idealne do wciągarek, dźwigów, bram garażowych, maszynek do mięsa, mieszadeł zbiorników chemicznych.</p>

<h3>Motoreduktory stożkowe (kątowe)</h3>
<p>Połączenie zalet walcowych (wysoka sprawność) i ślimakowych (zmiana kierunku o 90°). Zębniki stożkowe przenoszą napęd między dwoma osiami pod kątem prostym. Sprawność <strong>92–96%</strong>, droższe od walcowych, ale wydajniejsze od ślimakowych. Stosowane w maszynach żywnościowych, przemyśle ciężkim, przekładniach pomp i sprężarek.</p>

<h3>Motoreduktory planetarne</h3>
<p>Wysokoobciążalny napęd o zwartej konstrukcji. Kilka satelitów krąży wokół centralnego koła słonecznego — siła rozkłada się równomiernie, momenty są bardzo wysokie przy minimalnych wymiarach. Sprawność do 98%, niski poziom hałasu. Stosowane w robotyce, automatyce precyzyjnej, suwnicach i napędach pojazdów elektrycznych.</p>

<h2>Zastosowania motoreduktorów</h2>

<h3>Gastronomia i przemysł spożywczy</h3>
<p>Najczęściej spotykany typ to <strong>motoreduktor do maszynki do mięsa</strong> — typowo 0,55–1,5 kW, 50–90 obr/min, jednofazowy 230V. Wałek wyjściowy z gwintem M22 lub M28, korpus aluminiowy. Pasuje do maszynek wielkości 8, 12, 22, 32, 42, 80. Dodatkowo w gastronomii motoreduktory napędzają mieszarki ciasta, miesiarki, wyciskarki do owoców, profesjonalne roboty kuchenne, automatyczne ekspresy i taśmy podajnikowe w piekarniach.</p>

<h3>Bramy, dźwigi, wciągarki</h3>
<p>Motoreduktory ślimakowe od 0,37 do 2,2 kW z hamulcem elektromagnetycznym. Samohamowność przekładni ślimakowej zatrzymuje obciążenie nawet przy zaniku zasilania — krytyczne dla bezpieczeństwa wciągarek i dźwigów. Bramy garażowe i ogrodzeniowe używają zwykle motoreduktora 0,37–0,55 kW; wciągarki budowlane i warsztatowe 0,75–1,5 kW; dźwigi towarowe i windy 1,5–4 kW.</p>

<h3>Transport wewnątrzzakładowy</h3>
<p>Taśmy przenośnikowe, podajniki łańcuchowe, obrotnice palet, wózki samojezdne (AGV) — to królestwo motoreduktorów walcowych i kątowych. Moc dobieramy do obciążenia taśmy: 0,55–1,5 kW dla lekkich (do 100 kg/m), 2,2–7,5 kW dla cięższych zastosowań. Najczęściej trójfazowe 400V z osłonami IP55–IP65.</p>

<h3>Rolnictwo i przetwórstwo</h3>
<p>Mieszadła do zbiorników, dozowniki paszy, przesiewacze ziarna, podajniki ślimakowe, wymiatacze gnojowicy. Najczęściej trójfazowe motoreduktory 0,75–3 kW z osłonami IP55 chroniącymi przed wodą i pyłem. Dla zbiorników żywności wymagane wykonanie ze stali nierdzewnej lub w klasie higienicznej.</p>

<h3>Maszyny przemysłowe i CNC</h3>
<p>Mieszadła chemiczne, młyny kulowe, kruszarki, wirówki, prasy, maszyny obróbcze. Wszędzie, gdzie potrzebny jest niskoobrotowy napęd o stabilnym momencie. Motoreduktory planetarne w robotyce, automatyce CNC, manipulatorach przemysłowych — wszędzie, gdzie liczy się precyzja i krótki czas reakcji.</p>

<h2>Jak dobrać motoreduktor? — 5 parametrów</h2>
<p>Wybór motoreduktora to ciąg pięciu decyzji. Większość problemów z napędem bierze się z błędnego doboru — warto poświęcić chwilę, żeby określić wszystkie parametry przed zakupem.</p>
<ol>
  <li><strong>Moc (kW)</strong> — wynika z obciążenia. Jeśli nie znasz dokładnie, sprawdź silnik, który chcesz zastąpić (tabliczka znamionowa), albo skontaktuj się z nami z opisem maszyny i obciążenia. Częsty błąd: dobór mocy "na wyrost" — większa moc oznacza większy moment startowy, który może uszkodzić przekładnię docelowej maszyny.</li>
  <li><strong>Obroty wyjściowe (obr/min)</strong> — to prędkość wału po przekładni. Maszynki do mięsa: 50–90 obr/min. Mieszadła zbiornikowe: 30–200 obr/min. Bramy: 10–30 obr/min. Wciągarki: 50–200 obr/min. Przenośniki: 10–60 obr/min. Im niższe obroty, tym wyższe przełożenie i większy moment.</li>
  <li><strong>Moment obrotowy (Nm)</strong> — pochodna mocy i obrotów: M = 9550 × P / n, gdzie P w kW, n w obr/min. Przykład: 1,5 kW przy 90 obr/min daje 159 Nm. Im mniejsze obroty na wyjściu, tym większy moment z tej samej mocy.</li>
  <li><strong>Zasilanie</strong> — 230V jednofazowe (mniejsze moce do ~2,2 kW, domowe instalacje, gastronomia) lub 400V trójfazowe (większe moce, przemysł, lepsza sprawność). Dla zasilania trójfazowego wymagana instalacja siłowa.</li>
  <li><strong>Mocowanie</strong> — łapy (oznaczenie B3), kołnierz okrągły (B5), kołnierz mały (B14), wał pełny lub drążony. Musi pasować do istniejącej maszyny — sprawdź rozstaw otworów mocujących, średnicę i długość wału wyjściowego, ewentualny gwint.</li>
</ol>
<p>Dodatkowe parametry, które warto rozważyć: stopień ochrony IP (IP55 dla większości zastosowań, IP65 dla mycia ciśnieniowego), klasa izolacji (F lub H), kierunek obrotów (lewo/prawo/dwukierunkowy), obecność hamulca elektromagnetycznego, możliwość sterowania falownikiem.</p>

<h2>Producenci motoreduktorów w naszej ofercie</h2>
<p>Sprzedajemy motoreduktory uznanych europejskich i światowych producentów:</p>
<ul>
  <li><strong>NORD Drivesystems</strong> — niemiecki standard jakości, szeroka gama walcowych, ślimakowych i kątowych. Dostępność części zamiennych, modułowa konstrukcja.</li>
  <li><strong>SEW-Eurodrive</strong> — światowy lider w napędach przemysłowych. Modułowa konstrukcja, łatwa wymiana części, znakomita dostępność wsparcia technicznego w Polsce.</li>
  <li><strong>Bauer Gear Motor</strong> — kompaktowe motoreduktory walcowe i stożkowe do automatyki i pakownictwa.</li>
  <li><strong>Lenze</strong> — wysokoobciążalne napędy do przemysłu, integracja z falownikami i napędami serwo Lenze.</li>
  <li><strong>Indur, Cantoni Group, Mendel Polmot, Tamel</strong> — polscy producenci motoreduktorów spotykanych w starszych instalacjach przemysłowych.</li>
  <li><strong>Stojan</strong> — własne motoreduktory do maszynek do mięsa, w tym warianty 0,55 kW i 0,75 kW z gwintami M22/M28 — sprawdzone w setkach gastronomii.</li>
</ul>

<h2>Stan produktów — używane po remoncie, nowe, OEM</h2>
<p>W naszej ofercie znajdziesz motoreduktory w trzech stanach, dostosowanych do różnych budżetów:</p>
<ul>
  <li><strong>Używane po remoncie</strong> — kompleksowo sprawdzone i przetestowane przez naszych mechaników, gotowe do pracy. Wymiana łożysk, uszczelnień, czyszczenie wnętrza, kontrola koła zębatego, próba ruchowa pod obciążeniem. Gwarancja rozruchowa 30 dni. Cena atrakcyjna — często 40–60% wartości nowego.</li>
  <li><strong>Nowe</strong> — fabrycznie nowe, oryginalne opakowanie, pełna gwarancja producenta 24 miesiące. Najszybszy montaż, brak ryzyka — najlepszy wybór dla maszyn o krytycznym znaczeniu produkcyjnym.</li>
  <li><strong>Nieużywane (magazynowe)</strong> — fabrycznie nowe, ale przechowywane długo w magazynie. Mogą mieć minimalne ślady składowania (kurz, drobne otarcia lakieru), zachowują pełną sprawność techniczną. Gwarancja 12 miesięcy. Ceny pośrednie między nowymi a używanymi po remoncie.</li>
</ul>

<h2>Najczęstsze pytania o motoreduktory</h2>

<h3>Jaka jest różnica między motoreduktorem a przekładnią?</h3>
<p>Przekładnia to sama mechaniczna część zmieniająca obroty/moment — wymaga osobnego silnika. Motoreduktor to przekładnia zintegrowana z silnikiem w jednej obudowie. Motoreduktor jest gotowym napędem typu plug-and-play, przekładnia wymaga dobrania i sprzęgnięcia z silnikiem.</p>

<h3>Czy można podłączyć motoreduktor do falownika?</h3>
<p>Tak — większość trójfazowych motoreduktorów (silnik indukcyjny) pracuje poprawnie z falownikiem. Pozwala to płynnie regulować prędkość obrotową w zakresie typowo 5–50 Hz. Dla pracy ciągłej poniżej 25 Hz zaleca się motoreduktor z obcym chłodzeniem (wentylator zewnętrzny) lub odpowiednie obniżenie obciążenia.</p>

<h3>Jak rozpoznać uszkodzony motoreduktor?</h3>
<p>Objawy zużycia: nadmierny hałas (jęczenie kół zębatych, szum łożysk), wyciek oleju z uszczelnień, drgania wału wyjściowego, przegrzewanie się obudowy (powyżej 80°C), spadek momentu pod obciążeniem, niemożność osiągnięcia nominalnych obrotów. W większości przypadków możliwy jest remont — wymiana łożysk i uszczelnień przedłuża żywotność o kolejne 5–10 lat.</p>

<h3>Jaki olej do motoreduktora?</h3>
<p>Producent określa typ i lepkość w dokumentacji. Najczęściej: motoreduktory walcowe — olej przekładniowy CLP 220 (np. Mobilgear 600 XP 220, Shell Omala S2 G 220); motoreduktory ślimakowe — olej syntetyczny CLP PG 220 (Mobil Glygoyle 220, Klüber Syntheso D 220 EP). Wymiana co 10 000 godzin pracy lub 2 lata, w cięższych warunkach częściej.</p>

<h2>Pomożemy dobrać motoreduktor</h2>
<p>Nie wiesz, który motoreduktor pasuje do Twojej maszyny? Zadzwoń pod <a href="tel:+48500385112">500 385 112</a> lub napisz na <a href="mailto:stojan@silniki-elektryczne.com.pl">stojan@silniki-elektryczne.com.pl</a> z opisem zastosowania (rodzaj maszyny, wymagana moc i obroty wyjściowe, sposób mocowania, ewentualne wymiary istniejącego napędu). Pomożemy w doborze i sprawdzimy dostępność. Wysyłka 24 h kurierem z całej Polski, możliwość odbioru osobistego w Pigży (k. Torunia).</p>`;

async function main() {
  console.log('🔧 Updating motoreduktory category content...');

  const before = await prisma.category.findFirst({
    where: { slug: 'motoreduktory' },
    select: { id: true, description: true },
  });
  if (!before) {
    console.error('❌ Nie znaleziono kategorii motoreduktory');
    process.exit(1);
  }

  const beforeWords = before.description
    ? before.description.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length
    : 0;
  const afterWords = MOTOREDUKTORY_DESCRIPTION.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

  await prisma.category.update({
    where: { id: before.id },
    data: { description: MOTOREDUKTORY_DESCRIPTION },
  });

  console.log(`✓ /motoreduktory description: ${beforeWords} → ${afterWords} słów`);
  console.log(`✓ HTML chars: ${(before.description || '').length} → ${MOTOREDUKTORY_DESCRIPTION.length}`);
  console.log('\n✅ Done.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ Błąd:', e);
  process.exit(1);
});
