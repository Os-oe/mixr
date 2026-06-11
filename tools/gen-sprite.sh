#!/bin/bash
# gen-sprite.sh <name> "<prompt>" [ref-image]
# Nano Banana 2 render -> assets-src/<name>.png (+budget-guard +register).
set -euo pipefail
NAME="$1"; PROMPT="$2"; REF="${3:-}"
MODEL="gemini-3.1-flash-image-preview"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUTDIR="$DIR/assets-src"; mkdir -p "$OUTDIR"
OUT="$OUTDIR/$NAME.png"
BG=/Users/Osman/Desktop/APPS/agent-studio/commandcenter/scripts/lib/budget-guard.js
REG=/Users/Osman/Desktop/APPS/agent-studio/commandcenter/scripts/register-generation.sh

node "$BG" check image 0.05 >/dev/null || { echo "BUDGET BLOCK"; exit 2; }

if [ -n "$REF" ]; then
  B64=$(base64 -i "$REF" | tr -d '\n')
  REQ=$(jq -n --arg p "$PROMPT" --arg d "$B64" '{contents:[{parts:[{text:$p},{inline_data:{mime_type:"image/png",data:$d}}]}]}')
else
  REQ=$(jq -n --arg p "$PROMPT" '{contents:[{parts:[{text:$p}]}]}')
fi

RESP=$(curl -sS -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GOOGLE_AI_STUDIO_KEY}" \
  -H "Content-Type: application/json" -d "$REQ")

IMG_B64=$(echo "$RESP" | jq -r '.candidates[0].content.parts[]? | (.inline_data // .inlineData) | select(.) | .data' | head -n1)
if [ -z "$IMG_B64" ] || [ "$IMG_B64" = "null" ]; then
  echo "ERROR no image for $NAME"; echo "$RESP" | jq -c '{error, finishReason: .candidates[0].finishReason, safety: .candidates[0].safetyRatings}' ; exit 1
fi
echo "$IMG_B64" | base64 -d > "$OUT"
"$REG" "$OUT" --prompt "MIXR sprite: $NAME — ${PROMPT:0:140}" --model "$MODEL (Nano Banana 2)" --cost-eur 0.05 --cost-category image >/dev/null 2>&1 || true
echo "SAVED $OUT ($(stat -f%z "$OUT") bytes)"
