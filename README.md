# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional Firebase cloud saves and localStorage fallback.

## What is playable now

- Desktop movement with WASD or arrow keys.
- Mobile movement with the on-screen joystick.
- Jump, sprint, interact, pause, save, load, JSON export, and JSON import.
- Streamed block-city chunks around the player instead of one huge static map.
- Pickups, missions, vehicles, and buyable property markers.
- HUD, minimap, debug overlay, autosave, and offline-first PWA files.

## Controls

### Desktop

- Move: WASD or Arrow Keys
- Sprint: Shift
- Jump: Space
- Interact / vehicle enter-exit / buy property: E or F
- Pause: Escape

### Mobile

- Move: bottom-left joystick
- Jump, Sprint, Interact, Unstuck, Pause: bottom-right buttons

## Run locally

Because the game uses a service worker and external Three.js script, preview it from a static server instead of opening the file directly:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Deploy notes

This repo is static-host ready for Netlify or GitHub Pages. No live deployment was performed by this improvement loop. Firebase is optional and disabled by default; the current `firebase-backend.js` safely falls back to localStorage and does not include credentials or change any Firebase settings.
