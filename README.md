# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional Firebase/cloud-save adapter and localStorage fallback.

## Play locally

Open `index.html` from a static server, for example:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Controls

- Move: `WASD` or arrow keys
- Sprint: `Shift`
- Jump: `Space`
- Interact / enter vehicle / collect / buy: `E`
- Missions: `M`
- Pause: `Escape`
- Debug overlay: backtick
- Mobile: left joystick plus Jump, Sprint, Interact, Unstuck, and Pause buttons

## Gameplay added

- Streamed city chunks around the player so the world can expand without loading everything at once
- Collectible crates, NPC tips, buyable lots, mission board, and drivable neon vehicles
- Save/load slots, autosave, JSON export/import, and optional cloud-save adapter
- PWA manifest, service worker, and SVG icon for static hosting

## Firebase note

`firebase-backend.js` does not configure or modify any external Firebase project. It exposes a safe `window.NeonBlockCloud` adapter that uses an injected `window.NeonBlockFirebase` implementation when one exists, otherwise it falls back to browser localStorage.

## Deployment note

This repo is static-hosting ready, but deployment and external dashboard settings are intentionally not changed by code updates.
