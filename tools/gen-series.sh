#!/bin/bash
# Batch sprite series, anchored to assets-src/anchor-erdbeere.png
set -uo pipefail
cd "$(dirname "$0")/.."
REF="assets-src/anchor-erdbeere.png"
TPL_PRE="Using the attached sprite as the exact style reference — same semi-flat sticker illustration style, same tonal outline treatment (no black outlines), same two-step cel shading and glossy top-left highlights — create a NEW sprite: "
TPL_POST=". The entire background must be one solid flat pure magenta color (#FF00FF), edge to edge, no pattern. Subject centered, fills 75 percent of the frame. No text, no face, no character."

gen() { # name desc
  local n="$1" d="$2"
  if [ -f "assets-src/$n.png" ] && [ "${FORCE:-}" != "1" ]; then echo "SKIP $n (exists)"; return; fi
  ./tools/gen-sprite.sh "$n" "${TPL_PRE}${d}${TPL_POST}" "$REF" || echo "FAIL $n"
  sleep 2
}

gen tapioka "a loose cluster of seven glossy dark brown-black tapioca boba pearls, round and shiny"
gen popping-boba "a loose cluster of six translucent glossy orange mango popping-boba pearls"
gen kokos-jelly "three translucent milky-white coconut jelly cubes with soft rounded edges"
gen eiswuerfel "two glossy translucent ice cubes with a pale icy-blue tint"
gen mango "three juicy ripe mango cubes, vivid yellow-orange"
gen banane "two fresh banana slices showing the pale center with seeds"
gen blaubeeren "a small cluster of four round blueberries with a frosty bloom"
gen kiwi "one round kiwi slice showing bright green flesh, pale center and tiny black seeds"
gen minze "a fresh mint sprig with two bright green leaves"
gen sahne "a soft-serve style swirl of whipped cream, creamy white with warm shadows"
gen karamell-drizzle "a flowing ribbon of glossy golden-brown caramel sauce with drips"
gen cup-bubble "a tall empty clear bubble-tea takeaway cup, slightly tapered, with a thick lilac straw sticking out at a slight angle; the cup walls are transparent so the magenta background shows through the empty glass, draw only soft white gloss highlights and faint wall edges on the glass"
