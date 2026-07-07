# NeonBlock City

Roblox-inspired original open-world block-style browser game built with Three.js. Netlify-ready static PWA with optional Firebase cloud saves and localStorage fallback.

## Current playable features

- Desktop controls: WASD/arrow movement, Shift sprint, Space jump, E interact/mission board, R unstuck, Esc pause.
- Mobile controls: touch joystick plus Jump, Sprint, Interact, Unstuck, and Pause buttons.
- Streamed city chunks around the player so the world can keep expanding without rendering every block at once.
- Vehicles with enter/exit interaction, driving physics, gas, and HUD state.
- Missions: courier waypoint, crate hunt, and vehicle gate run.
- Ownership loop: buy glowing city lots with earned cash.
- Save system: autosave, two local slots, JSON export/import, and an optional Firebase bridge that does nothing unless configured.
- PWA files: `manifest.webmanifest`, `icon.svg`, and `sw.js` for install/offline static hosting readiness.

## Static hosting notes

This repo is safe to deploy as a static site from the repository root. No Firebase or Netlify dashboard setting is required for local/offline play. Optional Firebase cloud saves require adding Firebase SDKs and defining `window.NEONBLOCK_FIREBASE_CONFIG`; without that, saves stay in `localStorage`.

## Files

- `index.html` — game shell and HUD.
- `styles.css` — responsive HUD, pause menu, and touch controls.
- `app.js` — playable game loop, world streaming, missions, vehicles, lots, saves, and minimap.
- `firebase-backend.js` — optional cloud-save adapter with local fallback.
- `manifest.webmanifest`, `sw.js`, `icon.svg` — PWA readiness.
