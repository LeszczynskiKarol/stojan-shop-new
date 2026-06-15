#!/bin/bash
# Przerwij na pierwszym błędzie — żeby pm2 restart nie poszedł po nieudanym buildzie
# (wcześniej build frontu cicho padał: 'astro: command not found', a frontend i tak
#  restartował się na starym dist).
set -e

echo "========================================="
echo "Stojan Shop - Deploy Script"
echo "========================================="

cd ~/stojan-shop-new
git pull

# Instalacja zależności z poziomu ROOT (npm workspaces) — binarki (astro, tsc)
# są hoistowane do ./node_modules/.bin, więc build MUSI iść przez workspace z roota.
npm install

# Backend
echo "[1/3] Updating Backend..."
npm run build:backend
pm2 restart stojan-backend
echo "✓ Backend updated"

# Frontend
echo ""
echo "[2/3] Updating Frontend..."
npm run build:frontend
pm2 restart stojan-frontend
echo "✓ Frontend updated"

# Nginx
echo ""
echo "[3/3] Reloading nginx..."
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "========================================="
echo "Deploy complete!"
echo "========================================="
pm2 list