# NeonBlock City

Roblox-inspired original open-world block-style browser game prototype. It is a static PWA-ready web game with local saves and an optional Firebase cloud-save bridge.

## Run locally

Open `index.html` directly, or serve the folder with any static server:

```bash
python3 -m http.server 5173
```

Then visit `http://localhost:5173`.

## Controls

### Desktop

- Move: `WASD` or arrow keys
- Sprint: `Shift`
- Interact / enter vehicle / collect / buy: `E`
- Unstuck: `R`
- Pause: `Esc`

### Mobile

- Move: left joystick
- Sprint, Interact, Unstuck, Pause: right-side touch buttons

## Current gameplay

- Streamed city chunks around the player for better performance.
- Neon buildings, crates, NPCs, vehicles, and buyable lots generate deterministically by chunk.
- Missions reward cash and XP for crate collection, driving, and ownership.
- Vehicles can be entered/exited and consume gas while driving.
- Local save slots, autosave, and JSON export/import are included.

## Firebase cloud saves

`firebase-backend.js` is intentionally optional and disabled by default. It does not contain secrets and does not change any Firebase dashboard settings. To enable cloud saves later, provide `window.NEONBLOCK_FIREBASE_CONFIG` and the Firebase SDKs before the bridge loads, or adapt the exposed `window.NeonBlockCloud.save/load` methods to your backend.

## Netlify/PWA readiness

This is still a static site: `index.html`, `styles.css`, `app.js`, `manifest.webmanifest`, `sw.js`, and `icon.svg` can be hosted on Netlify without build steps. No deployment is performed by this repository change.
