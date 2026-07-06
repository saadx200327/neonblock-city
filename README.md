# NeonBlock City

Original open-world block-style browser game built with Three.js.

## Included in this branch

- Playable `app.js` game loop.
- Desktop controls: WASD / arrows, Shift sprint, E interact, Esc pause, F3 debug.
- Mobile controls: joystick, sprint, interact, unstuck, pause.
- Streamed city chunks, pickups, mission target, vehicles, buyable lots, minimap, autosave, save slots, JSON import/export.
- Static PWA files: `manifest.webmanifest` and `sw.js`.
- Optional cloud-save bridge in `firebase-backend.js`; localStorage remains the default.

## Local preview

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`.
