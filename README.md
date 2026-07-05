# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional Firebase cloud saves and localStorage fallback.

## What is playable now

- Desktop movement with WASD / arrow keys, Shift sprint, Space jump, E interact, F enter/exit vehicle, Escape pause.
- Mobile movement with a touch joystick plus Jump, Sprint, Interact, Unstuck, and Pause buttons.
- Streamed chunk-based neon city with roads, buildings, NPCs, pickups, vehicles, and buyable property markers.
- Missions for delivery, driving, and chip collection with cash/XP rewards.
- Vehicle entry/exit, gas/HP HUD, cash, XP, level, wanted level, debug status, and save slots.
- LocalStorage saves, JSON export/import, and an optional no-credential Firebase adapter hook.
- PWA files for static hosting: `manifest.webmanifest` and `sw.js`.

## Static hosting

This repo is designed to run as static files. Open `index.html` locally or drag the repo folder into Netlify. No deployment, Firebase dashboard, or Netlify dashboard configuration is required for the base game.

## Optional cloud saves

`firebase-backend.js` is intentionally a safe shim. It does not include credentials and does not modify Firebase settings. The game works offline with localStorage by default.

## File map

- `index.html` — game shell and HUD.
- `styles.css` — mobile-first HUD, menus, and controls.
- `app.js` — playable game loop, world streaming, missions, vehicles, ownership, saves, and performance controls.
- `manifest.webmanifest` — PWA metadata.
- `sw.js` — static cache service worker.
- `firebase-backend.js` — optional cloud-save adapter placeholder.
