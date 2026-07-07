# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional Firebase cloud saves and localStorage fallback.

## Run locally

Because this is a static browser game, any local static server works:

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173`.

## Controls

- **WASD / Arrow keys**: move or drive
- **Shift**: sprint / faster driving
- **Space**: jump
- **E**: interact with vehicles, crates, and buyable lots
- **P / Esc**: pause
- **M**: mission board
- **R**: unstuck
- **Mobile**: left joystick plus Jump, Sprint, Interact, Unstuck, Pause buttons

## Current gameplay loop

- Streamed city chunks generate around the player instead of loading one giant map.
- Neon crates give quick cash and XP.
- Vehicles can be entered/exited and include simple gas/HP HUD stats.
- Missions guide the player through delivery, driving, and first-property ownership.
- Buyable lots are saved locally and can support future ownership upgrades.
- Save slots, autosave, JSON export/import, and optional cloud-save bridge are included.

## Firebase notes

`firebase-backend.js` is intentionally safe by default. It does not contain secrets, does not initialize a Firebase project, and does not change any dashboard settings. To enable cloud saves later, provide a `window.NEONBLOCK_FIREBASE` adapter with `saveGame(slot, data)` and `loadGame(slot)` methods before `app.js` runs.

## Static/PWA readiness

The app includes `manifest.webmanifest`, `sw.js`, and an SVG icon. It can be hosted on Netlify as plain static files without a build step. This repository change does not deploy anything by itself.
