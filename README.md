# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. This repo is a Netlify-ready static PWA with local saves and an optional cloud-save bridge.

## Current gameplay

- Playable third-person movement on desktop and mobile.
- Keyboard controls: `WASD` / arrow keys to move, `Shift` to sprint, `E` to interact, `Esc` to pause.
- Mobile controls: virtual joystick, jump, sprint, interact, unstuck, and pause buttons.
- Streamed block-city chunks around the player to keep the scene lighter.
- Vehicles with enter/exit, gas, HP, and driving missions.
- Pickups, NPC walkers, starter cash, XP, levels, mission progress, and property ownership.
- Autosave, manual save slots, JSON export/import, and localStorage fallback.
- PWA files included for static hosting.

## Files

- `index.html` — game shell and HUD.
- `styles.css` — responsive HUD, menus, joystick, and mobile-safe layout.
- `app.js` — Three.js game loop, controls, missions, streaming, vehicles, saves.
- `firebase-backend.js` — optional cloud-save bridge; defaults to local fallback.
- `manifest.webmanifest` — PWA metadata.
- `sw.js` — static asset cache service worker.

## Local test

Use a local static server so the service worker/module file behavior matches hosting:

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173`.

## Deploy note

This is a static site and should work on Netlify by publishing the repo root. No Firebase or Netlify dashboard changes are required for the default offline/local-save mode.
