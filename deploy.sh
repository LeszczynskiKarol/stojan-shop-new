#!/bin/bash

echo "========================================="
echo "Stojan Shop - Deploy Script"
echo "========================================="

cd ~/stojan-shop-new
git pull

# Backend
echo "[1/3] Updating Backend..."
cd ~/stojan-shop-new/backend
npm install
npm run build
pm2 restart stojan-backend
echo "✓ Backend updated"

# Frontend
echo ""
echo "[2/3] Updating Frontend..."
cd ~/stojan-shop-new/frontend
npm install
npm run build
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