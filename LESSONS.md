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

## Architektur / Deploy
- Vercel-Catch-all-Function mit In-Memory-Store reicht für eine Demo mit
  Gast↔Theken-Sync (eine Function = ein warmer Container). Polling 2 s.
  Für echten Betrieb: KV/Redis — im Code als Adapter vorgesehen.
- `vercel domains add <domain> --scope <team>` (Ein-Argument-Form!) hängt die
  Demo-Subdomain ans gelinkte Projekt; Wildcard-CNAME existiert bereits.
- WebAudio-Synth statt Kie-SFX erneut die richtige Wahl für UI-Sounds:
  0 €, 0 Latenz, kein Bridge-Ausfallrisiko (pour=Bandpass-Noise-Sweep,
  plop=Sinus-Pitch-Drop, chime=Dreiklang-Arpeggio).

## Kosten (Ist)
| Posten | Menge | Ist |
|---|---|---|
| Nano Banana 2 Sprites (Anchor ×2 + Serie 12) | 14 Renders | 0,70 € |
| SFX | prozedural | 0,00 € |
| **Gesamt** | | **0,70 €** (Budget 20 €, Konzept-Schätzung ≤ 20 €) |
