# Migracja: stojan-shop (TypeORM) → stojan-shop-new (Prisma)

## Co robi migracja

- **Products**: importuje TYLKO produkty z `ownStore.active === true` (2215 z 145k)
  - Cena brana z `ownStore.price` (fallback na główną cenę)
  - Zachowuje CAŁY obiekt `marketplaces` (w tym powiązania Allegro!)
  - Zachowuje `matched_store_product` i `matched_olx_advert`
- **Categories**: pełny import, rekonstrukcja `parentId` z TypeORM `mpath`
- **Manufacturers**: pełny import, zachowuje UUIDs (FK do products)
- **ProductCategory**: junction table — tylko dla importowanych produktów
- **Orders**: pełny import
- **BlogPosts**: pełny import, konwersja `simple-array` → `String[]`
- **LegalPages**: pełny import + domyślne `isActive: true`
- **AllegroTokens / OlxTokens**: import jeśli istnieją

---

## Są 2 opcje — wybierz jedną:

### OPCJA A: Bezpośrednie połączenie (jeśli EC2 postgres jest dostępny z Twojego PC)

```bash
# 1. Upewnij się że lokalna baza ma schema Prisma
cd d:\stojan-shop-new\backend
npx prisma migrate deploy

# 2. Zainstaluj pg (jeśli nie ma)
npm install pg

# 3. Skopiuj skrypt
copy migrate-from-old.ts scripts\migrate-from-old.ts

# 4. Uruchom
npx tsx scripts/migrate-from-old.ts
```

> ⚠️ Wymaga otwartego portu 5432 na EC2 Security Group dla Twojego IP!

### OPCJA B: Export na EC2 → Import lokalnie (ZALECANE)

**Krok 1 — Na EC2:**

```bash
# Skopiuj skrypt na EC2
scp -i moja-aplikacja-key-pair.pem export-for-migration.ts ec2-user@16.171.6.205:~/

# Zaloguj się na EC2
ssh -i moja-aplikacja-key-pair.pem ec2-user@16.171.6.205

# Zainstaluj pg (jeśli nie ma globalnie)
cd ~/stojan-shop/backend
npm install pg

# Uruchom eksport
npx tsx ~/export-for-migration.ts

# Sprawdź pliki
ls -la ~/migration-export/
```

**Krok 2 — Ściągnij pliki na lokala:**

```bash
scp -i moja-aplikacja-key-pair.pem "ec2-user@16.171.6.205:~/migration-export/*.json" d:\stojan-shop-new\backend\scripts\migration-data\
```

**Krok 3 — Importuj lokalnie:**

```bash
cd d:\stojan-shop-new\backend

# Upewnij się że schema jest aktualny
npx prisma migrate deploy

# Skopiuj skrypt
copy import-from-json.ts scripts\import-from-json.ts

# Utwórz katalog na dane (jeśli nie istnieje)
mkdir scripts\migration-data

# Uruchom import
npx tsx scripts/import-from-json.ts
```

---

## Po migracji - weryfikacja

```bash
# Sprawdź ilości w bazie
npx prisma studio

# Lub z psql:
psql -U postgres -d stojan_shop -c "
  SELECT 'products' as tab, count(*) FROM products
  UNION ALL SELECT 'categories', count(*) FROM categories
  UNION ALL SELECT 'manufacturers', count(*) FROM manufacturers
  UNION ALL SELECT 'orders', count(*) FROM orders
  UNION ALL SELECT 'blog_posts', count(*) FROM blog_posts
  UNION ALL SELECT 'legal_pages', count(*) FROM legal_pages
  UNION ALL SELECT 'product_categories', count(*) FROM product_categories;
"
```

Oczekiwane wartości:

- products: ~2215
- categories: (ile było w starej bazie)
- manufacturers: (ile było w starej bazie)
- orders: (ile było w starej bazie)

1. Admin@DESKTOP-QSF9V7O MINGW64 /d/maturapolski (main)
   $ scp -i moja-aplikacja-key-pair.pem ec2-user@16.171.6.205:~/migration-export/\*.json /d/stojan-shop-new/backend/scripts/migration-data/

2. cd d:\stojan-shop-new\backend
   npx tsx scripts/import-from-json.ts
