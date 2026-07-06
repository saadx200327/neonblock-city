# NeonBlock City

Original open-world block-style browser game built with Three.js.

## Current playable scope

- Playable `app.js` game loop.
- Desktop controls: WASD / arrows, Space jump, Shift sprint, E interact, Esc pause, F3 debug.
- Mobile controls: joystick, jump, sprint, interact, unstuck, pause, and drag-look.
- Streamed city chunks, pickups, mission target, vehicles, buyable lots, minimap, autosave, save slots, JSON import/export.
- Optional cloud-save bridge in `firebase-backend.js`; localStorage remains the default.
- Static PWA files: `manifest.webmanifest` and `sw.js`.

## Local preview

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Netlify readiness

This project is static. Upload the repository folder or connect the repo with no build command and publish directory set to the repository root. Do not add secrets or Firebase keys unless the optional cloud bridge is intentionally configured later.
