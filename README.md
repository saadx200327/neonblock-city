# NeonBlock City

NeonBlock City is an original neon block-style open-world browser game built as a static Three.js web app.

## What is included

- Playable desktop movement: `WASD` / arrow keys, `Shift` sprint, `Space` jump, `E` interact, `M` mission board, `Esc` pause.
- Mobile controls: virtual joystick, jump, sprint, interact, unstuck, and pause buttons.
- Runtime world streaming: city chunks spawn around the player and unload when far away for better performance.
- Gameplay systems: crates, NPC tips, buyable lots, vehicles, missions, XP, cash, levels, minimap, HUD, and autosave.
- Saves: localStorage autosave, save slots, JSON export/import, and an optional Firebase adapter that stays inactive unless config is provided.
- PWA readiness: `manifest.webmanifest`, service worker cache, and SVG icon for static hosting.

## Run locally

Any static server works. Example:

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173`.

## Deploy notes

This repo is static-host ready for Netlify or similar hosts. No Firebase or Netlify dashboard settings are required for the local-only game. Cloud saves are optional and only activate when `window.NEONBLOCK_FIREBASE_CONFIG` is provided by the site owner.
