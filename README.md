# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional Firebase cloud saves and a localStorage fallback.

## Current gameplay

- Desktop movement: `WASD` or arrow keys, `Shift` sprint, `Space` jump, `E` interact, `P` or `Esc` pause.
- Mobile movement: on-screen joystick plus Jump, Sprint, Interact, Unstuck, and Pause buttons.
- Streamed neon city chunks around the player to keep the static game lighter on mobile.
- Missions: courier waypoint, crate collection, and first-property ownership objective.
- Vehicles: enter or exit nearby cars with Interact; vehicles have gas and higher movement speed.
- Ownership: buy purple lots with in-game cash; owned lots turn green and persist in saves.
- Saves: local autosave, manual save slots, and JSON export/import.
- Optional cloud saves: `firebase-backend.js` exposes a safe bridge only when Firebase globals are provided externally.

## Static hosting

This project is intentionally static. It can be previewed locally with any static server and uploaded to Netlify without changing Netlify dashboard settings.

```bash
python3 -m http.server 8080
```

Then open the local server page in a browser and test desktop plus mobile viewport controls.

## Files

- `index.html` - app shell and HUD.
- `styles.css` - responsive HUD, mobile controls, pause/save panels.
- `app.js` - playable Three.js game runtime.
- `firebase-backend.js` - optional cloud-save adapter; localStorage works without Firebase.
- `manifest.webmanifest`, `sw.js`, `icon.svg` - PWA install/offline readiness.
