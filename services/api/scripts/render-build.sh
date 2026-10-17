#!/usr/bin/env bash
# Render build command for services/api (Root Directory = services/api):
#   bash scripts/render-build.sh
set -euo pipefail

cd "$(dirname "$0")/.."

npm ci

mkdir -p data
CSV_PATH="data/ecdict.csv"

if [[ ! -f "$CSV_PATH" ]]; then
  echo "Downloading ECDICT CSV…"
  # Official ECDICT CSV (~66MB). Override with ECDICT_CSV_URL if needed.
  CSV_URL="${ECDICT_CSV_URL:-https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv}"
  curl -L --fail --retry 3 -o "$CSV_PATH" "$CSV_URL"
fi

ECDICT_TRIM="${ECDICT_TRIM:-1}" npm run build:db

# Keep the slug smaller after import.
rm -f "$CSV_PATH"

echo "Render build complete. ECDICT sqlite ready."
