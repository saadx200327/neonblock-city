# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional Firebase cloud saves and localStorage fallback.

## What is playable now

- Third-person block avatar with desktop WASD / arrow-key movement.
- Mobile joystick plus touch buttons for Interact, Sprint, Unstuck, and Pause.
- Streamed city chunks around the player to keep the world large without rendering everything at once.
- Neon pickups, NPC helpers, vehicles, basic vehicle gas, block ownership, autosave, manual save slots, JSON export/import, minimap, HUD, and debug overlay.
- Static hosting support through `index.html`, `styles.css`, `app.js`, `manifest.webmanifest`, `sw.js`, and `firebase-backend.js`.

## Controls

Desktop:

- Move: `WASD` or arrow keys
- Sprint: `Shift`
- Interact / enter vehicle / buy block: `E`
- Unstuck: `R`
- Pause: `Esc`

Mobile:

- Move: left joystick
- Use the right-side buttons for Sprint, Interact, Unstuck, and Pause

## Save system

The game works offline using `localStorage`. `firebase-backend.js` is a safe optional bridge. It does not include external Firebase credentials and does not require dashboard changes. A future Firebase setup can provide `window.firebaseSave` and `window.firebaseLoad` without changing the game loop.

## Local test

Use any static server from the repo root:

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173`.

## Netlify readiness

No build step is required. Publish the repository root as a static site. This PR does not deploy or change Netlify/Firebase settings.
