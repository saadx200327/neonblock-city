# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional Firebase cloud saves and localStorage fallback.

## Run locally

Open `index.html` with a static server so the service worker and module script behave correctly:

```bash
python3 -m http.server 5173
```

Then visit `http://localhost:5173`.

## Controls

- Move: `WASD` / arrow keys or mobile joystick
- Sprint: `Shift` or mobile Sprint
- Jump: `Space` or mobile Jump
- Interact: `E` or mobile Interact
- Pause: `Esc` or mobile Pause
- Unstuck: `R` or mobile Unstuck

## Gameplay included

- Streamed block city chunks around the player for better performance
- Crate collection mission and ownership mission
- Enter/exit nearby neon vehicles
- Buy city lots with cash
- NPC tips
- Autosave, two manual save slots, JSON export/import
- Offline-first PWA shell with localStorage saves

## Optional Firebase saves

The game does not require Firebase. To wire cloud saves later, define `window.NEONBLOCK_FIREBASE_CONFIG` and load Firebase compat SDKs before `firebase-backend.js`, or replace `firebase-backend.js` with project-specific Firebase logic. Without that config, the bridge safely no-ops and local saves continue working.

## Netlify/static readiness

No build step is required. Deploy the repository folder as a static site only when ready. This branch does not change any external Netlify or Firebase dashboard settings.
