# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with local saves and an optional Firebase bridge.

## Current playable features

- Desktop movement: WASD / arrow keys, Space to jump, Shift to sprint, E to interact, R to unstuck, P or Esc to pause.
- Mobile movement: on-screen joystick plus Jump, Sprint, Interact, Unstuck, and Pause buttons.
- Streamed block city chunks around the player for better browser performance.
- Mission loop with waypoint targets, cash rewards, XP, and leveling.
- Vehicles that can be entered/exited with Interact.
- Pickups, simple NPC pedestrians, buyable properties, minimap, HUD, autosave, save slots, and JSON export/import.
- PWA manifest and service worker for static-host offline readiness.

## Files

- `index.html` — static shell, HUD, menus, mobile controls, scripts.
- `styles.css` — responsive mobile-first HUD and control styling.
- `app.js` — full Three.js game loop and gameplay systems.
- `manifest.webmanifest` — PWA metadata.
- `sw.js` — cache-first service worker for static assets.

## Local testing

Run any static server from the repo root, for example:

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173`.

## Hosting notes

This is static-site ready. No deploy is required to test locally. Firebase is optional; if no Firebase SDK/config exists, saves remain local through `localStorage`.
