#!/usr/bin/env bash
# Deploy the transit proxy to Cloudflare and give it the key. No browser, no interactive login:
# this machine is a remote desktop, so an OAuth tab is not something anyone can click.
#
#   tools/deploy_worker.sh            # deploy, then set/refresh the TFNSW_KEY secret
#
# Credentials come from ~/projects/cloudflare.env (or the environment):
#   CLOUDFLARE_API_TOKEN=…            # API token from dash.cloudflare.com/profile/api-tokens,
#                                     # template "Edit Cloudflare Workers"
#   CLOUDFLARE_ACCOUNT_ID=…           # optional; read from the API below when missing
# The TfNSW key comes from ~/projects/tfnsw.env and is piped into `wrangler secret put`, so it reaches
# neither the repo nor shell history.
set -euo pipefail

cd "$(dirname "$0")/../proxy"
WRANGLER=(npx --yes wrangler@4)
CREDS="$HOME/projects/cloudflare.env"

read_env() { # read_env FILE KEY — first value, quotes and CR stripped, nothing echoed
  [ -f "$1" ] || return 1
  sed -n "s/^[[:space:]]*$2[[:space:]]*=[[:space:]]*//p" "$1" | head -1 | tr -d '"' | tr -d "'" | tr -d '\r'
}

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  CLOUDFLARE_API_TOKEN=$(read_env "$CREDS" CLOUDFLARE_API_TOKEN || true)
  [ -n "$CLOUDFLARE_API_TOKEN" ] || { echo "no CLOUDFLARE_API_TOKEN in $CREDS or the environment" >&2; exit 1; }
  export CLOUDFLARE_API_TOKEN
fi

if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  CLOUDFLARE_ACCOUNT_ID=$(read_env "$CREDS" CLOUDFLARE_ACCOUNT_ID || true)
  export CLOUDFLARE_ACCOUNT_ID
fi

if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  # One account behind the token is the normal case; ask the API rather than make Trix hunt for the id.
  CLOUDFLARE_ACCOUNT_ID=$(curl -sS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    https://api.cloudflare.com/client/v4/accounts \
    | sed -n 's/.*"id":"\([a-f0-9]\{32\}\)".*/\1/p' | head -1)
  [ -n "$CLOUDFLARE_ACCOUNT_ID" ] || { echo "could not read an account id from the token" >&2; exit 1; }
  export CLOUDFLARE_ACCOUNT_ID
  echo "account: $CLOUDFLARE_ACCOUNT_ID"
fi

echo "== deploy =="
"${WRANGLER[@]}" deploy 2>&1 | tee /tmp/wrangler-deploy.log | tail -12

echo "== secret =="
KEY=$(read_env "$HOME/projects/tfnsw.env" TFNSW_KEY || true)
[ -n "$KEY" ] || { echo "TFNSW_KEY not found in ~/projects/tfnsw.env" >&2; exit 1; }
printf '%s' "$KEY" | "${WRANGLER[@]}" secret put TFNSW_KEY 2>&1 | tail -3

URL=$(grep -oE 'https://[a-z0-9.-]+\.workers\.dev' /tmp/wrangler-deploy.log | head -1)
echo
echo "worker: ${URL:-see /tmp/wrangler-deploy.log}"
[ -n "$URL" ] && echo "next: set proxyBase in config.js to $URL, then python3 tools/deploy_test.py"
