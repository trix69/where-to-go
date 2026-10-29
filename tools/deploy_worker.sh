#!/usr/bin/env bash
# Deploy the transit proxy to Cloudflare and give it the key.
#
#   tools/deploy_worker.sh            # deploy, then set/refresh the TFNSW_KEY secret
#
# Needs `npx --yes wrangler@4 login` once (it opens a browser tab for Cloudflare's OAuth flow). The
# key is read from ~/projects/tfnsw.env and piped straight into `wrangler secret put`, so it never
# lands in this repo or in a command line that ends up in shell history.
set -euo pipefail

cd "$(dirname "$0")/../proxy"
WRANGLER=(npx --yes wrangler@4)

echo "== who am I =="
"${WRANGLER[@]}" whoami 2>&1 | sed -n '1,6p'

echo "== deploy =="
"${WRANGLER[@]}" deploy 2>&1 | tee /tmp/wrangler-deploy.log | tail -12

echo "== secret =="
KEY_FILE="$HOME/projects/tfnsw.env"
[ -f "$KEY_FILE" ] || { echo "missing $KEY_FILE" >&2; exit 1; }
# Strip the key out of the env file without putting it on a command line, and without awk's
# single-quote gymnastics: sed for the value, tr for any surrounding quotes and a stray CR.
KEY=$(sed -n 's/^[[:space:]]*TFNSW_KEY[[:space:]]*=[[:space:]]*//p' "$KEY_FILE" | head -1 | tr -d '"' | tr -d "'" | tr -d '\r')
[ -n "$KEY" ] || { echo "TFNSW_KEY not found in $KEY_FILE" >&2; exit 1; }
printf '%s' "$KEY" | "${WRANGLER[@]}" secret put TFNSW_KEY 2>&1 | tail -3

URL=$(grep -oE 'https://[a-z0-9.-]+\.workers\.dev' /tmp/wrangler-deploy.log | head -1)
echo
echo "worker: ${URL:-see /tmp/wrangler-deploy.log}"
[ -n "$URL" ] && echo "next: set proxyBase in config.js to $URL, then python3 tools/deploy_test.py"
