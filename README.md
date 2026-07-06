# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. The game is a static Netlify-ready PWA and works locally without a backend.

## Current playable features

- Desktop movement: WASD / arrow keys, Space to jump, Shift to sprint, E to interact, Esc to pause, F3 debug overlay.
- Mobile movement: joystick, jump, sprint, interact, unstuck, pause, and drag-look on the right side of the canvas.
- Streamed city chunks with roads, neon buildings, NPCs, pickups, vehicles, and buyable ownership lots.
- Missions: courier waypoint, collect energy cubes, and buy a starter lot.
- Vehicles: enter/exit nearby cars, drive with gas and HP HUD.
- Saves: local autosave, save slots, JSON export/import, save-on-background.
- Optional cloud bridge: `firebase-backend.js` defaults to local fallback and can later be replaced or wired to Firebase without breaking offline play.
- PWA readiness: `manifest.webmanifest` and `sw.js` are included for static hosting.

## Run locally

Open `index.html` through a local static server. Example:

```bash
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Deployment notes

No Firebase dashboard, Netlify dashboard, or live deployment settings are required for this static build. Uploading the repository folder to Netlify should serve `index.html` as the entry point.
