#!/usr/bin/env bash
# Wrapper for frpc — concurrently launches commands via cmd.exe on Windows,
# which doesn't understand /c/... paths. This script runs inside bash and
# resolves the binary + config natively.
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

FRPC_BIN=""
for candidate in \
  "/c/Users/Admin/frp/frp_0.61.1_windows_amd64/frpc.exe" \
  "$(command -v frpc 2>/dev/null || true)"; do
  if [[ -n "$candidate" && -x "$candidate" ]]; then
    FRPC_BIN="$candidate"
    break
  fi
done

if [[ -z "$FRPC_BIN" ]]; then
  echo "frpc binary not found — skipping tunnel"
  exit 0
fi

if [[ ! -f "$ROOT_DIR/frpc.toml" ]]; then
  echo "frpc.toml not found at $ROOT_DIR/frpc.toml — skipping tunnel"
  exit 0
fi

exec "$FRPC_BIN" -c "$ROOT_DIR/frpc.toml"
