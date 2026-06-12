# Lessons — MIXR Build (2026-06-11)

Erkenntnisse aus dem autonomen One-Prompt-Lauf 6 (interaktives Bestell-Erlebnis,
PixiJS v8 + GSAP + Vercel), wiederverwendbar für künftige App-Builds.

## Nano Banana 2 / Sprite-Pipeline
- **„Transparent background" im Prompt → Modell MALT ein Schachbrettmuster** statt
  echter Alpha. Verlässlich ist nur die Magenta-Key-Pipeline (solid `#FF00FF`
  fordern → Pillow-Key `r>185 && b>175 && g<120` + 1px-Alpha-Erosion gegen Fringe).
  Magenta vom Modell schwankt bis g≈55 — Toleranz großzügig, nicht corner-sample-gleich.
- **Style-Anchor-i2i hält die Serie stabil** (12 Zutaten, ein Look) — bestätigt
  wie bei NEON DASH. Anchor mit dem visuell komplexesten Motiv wählen (Erdbeere).
- **Cluster-Sprites** (7 Perlen in einem Bild) sind besser als Einzel-Perlen:
  weniger Renders, aber Drop-Count im Code auf 1–2 senken sonst Perlen-Flut.
- **Durchsichtige Gefäße kann das Modell nicht als Layer liefern** (Innenraum
  kommt deckend) → Becher prozedural zeichnen (Pixi Graphics), Zutaten als
  Sprites. Deckungsgleiche Registrierung ist dann per Konstruktion garantiert.

## PixiJS v8
- **Maske nie selbst transformieren, wenn sie Kind des transformierten Containers
  ist** — doppelte Transform, Clipping-Bereich schrumpft unsichtbar. Maske als
  Kind rein, fertig.
- Graphics-Liquid mit Wellen-Oberkante: nur bei Aktivität neu zeichnen
  (`activeUntil`-Fenster pro Primitive). Idle-Redraw kostet sonst dauerhaft
  ~30 % Frame-Budget.
- `renderer.extract.base64({ target })` für Share-Card-Snapshots — **vor** dem
  Konfetti aufrufen, sonst sind Schnipsel im Hero-Shot.

## Playwright
- **Headless-FPS-Messungen ohne GPU sind Rauschen** (SwiftShader: 32–53 fps
  Streuung). `--use-angle=metal --enable-gpu` + Median-Frametime mit Warmup
  → 3 Läufe stabil 60,0 fps.
- **Polling-UIs, die das DOM neu bauen, fressen Test-Klicks.** Fix im Produkt
  (Re-Render nur bei Datenänderung), nicht im Test — danach war auch die UX besser.
- Tests gegen geteilten Server-State: Karten **per Order-ID** adressieren,
  nie `.first()` (Alt-Bestellungen früherer Tests).
- **Live-E2E findet Races, die lokal unsichtbar sind:** Start-Button war vor
  `boot()`-Ende ein No-op (Menü+Sprites übers Netz). UI sofort binden, Handler
  awaitet ein `ready`-Promise.

## Video im Attract (Photoreal-Integration 11./12.06.)
- **`removeAttribute('src')` stoppt ein ladendes `<video>` NICHT** — laut
  HTML-Spec verwirft nur `load()` die laufende Media-Resource. Ohne `load()`
  feuert `canplay` trotzdem, `play()` startet die alte Resource neu und ein
  per `display:none` unsichtbares Video dekodiert die ganze Session weiter
  (GPU-/Akku-Drain parallel zum Pixi-Konfigurator). Stop-Pfad immer:
  `pause()` → `removeAttribute('src')` → `load()`.
- **Generation-Token an JEDER await-Grenze prüfen** — vor `play()` UND danach.
  Nach einem reinen Stop gibt es keinen „neueren Versuch", der aufräumt; im
  Stale-Branch selbst pausieren (außer `.playing` gesetzt = neuerer Besitzer).
- Geteiltes `<video>`-Element + lazy load + canplay-Timeout-Fallback auf
  Sprites ist ein gutes Muster — aber der Test „Start-Tap bleibt möglich"
  muss das **Lade-Fenster** treffen (tippen BEVOR `.playing` da ist), sonst
  testet er die Race nie.

## Service Worker + `<video>`
- **Range-Requests immer am SW vorbeilassen**
  (`if (e.request.headers.has('range')) return;`). Browser holen Video mit
  Range (Chrome `bytes=0-`, iOS `bytes=0-1`) → Server antwortet 206 →
  `cache.put(206)` wirft TypeError, die MP4s landen nie im Cache. Schlimmer:
  eine je gecachte volle 200 auf einen Range-Request quittiert iOS Safari mit
  Media-Error → Video dauerhaft tot. Zusätzlich `res.status === 200` vor
  jedem `cache.put` guarden.
- SW registriert nur außerhalb localhost → die lokale Suite testet SW+Video
  nie zusammen. Live-E2E gegen die deployte Domain ist Pflicht.

## Playwright webServer
- **`npm run build && node server.js` leakt das node-Kind beim Teardown** —
  Playwright killt nur den Shell-Wrapper, der Folgelauf bricht mit „port
  already used" (`reuseExistingServer: false`). Fix: `… && exec node server.js`
  — `exec` macht node zur Haupt-PID. Damit läuft auch `test:2x` durch.

## Architektur / Deploy
- Vercel-Catch-all-Function mit In-Memory-Store reicht für eine Demo mit
  Gast↔Theken-Sync (eine Function = ein warmer Container). Polling 2 s.
  Für echten Betrieb: KV/Redis — im Code als Adapter vorgesehen.
- `vercel domains add <domain> --scope <team>` (Ein-Argument-Form!) hängt die
  Demo-Subdomain ans gelinkte Projekt; Wildcard-CNAME existiert bereits.
- **`git push` triggerte hier KEINEN Vercel-Build**, obwohl `vercel git connect`
  „already connected" meldet (vermutlich Git-Author `osman.oe@live.de` nicht
  bei GitHub verifiziert — bekanntes Blocked-Pattern). Workaround:
  `vercel deploy --prod` aus dem Repo; nach Push 2–3 min auf Marker pollen
  statt blind warten. Erster `vercel deploy` warf zudem einen 500 beim
  File-Upload — einfacher Retry reichte.
- WebAudio-Synth statt Kie-SFX erneut die richtige Wahl für UI-Sounds:
  0 €, 0 Latenz, kein Bridge-Ausfallrisiko (pour=Bandpass-Noise-Sweep,
  plop=Sinus-Pitch-Drop, chime=Dreiklang-Arpeggio).

## Kosten (Ist)
| Posten | Menge | Ist |
|---|---|---|
| Nano Banana 2 Sprites (Anchor ×2 + Serie 12) | 14 Renders | 0,70 € |
| SFX | prozedural | 0,00 € |
| **Gesamt** | | **0,70 €** (Budget 20 €, Konzept-Schätzung ≤ 20 €) |

## Signature-Rebuild — Ship-Review (12.06.2026)
- **Sold-out gehört auf den Server.** Client-Polling + disabled-Buttons sind
  nur UI; der Orders-POST prüft jetzt `sigId` gegen die Overrides (409).
  Zusätzlich: placeOrder rechecked das frische Menü, der 4s-Poll wirkt auch
  auf sig-story/sig-custom (Kickback zur Galerie mit Hinweis). Merksatz: jedes
  „/admin wirkt sofort"-Versprechen braucht eine letzte Server-Instanz.
- **Preis bleibt bewusst Client-Vertrauen** (`preis` im Order-Body wird nicht
  validiert) — Demo-Parität zum Classic-Flow. Für echten Betrieb: Preis
  server-seitig aus Menü + Größe rechnen.
- **Loop-Videos müssen aus dem Hero generiert werden** (Start-Frame/Referenz),
  sonst springt der 250ms-Crossfade sichtbar auf eine andere Komposition.
  strawberry-mojito-Loop deshalb deaktiviert (`loop: null` → Ken-Burns wirkt
  hochwertiger als der Kontinuitätsbruch). Asset liegt noch in
  `public/assets/photoreal/` für den Neu-Render.
- **CSS-Variablen auf `documentElement` immer beim Verlassen zurücksetzen**
  (`removeProperty` → :root-Default greift). Sonst leakt der Kategorie-Akzent
  der Drink-Story auf Galerie/Attract (Brand-Drift, Kaffee = braune CTAs).
- **Horizontale Chip-Scroller brauchen eine Affordance**: `mask-image`-Edge-Fade
  + `::after`-Spacer, sonst liest sich der gekappte Chip als Layout-Bug.
- **Keine zwei `float:right` in benachbarten Zeilen einer Card** (/bar:
  Preis klebte am Zeitstempel) — flex + `margin-left:auto` statt floats.
- **SW-Deploy-Verhalten bestätigt (Live-Check):** cache-first `/` heißt:
  Reload 1 nach Deploy = noch altes index.html + neuer SW installiert
  (skipWaiting/claim, alter Cache wird gelöscht), Reload 2 = neue Version.
  Live-E2E nach Deploy deshalb immer mit zweitem Load prüfen. Cache enthielt
  nach Aktivierung nur `mixr-v2` mit frischem Markup.

### Offene P3s (Review 12.06., bewusst nicht gefixt)
- Soldout-Badge „AUS" in der Galerie unstyled (Badge-CSS nur auf `.opt-card`
  gescoped, `.sig-card` zeigt Inline-Text) — Test prüft nur Text, nicht Optik.
- Admin-„Start-Modus" ist auf echtem Kiosk totes UI: localStorage `mixr-mode`
  übersteuert dauerhaft, Reset erreicht das Gerät nicht (TTL oder Reset bei
  Done→Restart empfohlen).
- Runtime-Cache `/assets/` wächst über Deploys unbegrenzt (keine Eviction).
- „Zurück" aus Anpassen resettet Größe/Süße/Eis (openDrink setzt hart M/2/2).
- Story-Heroes haben ~40% toten Headroom im 4/5-Frame (`object-position`-Tweak).
- Emojis als UI-Icons (🔇/🎮/▶/Status-Icons) brechen das Premium-Niveau.
- /bar-Header bricht <480px unschön um; Schusterjunge „Foto." in der
  Galerie-Subline; 7. Galerie-Karte steht allein im 2er-Raster.
- Suite/Server nur ohne CLI-Sandbox lauffähig (Port-Bind geblockt — Umgebung,
  kein Code-Problem).
