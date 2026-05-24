#!/usr/bin/env bash
# ============================================================================
# dev-start.sh — Ask about DB sync, then start backend + frontend
# ============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Only ask if .sync-env is configured
if [[ -f "$SCRIPT_DIR/.sync-env" ]]; then
  echo ""
  read -p "Sync production DB before starting? (y/n) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    bash "$SCRIPT_DIR/sync-db.sh" --no-prompt
  fi
fi

echo ""
echo "Starting dev servers..."
npx concurrently -n BE,FE -c blue,magenta --kill-others-on-fail \
  "npm run dev:backend" \
  "npm run dev:frontend"
