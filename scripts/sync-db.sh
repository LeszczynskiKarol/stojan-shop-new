#!/usr/bin/env bash
# ============================================================================
# sync-db.sh — Sync production stojan-shop DB to local PostgreSQL
# Run: npm run sync:db   (or:  bash scripts/sync-db.sh --no-prompt)
# ============================================================================
set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

# ── Load config ──────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ ! -f "$SCRIPT_DIR/.sync-env" ]]; then
  echo -e "${RED}ERROR: scripts/.sync-env not found!${NC}"
  echo -e "Copy ${CYAN}scripts/.sync-env.example${NC} to ${CYAN}scripts/.sync-env${NC} and fill in your values."
  exit 1
fi
source "$SCRIPT_DIR/.sync-env"

# Validate required vars
for var in REMOTE_HOST SSH_KEY_PATH SG_ID LOCAL_DB_NAME; do
  if [[ -z "${!var:-}" ]]; then
    echo -e "${RED}ERROR: $var is not set in scripts/.sync-env${NC}"
    exit 1
  fi
done

REMOTE_USER="${REMOTE_USER:-ec2-user}"
REMOTE_ENV_PATH="${REMOTE_ENV_PATH:-/home/ec2-user/stojan-shop-new/backend/.env}"

# ── Prompt (skip with --no-prompt) ───────────────────────────────────────────
if [[ "${1:-}" != "--no-prompt" ]]; then
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║   stojan-shop — DB Sync (prod → local)       ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
  echo ""
  echo -e "${YELLOW}This will DROP your local '${LOCAL_DB_NAME}' database and replace it with production data.${NC}"
  read -p "Continue? (y/n) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Skipped.${NC}"
    exit 0
  fi
fi

# ── Resolve SSH key path (Git Bash converts /c/Users/... automatically) ──────
if [[ ! -f "$SSH_KEY_PATH" ]]; then
  echo -e "${RED}ERROR: SSH key not found at: $SSH_KEY_PATH${NC}"
  exit 1
fi

# ── Step 1: Get public IP ────────────────────────────────────────────────────
echo -e "${CYAN}[1/6] Getting public IP...${NC}"
MY_IP=$(curl -s --retry 3 --retry-delay 2 https://api.ipify.org)
if [[ ! "$MY_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo -e "${RED}ERROR: Could not determine public IP${NC}"
  exit 1
fi
echo -e "      IP: ${GREEN}$MY_IP${NC}"

# ── Step 2: Open security group ──────────────────────────────────────────────
echo -e "${CYAN}[2/6] Opening SSH in security group...${NC}"
SG_OPENED=false

aws ec2 authorize-security-group-ingress \
  --group-id "$SG_ID" \
  --protocol tcp --port 22 \
  --cidr "${MY_IP}/32" \
  --region "${AWS_REGION:-eu-central-1}" 2>/dev/null && SG_OPENED=true

if [[ "$SG_OPENED" == "true" ]]; then
  echo -e "      ${GREEN}Opened port 22 for $MY_IP${NC}"
else
  echo -e "      ${YELLOW}Rule already exists (or error) — continuing${NC}"
fi

# ── Cleanup trap — always close SG ───────────────────────────────────────────
cleanup() {
  if [[ "$SG_OPENED" == "true" ]]; then
    echo ""
    echo -e "${CYAN}[cleanup] Closing SSH in security group...${NC}"
    aws ec2 revoke-security-group-ingress \
      --group-id "$SG_ID" \
      --protocol tcp --port 22 \
      --cidr "${MY_IP}/32" \
      --region "${AWS_REGION:-eu-central-1}" 2>/dev/null && \
      echo -e "      ${GREEN}Closed.${NC}" || \
      echo -e "      ${YELLOW}Could not revoke (may need manual cleanup).${NC}"
  fi
}
trap cleanup EXIT

# ── Step 3: Get remote DATABASE_URL via SSH ──────────────────────────────────
echo -e "${CYAN}[3/6] Reading remote DATABASE_URL...${NC}"
REMOTE_DB_URL=$(ssh -i "$SSH_KEY_PATH" \
  -o StrictHostKeyChecking=no \
  -o ConnectTimeout=10 \
  "${REMOTE_USER}@${REMOTE_HOST}" \
  "grep '^DATABASE_URL=' ${REMOTE_ENV_PATH} | sed 's/^DATABASE_URL=//' | tr -d '\"'")

if [[ -z "$REMOTE_DB_URL" ]]; then
  echo -e "${RED}ERROR: Could not read remote DATABASE_URL${NC}"
  exit 1
fi
echo -e "      ${GREEN}Got remote DB URL${NC}"

# ── Step 4: Drop & recreate local DB ────────────────────────────────────────
echo -e "${CYAN}[4/6] Preparing local database...${NC}"

# Build local connection args
LOCAL_PSQL_ARGS=""
[[ -n "${LOCAL_DB_HOST:-localhost}" ]] && LOCAL_PSQL_ARGS="$LOCAL_PSQL_ARGS -h ${LOCAL_DB_HOST:-localhost}"
[[ -n "${LOCAL_DB_PORT:-5432}" ]]     && LOCAL_PSQL_ARGS="$LOCAL_PSQL_ARGS -p ${LOCAL_DB_PORT:-5432}"
[[ -n "${LOCAL_DB_USER:-}" ]]         && LOCAL_PSQL_ARGS="$LOCAL_PSQL_ARGS -U ${LOCAL_DB_USER}"

# Export password for psql if set
if [[ -n "${LOCAL_DB_PASSWORD:-}" ]]; then
  export PGPASSWORD="$LOCAL_DB_PASSWORD"
fi

# Terminate existing connections
psql $LOCAL_PSQL_ARGS -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${LOCAL_DB_NAME}' AND pid <> pg_backend_pid();" \
  --quiet 2>/dev/null || true

# Drop and recreate
dropdb $LOCAL_PSQL_ARGS --if-exists "$LOCAL_DB_NAME" 2>/dev/null || true
createdb $LOCAL_PSQL_ARGS "$LOCAL_DB_NAME"
echo -e "      ${GREEN}Local DB recreated${NC}"

# ── Step 5: Dump remote → restore local ─────────────────────────────────────
echo -e "${CYAN}[5/6] Downloading database dump...${NC}"

DUMP_FILE="/tmp/stojan_sync_$$.sql"
START_TIME=$(date +%s)

ssh -i "$SSH_KEY_PATH" \
  -o StrictHostKeyChecking=no \
  -o ConnectTimeout=10 \
  "${REMOTE_USER}@${REMOTE_HOST}" \
  "pg_dump '${REMOTE_DB_URL}' --no-owner --no-acl --clean --if-exists" \
  > "$DUMP_FILE"

DUMP_SIZE=$(du -h "$DUMP_FILE" 2>/dev/null | cut -f1)
echo -e "      ${GREEN}Downloaded: ${DUMP_SIZE}${NC}"

# ── Step 6: Restore locally ──────────────────────────────────────────────────
echo -e "${CYAN}[6/6] Restoring to local database...${NC}"

psql $LOCAL_PSQL_ARGS -d "$LOCAL_DB_NAME" -f "$DUMP_FILE" --quiet 2>/dev/null

rm -f "$DUMP_FILE"

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✓ Database synced in ${ELAPSED}s                    ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── Post-sync stats ──────────────────────────────────────────────────────────
echo -e "${CYAN}📊 Database summary:${NC}"
echo ""

# DB size
DB_SIZE=$(psql $LOCAL_PSQL_ARGS -d "$LOCAL_DB_NAME" -t -A -c \
  "SELECT pg_size_pretty(pg_database_size('${LOCAL_DB_NAME}'));" 2>/dev/null)
echo -e "   Total size: ${GREEN}${DB_SIZE}${NC}"
echo ""

# Table row counts (Prisma tables only, skip _prisma_migrations)
psql $LOCAL_PSQL_ARGS -d "$LOCAL_DB_NAME" -c "
  SELECT
    c.relname AS \"Table\",
    to_char(c.reltuples::bigint, 'FM999 999') AS \"Rows\"
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname NOT LIKE '_prisma%'
  ORDER BY c.reltuples DESC;
" 2>/dev/null

echo ""

# ── Regenerate Prisma client against local DB ────────────────────────────────
echo -e "${CYAN}Regenerating Prisma client...${NC}"
cd "$ROOT_DIR/backend"
npx prisma generate --quiet 2>/dev/null || true
echo -e "${GREEN}Done!${NC}"
