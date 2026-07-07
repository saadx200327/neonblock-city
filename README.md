# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional Firebase cloud saves and localStorage fallback.

## What is playable now

- Desktop movement with WASD / arrow keys, Shift sprint, Space jump, E interact, M mission board, R unstuck, Esc pause.
- Mobile touch joystick plus Jump, Sprint, Interact, Unstuck, and Pause buttons.
- Streamed neon city chunks around the player so the world grows while keeping the active object count controlled.
- Crate pickup loop, NPC mission tips, taxi driving progress, vehicles, buyable ownership lots, minimap, HUD, rewards, and autosave.
- Save slots, JSON export/import, localStorage fallback, and optional Firebase adapter that stays inactive unless a host page provides Firebase objects.
- PWA manifest, service worker, and SVG icon for static hosting.

## Run locally

Because this is a static site, any local static server works:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Deploy notes

This repo is ready for static hosting by serving the repository root. No live deployment, Firebase project changes, or Netlify dashboard changes are required by the code in this branch.

## Optional cloud saves

`firebase-backend.js` is intentionally safe by default. It does not contain credentials and does not call any external dashboard. Cloud saves only activate if the page exposes compatible Firebase globals before `app.js`; otherwise the game uses local saves.
