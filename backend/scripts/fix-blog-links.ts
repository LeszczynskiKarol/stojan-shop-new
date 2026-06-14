/**
 * One-shot: napraw zepsute linki wewnętrzne w treści blogów (blogPost.content).
 *
 * Wykryte przez sitecrawl (audyt SEO 2026-06-15) — linki do nieistniejących URL-i:
 *   /jak-dziala-silnik-elektryczny-podstawowe-... (404, z 3 postów)
 *   /historia-silnikow-elektrycznych              (404)
 *   /silniki-jednofazowe                          (404 — kategoria to /jednofazowe)
 *   /marka-producent/nidec--leroy-somer           (podwójny myślnik)
 *
 * Slugi docelowe zweryfikowane na dev API (blog/categories/manufacturers).
 * Zamiana z granicami (lookbehind/lookahead), żeby nie trafić w dłuższe URL-e.
 *
 * Uruchomienie:
 *   cd backend && npx tsx scripts/fix-blog-links.ts
 */
import 'dotenv/config'; // załaduj DATABASE_URL z .env (skrypt nie importuje index.ts)
import { prisma } from '../src/lib/prisma.js';

const FIXES: { from: string; to: string }[] = [
  {
    from: '/jak-dziala-silnik-elektryczny-podstawowe-zasady-pracy-napedow-zasilanych-pradem',
    to: '/blog/jak-dziala-silnik-elektryczny',
  },
  { from: '/marka-producent/nidec--leroy-somer', to: '/marka-producent/nidec-leroy-somer' },
  { from: '/historia-silnikow-elektrycznych', to: '/blog/historia-silnika-elektrycznego-poczatki-powstanie-rozwoj' },
  { from: '/silniki-jednofazowe', to: '/jednofazowe' },
];

function esc(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
// Linki w treści to absolutne URL-e z trailing slash (https://...pl/<slug>/).
// Dopasuj ścieżkę + opcjonalny trailing slash, ograniczoną z prawej znakiem
// niebędącym częścią sluga (", ', ?, #, <, spacja, koniec) — bez lookbehind,
// bo z lewej stoi domena (.../pl/<slug>), nie cudzysłów.
function makeRe(from: string) {
  return new RegExp(esc(from) + '/?(?=["\'?#<\\s]|$)', 'g');
}

async function main() {
  const posts = await prisma.blogPost.findMany({ select: { id: true, slug: true, content: true } });
  console.log(`Blogów do sprawdzenia: ${posts.length}\n`);
  let changedPosts = 0;
  let totalReplacements = 0;

  for (const post of posts) {
    let content = post.content || '';
    let postChanges = 0;
    const hits: string[] = [];

    for (const fix of FIXES) {
      const re = makeRe(fix.from);
      const matches = content.match(re);
      if (matches && matches.length) {
        content = content.replace(re, fix.to);
        postChanges += matches.length;
        hits.push(`${matches.length}× ${fix.from} → ${fix.to}`);
      }
    }

    if (postChanges > 0) {
      await prisma.blogPost.update({ where: { id: post.id }, data: { content } });
      changedPosts++;
      totalReplacements += postChanges;
      console.log(`✓ /blog/${post.slug}`);
      hits.forEach((h) => console.log(`    ${h}`));
    }
  }

  console.log(`\n✅ Zmieniono ${changedPosts} postów, ${totalReplacements} linków.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('❌ Błąd:', e);
  process.exit(1);
});
