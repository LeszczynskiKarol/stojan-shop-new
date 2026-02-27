1. Na instancji /backend: node export-for-migration.js

1. Admin@DESKTOP-QSF9V7O MINGW64 /d/maturapolski (main)
   $ scp -i moja-aplikacja-key-pair.pem ec2-user@16.171.6.205:~/migration-export/\*.json /d/stojan-shop-new/backend/scripts/migration-data/

1. cd d:\stojan-shop-new\backend
   npx tsx scripts/import-from-json.ts
