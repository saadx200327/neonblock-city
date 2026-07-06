# NeonBlock City

Roblox-inspired original open-world block-style browser game built as a static Three.js PWA.

## Included

- Desktop controls: WASD or arrow keys to move, mouse drag to rotate camera, Space to jump, Shift to sprint, E to interact, M for missions, Escape to pause.
- Mobile controls: joystick, jump, sprint, interact, unstuck, and pause buttons.
- Streamed city chunks that load nearby blocks and unload distant blocks for smoother play.
- Pickups, wandering NPCs, mission board, drive rings, vehicles, and purchasable lots.
- Local autosave, two manual save slots, JSON export/import, and a safe optional save bridge.
- Static PWA files for Netlify-style hosting: `index.html`, `styles.css`, `app.js`, `firebase-backend.js`, `manifest.webmanifest`, and `sw.js`.

## Local preview

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080` from the repository folder.

## Notes

This branch does not deploy the site and does not change any external dashboard settings.
