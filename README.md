# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional Firebase cloud saves and localStorage fallback.

## What is included

- Playable third-person movement on desktop and mobile.
- Desktop controls: WASD or arrows to move, drag to look, Space to jump, Shift to sprint, E to interact, R to unstuck, Esc to pause, F3 debug.
- Mobile controls: joystick, jump, sprint, interact, unstuck, and pause buttons.
- Streamed procedural city chunks so the world grows around the player while old chunks unload.
- Missions for collecting pickups, buying ownership lots, and driving vehicles.
- Vehicles with gas and HP HUD values.
- Local save slots, autosave, background save, and JSON import/export.
- Optional Firebase bridge that only runs when a separate page script provides Firebase helpers.
- Static PWA files: `manifest.webmanifest` and `sw.js`.

## Local preview

Open `index.html` from a local static server. Example:

```bash
python3 -m http.server 8888
```

Then visit `http://localhost:8888`.

## Deployment notes

This repo is static-site ready. No Firebase or Netlify dashboard settings are required for the base game. Cloud saves are optional and localStorage remains the fallback.
